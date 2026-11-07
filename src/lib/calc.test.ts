import { describe, expect, it } from 'vitest';
import { attributeKm, buildIntervals, buildMonthReport, findIssues, monthKm, shiftSegments } from './calc';
import type { FleetEvent, Fuel, Vehicle } from './types';

let n = 0;
function ev(p: Partial<FleetEvent> & Pick<FleetEvent, 'type' | 'odometer' | 'occurred_at'>): FleetEvent {
  return {
    id: `e${++n}`,
    vehicle_id: 'v1',
    driver_id: 'd1',
    fuel: null,
    liters: null,
    amount: null,
    full_tank: null,
    odometer_photo: null,
    receipt_photo: null,
    comment: '',
    ...p
  };
}

function refuel(odometer: number, day: string, liters: number, full = true, fuel: Fuel = 'petrol', extra: Partial<FleetEvent> = {}) {
  return ev({ type: 'refuel', odometer, occurred_at: `${day}T12:00:00Z`, fuel, liters, amount: liters * 250, full_tank: full, ...extra });
}

const van: Vehicle = {
  id: 'v1',
  plate: '150AIB',
  model: 'ГАЗель Next',
  body: '6m',
  fuels: ['petrol'],
  assigned_driver: 'd1',
  active: true,
  notes: ''
};

describe('buildIntervals', () => {
  it('считает расход между полными баками', () => {
    const events = [refuel(1000, '2026-10-01', 60), refuel(1400, '2026-10-03', 72)];
    const [x] = buildIntervals('v1', 'petrol', events);
    expect(x.km).toBe(400);
    expect(x.liters).toBe(72);
    expect(x.consumption).toBeCloseTo(18);
  });

  it('складывает неполные дозаправки внутри интервала', () => {
    const events = [refuel(1000, '2026-10-01', 60), refuel(1200, '2026-10-02', 20, false), refuel(1500, '2026-10-03', 70)];
    const [x] = buildIntervals('v1', 'petrol', events);
    expect(x.liters).toBe(90);
    expect(x.consumption).toBeCloseTo(18);
  });

  it('первая заправка (и неполные до неё) только задаёт точку отсчёта', () => {
    const events = [refuel(900, '2026-09-30', 30, false), refuel(1000, '2026-10-01', 60)];
    expect(buildIntervals('v1', 'petrol', events)).toHaveLength(0);
  });

  it('газ и бензин считаются раздельно', () => {
    const events = [
      refuel(1000, '2026-10-01', 50, true, 'lpg'),
      refuel(1050, '2026-10-01', 40, true, 'petrol'),
      refuel(1500, '2026-10-03', 90, true, 'lpg'),
      refuel(2050, '2026-10-05', 10, true, 'petrol')
    ];
    const [gas] = buildIntervals('v1', 'lpg', events);
    const [pet] = buildIntervals('v1', 'petrol', events);
    expect(gas.consumption).toBeCloseTo(18);
    expect(pet.consumption).toBeCloseTo(1);
  });

  it('норма появляется после трёх интервалов и ловит перерасход', () => {
    const events = [
      refuel(1000, '2026-10-01', 60),
      refuel(1400, '2026-10-03', 72), // 18
      refuel(1800, '2026-10-05', 72), // 18
      refuel(2200, '2026-10-07', 72), // 18
      refuel(2600, '2026-10-09', 96) // 24 — +33%
    ];
    const xs = buildIntervals('v1', 'petrol', events);
    expect(xs.map((x) => x.baseline)).toEqual([null, null, null, 18]);
    expect(xs[3].consumption).toBeCloseTo(24);
    expect(xs[3].deviation).toBeCloseTo(1 / 3);
  });

  it('слишком короткий отрезок не создаёт интервал, а копит литры', () => {
    const events = [refuel(1000, '2026-10-01', 60), refuel(1010, '2026-10-01', 2), refuel(1400, '2026-10-03', 70)];
    const xs = buildIntervals('v1', 'petrol', events);
    expect(xs).toHaveLength(1);
    expect(xs[0].km).toBe(400);
    expect(xs[0].liters).toBe(72);
  });
});

describe('смены и водители', () => {
  it('делит км интервала между водителями по сменам', () => {
    const events = [
      ev({ type: 'shift_start', odometer: 1000, occurred_at: '2026-10-01T08:00:00Z', driver_id: 'a' }),
      ev({ type: 'shift_end', odometer: 1300, occurred_at: '2026-10-01T18:00:00Z', driver_id: 'a' }),
      ev({ type: 'shift_start', odometer: 1300, occurred_at: '2026-10-02T08:00:00Z', driver_id: 'b' }),
      ev({ type: 'shift_end', odometer: 1400, occurred_at: '2026-10-02T18:00:00Z', driver_id: 'b' })
    ];
    const segs = shiftSegments(events);
    expect(segs).toHaveLength(2);
    expect(attributeKm(segs, 1000, 1400, 'b')).toEqual({ a: 300, b: 100 });
    // Непокрытые сменами км — на водителя заправки
    expect(attributeKm(segs, 1000, 1500, 'b')).toEqual({ a: 300, b: 200 });
  });

  it('пробег за месяц считается от последнего показания прошлого месяца', () => {
    const events = [
      ev({ type: 'shift_end', odometer: 5000, occurred_at: '2026-09-30T18:00:00Z' }),
      ev({ type: 'shift_start', odometer: 5000, occurred_at: '2026-10-01T08:00:00Z' }),
      ev({ type: 'shift_end', odometer: 5800, occurred_at: '2026-10-31T18:00:00Z' })
    ];
    expect(monthKm(events, '2026-10')).toBe(800);
    expect(monthKm(events, '2026-11')).toBe(0);
  });
});

describe('замечания', () => {
  it('находит пробег вне смены и уменьшение одометра', () => {
    const events = [
      ev({ type: 'shift_start', odometer: 1000, occurred_at: '2026-10-01T08:00:00Z' }),
      ev({ type: 'shift_end', odometer: 1200, occurred_at: '2026-10-01T18:00:00Z' }),
      ev({ type: 'shift_start', odometer: 1260, occurred_at: '2026-10-02T08:00:00Z' }),
      ev({ type: 'shift_end', odometer: 1250, occurred_at: '2026-10-02T18:00:00Z' })
    ];
    const kinds = findIssues([van], events).map((i) => i.kind).sort();
    expect(kinds).toEqual(['odometer_back', 'off_shift']);
  });
});

describe('отчёт за месяц', () => {
  it('считает литры, деньги, расход и перерасход', () => {
    const events = [
      refuel(1000, '2026-10-01', 60),
      refuel(1400, '2026-10-03', 72),
      refuel(1800, '2026-10-05', 72),
      refuel(2200, '2026-10-07', 72),
      refuel(2600, '2026-10-09', 96)
    ];
    const r = buildMonthReport([van], events, '2026-10');
    const f = r.vehicles[0].fuels[0];
    expect(r.vehicles[0].km).toBe(1600);
    expect(f.liters).toBe(372);
    expect(f.amount).toBe(372 * 250);
    // Первая заправка — точка отсчёта, в расход идут 72+72+72+96 л на 1600 км
    expect(f.consumption).toBeCloseTo((312 / 1600) * 100);
    // Перерасход по последнему интервалу: 96 − 72 = 24 л
    expect(f.overLiters).toBeCloseTo(24);
    expect(f.overAmount).toBeCloseTo(24 * 250);
    expect(r.drivers[0].overLiters).toBeCloseTo(24);
  });
});
