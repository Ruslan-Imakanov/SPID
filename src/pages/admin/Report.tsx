import { useMemo, useState } from 'react';
import { buildMonthReport, findIssues, monthKey } from '../../lib/calc';
import { currentMonth, devClass, fmtNum, fmtPct, fmtTenge } from '../../lib/format';
import { FUEL_LABEL, type Fuel } from '../../lib/types';
import MonthNav from '../../components/MonthNav';
import type { Fleet } from './useFleet';

export default function Report({ fleet }: { fleet: Fleet }) {
  const [month, setMonth] = useState(currentMonth());
  const [exporting, setExporting] = useState(false);
  const report = useMemo(() => buildMonthReport(fleet.vehicles, fleet.events, month), [fleet.vehicles, fleet.events, month]);
  const noBaseline = report.vehicles.every((v) => v.fuels.every((f) => f.baseline === null));

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

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 16 }}>
        <MonthNav value={month} onChange={setMonth} />
        <span className="grow" />
        <button className="btn" onClick={() => void doExport()} disabled={exporting}>
          ⬇ {exporting ? 'Готовлю…' : 'Скачать Excel'}
        </button>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="label">Пробег парка</div>
          <div className="value">{fmtNum(report.totals.km)} км</div>
        </div>
        {(Object.entries(report.totals.liters) as [Fuel, number][]).map(([f, l]) => (
          <div className="kpi" key={f}>
            <div className="label">{FUEL_LABEL[f]}, залито</div>
            <div className="value">{fmtNum(l)} л</div>
          </div>
        ))}
        <div className="kpi">
          <div className="label">Затраты на топливо</div>
          <div className="value">{fmtTenge(report.totals.amount)}</div>
        </div>
        <div className="kpi">
          <div className="label">Перерасход</div>
          <div className={`value ${report.totals.overAmount > 0 ? 'bad' : ''}`}>{fmtTenge(report.totals.overAmount)}</div>
        </div>
      </div>

      {noBaseline && (
        <div className="note info" style={{ marginBottom: 16 }}>
          Нормы ещё собираются: у каждой машины норма появится после 4 заправок до полного бака (первая — точка отсчёта, затем 3
          интервала). До этого видны фактический расход и сравнение одинаковых машин между собой.
        </div>
      )}

      <div className="card">
        <h2>Машины</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Машина</th>
                <th className="r">Пробег</th>
                <th>Топливо</th>
                <th className="r">Залито</th>
                <th className="r">Сумма</th>
                <th className="r">Расход</th>
                <th className="r">Норма</th>
                <th className="r">Откл.</th>
                <th className="r">Перерасход</th>
              </tr>
            </thead>
            <tbody>
              {report.vehicles.flatMap((r) =>
                r.fuels.map((f, i) => (
                  <tr key={`${r.vehicle.id}-${f.fuel}`}>
                    {i === 0 && (
                      <>
                        <td rowSpan={r.fuels.length}>
                          <b>{r.vehicle.plate}</b>
                          <div className="small muted">
                            {r.vehicle.model}
                            {r.vehicle.body === '6m' ? ', 6 м' : ''}
                          </div>
                        </td>
                        <td className="r num" rowSpan={r.fuels.length}>
                          {fmtNum(r.km)} км
                        </td>
                      </>
                    )}
                    <td>{FUEL_LABEL[f.fuel]}</td>
                    <td className="r num">{fmtNum(f.liters, 1)} л</td>
                    <td className="r num">{fmtTenge(f.amount)}</td>
                    <td className="r num">{f.consumption !== null ? `${fmtNum(f.consumption, 1)}` : '—'}</td>
                    <td className="r num muted">{f.baseline !== null ? fmtNum(f.baseline, 1) : 'сбор'}</td>
                    <td className={`r num ${devClass(f.deviation)}`}>{fmtPct(f.deviation)}</td>
                    <td className={`r num ${f.overAmount && f.overAmount > 0 ? 'bad' : ''}`}>
                      {f.overAmount !== null ? fmtTenge(f.overAmount) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>
          Расход и норма — л/100 км. Расход считается между заправками до полного бака, закрытыми в этом месяце.
        </div>
      </div>

      {report.groups.length > 0 && (
        <div className="card">
          <h2>Сравнение одинаковых машин</h2>
          {report.groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 12 }}>
              <h3>
                {g.label} · {FUEL_LABEL[g.fuel]}{' '}
                <span className="muted small">медиана {g.median !== null ? `${fmtNum(g.median, 1)} л/100` : '—'}</span>
              </h3>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {g.vehicles.map((x) => (
                      <tr key={x.vehicle.id}>
                        <td>{x.vehicle.plate}</td>
                        <td className="r num">{x.consumption !== null ? `${fmtNum(x.consumption, 1)} л/100` : 'нет данных'}</td>
                        <td className={`r num ${devClass(x.diff)}`}>{fmtPct(x.diff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Водители</h2>
        {report.drivers.length === 0 ? (
          <div className="muted">Нет смен за этот месяц</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Водитель</th>
                  <th className="r">Смен</th>
                  <th className="r">Пробег</th>
                  <th>Топливо</th>
                  <th className="r">Откл.</th>
                  <th className="r">Перерасход</th>
                  <th>Машины</th>
                </tr>
              </thead>
              <tbody>
                {report.drivers.map((d) => (
                  <tr key={d.driverId}>
                    <td>{fleet.nameOf(d.driverId)}</td>
                    <td className="r num">{d.shifts}</td>
                    <td className="r num">{fmtNum(d.km)} км</td>
                    <td className="small">
                      {d.fuels.map((f) => (
                        <div key={f.fuel}>
                          {FUEL_LABEL[f.fuel]} {fmtNum(f.liters, 1)} л
                        </div>
                      ))}
                    </td>
                    <td className="r num">
                      {d.fuels.map((f) => (
                        <div key={f.fuel} className={devClass(f.deviation)}>
                          {fmtPct(f.deviation)}
                        </div>
                      ))}
                    </td>
                    <td className={`r num ${d.overAmount > 0 ? 'bad' : ''}`}>{fmtTenge(d.overAmount)}</td>
                    <td className="small">{d.vehicles.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="small muted" style={{ marginTop: 8 }}>
          Литры распределяются по водителям пропорционально километрам, которые каждый проехал между заправками. Перерасход в тенге —
          по средней цене литра за месяц.
        </div>
      </div>
    </div>
  );
}
