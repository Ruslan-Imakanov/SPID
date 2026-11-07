import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  cachedVehicles,
  cacheRecent,
  cacheVehicles,
  knownEvents,
  lastOdometer,
  onQueueChange,
  openShift,
  queueAll,
  startAutoSync,
  syncQueue,
  type QueueItem
} from '../lib/offline';
import { fmtDateTime, fmtNum, fmtTime } from '../lib/format';
import { BODY_LABEL, EVENT_LABEL, FUEL_LABEL, type EventType, type FleetEvent, type Profile, type Vehicle } from '../lib/types';
import EventForm from './EventForm';

const VEHICLE_KEY = 'spid-vehicle';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

interface Props {
  profile: Profile;
  onLogout?: () => void;
  /** Встроен в кабинет руководителя — без своей шапки. */
  embedded?: boolean;
}

export default function DriverApp({ profile, onLogout, embedded }: Props) {
  const online = useOnline();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [events, setEvents] = useState<FleetEvent[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(VEHICLE_KEY);
    } catch {
      return null;
    }
  });
  const [form, setForm] = useState<EventType | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const refreshLocal = useCallback(async () => {
    const [ev, q] = await Promise.all([knownEvents(), queueAll()]);
    setEvents(ev);
    setQueue(q);
  }, []);

  const loadServer = useCallback(async () => {
    const [vRes, eRes] = await Promise.all([
      supabase.from('vehicles').select('*').eq('active', true).order('plate'),
      supabase.from('events').select('*').order('occurred_at', { ascending: false }).limit(500)
    ]);
    if (vRes.data) {
      setVehicles(vRes.data as Vehicle[]);
      await cacheVehicles(vRes.data as Vehicle[]);
    }
    if (eRes.data) await cacheRecent(eRes.data as FleetEvent[]);
    await refreshLocal();
  }, [refreshLocal]);

  useEffect(() => {
    void (async () => {
      setVehicles(await cachedVehicles());
      await refreshLocal();
      await loadServer();
    })();
    startAutoSync();
    return onQueueChange(() => void refreshLocal());
  }, [loadServer, refreshLocal]);

  const shift = useMemo(() => openShift(events, profile.id), [events, profile.id]);

  // Машина: во время смены — машина смены; иначе выбранная ранее или закреплённая.
  const vehicle = useMemo(() => {
    if (shift) return vehicles.find((v) => v.id === shift.vehicle_id) ?? null;
    return (
      vehicles.find((v) => v.id === vehicleId) ?? vehicles.find((v) => v.assigned_driver === profile.id) ?? null
    );
  }, [vehicles, vehicleId, shift, profile.id]);

  const last = vehicle ? lastOdometer(events, vehicle.id) : null;
  const myEvents = useMemo(() => events.filter((e) => e.driver_id === profile.id).slice(-15).reverse(), [events, profile.id]);
  const queued = new Set(queue.map((q) => q.id));
  const errors = queue.filter((q) => q.error);
  const plateOf = (id: string) => vehicles.find((v) => v.id === id)?.plate ?? '—';

  const chooseVehicle = (id: string) => {
    setVehicleId(id);
    try {
      localStorage.setItem(VEHICLE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const header = !embedded && (
    <div className="topbar">
      <span className="brand">СПИД</span>
      <span className="small">{profile.full_name}</span>
      <span className="spacer" />
      {onLogout && (
        <button className="link small" onClick={onLogout}>
          Выйти
        </button>
      )}
    </div>
  );

  if (form && vehicle) {
    return (
      <>
        {header}
        <EventForm
          type={form}
          vehicle={vehicle}
          profile={profile}
          last={last}
          onCancel={() => setForm(null)}
          onDone={() => {
            setSaved(`${EVENT_LABEL[form]} сохранено`);
            setForm(null);
            void refreshLocal();
          }}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="page narrow">
        {/* Связь и отправка */}
        <div className="row" style={{ marginBottom: 12 }}>
          <span className={`badge ${online ? 'good' : 'warn'}`}>{online ? 'В сети' : 'Нет интернета'}</span>
          {queue.length > 0 ? (
            <>
              <span className="badge warn">Не отправлено: {queue.length}</span>
              {online && (
                <button className="link small" onClick={() => void syncQueue()}>
                  Отправить сейчас
                </button>
              )}
            </>
          ) : (
            <span className="badge good">Всё отправлено</span>
          )}
        </div>
        {errors.length > 0 && online && (
          <div className="note bad small" style={{ marginBottom: 12 }}>
            Ошибка отправки: {errors[0].error}. Записи сохранены в телефоне, отправка повторится автоматически.
          </div>
        )}
        {saved && (
          <div className="note good" style={{ marginBottom: 12 }} onClick={() => setSaved(null)}>
            ✓ {saved}
            {!online && '. Отправится, когда появится интернет'}
          </div>
        )}

        {/* Машина */}
        <div className="card stack">
          {vehicle ? (
            <div className="row">
              <span className="plate">{vehicle.plate}</span>
              <span className="muted">
                {vehicle.model}
                {vehicle.body !== 'other' && `, ${BODY_LABEL[vehicle.body]}`} · {vehicle.fuels.map((f) => FUEL_LABEL[f]).join(' + ')}
              </span>
            </div>
          ) : (
            <div className="muted">{vehicles.length ? 'Выберите машину' : 'Загрузка списка машин…'}</div>
          )}
          {!shift && vehicles.length > 0 && (
            <label className="field">
              <span>Машина</span>
              <select value={vehicle?.id ?? ''} onChange={(e) => chooseVehicle(e.target.value)}>
                <option value="" disabled>
                  — выберите —
                </option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} — {v.model}
                    {v.body === '6m' ? ', 6 м' : ''}
                    {v.assigned_driver === profile.id ? ' (моя)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {last && (
            <div className="small muted">
              Последний пробег: {fmtNum(last.odometer)} км ({fmtDateTime(last.occurred_at)})
            </div>
          )}
        </div>

        {/* Смена */}
        <div className="card stack">
          <div className="status-line">
            {shift ? (
              <>
                <b>Смена идёт</b> с {fmtTime(shift.occurred_at)} · выезд {fmtNum(shift.odometer)} км
              </>
            ) : (
              <span className="muted">Смена не начата</span>
            )}
          </div>
          <button className="btn primary big" disabled={!vehicle} onClick={() => setForm(shift ? 'shift_end' : 'shift_start')}>
            {shift ? 'Закончить смену' : 'Начать смену'}
          </button>
          <button className="btn big" disabled={!vehicle} onClick={() => setForm('refuel')}>
            ⛽ Заправка
          </button>
        </div>

        {/* Мои записи */}
        <div className="card">
          <h3>Мои последние записи</h3>
          {myEvents.length === 0 && <div className="muted small">Пока нет записей</div>}
          {myEvents.map((e) => (
            <div className="list-item" key={e.id}>
              <div>
                <div>
                  {EVENT_LABEL[e.type]}
                  {e.type === 'refuel' && e.fuel && (
                    <span className="muted">
                      {' '}
                      · {FUEL_LABEL[e.fuel]} {fmtNum(e.liters, 1)} л{e.full_tank ? ', полный' : ''}
                    </span>
                  )}
                </div>
                <div className="small muted">
                  {plateOf(e.vehicle_id)} · {fmtNum(e.odometer)} км · {fmtDateTime(e.occurred_at)}
                </div>
              </div>
              <span className={`badge ${queued.has(e.id) ? 'warn' : 'good'}`}>{queued.has(e.id) ? 'ждёт' : '✓'}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
