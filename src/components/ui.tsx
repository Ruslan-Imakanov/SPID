import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Droplet, Droplets, Flame, X, type LucideIcon } from 'lucide-react';
import { FUEL_LABEL, type Fuel } from '../lib/types';

// ───────────────────────── Логотип ─────────────────────────

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#0B1322" />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15.25" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="1.5" />
      <path d="M32 8.5C32 8.5 15 27.2 15 39a17 17 0 0 0 34 0C49 27.2 32 8.5 32 8.5Z" fill="#FFB21A" />
      <path d="M24 39.5l5.6 5.6L40.5 34" fill="none" stroke="#0B1322" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ size = 36, large, sub = true }: { size?: number; large?: boolean; sub?: boolean }) {
  return (
    <span className={`logo${large ? ' lg' : ''}`}>
      <LogoMark size={size} />
      <span className="logo-word">
        <b>ГСМ</b>
        {sub && <span>Контроль</span>}
      </span>
    </span>
  );
}

// ───────────────────────── Госномер ─────────────────────────

/** 150AIB → 150 AIB; 123ABC02 → 123 ABC + регион 02 */
export function splitPlate(plate: string): { main: string; region: string | null } {
  const p = plate.replace(/\s+/g, '').toUpperCase();
  const m = p.match(/^(\d{3})([A-Z]{2,3})(\d{2})?$/);
  if (m) return { main: `${m[1]} ${m[2]}`, region: m[3] ?? null };
  return { main: p, region: null };
}

export function Plate({ plate, size = 'md' }: { plate: string; size?: 'sm' | 'md' | 'lg' }) {
  const { main, region } = splitPlate(plate);
  return (
    <span className={`plate ${size}`} aria-label={`Госномер ${plate}`}>
      <span className="plate-side" aria-hidden="true">
        <span className="plate-flag" />
        <span className="plate-kz">KZ</span>
      </span>
      <span className="plate-num">{main}</span>
      {region && <span className="plate-region">{region}</span>}
    </span>
  );
}

// ───────────────────────── Одометр ─────────────────────────

export function Odometer({
  value,
  minDigits = 6,
  size = 'md',
  unit = true,
  focusIndex
}: {
  value: string | number | null;
  minDigits?: number;
  size?: 'sm' | 'md';
  unit?: boolean;
  /** Подсветка ячейки, куда пойдёт следующая цифра (при вводе). */
  focusIndex?: number;
}) {
  const digits = value === null || value === '' ? '' : String(value).replace(/\D/g, '');
  const len = Math.max(minDigits, digits.length);
  const padded = digits.padStart(len, '0');
  const firstReal = len - digits.length;
  return (
    <span className={`odo${size === 'sm' ? ' sm' : ''}`} aria-hidden="true">
      {padded.split('').map((d, i) => (
        <span key={i} className={`odo-cell${i < firstReal ? ' dim' : ''}${focusIndex === i ? ' next' : ''}`}>
          {d}
        </span>
      ))}
      {unit && <span className="odo-unit">КМ</span>}
    </span>
  );
}

// ───────────────────────── Топливо ─────────────────────────

export const FUEL_ICON: Record<Fuel, LucideIcon> = {
  petrol: Droplet,
  lpg: Flame,
  diesel: Droplets
};

export function FuelTag({ fuel, text }: { fuel: Fuel; text?: ReactNode }) {
  return (
    <span className={`fuel-tag fuel-${fuel}`}>
      <span className="fuel-key" aria-hidden="true" />
      {text ?? FUEL_LABEL[fuel]}
    </span>
  );
}

// ───────────────────────── Аватар ─────────────────────────

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({ name, size }: { name: string; size?: 'sm' | 'lg' }) {
  return (
    <span className={`avatar${size ? ` ${size}` : ''}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

// ───────────────────────── Нижний лист / диалог ─────────────────────────

export function Sheet({
  title,
  onClose,
  children,
  footer,
  wide,
  icon
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  icon?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          {icon}
          <h2 className="h2">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ───────────────────────── Прочее ─────────────────────────

export function Switch({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true" />
      <span className="stack tight" style={{ gap: 2 }}>
        <span style={{ fontWeight: 650 }}>{label}</span>
        {hint && <span className="small faint">{hint}</span>}
      </span>
    </label>
  );
}

export function Empty({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-ico">
        <Icon size={26} />
      </span>
      <div className="h3">{title}</div>
      {text && <div className="small">{text}</div>}
      {children}
    </div>
  );
}

export function Stat({
  icon: Icon,
  tone,
  label,
  value,
  unit,
  sub,
  children
}: {
  icon: LucideIcon;
  tone?: 'amber' | 'good' | 'bad';
  label: string;
  value?: ReactNode;
  unit?: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className={`stat-ico${tone ? ` ${tone}` : ''}`}>
          <Icon size={17} />
        </span>
        {label}
      </div>
      {value !== undefined && (
        <div className="stat-value">
          {value}
          {unit && <small>{unit}</small>}
        </div>
      )}
      {children}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Текущее время, обновляется раз в intervalMs (для таймера смены). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function durationParts(fromIso: string, now: number): { h: number; m: number } {
  const ms = Math.max(0, now - Date.parse(fromIso));
  const totalMin = Math.floor(ms / 60_000);
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

export function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url]
  );
  return url;
}
