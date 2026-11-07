// Сроки страховых полисов: сколько дней осталось, статус, полисы водителя и машины.
import type { InsurancePolicy, Vehicle } from './types';

/** За сколько дней до конца предупреждаем (жёлтый). */
export const WARN_DAYS = 30;
/** Срочно (красный): неделя и меньше, а также просроченные. */
export const CRITICAL_DAYS = 7;

export type InsTone = 'bad' | 'warn' | 'good' | 'none';

export interface InsStatus {
  tone: InsTone;
  /** Дней до конца (отрицательное — просрочен), null — полиса нет. */
  days: number | null;
  /** «Осталось 12 дней», «Просрочена 3 дня», «До 12.03.2027», «Нет полиса». */
  label: string;
  policy: InsurancePolicy | null;
}

export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  const w = a > 10 && a < 20 ? forms[2] : b === 1 ? forms[0] : b >= 2 && b <= 4 ? forms[1] : forms[2];
  return `${n} ${w}`;
}

/** Дней от сегодняшнего дня (по местному времени) до даты окончания включительно. */
export function daysLeft(endsOn: string, now = Date.now()): number {
  const [y, m, d] = endsOn.split('-').map(Number);
  const end = new Date(y, m - 1, d).getTime();
  const t = new Date(now);
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((end - today) / 86_400_000);
}

export function fmtDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

export function policyStatus(p: InsurancePolicy, now = Date.now()): InsStatus {
  const days = daysLeft(p.ends_on, now);
  if (days < 0) return { tone: 'bad', days, label: `Просрочена ${plural(-days, ['день', 'дня', 'дней'])}`, policy: p };
  if (days === 0) return { tone: 'bad', days, label: 'Последний день', policy: p };
  if (days <= CRITICAL_DAYS) return { tone: 'bad', days, label: `Осталось ${plural(days, ['день', 'дня', 'дней'])}`, policy: p };
  if (days <= WARN_DAYS) return { tone: 'warn', days, label: `Осталось ${plural(days, ['день', 'дня', 'дней'])}`, policy: p };
  return { tone: 'good', days, label: `До ${fmtDate(p.ends_on)}`, policy: p };
}

const NONE: InsStatus = { tone: 'none', days: null, label: 'Нет полиса', policy: null };

/** Полисы водителя: оформленные на него и полисы закреплённой за ним машины без указания водителя. */
export function driverPolicies(policies: InsurancePolicy[], driverId: string, vehicles: Vehicle[]): InsurancePolicy[] {
  const mine = new Set(vehicles.filter((v) => v.assigned_driver === driverId).map((v) => v.id));
  return policies.filter((p) => p.driver_id === driverId || (p.driver_id === null && p.vehicle_id !== null && mine.has(p.vehicle_id)));
}

/** Полисы машины: оформленные на машину и полисы закреплённого водителя без указания машины. */
export function vehiclePolicies(policies: InsurancePolicy[], vehicle: Vehicle): InsurancePolicy[] {
  return policies.filter(
    (p) => p.vehicle_id === vehicle.id || (p.vehicle_id === null && vehicle.assigned_driver !== null && p.driver_id === vehicle.assigned_driver)
  );
}

/** Действующий полис каждого вида — с самой поздней датой окончания. */
export function currentByKind(list: InsurancePolicy[]): InsurancePolicy[] {
  const best = new Map<string, InsurancePolicy>();
  for (const p of list) {
    const cur = best.get(p.kind);
    if (!cur || p.ends_on > cur.ends_on) best.set(p.kind, p);
  }
  return [...best.values()];
}

const RANK: Record<InsTone, number> = { bad: 0, warn: 1, good: 2, none: 3 };

/** Итоговый статус: самый срочный среди действующих полисов каждого вида. */
export function summaryStatus(list: InsurancePolicy[], now = Date.now()): InsStatus {
  const current = currentByKind(list);
  if (current.length === 0) return NONE;
  return current
    .map((p) => policyStatus(p, now))
    .sort((a, b) => RANK[a.tone] - RANK[b.tone] || (a.days ?? 0) - (b.days ?? 0))[0];
}
