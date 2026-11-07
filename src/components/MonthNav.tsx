import { currentMonth, monthLabel, shiftMonth } from '../lib/format';

export default function MonthNav({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const isCurrent = value >= currentMonth();
  return (
    <div className="month-nav">
      <button className="btn" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Предыдущий месяц">
        ‹
      </button>
      <span className="title">{monthLabel(value)}</span>
      <button className="btn" onClick={() => onChange(shiftMonth(value, 1))} disabled={isCurrent} aria-label="Следующий месяц">
        ›
      </button>
    </div>
  );
}
