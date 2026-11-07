import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Fuel as FuelIcon, Info, Route, TrendingUp, Users, Wallet } from 'lucide-react';
import { buildMonthReport, dailySpend, findIssues, median, monthKey } from '../../lib/calc';
import { currentMonth, dayMonthLabel, fmtNum, fmtTenge, monthLabel, shiftMonth } from '../../lib/format';
import { BODY_LABEL, FUEL_LABEL, type Fuel } from '../../lib/types';
import { Avatar, Empty, FuelTag, Plate, Stat } from '../../components/ui';
import { Columns, HBars, compact, type ColDatum, type HBarRow } from '../../components/charts';
import { Deviation, fuelColor } from './Fleet';
import type { Fleet } from './useFleet';

const FUELS: Fuel[] = ['petrol', 'lpg', 'diesel'];

export function MonthNav({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const isCurrent = value >= currentMonth();
  return (
    <div className="row" style={{ gap: 4 }}>
      <button className="btn btn-sm" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Предыдущий месяц">
        <ChevronLeft size={18} />
      </button>
      <span style={{ minWidth: 132, textAlign: 'center', fontWeight: 700 }}>{monthLabel(value)}</span>
      <button className="btn btn-sm" onClick={() => onChange(shiftMonth(value, 1))} disabled={isCurrent} aria-label="Следующий месяц">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function groupLabel(model: string, body: string): string {
  return `${model}${body === '6m' ? ' · 6 м' : body === 'standard' ? ' · стандарт' : ''}`;
}

export default function Report({ fleet }: { fleet: Fleet }) {
  const [month, setMonth] = useState(currentMonth());
  const [exporting, setExporting] = useState(false);
  const report = useMemo(() => buildMonthReport(fleet.vehicles.filter((v) => v.active), fleet.events, month), [fleet.vehicles, fleet.events, month]);
  const days = useMemo(() => dailySpend(fleet.events, month), [fleet.events, month]);
  const noBaseline = report.vehicles.every((v) => v.fuels.every((f) => f.baseline === null));
  const hasData = report.totals.km > 0 || report.totals.amount > 0;
  const fuelsUsed = FUELS.filter((f) => days.some((d) => d.amount[f] > 0));

  const doExport = async () => {
    setExporting(true);
    try {
      const issues = findIssues(fleet.vehicles, fleet.events).filter((i) => monthKey(i.at) === month);
      const { exportMonthExcel } = await import('../../lib/excel');
      await exportMonthExcel(report, fleet, issues);
    } finally {
      setExporting(false);
    }
  };

  // Расход по машинам: группы одинаковых машин, внутри — по номеру.
  const barRows: HBarRow[] = useMemo(() => {
    const rows = report.vehicles.flatMap((r) =>
      r.fuels.map((f) => ({
        r,
        f,
        group: `${groupLabel(r.vehicle.model, r.vehicle.body)}${r.vehicle.fuels.length > 1 ? ' · ГБО' : ''} · ${FUEL_LABEL[f.fuel].toLowerCase()}`
      }))
    );
    rows.sort((a, b) => a.group.localeCompare(b.group, 'ru') || a.r.vehicle.plate.localeCompare(b.r.vehicle.plate));
    const groupMedian = new Map<string, number | null>();
    for (const g of new Set(rows.map((x) => x.group))) {
      const vals = rows.filter((x) => x.group === g && x.f.consumption !== null).map((x) => x.f.consumption!);
      groupMedian.set(g, vals.length >= 2 ? median(vals) : null);
    }
    return rows.map(({ r, f, group }) => {
      const gm = groupMedian.get(group) ?? null;
      return {
        key: `${r.vehicle.id}-${f.fuel}`,
        group,
        groupNote: gm !== null ? `медиана ${fmtNum(gm, 1)} л/100` : undefined,
        label: (
          <>
            <Plate plate={r.vehicle.plate} size="sm" />
          </>
        ),
        value: f.consumption,
        color: fuelColor(f.fuel),
        mark: f.baseline,
        valueText: f.consumption !== null ? fmtNum(f.consumption, 1) : '—',
        sub:
          f.deviation !== null ? (
            <span className={f.deviation >= 0.25 ? 't-bad' : f.deviation >= 0.1 ? 't-warn' : 't-good'}>
              {f.deviation > 0 ? '↑' : '↓'}
              {Math.abs(Math.round(f.deviation * 100))}%
            </span>
          ) : undefined,
        tip: {
          title: `${r.vehicle.plate} · ${FUEL_LABEL[f.fuel]}`,
          rows: [
            { color: fuelColor(f.fuel), label: 'л/100 км в этом месяце', value: f.consumption !== null ? fmtNum(f.consumption, 1) : 'нет данных' },
            ...(f.baseline !== null ? [{ color: 'var(--text)', label: 'норма машины', value: fmtNum(f.baseline, 1) }] : []),
            { color: 'transparent', label: 'залито', value: `${fmtNum(f.liters, 1)} л` }
          ]
        }
      };
    });
  }, [report]);

  const colData: ColDatum[] = days.map((d) => {
    const total = FUELS.reduce((a, f) => a + d.amount[f], 0);
    return {
      key: String(d.day),
      xLabel: d.day === 1 || d.day % 5 === 0 ? String(d.day) : undefined,
      segments: FUELS.map((f) => ({ key: f, value: d.amount[f], color: fuelColor(f), label: FUEL_LABEL[f] })),
      tip: {
        title: `${dayMonthLabel(d.day, month)} · ${fmtTenge(total)}`,
        rows: FUELS.filter((f) => d.amount[f] > 0).map((f) => ({
          color: fuelColor(f),
          label: `${FUEL_LABEL[f]}, ${fmtNum(d.liters[f], 1)} л`,
          value: fmtTenge(d.amount[f])
        }))
      }
    };
  });

  const per100 = report.totals.km > 0 ? (report.totals.amount / report.totals.km) * 100 : null;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Отчёт</h1>
        <MonthNav value={month} onChange={setMonth} />
        <button className="btn" onClick={() => void doExport()} disabled={exporting}>
          <Download size={18} /> {exporting ? 'Готовлю…' : 'Excel'}
        </button>
      </div>

      <div className="grid-stats">
        <Stat icon={Route} label="Пробег парка" value={fmtNum(report.totals.km)} unit=" км" sub={`${report.vehicles.filter((v) => v.km > 0).length} машин в работе`} />
        <Stat icon={Wallet} tone="amber" label="Затраты на топливо" value={fmtTenge(report.totals.amount)} sub={per100 !== null ? `${fmtTenge(per100)} на 100 км` : 'нет заправок'} />
        <Stat icon={FuelIcon} label="Залито">
          <div className="stat-lines">
            {(Object.entries(report.totals.liters) as [Fuel, number][]).length === 0 ? (
              <div className="stat-value">0 л</div>
            ) : (
              (Object.entries(report.totals.liters) as [Fuel, number][]).map(([f, l]) => (
                <div className="row" key={f}>
                  <FuelTag fuel={f} />
                  <b className="tnum">{fmtNum(l)} л</b>
                </div>
              ))
            )}
          </div>
        </Stat>
        <Stat
          icon={TrendingUp}
          tone={report.totals.overAmount > 0 ? 'bad' : 'good'}
          label="Перерасход"
          value={fmtTenge(report.totals.overAmount)}
          sub={noBaseline ? 'нормы ещё собираются' : 'сверх норм машин'}
        />
      </div>

      {noBaseline && (
        <div className="note section">
          <Info size={18} />
          <span>
            Нормы считаются сами: у каждой машины норма появится после 4 заправок до полного бака. А пока видно фактический расход и
            сравнение одинаковых машин между собой.
          </span>
        </div>
      )}

      {!hasData ? (
        <div className="card section">
          <Empty icon={FuelIcon} title={`За ${monthLabel(month).toLowerCase()} данных нет`} text="Когда водители начнут отмечать смены и заправки, здесь появятся графики." />
        </div>
      ) : (
        <>
          <section className="card pad-lg section">
            <div className="card-head wrap row" style={{ flexWrap: 'wrap' }}>
              <h2 className="h2">Расход по машинам</h2>
              <div className="legend">
                {FUELS.filter((f) => report.vehicles.some((v) => v.vehicle.fuels.includes(f))).map((f) => (
                  <FuelTag key={f} fuel={f} />
                ))}
                <span>
                  <span className="mark-key" /> норма машины
                </span>
              </div>
            </div>
            <HBars rows={barRows} unit="л/100 км" />
            <p className="small faint" style={{ marginTop: 10 }}>
              Расход считается между заправками до полного бака, закрытыми в этом месяце. Наведите или нажмите на строку — появятся
              детали.
            </p>
          </section>

          <section className="card pad-lg section">
            <div className="card-head row" style={{ flexWrap: 'wrap' }}>
              <h2 className="h2">Затраты по дням</h2>
              {fuelsUsed.length > 1 && (
                <div className="legend">
                  {fuelsUsed.map((f) => (
                    <FuelTag key={f} fuel={f} />
                  ))}
                </div>
              )}
            </div>
            {fuelsUsed.length === 0 ? (
              <div className="small faint">Заправок в этом месяце не было.</div>
            ) : (
              <>
                <Columns data={colData} yFormat={(v) => compact(v)} />
                <details className="table-view">
                  <summary>Показать таблицей</summary>
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>День</th>
                          {fuelsUsed.map((f) => (
                            <th key={f} className="r">
                              {FUEL_LABEL[f]}
                            </th>
                          ))}
                          <th className="r">Итого</th>
                        </tr>
                      </thead>
                      <tbody>
                        {days
                          .filter((d) => fuelsUsed.some((f) => d.amount[f] > 0))
                          .map((d) => (
                            <tr key={d.day}>
                              <td>{d.day}</td>
                              {fuelsUsed.map((f) => (
                                <td key={f} className="r num">
                                  {d.amount[f] ? fmtTenge(d.amount[f]) : '—'}
                                </td>
                              ))}
                              <td className="r num">
                                <b>{fmtTenge(fuelsUsed.reduce((a, f) => a + d.amount[f], 0))}</b>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </section>
        </>
      )}

      <section className="card pad-lg section">
        <div className="card-head">
          <h2 className="h2">Подробно по машинам</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Машина</th>
                <th className="r">Пробег</th>
                <th>Топливо</th>
                <th className="r">Залито</th>
                <th className="r">Сумма</th>
                <th className="r">Расход</th>
                <th className="r">Норма</th>
                <th className="r">Отклонение</th>
                <th className="r">Перерасход / экономия</th>
              </tr>
            </thead>
            <tbody>
              {report.vehicles.flatMap((r) =>
                r.fuels.map((f, i) => (
                  <tr key={`${r.vehicle.id}-${f.fuel}`}>
                    {i === 0 && (
                      <>
                        <td rowSpan={r.fuels.length}>
                          <Plate plate={r.vehicle.plate} size="sm" />
                          <div className="small faint" style={{ marginTop: 4 }}>
                            {r.vehicle.model}
                            {r.vehicle.body !== 'other' ? `, ${BODY_LABEL[r.vehicle.body]}` : ''}
                          </div>
                        </td>
                        <td className="r num" rowSpan={r.fuels.length}>
                          {fmtNum(r.km)} км
                        </td>
                      </>
                    )}
                    <td>
                      <FuelTag fuel={f.fuel} />
                    </td>
                    <td className="r num">{fmtNum(f.liters, 1)} л</td>
                    <td className="r num">{fmtTenge(f.amount)}</td>
                    <td className="r num">{f.consumption !== null ? fmtNum(f.consumption, 1) : '—'}</td>
                    <td className="r num faint">{f.baseline !== null ? fmtNum(f.baseline, 1) : 'сбор'}</td>
                    <td className="r">{f.deviation !== null ? <Deviation value={f.deviation} compact /> : <span className="faint">—</span>}</td>
                    <td className={`r num ${f.overAmount === null ? '' : f.overAmount > 0 ? 't-bad' : 't-good'}`}>
                      {f.overAmount === null ? '—' : f.overAmount > 0 ? fmtTenge(f.overAmount) : `−${fmtTenge(-f.overAmount)}`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="small faint" style={{ marginTop: 10 }}>
          Расход и норма — в литрах на 100 км.
        </p>
      </section>

      <section className="card pad-lg section">
        <div className="card-head">
          <Users size={18} className="faint" />
          <h2 className="h2">Водители</h2>
        </div>
        {report.drivers.length === 0 ? (
          <div className="small faint">За этот месяц смен не было.</div>
        ) : (
          <div className="list">
            {report.drivers.map((d) => (
              <div className="list-row" key={d.driverId} style={{ flexWrap: 'wrap' }}>
                <Avatar name={fleet.nameOf(d.driverId)} />
                <div className="grow" style={{ minWidth: 160 }}>
                  <div style={{ fontWeight: 650 }}>{fleet.nameOf(d.driverId)}</div>
                  <div className="small faint">
                    {d.shifts} {d.shifts === 1 ? 'смена' : d.shifts < 5 ? 'смены' : 'смен'} · {fmtNum(d.km)} км · {d.vehicles.join(', ')}
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {d.fuels.map((f) => (
                    <span key={f.fuel} className="row" style={{ gap: 6 }}>
                      <FuelTag fuel={f.fuel} text={`${fmtNum(f.liters, 1)} л`} />
                      <Deviation value={f.deviation} compact />
                    </span>
                  ))}
                </div>
                <div style={{ minWidth: 96, textAlign: 'right' }}>
                  <div className={`tnum ${d.overAmount > 0 ? 't-bad' : 't-good'}`} style={{ fontWeight: 700 }}>
                    {fmtTenge(Math.abs(d.overAmount))}
                  </div>
                  <div className="small faint">{d.overAmount > 0 ? 'перерасход' : 'экономия'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="small faint" style={{ marginTop: 10 }}>
          Литры делятся между водителями по километрам, которые каждый проехал между заправками. Перерасход в тенге — по средней цене
          литра за месяц.
        </p>
      </section>
    </div>
  );
}
