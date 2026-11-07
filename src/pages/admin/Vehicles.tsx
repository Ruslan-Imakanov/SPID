import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { BODY_LABEL, FUEL_LABEL, type Body, type Fuel, type Vehicle } from '../../lib/types';
import type { Fleet } from './useFleet';

const EMPTY: Omit<Vehicle, 'id'> = {
  plate: '',
  model: 'ГАЗель Next',
  body: 'standard',
  fuels: ['petrol'],
  assigned_driver: null,
  active: true,
  notes: ''
};

function VehicleForm({ initial, fleet, onClose }: { initial: Vehicle | null; fleet: Fleet; onClose: () => void }) {
  const [v, setV] = useState<Omit<Vehicle, 'id'>>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFuel = (f: Fuel) =>
    setV((x) => ({ ...x, fuels: x.fuels.includes(f) ? x.fuels.filter((y) => y !== f) : [...x.fuels, f] }));

  const save = async () => {
    setError(null);
    const plate = v.plate.trim().toUpperCase().replace(/\s+/g, '');
    if (!plate) return setError('Введите госномер');
    if (v.fuels.length === 0) return setError('Выберите хотя бы один вид топлива');
    setBusy(true);
    const payload = { ...v, plate, model: v.model.trim() };
    const { error } = initial
      ? await supabase.from('vehicles').update(payload).eq('id', initial.id)
      : await supabase.from('vehicles').insert(payload);
    setBusy(false);
    if (error) return setError(/duplicate|unique/i.test(error.message) ? 'Машина с таким номером уже есть' : error.message);
    await fleet.reload();
    onClose();
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? `Машина ${initial.plate}` : 'Новая машина'}</h2>
        <label className="field">
          <span>Госномер</span>
          <input value={v.plate} onChange={(e) => setV({ ...v, plate: e.target.value })} placeholder="150AIB" />
        </label>
        <label className="field">
          <span>Модель</span>
          <input value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} list="models" />
          <datalist id="models">
            <option value="ГАЗель Next" />
            <option value="ГАЗель Бизнес" />
            <option value="ГАЗель (старая)" />
            <option value="JAC N140" />
          </datalist>
        </label>
        <div className="field">
          <span className="muted small">Кузов</span>
          <div className="seg">
            {(['standard', '6m', 'other'] as Body[]).map((b) => (
              <button type="button" key={b} className={v.body === b ? 'active' : ''} onClick={() => setV({ ...v, body: b })}>
                {b === 'other' ? 'другое' : BODY_LABEL[b]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="muted small">Топливо (для газа с бензином отметьте оба)</span>
          <div className="seg">
            {(['petrol', 'lpg', 'diesel'] as Fuel[]).map((f) => (
              <button type="button" key={f} className={v.fuels.includes(f) ? 'active' : ''} onClick={() => toggleFuel(f)}>
                {FUEL_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Закреплённый водитель</span>
          <select value={v.assigned_driver ?? ''} onChange={(e) => setV({ ...v, assigned_driver: e.target.value || null })}>
            <option value="">— не закреплён —</option>
            {fleet.profiles
              .filter((p) => p.role === 'driver' || p.role === 'admin')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.phone}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Заметки</span>
          <textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} />
        </label>
        <label className="check">
          <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
          В работе (снимите, если машина продана или списана)
        </label>
        {error && <div className="note bad">{error}</div>}
        <div className="row">
          <button className="btn primary grow" onClick={() => void save()} disabled={busy}>
            Сохранить
          </button>
          <button className="btn" onClick={onClose} disabled={busy}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Vehicles({ fleet }: { fleet: Fleet }) {
  const [edit, setEdit] = useState<Vehicle | 'new' | null>(null);
  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 16 }}>
        <h1 className="grow" style={{ margin: 0 }}>
          Машины ({fleet.vehicles.filter((v) => v.active).length})
        </h1>
        <button className="btn primary" onClick={() => setEdit('new')}>
          + Добавить
        </button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Номер</th>
                <th>Модель</th>
                <th>Кузов</th>
                <th>Топливо</th>
                <th>Водитель</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fleet.vehicles.map((v) => (
                <tr key={v.id} className="click" onClick={() => setEdit(v)} style={v.active ? undefined : { opacity: 0.5 }}>
                  <td>
                    <b>{v.plate}</b>
                  </td>
                  <td>{v.model}</td>
                  <td>{BODY_LABEL[v.body]}</td>
                  <td>{v.fuels.map((f) => FUEL_LABEL[f]).join(' + ')}</td>
                  <td>{v.assigned_driver ? fleet.nameOf(v.assigned_driver) : <span className="muted">—</span>}</td>
                  <td>{!v.active && <span className="badge">не в работе</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {edit && <VehicleForm initial={edit === 'new' ? null : edit} fleet={fleet} onClose={() => setEdit(null)} />}
    </div>
  );
}
