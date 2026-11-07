import { useState } from 'react';
import { CircleAlert, Pencil, Plus, Save, Truck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BODY_LABEL, FUEL_LABEL, type Body, type Fuel, type Vehicle } from '../../lib/types';
import { Avatar, Empty, FUEL_ICON, FuelTag, Plate, Sheet, Switch } from '../../components/ui';
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

  const toggleFuel = (f: Fuel) => setV((x) => ({ ...x, fuels: x.fuels.includes(f) ? x.fuels.filter((y) => y !== f) : [...x.fuels, f] }));

  const save = async () => {
    setError(null);
    const plate = v.plate.trim().toUpperCase().replace(/\s+/g, '');
    if (!plate) return setError('Введите госномер');
    if (v.fuels.length === 0) return setError('Выберите хотя бы один вид топлива');
    setBusy(true);
    const payload = { ...v, plate, model: v.model.trim() };
    const { error } = initial ? await supabase.from('vehicles').update(payload).eq('id', initial.id) : await supabase.from('vehicles').insert(payload);
    setBusy(false);
    if (error) return setError(/duplicate|unique/i.test(error.message) ? 'Машина с таким номером уже есть' : error.message);
    await fleet.reload();
    onClose();
  };

  return (
    <Sheet
      title={initial ? 'Машина' : 'Новая машина'}
      icon={initial ? <Plate plate={initial.plate} size="sm" /> : undefined}
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-block" onClick={() => void save()} disabled={busy}>
          <Save size={18} /> Сохранить
        </button>
      }
    >
      <div className="stack loose">
        <label className="field">
          <span className="field-label">Госномер</span>
          <input value={v.plate} onChange={(e) => setV({ ...v, plate: e.target.value })} placeholder="150AIB" style={{ textTransform: 'uppercase' }} />
        </label>
        {v.plate.trim() && (
          <div>
            <Plate plate={v.plate} size="lg" />
          </div>
        )}
        <label className="field">
          <span className="field-label">Модель</span>
          <input value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} list="models" />
          <datalist id="models">
            <option value="ГАЗель Next" />
            <option value="ГАЗель Бизнес" />
            <option value="ГАЗель (старая)" />
            <option value="JAC N140" />
          </datalist>
        </label>
        <div className="field">
          <span className="field-label">Кузов</span>
          <div className="seg">
            {(['standard', '6m', 'other'] as Body[]).map((b) => (
              <button type="button" key={b} className={v.body === b ? 'active' : ''} onClick={() => setV({ ...v, body: b })}>
                {b === 'other' ? 'другой' : BODY_LABEL[b]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Топливо — для газа с бензином отметьте оба</span>
          <div className="fuel-choice">
            {(['petrol', 'lpg', 'diesel'] as Fuel[]).map((f) => {
              const Icon = FUEL_ICON[f];
              return (
                <button type="button" key={f} className={`fuel-${f}${v.fuels.includes(f) ? ' active' : ''}`} onClick={() => toggleFuel(f)} aria-pressed={v.fuels.includes(f)}>
                  <span className="fuel-ico">
                    <Icon size={20} />
                  </span>
                  {FUEL_LABEL[f]}
                </button>
              );
            })}
          </div>
        </div>
        <label className="field">
          <span className="field-label">Закреплённый водитель</span>
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
          <span className="field-label">Заметки</span>
          <textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} placeholder="Например: ГБО поставили в 2025" />
        </label>
        <Switch checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="В работе" hint="Выключите, если машина продана или списана — история сохранится" />
        {error && (
          <div className="note bad">
            <CircleAlert size={18} /> {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}

export default function Vehicles({ fleet }: { fleet: Fleet }) {
  const [edit, setEdit] = useState<Vehicle | 'new' | null>(null);
  const active = fleet.vehicles.filter((v) => v.active);
  const inactive = fleet.vehicles.filter((v) => !v.active);

  const card = (v: Vehicle) => (
    <article key={v.id} className="card click fleet-card" onClick={() => setEdit(v)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEdit(v)} style={v.active ? undefined : { opacity: 0.6 }}>
      <div className="row between">
        <Plate plate={v.plate} />
        <Pencil size={17} className="faint" />
      </div>
      <div className="vehicle-meta">
        <span>
          {v.model}
          {v.body !== 'other' && ` · ${BODY_LABEL[v.body]}`}
        </span>
        {v.fuels.map((f) => (
          <FuelTag key={f} fuel={f} />
        ))}
      </div>
      <div className="row">
        {v.assigned_driver ? (
          <>
            <Avatar name={fleet.nameOf(v.assigned_driver)} size="sm" />
            <span className="muted">{fleet.nameOf(v.assigned_driver)}</span>
          </>
        ) : (
          <span className="small faint">Водитель не закреплён</span>
        )}
      </div>
      {v.notes && <div className="small faint">{v.notes}</div>}
    </article>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Машины · {active.length}</h1>
        <button className="btn btn-primary" onClick={() => setEdit('new')}>
          <Plus size={18} /> Добавить машину
        </button>
      </div>
      {fleet.vehicles.length === 0 ? (
        <div className="card">
          <Empty icon={Truck} title="Машин пока нет" text="Добавьте первую машину кнопкой выше." />
        </div>
      ) : (
        <>
          <div className="grid-cards">{active.map(card)}</div>
          {inactive.length > 0 && (
            <div className="section">
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Не в работе · {inactive.length}
              </div>
              <div className="grid-cards">{inactive.map(card)}</div>
            </div>
          )}
        </>
      )}
      {edit && <VehicleForm initial={edit === 'new' ? null : edit} fleet={fleet} onClose={() => setEdit(null)} />}
    </div>
  );
}
