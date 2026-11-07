import { useMemo, useState } from 'react';
import { CalendarPlus, CircleAlert, MessageCircle, Plus, Save, ShieldAlert, ShieldCheck, ShieldOff, ShieldX, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { driverPolicies, fmtDate, policyStatus, summaryStatus, vehiclePolicies, type InsStatus } from '../../lib/insurance';
import { fmtTenge } from '../../lib/format';
import { INSURANCE_LABEL, type InsuranceKind, type InsurancePolicy, type Profile, type Vehicle } from '../../lib/types';
import { Avatar, Empty, Plate, Sheet, Stat } from '../../components/ui';
import InsurancePill from '../../components/InsurancePill';
import type { Fleet } from './useFleet';

const RANK = { bad: 0, warn: 1, none: 2, good: 3 } as const;

function addYear(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const end = new Date(y + 1, m - 1, d - 1);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}

function nextDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = new Date(y, m - 1, d + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function today(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function policyLine(p: InsurancePolicy): string {
  return [INSURANCE_LABEL[p.kind], p.company, p.number && `№ ${p.number}`, `до ${fmtDate(p.ends_on)}`].filter(Boolean).join(' · ');
}

function remindText(name: string, s: InsStatus, plate?: string): string {
  const p = s.policy!;
  const when = s.days !== null && s.days < 0 ? `закончилась ${fmtDate(p.ends_on)}` : `заканчивается ${fmtDate(p.ends_on)}`;
  return `${name}, страховка ${INSURANCE_LABEL[p.kind]}${plate ? ` на машину ${plate}` : ''} ${when}. Нужно продлить полис.`;
}

// ───────────────────────── Форма полиса ─────────────────────────

type Draft = Omit<InsurancePolicy, 'id'>;

function PolicyForm({ initial, fleet, onClose }: { initial: InsurancePolicy | Draft; fleet: Fleet; onClose: () => void }) {
  const editing = 'id' in initial;
  const [p, setP] = useState<Draft>(() => {
    const copy: Partial<InsurancePolicy> = { ...initial };
    delete copy.id;
    return copy as Draft;
  });
  const [cost, setCost] = useState(initial.cost !== null ? String(initial.cost) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companies = useMemo(() => [...new Set(fleet.policies.map((x) => x.company).filter(Boolean))].sort(), [fleet.policies]);
  const drivers = fleet.profiles.filter((x) => x.role === 'driver' || x.role === 'admin');
  const set = (patch: Partial<Draft>) => setP((x) => ({ ...x, ...patch }));

  const onDriver = (id: string) => {
    const assigned = fleet.vehicles.find((v) => v.assigned_driver === id);
    set({ driver_id: id || null, vehicle_id: p.vehicle_id ?? assigned?.id ?? null });
  };

  const save = async () => {
    setError(null);
    if (!p.driver_id && !p.vehicle_id) return setError('Выберите водителя или машину');
    if (!p.ends_on) return setError('Укажите дату окончания полиса');
    if (p.starts_on && p.starts_on > p.ends_on) return setError('Дата начала позже даты окончания');
    const c = cost.trim() ? Number(cost.replace(/\s/g, '').replace(',', '.')) : null;
    if (c !== null && !(c >= 0)) return setError('Неверная стоимость');
    setBusy(true);
    const payload = { ...p, company: p.company.trim(), number: p.number.trim(), note: p.note.trim(), cost: c };
    const { error } = editing
      ? await supabase.from('insurance_policies').update(payload).eq('id', (initial as InsurancePolicy).id)
      : await supabase.from('insurance_policies').insert(payload);
    setBusy(false);
    if (error) return setError(error.message);
    await fleet.reload();
    onClose();
  };

  const remove = async () => {
    if (!editing || !confirm('Удалить полис?')) return;
    setBusy(true);
    const { error } = await supabase.from('insurance_policies').delete().eq('id', (initial as InsurancePolicy).id);
    setBusy(false);
    if (error) return setError(error.message);
    await fleet.reload();
    onClose();
  };

  const preview = p.ends_on ? policyStatus({ ...p, id: 'x' } as InsurancePolicy) : null;

  return (
    <Sheet
      title={editing ? 'Полис' : 'Новый полис'}
      onClose={onClose}
      footer={
        <>
          {editing && (
            <button className="btn btn-danger" onClick={() => void remove()} disabled={busy} aria-label="Удалить полис">
              <Trash2 size={18} />
            </button>
          )}
          <button className="btn btn-primary grow" onClick={() => void save()} disabled={busy}>
            <Save size={18} /> Сохранить
          </button>
        </>
      }
    >
      <div className="stack loose">
        <div className="seg" role="radiogroup" aria-label="Вид страховки">
          {(['ogpo', 'kasko', 'other'] as InsuranceKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={p.kind === k} className={p.kind === k ? 'active' : ''} onClick={() => set({ kind: k })}>
              {INSURANCE_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="grid-2">
          <label className="field">
            <span className="field-label">Водитель</span>
            <select value={p.driver_id ?? ''} onChange={(e) => onDriver(e.target.value)}>
              <option value="">— любой водитель —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name || d.phone}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Машина</span>
            <select value={p.vehicle_id ?? ''} onChange={(e) => set({ vehicle_id: e.target.value || null })}>
              <option value="">— без машины —</option>
              {fleet.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span className="field-label">Страховая компания</span>
            <input value={p.company} onChange={(e) => set({ company: e.target.value })} list="ins-companies" placeholder="Название" />
            <datalist id="ins-companies">
              {companies.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span className="field-label">Номер полиса</span>
            <input value={p.number} onChange={(e) => set({ number: e.target.value })} placeholder="По желанию" />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span className="field-label">Начало</span>
            <input type="date" value={p.starts_on ?? ''} onChange={(e) => set({ starts_on: e.target.value || null })} />
          </label>
          <label className="field">
            <span className="field-label">Действует до (включительно)</span>
            <input type="date" value={p.ends_on} onChange={(e) => set({ ends_on: e.target.value })} />
          </label>
        </div>
        <div className="row wrap">
          <button type="button" className="btn btn-sm" onClick={() => set({ ends_on: addYear(p.starts_on || today()), starts_on: p.starts_on || today() })}>
            <CalendarPlus size={16} /> На 1 год{p.starts_on ? ' от начала' : ' с сегодня'}
          </button>
          {preview && <InsurancePill s={preview} />}
        </div>
        <div className="grid-2">
          <label className="field">
            <span className="field-label">Стоимость</span>
            <span className="input-wrap">
              <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="По желанию" style={{ fontSize: 16, fontWeight: 600 }} />
              <span className="input-suffix">₸</span>
            </span>
          </label>
          <label className="field">
            <span className="field-label">Заметка</span>
            <input value={p.note} onChange={(e) => set({ note: e.target.value })} placeholder="Например: без ограничения водителей" />
          </label>
        </div>
        {error && (
          <div className="note bad">
            <CircleAlert size={18} /> {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ───────────────────────── Раздел ─────────────────────────

interface Row {
  key: string;
  status: InsStatus;
  policies: InsurancePolicy[];
  person?: Profile;
  vehicle?: Vehicle;
  plates: string[];
}

type View = 'drivers' | 'vehicles';
type Filter = 'all' | 'attention' | 'none';

export function insuranceRows(fleet: Fleet, view: View): Row[] {
  if (view === 'drivers') {
    return fleet.profiles
      .filter((p) => p.role === 'driver' || (p.role === 'admin' && driverPolicies(fleet.policies, p.id, fleet.vehicles).length > 0))
      .map((p) => {
        const list = driverPolicies(fleet.policies, p.id, fleet.vehicles);
        return {
          key: p.id,
          status: summaryStatus(list),
          policies: list,
          person: p,
          plates: fleet.vehicles.filter((v) => v.assigned_driver === p.id).map((v) => v.plate)
        };
      });
  }
  return fleet.vehicles
    .filter((v) => v.active)
    .map((v) => {
      const list = vehiclePolicies(fleet.policies, v);
      return { key: v.id, status: summaryStatus(list), policies: list, vehicle: v, plates: [v.plate] };
    });
}

export default function Insurance({ fleet }: { fleet: Fleet }) {
  const [view, setView] = useState<View>('drivers');
  const [filter, setFilter] = useState<Filter>('all');
  const [edit, setEdit] = useState<InsurancePolicy | Draft | null>(null);

  const rows = useMemo(() => insuranceRows(fleet, view), [fleet, view]);
  const count = (t: InsStatus['tone']) => rows.filter((r) => r.status.tone === t).length;
  const shown = rows
    .filter((r) => (filter === 'all' ? true : filter === 'none' ? r.status.tone === 'none' : r.status.tone === 'bad' || r.status.tone === 'warn'))
    .sort((a, b) => RANK[a.status.tone] - RANK[b.status.tone] || (a.status.days ?? 0) - (b.status.days ?? 0));

  const blank = (r?: Row): Draft => {
    const vehicle = r?.vehicle ?? (r?.person ? fleet.vehicles.find((v) => v.assigned_driver === r.person!.id) : undefined);
    return {
      driver_id: r?.person?.id ?? null,
      vehicle_id: vehicle?.id ?? null,
      kind: 'ogpo',
      company: '',
      number: '',
      starts_on: today(),
      ends_on: addYear(today()),
      cost: null,
      note: ''
    };
  };
  // Продление: новый полис с того же вида и страховой, начинается на следующий день после старого
  const renewal = (old: InsurancePolicy): Draft => {
    const start = old.ends_on >= today() ? nextDay(old.ends_on) : today();
    return { driver_id: old.driver_id, vehicle_id: old.vehicle_id, kind: old.kind, company: old.company, number: '', starts_on: start, ends_on: addYear(start), cost: null, note: '' };
  };
  const what = view === 'drivers' ? 'водителей' : 'машин';

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Страховки</h1>
        <button className="btn btn-primary" onClick={() => setEdit(blank())}>
          <Plus size={18} /> Добавить полис
        </button>
      </div>

      <div className="seg" style={{ maxWidth: 420, marginBottom: 16 }}>
        <button className={view === 'drivers' ? 'active' : ''} onClick={() => setView('drivers')}>
          По водителям
        </button>
        <button className={view === 'vehicles' ? 'active' : ''} onClick={() => setView('vehicles')}>
          По машинам
        </button>
      </div>

      <div className="grid-stats">
        <Stat icon={ShieldX} tone="bad" label="Просрочены или ≤ 7 дней" value={count('bad')} sub={what} />
        <Stat icon={ShieldAlert} tone="amber" label="Истекают за 30 дней" value={count('warn')} sub={what} />
        <Stat icon={ShieldCheck} tone="good" label="Действуют" value={count('good')} sub={what} />
        <Stat icon={ShieldOff} label="Без полиса" value={count('none')} sub={what} />
      </div>

      <div className="chips section" style={{ marginBottom: 14 }}>
        {(
          [
            ['all', `Все · ${rows.length}`],
            ['attention', `Требуют внимания · ${count('bad') + count('warn')}`],
            ['none', `Без полиса · ${count('none')}`]
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button key={f} className={`chip${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>

      <div className="card">
        {shown.length === 0 ? (
          <Empty icon={ShieldCheck} title="Здесь пусто" text={filter === 'attention' ? 'Все полисы в порядке.' : 'Добавьте первый полис кнопкой выше.'} />
        ) : (
          <div className="list">
            {shown.map((r) => {
              const name = r.person?.full_name || r.person?.phone || r.vehicle?.plate || '';
              const remindPhone = r.person?.phone ?? fleet.profiles.find((x) => x.id === r.vehicle?.assigned_driver)?.phone;
              const remindName = r.person?.full_name ?? fleet.nameOf(r.vehicle?.assigned_driver ?? null);
              const current = r.status.policy;
              return (
                <div className="list-row" key={r.key} style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  {r.person ? <Avatar name={name} size="lg" /> : <Plate plate={r.vehicle!.plate} />}
                  <div className="grow" style={{ minWidth: 200 }}>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <b>{r.person ? name : r.vehicle!.model}</b>
                      {r.person && r.plates.map((pl) => <Plate key={pl} plate={pl} size="sm" />)}
                      {!r.person && r.vehicle?.assigned_driver && <span className="small muted">{fleet.nameOf(r.vehicle.assigned_driver)}</span>}
                    </div>
                    <div className="small faint" style={{ marginTop: 3 }}>
                      {current ? policyLine(current) : 'Полис не внесён'}
                      {r.policies.length > 1 && ` · всего полисов: ${r.policies.length}`}
                    </div>
                  </div>
                  <InsurancePill s={r.status} withKind={!!current} />
                  <div className="row" style={{ gap: 4 }}>
                    {(r.status.tone === 'bad' || r.status.tone === 'warn') && remindPhone && current && (
                      <a
                        className="btn btn-sm"
                        href={`https://wa.me/${remindPhone}?text=${encodeURIComponent(remindText(remindName, r.status, r.vehicle?.plate ?? r.plates[0]))}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Напомнить в WhatsApp"
                      >
                        <MessageCircle size={16} /> Напомнить
                      </a>
                    )}
                    <button className="btn btn-sm" onClick={() => setEdit(current ?? blank(r))}>
                      {current ? 'Изменить' : 'Внести'}
                    </button>
                    {current && (
                      <button className="btn btn-sm btn-ghost" onClick={() => setEdit(renewal(current))} title="Новый полис на следующий год">
                        <Plus size={16} /> Продлить
                      </button>
                    )}
                  </div>
                  {r.policies.length > 1 && (
                    <div className="small" style={{ flexBasis: '100%', paddingLeft: 56 }}>
                      {r.policies
                        .slice()
                        .sort((a, b) => b.ends_on.localeCompare(a.ends_on))
                        .map((p) => (
                          <button key={p.id} className="link-btn" style={{ marginRight: 14 }} onClick={() => setEdit(p)}>
                            {policyLine(p)}
                            {p.cost !== null ? ` · ${fmtTenge(p.cost)}` : ''}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="small faint" style={{ marginTop: 10 }}>
        Жёлтым — осталось 30 дней и меньше, красным — неделя и меньше или полис просрочен. Полис можно оформить на водителя, на машину или на
        обоих: полис машины без указания водителя считается полисом её закреплённого водителя. «Напомнить» открывает WhatsApp с готовым
        текстом для водителя.
      </p>
      {edit && <PolicyForm initial={edit} fleet={fleet} onClose={() => setEdit(null)} />}
    </div>
  );
}
