import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Clock3, Fuel, Route, ScrollText, TriangleAlert, Truck } from 'lucide-react';
import { byTime, dayKey, findIssues, monthKey, monthKm, sum, vehicleStatus, type FuelNow, type VehicleStatus } from '../../lib/calc';
import { capitalize, fmtDateTime, fmtNum, fmtTenge, fmtTime } from '../../lib/format';
import { BODY_LABEL, EVENT_LABEL, FUEL_LABEL, type Fuel as FuelT } from '../../lib/types';
import { Avatar, Empty, FuelTag, Odometer, Plate, Sheet, Stat, useNow } from '../../components/ui';
import { Columns, type ColDatum } from '../../components/charts';
import { EventIcon } from '../DriverApp';
import type { Fleet as FleetData } from './useFleet';

const DAY = 86_400_000;

export function fuelColor(f: FuelT): string {
  return `var(--fuel-${f})`;
}

/** Главный вид топлива машины — тот, которого уходит больше всего. */
function mainFuel(s: VehicleStatus): FuelNow | null {
  const withData = s.fuels.filter((f) => f.recent !== null);
  if (withData.length === 0) return s.fuels[0] ?? null;
  return withData.sort((a, b) => (b.recent ?? 0) - (a.recent ?? 0))[0];
}

function sinceLabel(iso: string, now: number): string {
  if (dayKey(iso) === dayKey(now)) return `с ${fmtTime(iso)}`;
  if (dayKey(iso) === dayKey(now - DAY)) return `со вчера, ${fmtTime(iso)}`;
  return `с ${new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
}

function StatusPill({ s, now }: { s: VehicleStatus; now: number }) {
  if (s.shift && !s.shift.stale)
    return (
      <span className="pill good">
        <span className="live-dot" /> На линии
      </span>
    );
  if (s.shift?.stale)
    return (
      <span className="pill warn">
        <TriangleAlert size={14} /> Смена не закрыта
      </span>
    );
  if (!s.last) return <span className="pill">Нет записей</span>;
  return (
    <span className="pill">
      <Clock3 size={14} /> Стоит {sinceLabel(s.last.occurred_at, now)}
    </span>
  );
}

export function Deviation({ value, compact }: { value: number | null; compact?: boolean }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  const tone = value >= 0.25 ? 'bad' : value >= 0.1 ? 'warn' : 'good';
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`pill ${tone}`} title="Отклонение от нормы машины">
      <Icon size={14} />
      {pct > 0 ? '+' : ''}
      {pct}%{!compact && ' к норме'}
    </span>
  );
}

function FleetCard({ s, now, nameOf, onOpen }: { s: VehicleStatus; now: number; nameOf: (id: string | null) => string; onOpen: () => void }) {
  const v = s.vehicle;
  const f = mainFuel(s);
  return (
    <article
      className="card click fleet-card"
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      tabIndex={0}
      role="button"
      aria-label={`Машина ${v.plate}`}
    >
      <div className="row between">
        <Plate plate={v.plate} />
        <StatusPill s={s} now={now} />
      </div>
      <div className="vehicle-meta">
        <span>
          {v.model}
          {v.body !== 'other' && ` · ${BODY_LABEL[v.body]}`}
        </span>
        {v.fuels.map((x) => (
          <FuelTag key={x} fuel={x} />
        ))}
      </div>
      <div className="row" style={{ minHeight: 28 }}>
        {s.shift ? (
          <>
            <Avatar name={nameOf(s.shift.driverId)} size="sm" />
            <span className="stack tight" style={{ gap: 0, minWidth: 0 }}>
              <span style={{ fontWeight: 650 }}>{nameOf(s.shift.driverId)}</span>
              <span className="small faint">
                на смене {sinceLabel(s.shift.since, now)} · выезд {fmtNum(s.shift.startOdo)} км
              </span>
            </span>
          </>
        ) : v.assigned_driver ? (
          <>
            <Avatar name={nameOf(v.assigned_driver)} size="sm" />
            <span className="muted">{nameOf(v.assigned_driver)}</span>
          </>
        ) : (
          <span className="small faint">Водитель не закреплён</span>
        )}
      </div>
      <div className="metrics">
        <div>
          <div className="metric-label">Одометр</div>
          <div className="metric-value">
            {s.last ? fmtNum(s.last.odometer) : '—'} <small>км</small>
          </div>
        </div>
        <div>
          <div className="metric-label">Сегодня</div>
          <div className="metric-value">
            {s.todayKm > 0 ? `+${fmtNum(s.todayKm)}` : '0'} <small>км</small>
          </div>
        </div>
        <div>
          <div className="metric-label">Расход{f && v.fuels.length > 1 ? `, ${FUEL_LABEL[f.fuel].toLowerCase()}` : ''}</div>
          <div className="metric-value">
            {f?.recent != null ? (
              <>
                {fmtNum(f.recent, 1)} <small>л/100</small>
              </>
            ) : (
              <small>собираем</small>
            )}
          </div>
        </div>
      </div>
      <div className="fleet-foot">
        {f && <Deviation value={f.deviation} />}
        <span className="grow">
          {s.lastRefuel
            ? `Заправка ${fmtNum(s.lastRefuel.liters, 1)} л · ${new Date(s.lastRefuel.occurred_at).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short'
              })}`
            : 'Заправок ещё не было'}
        </span>
        <ChevronRight size={18} className="faint" />
      </div>
    </article>
  );
}

function intervalColumns(f: FuelNow): ColDatum[] {
  return f.intervals.slice(-12).map((x) => {
    const d = new Date(x.endAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    return {
      key: x.closingEventId,
      xLabel: d,
      segments: [{ key: 'c', value: x.consumption, color: fuelColor(f.fuel), label: FUEL_LABEL[f.fuel] }],
      tip: {
        title: `${d} · ${fmtNum(x.km)} км`,
        rows: [
          { color: fuelColor(f.fuel), label: 'л/100 км', value: fmtNum(x.consumption, 1) },
          { color: 'transparent', label: 'залито', value: `${fmtNum(x.liters, 1)} л` }
        ]
      }
    };
  });
}

function VehicleSheet({
  s,
  fleet,
  now,
  onClose,
  onOpenJournal
}: {
  s: VehicleStatus;
  fleet: FleetData;
  now: number;
  onClose: () => void;
  onOpenJournal: () => void;
}) {
  const v = s.vehicle;
  const ve = fleet.events.filter((e) => e.vehicle_id === v.id).sort(byTime);
  const recent = ve.slice(-8).reverse();
  const month = monthKey(new Date(now).toISOString());
  return (
    <Sheet
      title={<Plate plate={v.plate} size="lg" />}
      onClose={onClose}
      wide
      footer={
        <button className="btn btn-ink btn-block" onClick={onOpenJournal}>
          <ScrollText size={18} /> Все записи машины
        </button>
      }
    >
      <div className="stack loose">
        <div className="vehicle-meta">
          <span>
            {v.model}
            {v.body !== 'other' && ` · ${BODY_LABEL[v.body]}`}
          </span>
          {v.fuels.map((x) => (
            <FuelTag key={x} fuel={x} />
          ))}
          <StatusPill s={s} now={now} />
        </div>

        <div className="grid-stats">
          <div className="stat">
            <div className="stat-top">Одометр</div>
            {s.last ? <Odometer value={s.last.odometer} size="sm" /> : <div className="stat-value">—</div>}
            {s.last && <div className="stat-sub">{fmtDateTime(s.last.occurred_at)}</div>}
          </div>
          <Stat icon={Route} label="Пробег за месяц" value={fmtNum(monthKm(ve, month))} unit=" км" />
          <Stat icon={Truck} label="Сегодня" value={s.todayKm > 0 ? `+${fmtNum(s.todayKm)}` : '0'} unit=" км" />
        </div>

        {s.fuels.map((f) => (
          <section key={f.fuel} className="stack" style={{ gap: 10 }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <FuelTag fuel={f.fuel} text={<b style={{ color: 'var(--text)', fontSize: 15 }}>Расход · {FUEL_LABEL[f.fuel]}</b>} />
              <span className="grow" />
              {f.recent !== null && (
                <span className="pill">
                  сейчас <b style={{ color: 'var(--text)' }}>{fmtNum(f.recent, 1)}</b> л/100
                </span>
              )}
              {f.baseline !== null && <span className="pill">норма {fmtNum(f.baseline, 1)}</span>}
              <Deviation value={f.deviation} compact />
            </div>
            {f.intervals.length === 0 ? (
              <div className="note">
                <Fuel size={18} />
                Расход появится после двух заправок до полного бака.
              </div>
            ) : (
              <Columns
                data={intervalColumns(f)}
                yFormat={(n) => fmtNum(n)}
                reference={f.baseline !== null ? { value: f.baseline, label: `норма ${fmtNum(f.baseline, 1)}` } : null}
                height={150}
              />
            )}
          </section>
        ))}

        <section>
          <div className="h3" style={{ marginBottom: 6 }}>
            Последние записи
          </div>
          {recent.length === 0 ? (
            <div className="small faint">Записей пока нет</div>
          ) : (
            <div className="list">
              {recent.map((e) => (
                <div className="list-row" key={e.id}>
                  <EventIcon e={e} />
                  <div className="grow">
                    <div style={{ fontWeight: 650 }}>
                      {EVENT_LABEL[e.type]}
                      {e.type === 'refuel' && e.fuel && (
                        <span className="muted" style={{ fontWeight: 500 }}>
                          {' '}
                          · {fmtNum(e.liters, 1)} л · {fmtTenge(e.amount)}
                        </span>
                      )}
                    </div>
                    <div className="small faint">
                      {fleet.nameOf(e.driver_id)} · {fmtNum(e.odometer)} км · {fmtDateTime(e.occurred_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}

export default function Fleet({
  fleet,
  onOpenJournal,
  onOpenIssues
}: {
  fleet: FleetData;
  onOpenJournal: (vehicleId: string) => void;
  onOpenIssues: () => void;
}) {
  const now = useNow(60_000);
  const [openId, setOpenId] = useState<string | null>(null);

  const statuses = useMemo(
    () => fleet.vehicles.filter((v) => v.active).map((v) => vehicleStatus(v, fleet.events, now)),
    [fleet.vehicles, fleet.events, now]
  );
  const sorted = useMemo(() => {
    const rank = (s: VehicleStatus) => (s.shift && !s.shift.stale ? 0 : s.shift ? 1 : 2);
    return [...statuses].sort((a, b) => rank(a) - rank(b) || a.vehicle.plate.localeCompare(b.vehicle.plate));
  }, [statuses]);

  const onLine = statuses.filter((s) => s.shift && !s.shift.stale).length;
  const todayKm = sum(statuses.map((s) => s.todayKm));
  const today = dayKey(now);
  const todayRefuels = fleet.events.filter((e) => e.type === 'refuel' && dayKey(e.occurred_at) === today);
  const todayAmount = sum(todayRefuels.map((e) => e.amount ?? 0));
  const litersBy = (['petrol', 'lpg', 'diesel'] as FuelT[])
    .map((f) => ({ f, l: sum(todayRefuels.filter((e) => e.fuel === f).map((e) => e.liters ?? 0)) }))
    .filter((x) => x.l > 0);
  const issues7 = useMemo(
    () => findIssues(fleet.vehicles, fleet.events).filter((i) => now - Date.parse(i.at) <= 7 * DAY),
    [fleet.vehicles, fleet.events, now]
  );
  const open = statuses.find((s) => s.vehicle.id === openId) ?? null;

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack tight grow">
          <h1 className="h1">Парк</h1>
          <span className="muted">{capitalize(new Date(now).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }))}</span>
        </div>
      </div>

      <div className="grid-stats">
        <Stat icon={Truck} tone="good" label="На линии сейчас" value={onLine} unit={` из ${statuses.length}`}>
          <div className="meter" aria-hidden="true">
            {onLine > 0 && <span style={{ width: `${(onLine / Math.max(1, statuses.length)) * 100}%`, background: 'var(--good-dot)' }} />}
          </div>
        </Stat>
        <Stat icon={Route} label="Пробег сегодня" value={fmtNum(todayKm)} unit=" км" sub={`по ${statuses.filter((s) => s.todayKm > 0).length} машинам`} />
        <Stat icon={Fuel} tone="amber" label="Заправлено сегодня" value={fmtTenge(todayAmount)}>
          <div className="row wrap" style={{ gap: 10 }}>
            {litersBy.length === 0 ? (
              <span className="stat-sub">заправок не было</span>
            ) : (
              litersBy.map((x) => <FuelTag key={x.f} fuel={x.f} text={`${fmtNum(x.l, 1)} л`} />)
            )}
          </div>
        </Stat>
        <button className="stat" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={onOpenIssues}>
          <div className="stat-top">
            <span className={`stat-ico${issues7.length ? ' bad' : ' good'}`}>
              <TriangleAlert size={17} />
            </span>
            Замечания за 7 дней
          </div>
          <div className="stat-value">{issues7.length}</div>
          <div className="stat-sub">{issues7.length ? 'нажмите, чтобы посмотреть' : 'всё спокойно'}</div>
        </button>
      </div>

      <div className="section">
        {statuses.length === 0 ? (
          <div className="card">
            <Empty icon={Truck} title={fleet.loading ? 'Загрузка…' : 'Машин пока нет'} text="Добавьте машины в разделе «Машины»." />
          </div>
        ) : (
          <div className="grid-cards">
            {sorted.map((s) => (
              <FleetCard key={s.vehicle.id} s={s} now={now} nameOf={fleet.nameOf} onOpen={() => setOpenId(s.vehicle.id)} />
            ))}
          </div>
        )}
      </div>

      {open && (
        <VehicleSheet
          s={open}
          fleet={fleet}
          now={now}
          onClose={() => setOpenId(null)}
          onOpenJournal={() => {
            setOpenId(null);
            onOpenJournal(open.vehicle.id);
          }}
        />
      )}
    </div>
  );
}
