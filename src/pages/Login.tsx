import { useState, type FormEvent } from 'react';
import { isValidPhone, normalizePhone, phoneToEmail, supabase } from '../lib/supabase';

function translate(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Неверный телефон или пароль';
  if (/already registered|already exists/i.test(msg)) return 'Этот номер уже зарегистрирован — войдите';
  if (/password should be at least/i.test(msg)) return 'Пароль должен быть не короче 6 символов';
  if (/fetch|network/i.test(msg)) return 'Нет связи с сервером. Проверьте интернет';
  return msg;
}

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!isValidPhone(phone)) {
      setError('Введите номер телефона полностью, например +7 701 123 45 67');
      return;
    }
    if (password.length < 6) {
      setError('Пароль должен быть не короче 6 символов');
      return;
    }
    if (mode === 'register' && name.trim().length < 2) {
      setError('Введите фамилию и имя');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: phoneToEmail(phone), password });
        if (error) setError(translate(error.message));
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: phoneToEmail(phone),
          password,
          options: { data: { full_name: name.trim(), phone: normalizePhone(phone) } }
        });
        if (error) setError(translate(error.message));
        else if (!data.session)
          setInfo('Регистрация создана, но вход не выполнен: в Supabase включено подтверждение e-mail. Его нужно выключить (см. инструкцию).');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <form className="card stack" onSubmit={submit}>
        <div>
          <h1>СПИД</h1>
          <div className="muted">Учёт пробега и топлива</div>
        </div>
        <div className="seg">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Вход
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Регистрация
          </button>
        </div>
        {mode === 'register' && (
          <label className="field">
            <span>Фамилия и имя</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Иванов Иван" />
          </label>
        )}
        <label className="field">
          <span>Телефон</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+7 701 123 45 67"
          />
        </label>
        <label className="field">
          <span>Пароль {mode === 'register' && <span className="small">(не короче 6 символов)</span>}</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {error && <div className="note bad">{error}</div>}
        {info && <div className="note warn">{info}</div>}
        <button className="btn primary big" disabled={busy}>
          {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
        </button>
        {mode === 'register' && (
          <div className="small muted">После регистрации руководитель подтвердит доступ.</div>
        )}
      </form>
    </div>
  );
}
