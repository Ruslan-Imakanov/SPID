// Расчёт расхода топлива. Чистые функции без обращения к сети — их покрывают тесты.
//
// Метод «от полного бака до полного»: между двумя заправками до полного бака одним видом
// топлива машина сожгла ровно столько, сколько залили во второй раз (плюс все неполные
// дозаправки между ними). Расход = литры / км × 100.
//
// Норма машины не задаётся вручную: это медиана расхода по её предыдущим интервалам
// (последние несколько месяцев), поэтому она сама подстраивается под зиму и лето.

import type { FleetEvent, Fuel, Vehicle } from './types';

/** Порог перерасхода относительно нормы машины (10%). */
export const OVERUSE_THRESHOLD = 0.1;
/** Сильный перерасход — попадает в «Замечания». */
export const STRONG_OVERUSE = 0.25;
/** Подозрительно низкий расход — скорее всего пропущена запись о заправке. */
export const SUSPICIOUS_LOW = 0.4;
/** Сколько интервалов нужно для нормы. */
export const BASELINE_MIN_INTERVALS = 3;
export const BASELINE_MAX_INTERVALS = 6;
export const BASELINE_WINDOW_DAYS = 120;
/** Интервалы короче этого слишком неточные (бак «до полного» каждый раз заливается чуть по-разному). */
export const MIN_INTERVAL_KM = 30;
/** Пробег между концом смены и началом следующей, выше которого это замечание. */
export const OFF_SHIFT_KM = 10;
/** Пробег между соседними записями, выше которого это подозрительно. */
export const BIG_JUMP_KM = 1500;

const DAY = 86_400_000;

export function byTime(a: FleetEvent, b: FleetEvent): number {
  const t = Date.parse(a.occurred_at) - Date.parse(b.occurred_at);
  return t !== 0 ? t : a.odometer - b.odometer;
}

export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ───────────────────────── Интервалы «полный — полный» ─────────────────────────

export interface FuelInterval {
  vehicleId: string;
  fuel: Fuel;
  startOdo: number;
  endOdo: number;
  km: number;
  liters: number;
  amount: number;
  startAt: string;
  endAt: string;
  /** Заправка, закрывающая интервал. */
  closingEventId: string;
  closingDriverId: string;
  /** л/100 км */
  consumption: number;
  /** Норма на момент интервала (медиана предыдущих), null — ещё собираем данные. */
  baseline: number | null;
  /** (расход − норма) / норма */
  deviation: number | null;
  /** Километры по водителям внутри интервала (по сменам). */
  driverKm: Record<string, number>;
}

/**
 * Строит интервалы для одной машины и одного вида топлива.
 * events — все события машины (смены нужны для распределения км по водителям).
 */
export function buildIntervals(vehicleId: string, fuel: Fuel, events: FleetEvent[]): FuelInterval[] {
  const vehicleEvents = events.filter((e) => e.vehicle_id === vehicleId).sort(byTime);
  const refuels = vehicleEvents.filter((e) => e.type === 'refuel' && e.fuel === fuel);
  const shifts = shiftSegments(vehicleEvents);

  const result: FuelInterval[] = [];
  let prevFull: FleetEvent | null = null;
  let liters = 0;
  let amount = 0;

  for (const r of refuels) {
    if (prevFull) {
      liters += r.liters ?? 0;
      amount += r.amount ?? 0;
    }
    if (!r.full_tank) continue;

    if (prevFull) {
      const km = r.odometer - prevFull.odometer;
      if (km >= MIN_INTERVAL_KM && liters > 0) {
        result.push({
          vehicleId,
          fuel,
          startOdo: prevFull.odometer,
          endOdo: r.odometer,
          km,
          liters: round2(liters),
          amount: round2(amount),
          startAt: prevFull.occurred_at,
          endAt: r.occurred_at,
          closingEventId: r.id,
          closingDriverId: r.driver_id,
          consumption: (liters / km) * 100,
          baseline: null,
          deviation: null,
          driverKm: attributeKm(shifts, prevFull.odometer, r.odometer, r.driver_id)
        });
        prevFull = r;
        liters = 0;
        amount = 0;
      } else if (km < MIN_INTERVAL_KM && km >= 0) {
        // Слишком короткий отрезок: копим литры дальше, не сдвигая начало интервала.
        continue;
      } else {
        // Пробег уменьшился — данные испорчены, начинаем заново с этой заправки.
        prevFull = r;
        liters = 0;
        amount = 0;
      }
    } else {
      prevFull = r;
      liters = 0;
      amount = 0;
    }
  }

  // Норма для каждого интервала — медиана предыдущих интервалов в окне.
  for (let i = 0; i < result.length; i++) {
    const end = Date.parse(result[i].endAt);
    const prev = result
      .slice(0, i)
      .filter((x) => end - Date.parse(x.endAt) <= BASELINE_WINDOW_DAYS * DAY)
      .slice(-BASELINE_MAX_INTERVALS);
    if (prev.length >= BASELINE_MIN_INTERVALS) {
      const b = median(prev.map((x) => x.consumption))!;
      result[i].baseline = b;
      result[i].deviation = (result[i].consumption - b) / b;
    }
  }
  return result;
}

