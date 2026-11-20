import { useMemo, useState } from 'react';
import { CircleAlert, Clock3, MapPin, Pencil, Plus, Route as RouteIcon, Settings2, Truck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { buildTrips, monthKey, sum, type Trip } from '../../lib/calc';
import { currentMonth, fmtDateTime, fmtNum, fmtTime } from '../../lib/format';
import { Avatar, Empty, Plate, Sheet, Stat, Switch, durationParts, useNow } from '../../components/ui';
import { MonthNav } from './Report';
import type { Fleet } from './useFleet';

function RegionsSheet({ fleet, onClose }: { fleet: Fleet; onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setError(null);
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return setError(/duplicate|unique/i.test(error.message) ? 'Такой регион уже есть' : error.message);
    await fleet.reload();
  };
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    await run(() => supabase.from('regions').insert({ name: n, sort: (fleet.regions.reduce((m, r) => Math.max(m, r.sort === 99 ? 0 : r.sort), 0) || 0) + 1 }));
    setName('');
  };
  const rename = (id: string, current: string) => {
    const n = prompt('Название региона', current);
    if (n && n.trim() && n.trim() !== current) void run(() => supabase.from('regions').update({ name: n.trim() }).eq('id', id));
  };

  return (
    <Sheet title="Регионы" icon={<MapPin size={20} />} onClose={onClose}>
      <div className="stack loose">
        <div className="small muted">Водитель выбирает регион при начале смены. Скрытый регион в списке не показывается, а старые рейсы остаются.</div>
        <div className="row">
          <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Новый регион, например: Талдыкорган" onKeyDown={(e) => e.key === 'Enter' && void add()} />
          <button className="btn btn-primary" onClick={() => void add()} disabled={busy || !name.trim()}>
            <Plus size={18} /> Добавить
          </button>
        </div>
        {error && (
          <div className="note bad">
            <CircleAlert size={18} /> {error}
          </div>
        )}
        <div className="list">
          {fleet.regions.map((r) => (
            <div className="list-row" key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
              <span className="type-ico">
                <MapPin size={18} />
              </span>
              <b className="grow">{r.name}</b>
              <button className="icon-btn" onClick={() => rename(r.id, r.name)} aria-label="Переименовать">
                <Pencil size={17} />
              </button>
              <Switch checked={r.active} onChange={(v) => void run(() => supabase.from('regions').update({ active: v }).eq('id', r.id))} label={<span className="small">{r.active ? 'Показан' : 'Скрыт'}</span>} />
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

export default function Routes({ fleet }: { fleet: Fleet }) {
  const now = useNow(60_000);
  const [month, setMonth] = useState(currentMonth());
  const [region, setRegion] = useState('');
  const [manage, setManage] = useState(false);

  const trips = useMemo(() => buildTrips(fleet.vehicles, fleet.events), [fleet.vehicles, fleet.events]);
  const onRoad = trips.filter((t) => t.open && now - Date.parse(t.startAt) <= 20 * 3_600_000);
  const stale = trips.filter((t) => t.open && now - Date.parse(t.startAt) > 20 * 3_600_000);
  const inMonth = trips.filter((t) => !t.open && monthKey(t.startAt) === month && (!region || t.regionId === region));

  const byRegion = useMemo(() => {
    const m = new Map<string, { id: string | null; trips: number; km: number; drivers: Set<string> }>();
    for (const t of trips.filter((x) => !x.open && monthKey(x.startAt) === month)) {
      const k = t.regionId ?? 'none';
      const row = m.get(k) ?? { id: t.regionId, trips: 0, km: 0, drivers: new Set<string>() };
      row.trips += 1;
      row.km += t.km ?? 0;
      row.drivers.add(t.driverId);
      m.set(k, row);
    }
    return [...m.values()].sort((a, b) => b.km - a.km);
  }, [trips, month]);

  const plate = (t: Trip) => fleet.plateOf(t.vehicleId);
  const card = (t: Trip, late?: boolean) => {
    const d = durationParts(t.startAt, now);
    return (
      <article className="card fleet-card" key={t.key}>
        <div className="row between">
          <Plate plate={plate(t)} />
          <span className={`pill ${late ? 'warn' : 'good'}`}>{late ? 'Не закрыт' : <><span className="live-dot" /> В пути</>}</span>
        </div>
        <div className="row">
          <Avatar name={fleet.nameOf(t.driverId)} size="sm" />
          <b>{fleet.nameOf(t.driverId)}</b>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="pill amber">
            <MapPin size={14} /> {t.regionId ? fleet.regionName(t.regionId) : 'Регион не указан'}
          </span>
          <span className="pill">
            <Clock3 size={14} /> с {fmtTime(t.startAt)} · {d.h} ч {d.m} мин
          </span>
        </div>
        <div className="small faint">Выезд: {fmtNum(t.startOdo)} км · {fmtDateTime(t.startAt)}</div>
      </article>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Маршруты</h1>
        <button className="btn" onClick={() => setManage(true)}>
          <Settings2 size={18} /> Регионы
        </button>
      </div>

      <div className="grid-stats">
        <Stat icon={Truck} tone="good" label="Сейчас в пути" value={onRoad.length} sub={onRoad.length ? [...new Set(onRoad.map((t) => fleet.regionName(t.regionId)))].join(', ') : 'все машины на базе'} />
        <Stat icon={RouteIcon} label="Рейсов за месяц" value={inMonth.length} sub={region ? fleet.regionName(region) : 'по всем регионам'} />
        <Stat icon={MapPin} tone="amber" label="Пробег рейсов" value={fmtNum(sum(inMonth.map((t) => t.km ?? 0)))} unit=" км" />
      </div>

      <section className="section">
        <div className="section-title">
          <h2 className="h2">Сейчас в пути</h2>
        </div>
        {onRoad.length + stale.length === 0 ? (
          <div className="card">
            <Empty icon={Truck} title="Сейчас никто не в пути" text="Когда водитель начнёт смену и выберет регион, рейс появится здесь." />
          </div>
        ) : (
          <div className="grid-cards">
            {onRoad.map((t) => card(t))}
            {stale.map((t) => card(t, true))}
          </div>
        )}
      </section>

      <section className="card pad-lg section">
        <div className="card-head row" style={{ flexWrap: 'wrap' }}>
          <h2 className="h2">Рейсы</h2>
          <MonthNav value={month} onChange={setMonth} />
        </div>
        <div className="chips" style={{ marginBottom: 12 }}>
          <button className={`chip${region === '' ? ' active' : ''}`} onClick={() => setRegion('')}>
            Все регионы
          </button>
          {fleet.regions
            .filter((r) => r.active || trips.some((t) => t.regionId === r.id))
            .map((r) => (
              <button key={r.id} className={`chip${region === r.id ? ' active' : ''}`} onClick={() => setRegion(r.id)}>
                {r.name}
              </button>
            ))}
        </div>
        {inMonth.length === 0 ? (
          <div className="small faint">Завершённых рейсов за этот месяц нет.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Выезд</th>
                  <th>Возврат</th>
                  <th>Регион</th>
                  <th>Водитель</th>
                  <th>Машина</th>
                  <th className="r">Пробег</th>
                </tr>
              </thead>
              <tbody>
                {inMonth.map((t) => (
                  <tr key={t.key}>
                    <td className="num">{fmtDateTime(t.startAt)}</td>
                    <td className="num">{t.endAt ? fmtDateTime(t.endAt) : '—'}</td>
                    <td>{fleet.regionName(t.regionId)}</td>
                    <td>{fleet.nameOf(t.driverId)}</td>
                    <td>
                      <Plate plate={plate(t)} size="sm" />
                    </td>
                    <td className="r num">{fmtNum(t.km)} км</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {byRegion.length > 0 && (
        <section className="card pad-lg section">
          <div className="card-head">
            <h2 className="h2">По регионам за месяц</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Регион</th>
                  <th className="r">Рейсов</th>
                  <th className="r">Водителей</th>
                  <th className="r">Пробег</th>
                </tr>
              </thead>
              <tbody>
                {byRegion.map((r) => (
                  <tr key={r.id ?? 'none'}>
                    <td>{r.id ? fleet.regionName(r.id) : <span className="faint">Регион не указан</span>}</td>
                    <td className="r num">{r.trips}</td>
                    <td className="r num">{r.drivers.size}</td>
                    <td className="r num">{fmtNum(r.km)} км</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {manage && <RegionsSheet fleet={fleet} onClose={() => setManage(false)} />}
    </div>
  );
}
