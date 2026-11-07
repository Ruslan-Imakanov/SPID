import { useMemo, useState } from 'react';
import { monthKey } from '../../lib/calc';
import { currentMonth, fmtDateTime, fmtNum, fmtTenge } from '../../lib/format';
import { EVENT_LABEL, FUEL_LABEL, type EventType, type FleetEvent } from '../../lib/types';
import MonthNav from '../../components/MonthNav';
import EventDetail from './EventDetail';
import type { Fleet } from './useFleet';

export default function Journal({ fleet }: { fleet: Fleet }) {
  const [month, setMonth] = useState(currentMonth());
  const [vehicleId, setVehicleId] = useState('');
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

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 16 }}>
        <MonthNav value={month} onChange={setMonth} />
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Все машины</option>
          {fleet.vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate}
            </option>
          ))}
        </select>
        <select value={driverId} onChange={(e) => setDriverId(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Все водители</option>
          {fleet.profiles
            .filter((p) => p.role !== 'pending')
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.phone}
              </option>
            ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as EventType | '')} style={{ width: 'auto' }}>
          <option value="">Все записи</option>
          <option value="shift_start">Начало смены</option>
          <option value="shift_end">Конец смены</option>
          <option value="refuel">Заправки</option>
        </select>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="muted">Записей нет</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Машина</th>
                  <th>Водитель</th>
                  <th>Запись</th>
                  <th className="r">Пробег</th>
                  <th>Заправка</th>
                  <th>Фото</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="click" onClick={() => setOpen(e)}>
                    <td className="num">{fmtDateTime(e.occurred_at)}</td>
                    <td>
                      <b>{fleet.plateOf(e.vehicle_id)}</b>
                    </td>
                    <td>{fleet.nameOf(e.driver_id)}</td>
                    <td>{EVENT_LABEL[e.type]}</td>
                    <td className="r num">{fmtNum(e.odometer)}</td>
                    <td className="small">
                      {e.type === 'refuel' && e.fuel && (
                        <>
                          {FUEL_LABEL[e.fuel]} {fmtNum(e.liters, 1)} л · {fmtTenge(e.amount)}
                          {e.full_tank ? '' : ' · неполный'}
                        </>
                      )}
                    </td>
                    <td className="small">{[e.odometer_photo && '📷', e.receipt_photo && '🧾'].filter(Boolean).join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && <EventDetail event={open} fleet={fleet} onClose={() => setOpen(null)} />}
    </div>
  );
}
