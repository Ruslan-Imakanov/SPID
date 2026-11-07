import { useState } from 'react';
import { Check, CircleAlert, KeyRound, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ROLE_LABEL, type Profile } from '../lib/types';
import { Avatar, Sheet } from './ui';

export function fmtPhone(d: string): string {
  const m = d.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : d;
}

/** Профиль: смена своего пароля и выход. */
export default function ProfileSheet({ profile, onClose, onLogout }: { profile: Profile; onClose: () => void; onLogout?: () => void }) {
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const change = async () => {
    setMsg(null);
    if (pwd.length < 6) return setMsg({ ok: false, text: 'Пароль должен быть не короче 6 символов' });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      setPwd('');
      setMsg({ ok: true, text: 'Пароль изменён' });
    }
  };

  return (
    <Sheet title={profile.full_name || 'Профиль'} onClose={onClose} icon={<Avatar name={profile.full_name || '?'} />}>
      <div className="stack loose">
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="pill amber">{ROLE_LABEL[profile.role]}</span>
          <span className="muted small">{fmtPhone(profile.phone)}</span>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <label className="field">
            <span className="field-label">Новый пароль</span>
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" placeholder="Не короче 6 символов" />
          </label>
          {msg && (
            <div className={`note ${msg.ok ? 'good' : 'bad'}`}>
              {msg.ok ? <Check size={18} /> : <CircleAlert size={18} />}
              {msg.text}
            </div>
          )}
          <button className="btn" onClick={() => void change()} disabled={busy || !pwd}>
            <KeyRound size={18} /> Сменить пароль
          </button>
        </div>
        {onLogout && (
          <button className="btn btn-danger btn-block" onClick={onLogout}>
            <LogOut size={18} /> Выйти из приложения
          </button>
        )}
      </div>
    </Sheet>
  );
}
