// Декоративная шкала прибора (как спидометр / указатель топлива) для заставок.

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const s = polar(cx, cy, r, from);
  const e = polar(cx, cy, r, to);
  const large = Math.abs(from - to) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

/** value — положение стрелки 0..1 */
export default function GaugeArt({ value = 0.68, className, size = 200 }: { value?: number; className?: string; size?: number }) {
  const cx = 100;
  const cy = 100;
  const START = 225;
  const SPAN = 270;
  const needle = START - SPAN * value;
  const ticks = Array.from({ length: 28 }, (_, i) => i);
  const tip = polar(cx, cy, 70, needle);
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <path d={arc(cx, cy, 86, START, START - SPAN)} fill="none" stroke="rgb(255 255 255 / 0.10)" strokeWidth="10" strokeLinecap="round" />
      <path d={arc(cx, cy, 86, START, needle)} fill="none" stroke="#FFB21A" strokeWidth="10" strokeLinecap="round" opacity="0.9" />
      {ticks.map((i) => {
        const a = START - (SPAN / 27) * i;
        const major = i % 9 === 0;
        const p1 = polar(cx, cy, major ? 60 : 66, a);
        const p2 = polar(cx, cy, 74, a);
        return (
          <line
            key={i}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={major ? 'rgb(255 255 255 / 0.55)' : 'rgb(255 255 255 / 0.22)'}
            strokeWidth={major ? 3 : 2}
            strokeLinecap="round"
          />
        );
      })}
      <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="#FFB21A" strokeWidth="4" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="9" fill="#FFB21A" />
      <circle cx={cx} cy={cy} r="4" fill="#0B1322" />
    </svg>
  );
}