/** Текущая норма машины по топливу: медиана последних интервалов. */
export function currentBaseline(intervals: FuelInterval[], now = Date.now()): number | null {
  const recent = intervals
    .filter((x) => now - Date.parse(x.endAt) <= BASELINE_WINDOW_DAYS * DAY)
    .slice(-BASELINE_MAX_INTERVALS);
  if (recent.length < BASELINE_MIN_INTERVALS) return null;
  return median(recent.map((x) => x.consumption));
}

// ───────────────────────── Смены ─────────────────────────

export interface ShiftSegment {
  driverId: string;
  vehicleId: string;
  startOdo: number;
  endOdo: number;
  startAt: string;
  endAt: string;
}

/** Пары «начало — конец смены» одного водителя на одной машине. */
export function shiftSegments(vehicleEvents: FleetEvent[]): ShiftSegment[] {
  const open = new Map<string, FleetEvent>();
  const out: ShiftSegment[] = [];
  for (const e of [...vehicleEvents].sort(byTime)) {
    if (e.type === 'shift_start') {
      open.set(e.driver_id, e);
    } else if (e.type === 'shift_end') {
      const s = open.get(e.driver_id);
      if (s && e.odometer >= s.odometer) {
        out.push({
          driverId: e.driver_id,
          vehicleId: e.vehicle_id,
          startOdo: s.odometer,
          endOdo: e.odometer,
          startAt: s.occurred_at,
          endAt: e.occurred_at
        });
      }
      open.delete(e.driver_id);
    }
  }
  return out;
}

/**
 * Делит километры интервала [from, to] между водителями по их сменам.
 * Что не покрыто сменами, записывается на водителя закрывающей заправки.
 */
export function attributeKm(
  shifts: ShiftSegment[],
  from: number,
  to: number,
  fallbackDriver: string
): Record<string, number> {
  const res: Record<string, number> = {};
  let covered = 0;
  for (const s of shifts) {
    const overlap = Math.min(to, s.endOdo) - Math.max(from, s.startOdo);
    if (overlap > 0) {
      res[s.driverId] = (res[s.driverId] ?? 0) + overlap;
      covered += overlap;
    }
  }
  const rest = to - from - covered;
  if (rest > 0) res[fallbackDriver] = (res[fallbackDriver] ?? 0) + rest;
  return res;
}

// ───────────────────────── Пробег за месяц ─────────────────────────

/** Пробег машины за месяц по показаниям одометра. */
export function monthKm(vehicleEvents: FleetEvent[], month: string): number {
  const sorted = [...vehicleEvents].sort(byTime);
  const inMonth = sorted.filter((e) => monthKey(e.occurred_at) === month);
  if (inMonth.length === 0) return 0;
  const before = sorted.filter((e) => monthKey(e.occurred_at) < month);
  const start = before.length ? before[before.length - 1].odometer : inMonth[0].odometer;
  const end = Math.max(...inMonth.map((e) => e.odometer));
  return Math.max(0, end - start);
}

// ───────────────────────── Отчёт за месяц ─────────────────────────

