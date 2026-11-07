import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Cloud,
  CloudOff,
  CloudUpload,
  Clock3,
  Fuel,
  History,
  Play,
  Route,
  Square,
  TriangleAlert
} from 'lucide-react';
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
import { dayKey, dayKm } from '../lib/calc';
import { capitalize, fmtDateTime, fmtNum, fmtTime } from '../lib/format';
import { BODY_LABEL, EVENT_LABEL, FUEL_LABEL, type EventType, type FleetEvent, type Profile, type Vehicle } from '../lib/types';
import { Avatar, FUEL_ICON, FuelTag, Logo, Odometer, Plate, Sheet, durationParts, useNow } from '../components/ui';
import GaugeArt from '../components/GaugeArt';
import EventForm from './EventForm';
import ProfileSheet from '../components/ProfileSheet';

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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function todayLabel(): string {
  return capitalize(new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
}

export function EventIcon({ e }: { e: FleetEvent }) {
  if (e.type === 'shift_start')
    return (
      <span className="type-ico start">
        <Play size={18} />
      </span>
    );
  if (e.type === 'shift_end')
    return (
      <span className="type-ico end">
        <Square size={16} />
      </span>
    );
  const Icon = e.fuel ? FUEL_ICON[e.fuel] : Fuel;
  return (
    <span className={`type-ico refuel${e.fuel ? ` fuel-${e.fuel}` : ''}`}>
      <Icon size={18} />
    </span>
  );
}

interface Props {
  profile: Profile;
  onLogout?: () => void;
  /** Встроен в кабинет руководителя — без своей шапки. */
  embedded?: boolean;
}

export default function DriverApp({ profile, onLogout, embedded }: Props) {
  const online = useOnline();
  const now = useNow(30_000);
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
  const [toast, setToast] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);

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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const shift = useMemo(() => openShift(events, profile.id), [events, profile.id]);

  // Машина: во время смены — машина смены; иначе выбранная ранее или закреплённая.
  const vehicle = useMemo(() => {
    if (shift) return vehicles.find((v) => v.id === shift.vehicle_id) ?? null;
    return vehicles.find((v) => v.id === vehicleId) ?? vehicles.find((v) => v.assigned_driver === profile.id) ?? null;
  }, [vehicles, vehicleId, shift, profile.id]);

  const last = vehicle ? lastOdometer(events, vehicle.id) : null;
  const myEvents = useMemo(() => events.filter((e) => e.driver_id === profile.id).slice(-12).reverse(), [events, profile.id]);
  const queued = new Set(queue.map((q) => q.id));
  const errors = queue.filter((q) => q.error && !/fetch|network|load failed/i.test(q.error));
  const plateOf = (id: string) => vehicles.find((v) => v.id === id)?.plate ?? '—';

  const today = dayKey(now);
  const myToday = events.filter((e) => e.driver_id === profile.id && dayKey(e.occurred_at) === today);
  const todayKmMine = vehicle ? dayKm(events.filter((e) => e.vehicle_id === vehicle.id), today) : 0;
  const todayLiters = myToday.filter((e) => e.type === 'refuel').reduce((a, e) => a + (e.liters ?? 0), 0);

  const chooseVehicle = (id: string) => {
    setVehicleId(id);
    setPicker(false);
    try {
      localStorage.setItem(VEHICLE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const syncButton = (
    <button
      className={`sync-btn${!online ? ' offline' : queue.length ? ' pending' : ''}`}
      onClick={() => void syncQueue()}
      aria-label="Состояние отправки"
    >
      {!online ? <CloudOff size={17} /> : queue.length ? <CloudUpload size={17} /> : <Cloud size={17} />}
      {!online ? (queue.length ? `Нет сети · ${queue.length}` : 'Нет сети') : queue.length ? `Отправка · ${queue.length}` : 'Всё отправлено'}
    </button>
  );

  if (form && vehicle) {
    return (
      <EventForm
        type={form}
        vehicle={vehicle}
        profile={profile}
        last={last}
        shift={shift}
        onCancel={() => setForm(null)}
        onDone={() => {
          setToast(`${EVENT_LABEL[form]} — сохранено${navigator.onLine ? '' : '. Отправится, когда появится сеть'}`);
          setForm(null);
          void refreshLocal();
        }}
      />
    );
  }

  const elapsed = shift ? durationParts(shift.occurred_at, now) : null;

  return (
    <div className={embedded ? '' : 'driver'}>
      {!embedded && (
        <header className="app-bar">
          <Logo size={32} />
          <span className="spacer" />
          {syncButton}
          <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Профиль">
            <Avatar name={profile.full_name || profile.phone} size="sm" />
          </button>
        </header>
      )}

      <main className="page narrow stack" style={{ gap: 14 }}>
        {embedded ? (
          <div className="row between">
            <div className="h2">Ввод показаний</div>
            <span style={{ color: 'var(--on-ink)' }} className="sync-wrap">
              {syncButton}
            </span>
          </div>
        ) : (
          <div className="hello">
            <h1 className="h1">
              {greeting()}
              {profile.full_name ? `, ${profile.full_name}` : ''}
            </h1>
            <div className="muted" style={{ marginTop: 4 }}>
              {todayLabel()}
            </div>
          </div>
        )}

        {errors.length > 0 && online && (
          <div className="note bad">
            <TriangleAlert size={18} />
            <span>
              Не удалось отправить запись: {errors[0].error}. Она сохранена в телефоне — отправка повторится сама.
            </span>
          </div>
        )}

        {/* Машина */}
        <section className="card vehicle-card">
          {vehicle ? (
            <>
              <div className="row between wrap">
                <Plate plate={vehicle.plate} size="lg" />
                {!shift && vehicles.length > 1 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setPicker(true)}>
                    Сменить <ChevronDown size={16} />
                  </button>
                )}
              </div>
              <div className="vehicle-meta">
                <span>
                  {vehicle.model}
                  {vehicle.body !== 'other' && ` · ${BODY_LABEL[vehicle.body]}`}
                </span>
                {vehicle.fuels.map((f) => (
                  <FuelTag key={f} fuel={f} />
                ))}
              </div>
              {last && (
                <div className="row wrap" style={{ gap: 10 }}>
                  <Odometer value={last.odometer} size="sm" />
                  <span className="small faint">последняя запись {fmtDateTime(last.occurred_at)}</span>
                </div>
              )}
            </>
          ) : (
            <div className="stack" style={{ alignItems: 'flex-start' }}>
              <div className="h2">{vehicles.length ? 'Выберите машину' : 'Загружаю список машин…'}</div>
              {vehicles.length > 0 && (
                <button className="btn btn-primary" onClick={() => setPicker(true)}>
                  Выбрать машину <ChevronDown size={18} />
                </button>
              )}
            </div>
          )}
        </section>

        {/* Смена */}
        <section className="hero">
          <GaugeArt className="hero-gauge" value={shift ? 0.7 : 0.15} size={190} />
          {shift && elapsed ? (
            <>
              <div className="hero-status">
                <span className="live-dot" /> На линии
              </div>
              <div className="hero-time" aria-label={`Смена идёт ${elapsed.h} ч ${elapsed.m} мин`}>
                {elapsed.h}
                <small>ч</small>
                {String(elapsed.m).padStart(2, '0')}
                <small>мин</small>
              </div>
              <div className="hero-meta">
                Выезд в {fmtTime(shift.occurred_at)} · {fmtNum(shift.odometer)} км
              </div>
              <button className="btn btn-xl btn-block" style={{ background: '#fff', color: '#0b1322', borderColor: '#fff' }} onClick={() => setForm('shift_end')}>
                <Square size={20} /> Закончить смену
              </button>
            </>
          ) : (
            <>
              <div className="hero-status">
                <Clock3 size={16} /> Смена не начата
              </div>
              <div className="hero-quiet">
                <div className="h2">Готовы к выезду?</div>
                <div className="hero-meta" style={{ margin: '6px 0 0', maxWidth: '26ch' }}>
                  Введите пробег и сфотографируйте одометр — это 10 секунд.
                </div>
              </div>
              <button className="btn btn-primary btn-xl btn-block" disabled={!vehicle} onClick={() => setForm('shift_start')}>
                <Play size={20} /> Начать смену
              </button>
            </>
          )}
        </section>

        <div className="tiles">
          <button className="tile" disabled={!vehicle} onClick={() => setForm('refuel')}>
            <span className="tile-ico">
              <Fuel size={22} />
            </span>
            <span className="stack tight" style={{ gap: 2 }}>
              <b>Заправка</b>
              <span>литры, сумма, чек</span>
            </span>
          </button>
          <div className="tile" style={{ cursor: 'default' }}>
            <span className="tile-ico alt">
              <Route size={22} />
            </span>
            <span className="stack tight" style={{ gap: 2 }}>
              <b>{fmtNum(todayKmMine)} км сегодня</b>
              <span>{todayLiters > 0 ? `заправлено ${fmtNum(todayLiters, 1)} л` : 'заправок не было'}</span>
            </span>
          </div>
        </div>

        {/* Мои записи */}
        <section className="card">
          <div className="card-head">
            <History size={18} className="faint" />
            <h2 className="h2">Мои записи</h2>
          </div>
          {myEvents.length === 0 ? (
            <div className="small faint">Здесь появятся ваши смены и заправки.</div>
          ) : (
            <div className="list">
              {myEvents.map((e) => (
                <div className="list-row" key={e.id}>
                  <EventIcon e={e} />
                  <div className="grow">
                    <div style={{ fontWeight: 650 }}>
                      {EVENT_LABEL[e.type]}
                      {e.type === 'refuel' && e.fuel && (
                        <span className="muted" style={{ fontWeight: 500 }}>
                          {' '}
                          · {FUEL_LABEL[e.fuel]} {fmtNum(e.liters, 1)} л{e.full_tank ? ', полный бак' : ''}
                        </span>
                      )}
                    </div>
                    <div className="small faint">
                      {plateOf(e.vehicle_id)} · {fmtNum(e.odometer)} км · {fmtDateTime(e.occurred_at)}
                    </div>
                  </div>
                  {queued.has(e.id) ? (
                    <span className="pill warn" title="Ждёт отправки">
                      <CloudUpload size={14} /> ждёт
                    </span>
                  ) : (
                    <span className="pill good" title="Отправлено">
                      <Check size={14} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {toast && (
        <div className="toast" role="status">
          <span className="ok">
            <Check size={16} />
          </span>
          {toast}
        </div>
      )}

      {picker && (
        <Sheet title="Выберите машину" onClose={() => setPicker(false)}>
          <div className="list">
            {[...vehicles]
              .sort((a, b) => Number(b.assigned_driver === profile.id) - Number(a.assigned_driver === profile.id))
              .map((v) => (
                <div className="list-row click" key={v.id} onClick={() => chooseVehicle(v.id)} role="button" tabIndex={0}>
                  <Plate plate={v.plate} size="sm" />
                  <div className="grow small muted">
                    {v.model}
                    {v.body === '6m' ? ', 6 м' : ''} · {v.fuels.map((f) => FUEL_LABEL[f].toLowerCase()).join(' + ')}
                  </div>
                  {v.assigned_driver === profile.id && <span className="pill amber">моя</span>}
                  {vehicle?.id === v.id && <Check size={18} className="t-good" />}
                </div>
              ))}
          </div>
        </Sheet>
      )}

      {menu && <ProfileSheet profile={profile} onClose={() => setMenu(false)} onLogout={onLogout} />}
    </div>
  );
}
