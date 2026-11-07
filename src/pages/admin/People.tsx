import { useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Ban,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Crown,
  KeyRound,
  MessageCircle,
  RotateCcw,
  Save,
  Share2,
  Shuffle,
  UserCheck,
  UserPlus,
  Users,
  UserX
} from 'lucide-react';
import { isValidPhone, normalizePhone, phoneToEmail, supabase } from '../../lib/supabase';
import { ROLE_LABEL, type Profile, type Role } from '../../lib/types';
import { Avatar, Empty, Plate, Sheet } from '../../components/ui';
import { fmtPhone } from '../../components/ProfileSheet';
import type { Fleet } from './useFleet';
import { driverPolicies, summaryStatus } from '../../lib/insurance';
import InsurancePill from '../../components/InsurancePill';

const APP_NAME = 'ГСМ Контроль';

function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function randomPassword(): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => abc[n % abc.length]).join('');
}

function waLink(text: string, phone?: string): string {
  return `https://wa.me/${phone ? normalizePhone(phone) : ''}?text=${encodeURIComponent(text)}`;
}

function friendlyError(msg: string): string {
  if (/последнего руководителя/i.test(msg)) return 'Нельзя снять права с последнего руководителя — сначала назначьте другого.';
  if (/already registered|already exists/i.test(msg)) return 'Этот номер уже зарегистрирован — найдите сотрудника в списке.';
  if (/rate limit/i.test(msg)) return 'Слишком много регистраций подряд. Подождите пару минут.';
  return msg;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function RoleSeg({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <div className="seg" role="radiogroup" aria-label="Роль">
      <button type="button" role="radio" aria-checked={value === 'driver'} className={value === 'driver' ? 'active' : ''} onClick={() => onChange('driver')} disabled={disabled}>
        <Users size={17} /> Водитель
      </button>
      <button type="button" role="radio" aria-checked={value === 'admin'} className={value === 'admin' ? 'active' : ''} onClick={() => onChange('admin')} disabled={disabled}>
        <Crown size={17} /> Руководитель
      </button>
    </div>
  );
}

const ROLE_HINT: Record<'driver' | 'admin', string> = {
  driver: 'Отмечает смены и заправки со своего телефона.',
  admin: 'Видит парк, отчёты и журнал, исправляет записи, управляет машинами и сотрудниками.'
};

// ───────────────────────── Добавить сотрудника ─────────────────────────

function AddPersonSheet({ fleet, onClose }: { fleet: Fleet; onClose: () => void }) {
  const [role, setRole] = useState<Role>('driver');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(randomPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; phone: string; password: string; role: Role } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) return setError('Введите фамилию и имя');
    if (!isValidPhone(phone)) return setError('Введите номер полностью, например +7 701 123 45 67');
    if (password.length < 6) return setError('Пароль должен быть не короче 6 символов');
    setBusy(true);
    try {
      // Отдельный клиент без сохранения сессии: регистрируем сотрудника, не выходя из своей учётной записи.
      const temp = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'gsm-temp-signup' }
      });
      const { data, error } = await temp.auth.signUp({
        email: phoneToEmail(phone),
        password,
        options: { data: { full_name: name.trim(), phone: normalizePhone(phone) } }
      });
      if (error) throw error;
      const id = data.user?.id;
      if (!id) throw new Error('Не удалось создать учётную запись');
      const { error: upd } = await supabase.from('profiles').update({ role }).eq('id', id);
      if (upd) throw upd;
      await temp.auth.signOut().catch(() => undefined);
      await fleet.reload();
      setDone({ name: name.trim(), phone: normalizePhone(phone), password, role });
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const text = `${done.name}, вам открыт доступ в «${APP_NAME}» (${done.role === 'admin' ? 'руководитель' : 'водитель'}).\n\nСсылка: ${appUrl()}\nТелефон: ${fmtPhone(done.phone)}\nПароль: ${done.password}\n\nПароль можно сменить в профиле.`;
    return (
      <Sheet title="Сотрудник добавлен" onClose={onClose} icon={<span className="stat-ico good"><Check size={18} /></span>}>
        <div className="stack loose">
          <div className="note good">
            <UserCheck size={18} />
            <span>
              {done.name} — {done.role === 'admin' ? 'руководитель' : 'водитель'}. Доступ уже открыт, подтверждать не нужно.
            </span>
          </div>
          <div className="card flat" style={{ background: 'var(--surface-2)' }}>
            <div className="stack tight">
              <div className="small faint">Данные для входа</div>
              <div>
                Телефон: <b>{fmtPhone(done.phone)}</b>
              </div>
              <div>
                Пароль: <b className="tnum" style={{ letterSpacing: '0.06em' }}>{done.password}</b>
              </div>
            </div>
          </div>
          <a className="btn btn-primary btn-lg btn-block" href={waLink(text, done.phone)} target="_blank" rel="noreferrer">
            <MessageCircle size={20} /> Отправить в WhatsApp
          </a>
          <button className="btn btn-block" onClick={async () => setCopied(await copy(text))}>
            {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'Скопировано' : 'Скопировать текст'}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Новый сотрудник"
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-block" onClick={() => void submit()} disabled={busy}>
          <UserPlus size={18} /> {busy ? 'Создаю…' : 'Добавить'}
        </button>
      }
    >
      <div className="stack loose">
        <div className="stack tight" style={{ gap: 8 }}>
          <RoleSeg value={role} onChange={setRole} />
          <div className="small faint">{ROLE_HINT[role === 'admin' ? 'admin' : 'driver']}</div>
        </div>
        <label className="field">
          <span className="field-label">Фамилия и имя</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Иванов Иван" autoComplete="off" />
        </label>
        <label className="field">
          <span className="field-label">Номер телефона — это его логин</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="+7 701 123 45 67" autoComplete="off" />
        </label>
        <label className="field">
          <span className="field-label">Пароль</span>
          <span className="input-wrap">
            <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" style={{ fontSize: 17, letterSpacing: '0.04em' }} />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setPassword(randomPassword())}
              aria-label="Придумать другой пароль"
              title="Придумать другой"
              style={{ position: 'absolute', right: 3, top: 3, width: 42, height: 42, color: 'var(--text-3)' }}
            >
              <Shuffle size={18} />
            </button>
          </span>
        </label>
        {error && (
          <div className="note bad">
            <CircleAlert size={18} /> {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ───────────────────────── Пригласить ссылкой ─────────────────────────

function InviteSheet({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Установите приложение «${APP_NAME}» для учёта смен и заправок: ${appUrl()}\n\nНажмите «Регистрация», введите имя, телефон и придумайте пароль. После этого я подтвержу доступ.`;
  return (
    <Sheet title="Пригласить по ссылке" onClose={onClose}>
      <div className="stack loose">
        <p className="muted">Человек зарегистрируется сам, а вы подтвердите его здесь и выберете роль.</p>
        <div className="card flat" style={{ background: 'var(--surface-2)', wordBreak: 'break-all' }}>
          <b>{appUrl()}</b>
        </div>
        <a className="btn btn-primary btn-lg btn-block" href={waLink(text)} target="_blank" rel="noreferrer">
          <MessageCircle size={20} /> Отправить в WhatsApp
        </a>
        <button className="btn btn-block" onClick={async () => setCopied(await copy(text))}>
          {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'Скопировано' : 'Скопировать приглашение'}
        </button>
      </div>
    </Sheet>
  );
}

// ───────────────────────── Карточка сотрудника ─────────────────────────

function PersonSheet({ p, me, fleet, onClose }: { p: Profile; me: Profile; fleet: Fleet; onClose: () => void }) {
  const self = p.id === me.id;
  const [name, setName] = useState(p.full_name);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, okText: string) => {
    setMsg(null);
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return setMsg({ ok: false, text: friendlyError(error.message) });
    setMsg({ ok: true, text: okText });
    await fleet.reload();
  };

  const setRole = (role: Role) =>
    run(() => supabase.from('profiles').update({ role }).eq('id', p.id), role === 'admin' ? 'Теперь это руководитель' : role === 'driver' ? 'Теперь это водитель' : 'Доступ отключён');

  const plates = fleet.vehicles.filter((v) => v.assigned_driver === p.id);

  return (
    <Sheet title={p.full_name || 'Сотрудник'} icon={<Avatar name={p.full_name || '?'} />} onClose={onClose}>
      <div className="stack loose">
        <div className="row wrap" style={{ gap: 8 }}>
          <span className={`pill ${p.role === 'admin' ? 'amber' : p.role === 'blocked' ? 'bad' : ''}`}>{ROLE_LABEL[p.role]}</span>
          <span className="muted">{fmtPhone(p.phone)}</span>
          {self && <span className="pill">это вы</span>}
          {plates.map((v) => (
            <Plate key={v.id} plate={v.plate} size="sm" />
          ))}
        </div>

        {msg && (
          <div className={`note ${msg.ok ? 'good' : 'bad'}`}>
            {msg.ok ? <Check size={18} /> : <CircleAlert size={18} />} {msg.text}
          </div>
        )}

        {p.role !== 'blocked' && (
          <div className="stack tight" style={{ gap: 8 }}>
            <div className="field-label">Роль</div>
            <RoleSeg value={p.role === 'admin' ? 'admin' : 'driver'} onChange={(r) => r !== p.role && void setRole(r)} disabled={busy || self} />
            <div className="small faint">{self ? 'Свою роль поменять нельзя — попросите другого руководителя.' : ROLE_HINT[p.role === 'admin' ? 'admin' : 'driver']}</div>
          </div>
        )}

        <div className="stack tight" style={{ gap: 8 }}>
          <label className="field">
            <span className="field-label">Фамилия и имя</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn" disabled={busy || !name.trim() || name.trim() === p.full_name} onClick={() => void run(() => supabase.from('profiles').update({ full_name: name.trim() }).eq('id', p.id), 'Имя сохранено')}>
            <Save size={18} /> Сохранить имя
          </button>
        </div>

        {!self && (
          <div className="stack tight" style={{ gap: 8 }}>
            <label className="field">
              <span className="field-label">Новый пароль (если забыл)</span>
              <span className="input-wrap">
                <input value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Не короче 6 символов" autoComplete="off" style={{ fontSize: 16 }} />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setPwd(randomPassword())}
                  aria-label="Придумать пароль"
                  style={{ position: 'absolute', right: 3, top: 3, width: 42, height: 42, color: 'var(--text-3)' }}
                >
                  <Shuffle size={18} />
                </button>
              </span>
            </label>
            <div className="row wrap">
              <button
                className="btn grow"
                disabled={busy || pwd.length < 6}
                onClick={() => void run(() => supabase.rpc('admin_set_password', { target: p.id, new_password: pwd }), `Пароль изменён: ${pwd}`)}
              >
                <KeyRound size={18} /> Задать пароль
              </button>
              {pwd.length >= 6 && (
                <a
                  className="btn"
                  href={waLink(`Ваш новый пароль в «${APP_NAME}»: ${pwd}\nВход: ${appUrl()}`, p.phone)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Отправить пароль в WhatsApp"
                >
                  <MessageCircle size={18} />
                </a>
              )}
            </div>
          </div>
        )}

        {!self &&
          (p.role === 'blocked' ? (
            <button className="btn btn-block" disabled={busy} onClick={() => void setRole('driver')}>
              <RotateCcw size={18} /> Вернуть доступ (водитель)
            </button>
          ) : (
            <button className="btn btn-danger btn-block" disabled={busy} onClick={() => confirm(`Отключить доступ: ${p.full_name}?`) && void setRole('blocked')}>
              <Ban size={18} /> Отключить доступ
            </button>
          ))}
      </div>
    </Sheet>
  );
}

// ───────────────────────── Раздел ─────────────────────────

type Filter = 'all' | 'admin' | 'driver' | 'blocked';

export default function People({ fleet, me }: { fleet: Fleet; me: Profile }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [add, setAdd] = useState(false);
  const [invite, setInvite] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = fleet.profiles.filter((p) => p.role === 'pending');
  const others = useMemo(() => {
    const order: Record<Role, number> = { admin: 0, driver: 1, blocked: 2, pending: 3 };
    return fleet.profiles
      .filter((p) => p.role !== 'pending' && (filter === 'all' ? p.role !== 'blocked' : p.role === filter))
      .sort((a, b) => order[a.role] - order[b.role] || a.full_name.localeCompare(b.full_name, 'ru'));
  }, [fleet.profiles, filter]);
  const count = (r: Role) => fleet.profiles.filter((p) => p.role === r).length;
  const open = fleet.profiles.find((p) => p.id === openId) ?? null;

  const approve = async (p: Profile, role: Role) => {
    setError(null);
    setBusyId(p.id);
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id);
    setBusyId(null);
    if (error) setError(friendlyError(error.message));
    else await fleet.reload();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Сотрудники</h1>
        <button className="btn" onClick={() => setInvite(true)}>
          <Share2 size={18} /> Пригласить
        </button>
        <button className="btn btn-primary" onClick={() => setAdd(true)}>
          <UserPlus size={18} /> Добавить
        </button>
      </div>

      {error && (
        <div className="note bad" style={{ marginBottom: 12 }}>
          <CircleAlert size={18} /> {error}
        </div>
      )}

      {pending.length > 0 && (
        <section className="card pad-lg" style={{ borderColor: 'var(--amber)', marginBottom: 16 }}>
          <div className="card-head">
            <span className="stat-ico amber">
              <UserCheck size={17} />
            </span>
            <h2 className="h2">Ждут подтверждения · {pending.length}</h2>
          </div>
          <div className="list">
            {pending.map((p) => (
              <div className="list-row" key={p.id} style={{ flexWrap: 'wrap' }}>
                <Avatar name={p.full_name || '?'} />
                <div className="grow" style={{ minWidth: 150 }}>
                  <div style={{ fontWeight: 650 }}>{p.full_name || '(без имени)'}</div>
                  <div className="small faint">{fmtPhone(p.phone)}</div>
                </div>
                <div className="row wrap">
                  <button className="btn btn-primary btn-sm" disabled={busyId === p.id} onClick={() => void approve(p, 'driver')}>
                    <Check size={16} /> Водитель
                  </button>
                  <button className="btn btn-sm" disabled={busyId === p.id} onClick={() => void approve(p, 'admin')}>
                    <Crown size={16} /> Руководитель
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={busyId === p.id} onClick={() => void approve(p, 'blocked')} aria-label="Отклонить">
                    <UserX size={16} /> Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="chips" style={{ marginBottom: 14 }}>
        {(
          [
            ['all', `Все · ${count('admin') + count('driver')}`],
            ['admin', `Руководители · ${count('admin')}`],
            ['driver', `Водители · ${count('driver')}`],
            ['blocked', `Отключены · ${count('blocked')}`]
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button key={f} className={`chip${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>

      <div className="card">
        {others.length === 0 ? (
          <Empty icon={Users} title="Здесь пока никого" text="Добавьте сотрудника или отправьте приглашение." />
        ) : (
          <div className="list">
            {others.map((p) => {
              const plates = fleet.vehicles.filter((v) => v.assigned_driver === p.id);
              return (
                <div className="list-row click" key={p.id} role="button" tabIndex={0} onClick={() => setOpenId(p.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(p.id)}>
                  <Avatar name={p.full_name || '?'} size="lg" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <b>{p.full_name || '(без имени)'}</b>
                      {p.role === 'admin' && (
                        <span className="pill amber">
                          <Crown size={13} /> Руководитель
                        </span>
                      )}
                      {p.role === 'blocked' && <span className="pill bad">Отключён</span>}
                      {p.id === me.id && <span className="pill">вы</span>}
                    </div>
                    <div className="row wrap small faint" style={{ gap: 8, marginTop: 4 }}>
                      {fmtPhone(p.phone)}
                      {plates.map((v) => (
                        <Plate key={v.id} plate={v.plate} size="sm" />
                      ))}
                      {p.role === 'driver' && <InsurancePill s={summaryStatus(driverPolicies(fleet.policies, p.id, fleet.vehicles))} withKind prefix="" />}
                    </div>
                  </div>
                  <ChevronRight size={18} className="faint" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {add && <AddPersonSheet fleet={fleet} onClose={() => setAdd(false)} />}
      {invite && <InviteSheet onClose={() => setInvite(false)} />}
      {open && <PersonSheet p={open} me={me} fleet={fleet} onClose={() => setOpenId(null)} />}
    </div>
  );
}