export interface FuelStats {
  fuel: Fuel;
  /** Залито за месяц (все заправки месяца). */
  liters: number;
  amount: number;
  /** Средняя цена литра, ₸. */
  price: number | null;
  /** Литры и км по интервалам, закрытым в этом месяце. */
  intervalLiters: number;
  intervalKm: number;
  /** Средний фактический расход, л/100 км. */
  consumption: number | null;
  /** Ожидаемые литры по норме (только интервалы, где норма уже есть). */
  expectedLiters: number;
  /** Фактические литры по тем же интервалам. */
  measuredLiters: number;
  /** Норма, л/100 км (средневзвешенная по интервалам месяца). */
  baseline: number | null;
  /** Отклонение от нормы, доля. */
  deviation: number | null;
  /** Перерасход в литрах (может быть отрицательным — экономия). */
  overLiters: number | null;
  overAmount: number | null;
}

export interface VehicleMonth {
  vehicle: Vehicle;
  km: number;
  fuels: FuelStats[];
  amount: number;
}

export interface DriverMonth {
  driverId: string;
  /** Км по сменам за месяц. */
  km: number;
  shifts: number;
  /** Литры, приходящиеся на водителя, по видам топлива (доля от интервалов по его км). */
  fuels: { fuel: Fuel; liters: number; expectedLiters: number; measuredLiters: number; deviation: number | null }[];
  overLiters: number;
  overAmount: number;
  vehicles: string[];
}

export interface GroupRow {
  key: string;
  label: string;
  fuel: Fuel;
  median: number | null;
  vehicles: { vehicle: Vehicle; consumption: number | null; diff: number | null }[];
}

export interface MonthReport {
  month: string;
  vehicles: VehicleMonth[];
  drivers: DriverMonth[];
  groups: GroupRow[];
  intervals: FuelInterval[];
  totals: { km: number; amount: number; liters: Partial<Record<Fuel, number>>; overAmount: number };
}

export function buildMonthReport(vehicles: Vehicle[], events: FleetEvent[], month: string): MonthReport {
  const allIntervals: FuelInterval[] = [];
  const vehicleRows: VehicleMonth[] = [];
  const priceByFuel: Partial<Record<Fuel, number>> = {};

  for (const v of vehicles) {
    const ve = events.filter((e) => e.vehicle_id === v.id);
    const fuels: FuelStats[] = [];
    for (const f of v.fuels) {
      const intervals = buildIntervals(v.id, f, ve);
      allIntervals.push(...intervals);
      const refuels = ve.filter((e) => e.type === 'refuel' && e.fuel === f && monthKey(e.occurred_at) === month);
      const liters = sum(refuels.map((r) => r.liters ?? 0));
      const amount = sum(refuels.map((r) => r.amount ?? 0));
      const price = liters > 0 && amount > 0 ? amount / liters : null;

      const mi = intervals.filter((x) => monthKey(x.endAt) === month);
      const intervalLiters = sum(mi.map((x) => x.liters));
      const intervalKm = sum(mi.map((x) => x.km));
      const withBase = mi.filter((x) => x.baseline !== null);
      const expectedLiters = sum(withBase.map((x) => (x.km * x.baseline!) / 100));
      const measuredLiters = sum(withBase.map((x) => x.liters));
      const baseKm = sum(withBase.map((x) => x.km));
      const overLiters = withBase.length ? measuredLiters - expectedLiters : null;
      fuels.push({
        fuel: f,
        liters: round2(liters),
        amount: round2(amount),
        price,
        intervalLiters: round2(intervalLiters),
        intervalKm,
        consumption: intervalKm > 0 ? (intervalLiters / intervalKm) * 100 : null,
        expectedLiters,
        measuredLiters,
        baseline: baseKm > 0 ? (expectedLiters / baseKm) * 100 : null,
        deviation: expectedLiters > 0 ? measuredLiters / expectedLiters - 1 : null,
        overLiters,
        overAmount: overLiters !== null && price !== null ? overLiters * price : null
      });
    }
    vehicleRows.push({ vehicle: v, km: monthKm(ve, month), fuels, amount: sum(fuels.map((f) => f.amount)) });
  }

  // Средняя цена по парку — для оценки перерасхода водителя в тенге.
  for (const f of ['petrol', 'lpg', 'diesel'] as Fuel[]) {
    const rows = vehicleRows.flatMap((r) => r.fuels.filter((x) => x.fuel === f));
    const l = sum(rows.map((x) => x.liters));
    const a = sum(rows.map((x) => x.amount));
    if (l > 0 && a > 0) priceByFuel[f] = a / l;
  }

  const drivers = buildDriverRows(vehicles, events, allIntervals, month, priceByFuel);

  return {
    month,
    vehicles: vehicleRows,
    drivers,
    groups: buildGroups(vehicleRows),
    intervals: allIntervals,
    totals: {
      km: sum(vehicleRows.map((r) => r.km)),
      amount: sum(vehicleRows.map((r) => r.amount)),
      liters: Object.fromEntries(
        (['petrol', 'lpg', 'diesel'] as Fuel[])
          .map((f) => [f, sum(vehicleRows.flatMap((r) => r.fuels.filter((x) => x.fuel === f).map((x) => x.liters)))])
          .filter(([, l]) => (l as number) > 0)
      ),
      overAmount: sum(vehicleRows.flatMap((r) => r.fuels.map((f) => (f.overAmount && f.overAmount > 0 ? f.overAmount : 0))))
    }
  };
}

