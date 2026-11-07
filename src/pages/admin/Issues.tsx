import { useMemo, useState } from 'react';
import { findIssues, type IssueKind } from '../../lib/calc';
import { fmtDateTime } from '../../lib/format';
import type { FleetEvent } from '../../lib/types';
import EventDetail from './EventDetail';
import type { Fleet } from './useFleet';

const KIND_LABEL: Record<IssueKind, string> = {
  overuse: 'Перерасход',
  off_shift: 'Пробег вне смены',
  odometer_back: 'Пробег уменьшился',
  big_jump: 'Скачок пробега',
  unclosed_shift: 'Смена не закрыта',
  low_use: 'Низкий расход'
};

export default function Issues({ fleet }: { fleet: Fleet }) {
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState<IssueKind | ''>('');
  const [open, setOpen] = useState<FleetEvent | null>(null);

  const issues = useMemo(() => {
    const since = Date.now() - days * 86_400_000;
    return findIssues(fleet.vehicles, fleet.events).filter((i) => Date.parse(i.at) >= since && (!kind || i.kind === kind));
  }, [fleet.vehicles, fleet.events, days, kind]);

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 16 }}>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 'auto' }}>
          <option value={7}>за 7 дней</option>
          <option value={30}>за 30 дней</option>
          <option value={90}>за 90 дней</option>
          <option value={3650}>за всё время</option>
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as IssueKind | '')} style={{ width: 'auto' }}>
          <option value="">Все замечания</option>
          {(Object.keys(KIND_LABEL) as IssueKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {issues.length === 0 && <div className="muted">Замечаний нет 👍</div>}
        {issues.map((i, idx) => {
          const ev = i.eventId ? fleet.events.find((e) => e.id === i.eventId) : undefined;
          return (
            <div className="list-item" key={`${i.kind}-${i.eventId}-${idx}`}>
              <div>
                <div className="row" style={{ gap: 6 }}>
                  <span className={`badge ${i.severity === 'high' ? 'bad' : 'warn'}`}>{KIND_LABEL[i.kind]}</span>
                  <b>{fleet.plateOf(i.vehicleId)}</b>
                  <span className="muted small">
                    {fleet.nameOf(i.driverId)} · {fmtDateTime(i.at)}
                  </span>
                </div>
                <div style={{ marginTop: 4 }}>{i.text}</div>
              </div>
              {ev && (
                <button className="link small" onClick={() => setOpen(ev)}>
                  Запись
                </button>
              )}
            </div>
          );
        })}
      </div>
      {open && <EventDetail event={open} fleet={fleet} onClose={() => setOpen(null)} />}
    </div>
  );
}
