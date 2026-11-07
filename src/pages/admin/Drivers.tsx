import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ROLE_LABEL, type Profile, type Role } from '../../lib/types';
import type { Fleet } from './useFleet';

function fmtPhone(d: string): string {
  const m = d.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : d;
}

export default function Drivers({ fleet, me }: { fleet: Fleet; me: Profile }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (p: Profile, patch: Partial<Profile>) => {
    setError(null);
    setBusy(p.id);
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id);
    setBusy(null);
    if (error) setError(error.message);
    else await fleet.reload();
  };

  const rename = (p: Profile) => {
    const name = prompt('Фамилия и имя', p.full_name);
    if (name !== null && name.trim()) void update(p, { full_name: name.trim() });
  };

  const resetPassword = async (p: Profile) => {
    const pwd = prompt(`Новый пароль для ${p.full_name || fmtPhone(p.phone)} (не короче 6 символов)`);
    if (pwd === null) return;
    if (pwd.length < 6) return setError('Пароль должен быть не короче 6 символов');
    setError(null);
    setBusy(p.id);
    const { error } = await supabase.rpc('admin_set_password', { target: p.id, new_password: pwd });
    setBusy(null);
    if (error) setError(error.message);
    else alert('Пароль изменён');
  };

  const order: Record<Role, number> = { pending: 0, driver: 1, admin: 2, blocked: 3 };
  const list = [...fleet.profiles].sort((a, b) => order[a.role] - order[b.role] || a.full_name.localeCompare(b.full_name));
  const pending = list.filter((p) => p.role === 'pending');

  return (
    <div className="page">
      <h1>Водители</h1>
      <div className="note info small" style={{ marginBottom: 16 }}>
        Водитель сам регистрируется в приложении по номеру телефона, затем вы подтверждаете его здесь. Если водитель забыл пароль —
        нажмите «новый пароль» и сообщите ему.
      </div>
      {error && <div className="note bad" style={{ marginBottom: 12 }}>{error}</div>}

      {pending.length > 0 && (
        <div className="card">
          <h2>Ждут подтверждения</h2>
          {pending.map((p) => (
            <div className="list-item" key={p.id}>
              <div>
                <b>{p.full_name || '(без имени)'}</b>
                <div className="small muted">{fmtPhone(p.phone)}</div>
              </div>
              <div className="row">
                <button className="btn primary" disabled={busy === p.id} onClick={() => void update(p, { role: 'driver' })}>
                  Подтвердить
                </button>
                <button className="btn" disabled={busy === p.id} onClick={() => void update(p, { role: 'blocked' })}>
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Имя</th>
                <th>Телефон</th>
                <th>Машина</th>
                <th>Доступ</th>
              </tr>
            </thead>
            <tbody>
              {list
                .filter((p) => p.role !== 'pending')
                .map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.full_name || '(без имени)'}{' '}
                      <button className="link small" onClick={() => rename(p)}>
                        изменить
                      </button>
                    </td>
                    <td className="num">
                      {fmtPhone(p.phone)}{' '}
                      <button className="link small" onClick={() => void resetPassword(p)}>
                        новый пароль
                      </button>
                    </td>
                    <td>
                      {fleet.vehicles
                        .filter((v) => v.assigned_driver === p.id)
                        .map((v) => v.plate)
                        .join(', ') || <span className="muted">—</span>}
                    </td>
                    <td>
                      {p.id === me.id ? (
                        <span className="badge">{ROLE_LABEL[p.role]} (вы)</span>
                      ) : (
                        <select
                          value={p.role}
                          disabled={busy === p.id}
                          onChange={(e) => void update(p, { role: e.target.value as Role })}
                          style={{ width: 'auto' }}
                        >
                          {(['driver', 'admin', 'blocked'] as Role[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
