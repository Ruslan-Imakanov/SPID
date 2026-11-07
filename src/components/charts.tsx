// Графики на HTML/CSS по правилам dataviz: тонкие метки со скруглённым концом у данных,
// волосяные линии сетки, значения у конца полосы, подсказка на наведение и фокус,
// легенда при двух и более сериях, текст — только цветами текста.
import { Fragment, useState, type PointerEvent, type FocusEvent, type ReactNode } from 'react';

// ───────────────────────── Подсказка ─────────────────────────

export interface TipRow {
  color: string;
  label: string;
  value: string;
}
export interface TipContent {
  title: string;
  rows: TipRow[];
}
interface TipState extends TipContent {
  x: number;
  y: number;
}

export function useTip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const bind = (content: TipContent) => ({
    tabIndex: 0,
    onPointerEnter: (e: PointerEvent) => setTip({ ...content, x: e.clientX, y: e.clientY }),
    onPointerMove: (e: PointerEvent) => setTip({ ...content, x: e.clientX, y: e.clientY }),
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ ...content, x: r.left + r.width / 2, y: r.top + 4 });
    },
    onBlur: () => setTip(null)
  });
  return { tip, bind };
}

export function Tip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  const x = Math.min(Math.max(tip.x, 100), window.innerWidth - 100);
  const below = tip.y < 120;
  return (
    <div className="tip" style={{ left: x, top: tip.y, transform: below ? 'translate(-50%, 18px)' : undefined }} role="tooltip">
      <div className="tip-title">{tip.title}</div>
      {tip.rows.map((r, i) => (
        <div className="tip-row" key={i}>
          <span className="tip-key" style={{ ['--k' as string]: r.color }} />
          <b>{r.value}</b>
          <span style={{ color: '#a9b4c7' }}>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── Шкала ─────────────────────────

/** «Круглые» деления от 0 до чуть выше max. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.0001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
  if (v >= 10_000) return `${Math.round(v / 1000).toLocaleString('ru-RU')} тыс`;
  return Math.round(v).toLocaleString('ru-RU');
}

// ───────────────────────── Горизонтальные полосы ─────────────────────────

export interface HBarRow {
  key: string;
  group?: string;
  groupNote?: string;
  label: ReactNode;
  value: number | null;
  color: string;
  /** Отметка нормы (вертикальная черта). */
  mark?: number | null;
  valueText: string;
  sub?: ReactNode;
  tip: TipContent;
}

export function HBars({ rows, unit }: { rows: HBarRow[]; unit: string }) {
  const { tip, bind } = useTip();
  const max = Math.max(1, ...rows.flatMap((r) => [r.value ?? 0, r.mark ?? 0]));
  const ticks = niceTicks(max, 4);
  const top = ticks[ticks.length - 1];
  const pct = (v: number) => `${(v / top) * 100}%`;
  let lastGroup: string | undefined;

  return (
    <div className="hb">
      {rows.map((r) => {
        const showGroup = r.group !== undefined && r.group !== lastGroup;
        lastGroup = r.group;
        return (
          <Fragment key={r.key}>
            {showGroup && (
              <div className="hb-group">
                <span>{r.group}</span>
                {r.groupNote && <span style={{ fontWeight: 500 }}>{r.groupNote}</span>}
              </div>
            )}
            <div className="hb-row" {...bind(r.tip)} aria-label={`${r.tip.title}: ${r.valueText}`}>
              <div className="hb-label">{r.label}</div>
              <div className="hb-track">
                {ticks.slice(1).map((t) => (
                  <span key={t} className="hb-grid" style={{ left: pct(t) }} />
                ))}
                {r.value !== null && <span className="hb-bar" style={{ width: pct(r.value), ['--k' as string]: r.color }} />}
                {r.mark != null && <span className="hb-mark" style={{ left: pct(r.mark) }} />}
              </div>
              <div className="hb-val">
                {r.value !== null ? r.valueText : <span className="faint" style={{ fontWeight: 500, fontSize: 12.5 }}>нет данных</span>}
                {r.sub && <small>{r.sub}</small>}
              </div>
            </div>
          </Fragment>
        );
      })}
      <div className="hb-axis" aria-hidden="true">
        <span />
        <div className="hb-axis-scale">
          {ticks.map((t) => (
            <span key={t} style={{ left: pct(t) }}>
              {t.toLocaleString('ru-RU')}
            </span>
          ))}
        </div>
        <span className="faint small" style={{ textAlign: 'right' }}>
          {unit}
        </span>
      </div>
      <Tip tip={tip} />
    </div>
  );
}

// ───────────────────────── Столбцы (со стеком) ─────────────────────────

export interface ColSegment {
  key: string;
  value: number;
  color: string;
  label: string;
}
export interface ColDatum {
  key: string;
  xLabel?: string;
  segments: ColSegment[];
  tip: TipContent;
}

export function Columns({
  data,
  yFormat = compact,
  reference,
  height = 190
}: {
  data: ColDatum[];
  yFormat?: (v: number) => string;
  reference?: { value: number; label: string } | null;
  height?: number;
}) {
  const { tip, bind } = useTip();
  const totals = data.map((d) => d.segments.reduce((a, s) => a + s.value, 0));
  const max = Math.max(1, ...totals, reference?.value ?? 0);
  const ticks = niceTicks(max, 4);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => (v / top) * 100;
  const n = data.length;

  return (
    <div>
      <div className="cols">
        <div className="cols-y" style={{ height }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${y(t)}%` }}>
              {yFormat(t)}
            </span>
          ))}
        </div>
        <div className="cols-plot" style={{ height }}>
          {ticks.slice(1).map((t) => (
            <span key={t} className="cols-grid" style={{ bottom: `${y(t)}%` }} />
          ))}
          <div className="cols-bars">
            {data.map((d, i) => (
              <div key={d.key} className="cols-slot" {...bind(d.tip)} aria-label={d.tip.title}>
                {totals[i] > 0 && (
                  <div className="cols-stack" style={{ height: `${y(totals[i])}%` }}>
                    {d.segments
                      .filter((s) => s.value > 0)
                      .map((s) => (
                        <span
                          key={s.key}
                          className="cols-seg"
                          style={{ flexGrow: s.value, flexBasis: 0, ['--k' as string]: s.color }}
                        />
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {reference && (
            <>
              <span className="cols-ref" style={{ bottom: `${y(reference.value)}%` }} />
              <span className="cols-ref-label" style={{ bottom: `${y(reference.value)}%` }}>
                {reference.label}
              </span>
            </>
          )}
        </div>
        <div className="cols-x" aria-hidden="true">
          {data.map((d, i) =>
            d.xLabel ? (
              <span key={d.key} style={{ left: `${((i + 0.5) / n) * 100}%` }}>
                {d.xLabel}
              </span>
            ) : null
          )}
        </div>
      </div>
      <Tip tip={tip} />
    </div>
  );
}
