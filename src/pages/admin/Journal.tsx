import { useMemo, useState } from 'react';
import { Camera, ChevronRight, Receipt, ScrollText } from 'lucide-react';
import { dayKey, monthKey } from '../../lib/calc';
import { capitalize, currentMonth, fmtNum, fmtTenge, fmtTime } from '../../lib/format';
import { EVENT_LABEL, FUEL_LABEL, type EventType, type FleetEvent } from '../../lib/types';
import { Empty, Plate } from '../../components/ui';
import { EventIcon } from '../DriverApp';
import EventDetail from './EventDetail';
import { MonthNav } from './Report';
import type { Fleet } from './useFleet';

function dayTitle(key: string): string {
  const today = dayKey(Date.now());
  const yesterday = dayKey(Date.now() - 86_400_000);
  if (key === today) return 'Сегодня';
  if (key === yesterday) return 'Вчера';
  const [y, m, d] = key.split('-').map(Number);
  return capitalize(new Date(y, m - 1, d).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
}

export default function Journal({
  fleet,
  vehicleId,
  onVehicleChange
}: {
  fleet: Fleet;
  vehicleId: string;
  onVehicleChange: (id: string) => void;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [driverId, setDriverId] = useState('');
  const [type, setType] = useState<EventType | ''>('');
  const [open, setOpen] = useState<FleetEvent | null>(null);

  const rows = useMemo(
    () =>
      fleet.events
        .filter(
          (e) =>
            monthKey(e.occurred_at) === month &&
            (!vehicleId || e.vehicle_id === vehicleId) &&
            (!driverId || e.driver_id === driverId) &&
            (!type || e.type === type)
        )
        .slice()
        .reverse(),
    [fleet.events, month, vehicleId, driverId, type]
  );
  const byDay = useMemo(() => {
    const m = new Map<string, FleetEvent[]>();
    for (const e of rows) {
      const k = dayKey(e.occurred_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Журнал</h1>
        <MonthNav value={month} onChange={setMonth} />
      </div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <select className="input compact" value={vehicleId} onChange={(e) => onVehicleChange(e.target.value)} aria-label="Машина">
          <option value="">Все машины</option>
          {fleet.vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate}
            </option>
          ))}
        </select>
        <select className="input compact" value={driverId} onChange={(e) => setDriverId(e.target.value)} aria-label="Сотрудник">
          <option value="">Все сотрудники</option>
          {fleet.profiles
            .filter((p) => p.role === 'driver' || p.role === 'admin')
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.phone}
              </option>
            ))}
        </select>
      </div>
      <div className="chips" style={{ marginBottom: 16 }}>
        {(
          [
            ['', 'Все записи'],
            ['shift_start', 'Начало смены'],
            ['shift_end', 'Конец смены'],
            ['refuel', 'Заправки']
          ] as [EventType | '', string][]
        ).map(([t, label]) => (
          <button key={t || 'all'} className={`chip${type === t ? ' active' : ''}`} onClick={() => setType(t)}>
            {label}
          </button>
        ))}
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <Empty icon={ScrollText} title="Записей нет" text="Смените месяц или фильтры." />
        ) : (
          byDay.map(([day, list]) => (
            <div key={day}>
              <div className="day-head eyebrow" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13 }}>
                {dayTitle(day)} · {list.length}
              </div>
              <div className="list">
                {list.map((e) => (
                  <div className="list-row click" key={e.id} role="button" tabIndex={0} onClick={() => setOpen(e)} onKeyDown={(k) => k.key === 'Enter' && setOpen(e)}>
                    <EventIcon e={e} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row wrap" style={{ gap: 8 }}>
                        <b>{EVENT_LABEL[e.type]}</b>
                        <Plate plate={fleet.plateOf(e.vehicle_id)} size="sm" />
                      </div>
                      <div className="small faint" style={{ marginTop: 2 }}>
                        {fmtTime(e.occurred_at)} · {fleet.nameOf(e.driver_id)} · {fmtNum(e.odometer)} км
                        {e.type === 'refuel' && e.fuel && (
                          <>
                            {' '}
                            · {FUEL_LABEL[e.fuel]} {fmtNum(e.liters, 1)} л · {fmtTenge(e.amount)}
                            {e.full_tank ? '' : ' · неполный бак'}
                          </>
                        )}
                      </div>
                    </div>
                    <span className="row faint" style={{ gap: 4 }}>
                      {e.odometer_photo && <Camera size={16} aria-label="есть фото одометра" />}
                      {e.receipt_photo && <Receipt size={16} aria-label="есть фото чека" />}
                    </span>
                    <ChevronRight size={18} className="faint" />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      {open && <EventDetail event={open} fleet={fleet} onClose={() => setOpen(null)} />}
    </div>
  );
}
