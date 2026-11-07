import { useState, type FormEvent } from 'react';
import { CircleAlert, CloudOff, Eye, EyeOff, Gauge, LogIn, TrendingDown, UserPlus } from 'lucide-react';
import { isValidPhone, normalizePhone, phoneToEmail, supabase } from '../lib/supabase';
import { Logo } from '../components/ui';
import GaugeArt from '../components/GaugeArt';

function translate(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Неверный телефон или пароль';
  if (/already registered|already exists/i.test(msg)) return 'Этот номер уже зарегистрирован — войдите';
  if (/password should be at least/i.test(msg)) return 'Пароль должен быть не короче 6 символов';
  if (/rate limit/i.test(msg)) return 'Слишком много попыток. Подождите минуту и попробуйте снова';
  if (/fetch|network/i.test(msg)) return 'Нет связи с сервером. Проверьте интернет';
  return msg;
}

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidPhone(phone)) return setError('Введите номер полностью, например +7 701 123 45 67');
    if (password.length < 6) return setError('Пароль должен быть не короче 6 символов');
    if (mode === 'register' && name.trim().length < 2) return setError('Введите фамилию и имя');
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
        else if (!data.session) setError('Регистрация создана, но вход не выполнен. Попросите руководителя проверить настройки.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-art" aria-hidden="true">
        <GaugeArt className="auth-gauge" size={520} value={0.62} />
      </div>
      <div className="auth-inner">
        <div className="auth-brand">
          <Logo size={56} large />
          <p className="lead">Пробег и топливо всего автопарка — под контролем.</p>
          <div className="auth-points">
            <div>
              <Gauge size={20} /> Пробег с фото одометра — за 10 секунд
            </div>
            <div>
              <TrendingDown size={20} /> Расход каждой машины и перерасход в тенге
            </div>
            <div>
              <CloudOff size={20} /> Работает даже без интернета
            </div>
          </div>
        </div>

        <form className="auth-card stack" onSubmit={submit} noValidate>
          <div className="seg" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
              Вход
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Регистрация
            </button>
          </div>

          {mode === 'register' && (
            <label className="field">
              <span className="field-label">Фамилия и имя</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Иванов Иван" />
            </label>
          )}
          <label className="field">
            <span className="field-label">Номер телефона</span>
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
            <span className="field-label">Пароль{mode === 'register' && ' — не короче 6 символов'}</span>
            <span className="input-wrap">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPwd ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={{ fontSize: 16, fontWeight: 500 }}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Скрыть пароль' : 'Показать пароль'}
                style={{ position: 'absolute', right: 3, top: 3, width: 42, height: 42, color: 'var(--text-3)' }}
              >
                {showPwd ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </span>
          </label>

          {error && (
            <div className="note bad" role="alert">
              <CircleAlert size={18} />
              {error}
            </div>
          )}

          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {mode === 'login' ? <LogIn size={20} /> : <UserPlus size={20} />}
            {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
          <p className="small faint" style={{ textAlign: 'center' }}>
            {mode === 'login' ? 'Нет доступа? Нажмите «Регистрация» или спросите руководителя.' : 'После регистрации руководитель подтвердит доступ.'}
          </p>
        </form>
      </div>
    </div>
  );
}
