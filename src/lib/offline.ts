// Офлайн-очередь: запись сначала сохраняется в телефоне (IndexedDB) вместе с фото,
// затем отправляется в облако, когда есть интернет. id записи создаётся на телефоне,
// поэтому повторная отправка не создаёт дублей.

import { supabase } from './supabase';
import type { FleetEvent, InsurancePolicy, Vehicle } from './types';
import { byTime } from './calc';

export interface QueueItem {
  id: string;
  event: FleetEvent;
  odoPhoto: Blob | null;
  receiptPhoto: Blob | null;
  error: string | null;
  createdAt: number;
}

const DB_NAME = 'spid';
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

// ───────────────────────── Ключ-значение (кэш) ─────────────────────────

export function kvGet<T>(key: string): Promise<T | undefined> {
  return tx<T>('kv', 'readonly', (s) => s.get(key) as IDBRequest<T>);
}

export function kvSet(key: string, value: unknown): Promise<unknown> {
  return tx('kv', 'readwrite', (s) => s.put(value, key));
}

export async function cacheVehicles(v: Vehicle[]) {
  await kvSet('vehicles', v);
}
export async function cachedVehicles(): Promise<Vehicle[]> {
  return (await kvGet<Vehicle[]>('vehicles')) ?? [];
}
export async function cachePolicies(p: InsurancePolicy[]) {
  await kvSet('policies', p);
}
export async function cachedPolicies(): Promise<InsurancePolicy[]> {
  return (await kvGet<InsurancePolicy[]>('policies')) ?? [];
}
/** Последние события с сервера (для подсказки последнего пробега и статуса смены). */
export async function cacheRecent(events: FleetEvent[]) {
  await kvSet('recent', events);
}
export async function cachedRecent(): Promise<FleetEvent[]> {
  return (await kvGet<FleetEvent[]>('recent')) ?? [];
}

// ───────────────────────── Очередь ─────────────────────────

const listeners = new Set<() => void>();
export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((fn) => fn());
}

export async function queueAll(): Promise<QueueItem[]> {
  const items = await tx<QueueItem[]>('queue', 'readonly', (s) => s.getAll() as IDBRequest<QueueItem[]>);
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function enqueue(event: FleetEvent, odoPhoto: Blob | null, receiptPhoto: Blob | null) {
  const item: QueueItem = { id: event.id, event, odoPhoto, receiptPhoto, error: null, createdAt: Date.now() };
  await tx('queue', 'readwrite', (s) => s.put(item));
  notify();
  void syncQueue();
}

async function queueDelete(id: string) {
  await tx('queue', 'readwrite', (s) => s.delete(id));
}

async function queuePut(item: QueueItem) {
  await tx('queue', 'readwrite', (s) => s.put(item));
}

async function uploadPhoto(path: string, blob: Blob): Promise<string> {
  const { error } = await supabase.storage.from('photos').upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: false
  });
  // Файл уже загружен прошлой (прерванной) попыткой — это нормально.
  if (error && !/exist|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`)) {
    throw error;
  }
  return path;
}

let syncing = false;

export async function syncQueue(): Promise<void> {
  if (syncing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  syncing = true;
  try {
    const items = await queueAll();
    for (const item of items) {
      const ev: FleetEvent = { ...item.event };
      try {
        if (item.odoPhoto) ev.odometer_photo = await uploadPhoto(`${ev.driver_id}/${ev.id}-odo.jpg`, item.odoPhoto);
        if (item.receiptPhoto) ev.receipt_photo = await uploadPhoto(`${ev.driver_id}/${ev.id}-receipt.jpg`, item.receiptPhoto);
        const { error } = await supabase.from('events').upsert(ev, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw error;
        await queueDelete(item.id);
        const recent = await cachedRecent();
        await cacheRecent([ev, ...recent.filter((r) => r.id !== ev.id)].slice(0, 500));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
        await queuePut({ ...item, error: msg });
        if (/fetch|network|load failed/i.test(msg)) break; // нет связи — попробуем позже
      }
      notify();
    }
  } finally {
    syncing = false;
    notify();
  }
}

let started = false;
/** Запускает автоматическую отправку: при появлении сети, при открытии приложения и раз в минуту. */
export function startAutoSync() {
  if (started) return;
  started = true;
  window.addEventListener('online', () => void syncQueue());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncQueue();
  });
  setInterval(() => void syncQueue(), 60_000);
  void syncQueue();
}

// ───────────────────────── Подсказки для формы ─────────────────────────

/** Все известные телефону события: с сервера + ещё не отправленные. */
export async function knownEvents(): Promise<FleetEvent[]> {
  const [recent, queue] = await Promise.all([cachedRecent(), queueAll()]);
  const map = new Map<string, FleetEvent>();
  for (const e of recent) map.set(e.id, e);
  for (const q of queue) map.set(q.id, q.event);
  return [...map.values()].sort(byTime);
}

export function lastOdometer(events: FleetEvent[], vehicleId: string): FleetEvent | null {
  const ve = events.filter((e) => e.vehicle_id === vehicleId);
  return ve.length ? ve[ve.length - 1] : null;
}

/** Открытая смена водителя (последнее событие смены — «начало»). */
export function openShift(events: FleetEvent[], driverId: string): FleetEvent | null {
  const shifts = events.filter((e) => e.driver_id === driverId && e.type !== 'refuel');
  const last = shifts[shifts.length - 1];
  return last && last.type === 'shift_start' ? last : null;
}