function buildDriverRows(
  vehicles: Vehicle[],
  events: FleetEvent[],
  intervals: FuelInterval[],
  month: string,
  priceByFuel: Partial<Record<Fuel, number>>
): DriverMonth[] {
  const rows = new Map<string, DriverMonth>();
  const get = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { driverId: id, km: 0, shifts: 0, fuels: [], overLiters: 0, overAmount: 0, vehicles: [] };
      rows.set(id, r);
    }
    return r;
  };
  const plate = new Map(vehicles.map((v) => [v.id, v.plate]));

  for (const v of vehicles) {
    const segs = shiftSegments(events.filter((e) => e.vehicle_id === v.id));
    for (const s of segs) {
      if (monthKey(s.endAt) !== month) continue;
      const r = get(s.driverId);
      r.km += s.endOdo - s.startOdo;
      r.shifts += 1;
      const p = plate.get(v.id);
      if (p && !r.vehicles.includes(p)) r.vehicles.push(p);
    }
  }

  for (const x of intervals) {
    if (monthKey(x.endAt) !== month) continue;
    for (const [driverId, km] of Object.entries(x.driverKm)) {
      const share = km / x.km;
      const r = get(driverId);
      let f = r.fuels.find((y) => y.fuel === x.fuel);
      if (!f) {
        f = { fuel: x.fuel, liters: 0, expectedLiters: 0, measuredLiters: 0, deviation: null };
        r.fuels.push(f);
      }
      f.liters += x.liters * share;
      if (x.baseline !== null) {
        f.expectedLiters += (km * x.baseline) / 100;
        f.measuredLiters += x.liters * share;
      }
    }
  }

  for (const r of rows.values()) {
    for (const f of r.fuels) {
      f.liters = round2(f.liters);
      f.deviation = f.expectedLiters > 0 ? f.measuredLiters / f.expectedLiters - 1 : null;
      const over = f.measuredLiters - f.expectedLiters;
      r.overLiters += over;
      r.overAmount += over * (priceByFuel[f.fuel] ?? 0);
    }
  }
  return [...rows.values()].sort((a, b) => b.overAmount - a.overAmount);
}

/** Сравнение одинаковых машин между собой (модель + кузов + топливо). */
function buildGroups(rows: VehicleMonth[]): GroupRow[] {
  const groups = new Map<string, GroupRow>();
  for (const r of rows) {
    for (const f of r.fuels) {
      const key = `${r.vehicle.model}|${r.vehicle.body}|${f.fuel}`;
      let g = groups.get(key);
      if (!g) {
        const body = r.vehicle.body === '6m' ? ', 6 м' : r.vehicle.body === 'standard' ? ', стандарт' : '';
        g = { key, label: `${r.vehicle.model}${body}`, fuel: f.fuel, median: null, vehicles: [] };
        groups.set(key, g);
      }
      g.vehicles.push({ vehicle: r.vehicle, consumption: f.consumption, diff: null });
    }
  }
  const out = [...groups.values()].filter((g) => g.vehicles.length > 1);
  for (const g of out) {
    g.median = median(g.vehicles.map((x) => x.consumption).filter((x): x is number => x !== null));
    for (const x of g.vehicles) {
      x.diff = g.median && x.consumption !== null ? x.consumption / g.median - 1 : null;
    }
    g.vehicles.sort((a, b) => (b.consumption ?? -1) - (a.consumption ?? -1));
  }
  return out;
}

// ───────────────────────── Замечания ─────────────────────────

