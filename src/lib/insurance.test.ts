import { describe, expect, it } from 'vitest';
import { currentByKind, daysLeft, driverPolicies, plural, policyStatus, summaryStatus, vehiclePolicies } from './insurance';
import type { InsurancePolicy, Vehicle } from './types';

const NOW = new Date(2026, 10, 7, 12, 0).getTime(); // 7 ноября 2026, полдень

function pol(p: Partial<InsurancePolicy> & Pick<InsurancePolicy, 'ends_on'>): InsurancePolicy {
  return { id: Math.random().toString(36), driver_id: 'd1', vehicle_id: null, kind: 'ogpo', company: '', number: '', starts_on: null, cost: null, note: '', ...p };
}

const car = (id: string, driver: string | null): Vehicle => ({ id, plate: id, model: '', body: 'standard', fuels: ['petrol'], assigned_driver: driver, active: true, notes: '' });

describe('сроки полисов', () => {
  it('считает дни до конца по местной дате', () => {
    expect(daysLeft('2026-11-07', NOW)).toBe(0);
    expect(daysLeft('2026-11-08', NOW)).toBe(1);
    expect(daysLeft('2026-12-07', NOW)).toBe(30);
    expect(daysLeft('2026-11-01', NOW)).toBe(-6);
  });

  it('статусы: действует, скоро, срочно, просрочена', () => {
    expect(policyStatus(pol({ ends_on: '2027-03-12' }), NOW)).toMatchObject({ tone: 'good', label: 'До 12.03.2027' });
    expect(policyStatus(pol({ ends_on: '2026-11-25' }), NOW)).toMatchObject({ tone: 'warn', label: 'Осталось 18 дней' });
    expect(policyStatus(pol({ ends_on: '2026-11-10' }), NOW)).toMatchObject({ tone: 'bad', label: 'Осталось 3 дня' });
    expect(policyStatus(pol({ ends_on: '2026-11-07' }), NOW)).toMatchObject({ tone: 'bad', label: 'Последний день' });
    expect(policyStatus(pol({ ends_on: '2026-11-06' }), NOW)).toMatchObject({ tone: 'bad', label: 'Просрочена 1 день' });
  });

  it('склонения', () => {
    expect(plural(1, ['день', 'дня', 'дней'])).toBe('1 день');
    expect(plural(3, ['день', 'дня', 'дней'])).toBe('3 дня');
    expect(plural(11, ['день', 'дня', 'дней'])).toBe('11 дней');
    expect(plural(21, ['день', 'дня', 'дней'])).toBe('21 день');
    expect(plural(25, ['день', 'дня', 'дней'])).toBe('25 дней');
  });

  it('полисы водителя и машины', () => {
    const cars = [car('v1', 'd1'), car('v2', 'd2')];
    const list = [
      pol({ id: 'a', driver_id: 'd1', ends_on: '2027-01-01' }), // на водителя
      pol({ id: 'b', driver_id: null, vehicle_id: 'v1', ends_on: '2027-02-01' }), // на его машину
      pol({ id: 'c', driver_id: null, vehicle_id: 'v2', ends_on: '2027-03-01' }), // чужая машина
      pol({ id: 'd', driver_id: 'd2', vehicle_id: 'v1', ends_on: '2027-04-01' }) // другой водитель на этой машине
    ];
    expect(driverPolicies(list, 'd1', cars).map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(vehiclePolicies(list, cars[0]).map((p) => p.id).sort()).toEqual(['a', 'b', 'd']);
  });

  it('итог: свежий полис заменяет старый, но учитывается самый срочный вид', () => {
    const renewed = [pol({ ends_on: '2026-11-01' }), pol({ ends_on: '2027-11-01' })];
    expect(currentByKind(renewed)).toHaveLength(1);
    expect(summaryStatus(renewed, NOW).tone).toBe('good');
    const mixed = [pol({ ends_on: '2027-11-01' }), pol({ kind: 'kasko', ends_on: '2026-11-20' })];
    expect(summaryStatus(mixed, NOW)).toMatchObject({ tone: 'warn', label: 'Осталось 13 дней' });
    expect(summaryStatus([], NOW)).toMatchObject({ tone: 'none', label: 'Нет полиса' });
  });
});
