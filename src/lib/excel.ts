import writeXlsxFile from 'write-excel-file';
import { byTime, monthKey, shiftSegments, type Issue, type MonthReport } from './calc';
import { monthLabel } from './format';
import { BODY_LABEL, FUEL_LABEL, INSURANCE_LABEL, type FleetEvent, type InsurancePolicy, type Profile, type Vehicle } from './types';
import { daysLeft, policyStatus } from './insurance';

type Cell = { value: string | number | Date | null; type?: typeof String | typeof Number | typeof Date; fontWeight?: 'bold'; format?: string } | null;

interface FleetLike {
  vehicles: Vehicle[];
  profiles: Profile[];
  events: FleetEvent[];
  policies: InsurancePolicy[];
  nameOf: (id: string | null) => string;
  plateOf: (id: string) => string;
}

const H = (value: string): Cell => ({ value, fontWeight: 'bold' });
const S = (value: string | null | undefined): Cell => ({ value: value ?? '', type: String });
const N = (value: number | null | undefined, format = '#,##0'): Cell =>
  value === null || value === undefined || Number.isNaN(value) ? null : { value: Math.round(value * 100) / 100, type: Number, format };
const P = (value: number | null | undefined): Cell => N(value, '0%');
const D = (iso: string): Cell => ({ value: new Date(iso), type: Date, format: 'dd.mm.yyyy hh:mm' });

export async function exportMonthExcel(report: MonthReport, fleet: FleetLike, issues: Issue[]) {
  const month = report.month;

  const vehiclesSheet: Cell[][] = [
    [H('Машина'), H('Модель'), H('Кузов'), H('Пробег, км'), H('Топливо'), H('Залито, л'), H('Сумма, ₸'), H('Цена л, ₸'), H('Расход, л/100'), H('Норма, л/100'), H('Отклонение'), H('Перерасход, л'), H('Перерасход, ₸')]
  ];
  for (const r of report.vehicles) {
    for (const f of r.fuels) {
      vehiclesSheet.push([
        S(r.vehicle.plate),
        S(r.vehicle.model),
        S(BODY_LABEL[r.vehicle.body]),
        N(r.km),
        S(FUEL_LABEL[f.fuel]),
        N(f.liters, '#,##0.0'),
        N(f.amount),
        N(f.price, '#,##0.0'),
        N(f.consumption, '0.0'),
        N(f.baseline, '0.0'),
        P(f.deviation),
        N(f.overLiters, '#,##0.0'),
        N(f.overAmount)
      ]);
    }
  }

  const driversSheet: Cell[][] = [[H('Водитель'), H('Смен'), H('Пробег, км'), H('Топливо'), H('Литры'), H('Отклонение'), H('Перерасход, ₸ (всего)'), H('Машины')]];
  for (const d of report.drivers) {
    const fuels = d.fuels.length ? d.fuels : [null];
    fuels.forEach((f, i) => {
      driversSheet.push([
        S(fleet.nameOf(d.driverId)),
        i === 0 ? N(d.shifts) : null,
        i === 0 ? N(d.km) : null,
        S(f ? FUEL_LABEL[f.fuel] : ''),
        f ? N(f.liters, '#,##0.0') : null,
        f ? P(f.deviation) : null,
        i === 0 ? N(d.overAmount) : null,
        S(i === 0 ? d.vehicles.join(', ') : '')
      ]);
    });
  }

  const monthEvents = fleet.events.filter((e) => monthKey(e.occurred_at) === month).sort(byTime);

  const refuelSheet: Cell[][] = [[H('Дата'), H('Машина'), H('Водитель'), H('Пробег, км'), H('Топливо'), H('Литры'), H('Сумма, ₸'), H('Полный бак'), H('Комментарий')]];
  for (const e of monthEvents.filter((x) => x.type === 'refuel')) {
    refuelSheet.push([
      D(e.occurred_at),
      S(fleet.plateOf(e.vehicle_id)),
      S(fleet.nameOf(e.driver_id)),
      N(e.odometer),
      S(e.fuel ? FUEL_LABEL[e.fuel] : ''),
      N(e.liters, '#,##0.0'),
      N(e.amount),
      S(e.full_tank ? 'да' : 'нет'),
      S(e.comment)
    ]);
  }

  const shiftSheet: Cell[][] = [[H('Начало'), H('Конец'), H('Машина'), H('Водитель'), H('Выезд, км'), H('Возврат, км'), H('Пробег, км')]];
  for (const v of fleet.vehicles) {
    for (const s of shiftSegments(fleet.events.filter((e) => e.vehicle_id === v.id))) {
      if (monthKey(s.endAt) !== month) continue;
      shiftSheet.push([D(s.startAt), D(s.endAt), S(v.plate), S(fleet.nameOf(s.driverId)), N(s.startOdo), N(s.endOdo), N(s.endOdo - s.startOdo)]);
    }
  }

  const issuesSheet: Cell[][] = [[H('Дата'), H('Машина'), H('Водитель'), H('Замечание')]];
  for (const i of issues) {
    issuesSheet.push([D(i.at), S(fleet.plateOf(i.vehicleId)), S(fleet.nameOf(i.driverId)), S(i.text)]);
  }

  const insSheet: Cell[][] = [[H('Водитель'), H('Машина'), H('Вид'), H('Страховая'), H('Номер'), H('Начало'), H('Окончание'), H('Осталось дней'), H('Статус'), H('Стоимость, ₸')]];
  for (const p of [...fleet.policies].sort((a, b) => a.ends_on.localeCompare(b.ends_on))) {
    insSheet.push([
      S(p.driver_id ? fleet.nameOf(p.driver_id) : 'любой водитель'),
      S(p.vehicle_id ? fleet.plateOf(p.vehicle_id) : ''),
      S(INSURANCE_LABEL[p.kind]),
      S(p.company),
      S(p.number),
      S(p.starts_on ? p.starts_on.split('-').reverse().join('.') : ''),
      S(p.ends_on.split('-').reverse().join('.')),
      N(daysLeft(p.ends_on)),
      S(policyStatus(p).label),
      N(p.cost)
    ]);
  }

  const w = (widths: number[]) => widths.map((width) => ({ width }));
  await writeXlsxFile([vehiclesSheet, driversSheet, refuelSheet, shiftSheet, issuesSheet, insSheet] as never, {
    sheets: ['Машины', 'Водители', 'Заправки', 'Смены', 'Замечания', 'Страховки'],
    columns: [
      w([10, 18, 10, 11, 9, 10, 12, 10, 12, 12, 11, 13, 14]),
      w([24, 7, 11, 9, 9, 11, 18, 20]),
      w([16, 10, 24, 11, 9, 9, 12, 10, 30]),
      w([16, 16, 10, 24, 11, 11, 11]),
      w([16, 10, 24, 80]),
      w([24, 10, 9, 22, 16, 12, 12, 14, 22, 14])
    ],
    fileName: `ГСМ Контроль — ${monthLabel(month)}.xlsx`
  } as never);
}