export type IssueKind = 'odometer_back' | 'off_shift' | 'big_jump' | 'unclosed_shift' | 'overuse' | 'low_use';

export interface Issue {
  kind: IssueKind;
  severity: 'high' | 'medium';
  vehicleId: string;
  driverId: string | null;
  at: string;
  eventId: string | null;
  text: string;
}

export function findIssues(vehicles: Vehicle[], events: FleetEvent[]): Issue[] {
  const issues: Issue[] = [];
  for (const v of vehicles) {
    const ve = events.filter((e) => e.vehicle_id === v.id).sort(byTime);
    let lastEnd: FleetEvent | null = null;
    const openShift = new Map<string, FleetEvent>();

    for (let i = 0; i < ve.length; i++) {
      const e = ve[i];
      const prev = i > 0 ? ve[i - 1] : null;
      if (prev && e.odometer < prev.odometer) {
        issues.push({
          kind: 'odometer_back',
          severity: 'high',
          vehicleId: v.id,
          driverId: e.driver_id,
          at: e.occurred_at,
          eventId: e.id,
          text: `Пробег ${fmtKm(e.odometer)} меньше предыдущей записи ${fmtKm(prev.odometer)}`
        });
      } else if (prev && e.odometer - prev.odometer > BIG_JUMP_KM) {
        issues.push({
          kind: 'big_jump',
          severity: 'medium',
          vehicleId: v.id,
          driverId: e.driver_id,
          at: e.occurred_at,
          eventId: e.id,
          text: `Скачок пробега +${fmtKm(e.odometer - prev.odometer)} с прошлой записи — проверьте показание`
        });
      }

      if (e.type === 'shift_start') {
        if (lastEnd && e.odometer - lastEnd.odometer > OFF_SHIFT_KM) {
          issues.push({
            kind: 'off_shift',
            severity: 'high',
            vehicleId: v.id,
            driverId: e.driver_id,
            at: e.occurred_at,
            eventId: e.id,
            text: `Пробег вне смены: ${fmtKm(e.odometer - lastEnd.odometer)} между концом прошлой смены и началом этой`
          });
        }
        const open = openShift.get(e.driver_id);
        if (open) {
          issues.push({
            kind: 'unclosed_shift',
            severity: 'medium',
            vehicleId: v.id,
            driverId: e.driver_id,
            at: open.occurred_at,
            eventId: open.id,
            text: 'Смена не была закрыта'
          });
        }
        openShift.set(e.driver_id, e);
      } else if (e.type === 'shift_end') {
        openShift.delete(e.driver_id);
        lastEnd = e;
      }
    }

    for (const f of v.fuels) {
      for (const x of buildIntervals(v.id, f, ve)) {
        if (x.deviation === null) continue;
        const who = topDriver(x.driverKm);
        if (x.deviation >= STRONG_OVERUSE) {
          issues.push({
            kind: 'overuse',
            severity: 'high',
            vehicleId: v.id,
            driverId: who,
            at: x.endAt,
            eventId: x.closingEventId,
            text: `Перерасход (${fuelName(f)}): ${x.consumption.toFixed(1)} л/100 км при норме ${x.baseline!.toFixed(1)} (+${Math.round(
              x.deviation * 100
            )}%) на ${fmtKm(x.km)}`
          });
        } else if (x.deviation <= -SUSPICIOUS_LOW) {
          issues.push({
            kind: 'low_use',
            severity: 'medium',
            vehicleId: v.id,
            driverId: who,
            at: x.endAt,
            eventId: x.closingEventId,
            text: `Слишком низкий расход (${fuelName(f)}): ${x.consumption.toFixed(1)} л/100 км при норме ${x.baseline!.toFixed(
              1
            )} — возможно, пропущена запись о заправке или бак был не полный`
          });
        }
      }
    }
  }
  return issues.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

// ───────────────────────── Утилиты ─────────────────────────

function topDriver(km: Record<string, number>): string | null {
  let best: string | null = null;
  let max = -1;
  for (const [id, v] of Object.entries(km)) {
    if (v > max) {
      max = v;
      best = id;
    }
  }
  return best;
}

function fuelName(f: Fuel): string {
  return f === 'petrol' ? 'бензин' : f === 'lpg' ? 'газ' : 'дизель';
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function fmtKm(km: number): string {
  return `${Math.round(km).toLocaleString('ru-RU')} км`;
}
