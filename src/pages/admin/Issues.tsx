import { useMemo, useState } from 'react';
import { ChevronRight, Clock3, MoonStar, RotateCcw, ShieldCheck, TrendingDown, TrendingUp, Zap, type LucideIcon } from 'lucide-react';
import { findIssues, type IssueKind } from '../../lib/calc';
import { fmtDateTime } from '../../lib/format';
import type { FleetEvent } from '../../lib/types';
import { Empty, Plate } from '../../components/ui';
import EventDetail from './EventDetail';
import type { Fleet } from './useFleet';

const KIND: Record<IssueKind, { label: string; icon: LucideIcon }> = {
  overuse: { label: 'Перерасход', icon: TrendingUp },
  off_shift: { label: 'Пробег вне смены', icon: MoonStar },
  odometer_back: { label: 'Пробег уменьшился', icon: RotateCcw },
  big_jump: { label: 'Скачок пробега', icon: Zap },
  unclosed_shift: { label: 'Смена не закрыта', icon: Clock3 },
  low_use: { label: 'Низкий расход', icon: TrendingDown }
};

export default function Issues({ fleet }: { fleet: Fleet }) {
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState<IssueKind | ''>('');
  const [open, setOpen] = useState<FleetEvent | null>(null);

  const inPeriod = useMemo(() => {
    const since = Date.now() - days * 86_400_000;
    return findIssues(fleet.vehicles, fleet.events).filter((i) => Date.parse(i.at) >= since);
  }, [fleet.vehicles, fleet.events, days]);
  const issues = kind ? inPeriod.filter((i) => i.kind === kind) : inPeriod;
  const counts = (k: IssueKind) => inPeriod.filter((i) => i.kind === k).length;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Замечания</h1>
        <select className="input compact" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Период">
          <option value={7}>за 7 дней</option>
          <option value={30}>за 30 дней</option>
          <option value={90}>за 90 дней</option>
          <option value={3650}>за всё время</option>
        </select>
      </div>

      <div className="chips" style={{ marginBottom: 16 }}>
        <button className={`chip${kind === '' ? ' active' : ''}`} onClick={() => setKind('')}>
          Все · {inPeriod.length}
        </button>
        {(Object.keys(KIND) as IssueKind[])
          .filter((k) => counts(k) > 0)
          .map((k) => {
            const Icon = KIND[k].icon;
            return (
              <button key={k} className={`chip${kind === k ? ' active' : ''}`} onClick={() => setKind(k)}>
                <Icon size={15} /> {KIND[k].label} · {counts(k)}
              </button>
            );
          })}
      </div>

      {issues.length === 0 ? (
        <div className="card">
          <Empty icon={ShieldCheck} title="Замечаний нет" text="Пробег, смены и расход в порядке." />
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {issues.map((i, idx) => {
            const ev = i.eventId ? fleet.events.find((e) => e.id === i.eventId) : undefined;
            const Icon = KIND[i.kind].icon;
            return (
              <article
                key={`${i.kind}-${i.eventId}-${idx}`}
                className={`issue${i.severity === 'high' ? ' high' : ''}`}
                style={{ cursor: ev ? 'pointer' : 'default' }}
                onClick={() => ev && setOpen(ev)}
              >
                <span className="issue-ico">
                  <Icon size={19} />
                </span>
                <div className="grow stack tight" style={{ gap: 4 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <b>{KIND[i.kind].label}</b>
                    <Plate plate={fleet.plateOf(i.vehicleId)} size="sm" />
                    <span className="small faint">
                      {fleet.nameOf(i.driverId)} · {fmtDateTime(i.at)}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 15 }}>
                    {i.text}
                  </div>
                </div>
                {ev && <ChevronRight size={18} className="faint" style={{ alignSelf: 'center' }} />}
              </article>
            );
          })}
        </div>
      )}
      {open && <EventDetail event={open} fleet={fleet} onClose={() => setOpen(null)} />}
    </div>
  );
}
