import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Ban, Hourglass, LogOut, RefreshCw, Settings } from 'lucide-react';
import { configured, supabase } from './lib/supabase';
import type { Profile } from './lib/types';
import { Logo } from './components/ui';
import Login from './pages/Login';
import DriverApp from './pages/DriverApp';
import AdminApp from './pages/admin/AdminApp';

const PROFILE_KEY = 'spid-profile';

function cachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function StatusScreen({
  icon: Icon,
  title,
  text,
  children
}: {
  icon: typeof Hourglass;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="center-screen" style={{ background: 'var(--ink)' }}>
      <div className="stack loose" style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ color: 'var(--on-ink)', display: 'flex', justifyContent: 'center' }}>
          <Logo size={44} />
        </div>
        <div className="card pad-lg stack status-screen">
          <span className="status-ico">
            <Icon size={30} />
          </span>
          <h1 className="h1" style={{ fontSize: 21 }}>
            {title}
          </h1>
          <p className="muted">{text}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async () => {
    if (!session) return;
    const uid = session.user.id;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
    if (data) {
      setProfile(data as Profile);
      setProfileError(null);
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
      } catch {
        /* хранилище недоступно — работаем без кэша */
      }
    } else {
      // Нет интернета — берём сохранённый профиль, если он того же пользователя.
      const cached = cachedProfile();
      if (cached && cached.id === uid) setProfile(cached);
      else setProfileError(error?.message ?? 'Не удалось загрузить профиль');
    }
  }, [session]);

  useEffect(() => {
    if (session) void loadProfile();
    else setProfile(null);
  }, [session, loadProfile]);

  const logout = async () => {
    try {
      localStorage.removeItem(PROFILE_KEY);
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
  };

  if (!configured) {
    return (
      <StatusScreen
        icon={Settings}
        title="Нужна настройка"
        text="Не заданы адрес и ключ Supabase. Создайте файл .env по образцу .env.example и пересоберите приложение."
      />
    );
  }

  if (session === undefined) {
    return (
      <div className="center-screen" style={{ background: 'var(--ink)', color: 'var(--on-ink)' }}>
        <Logo size={48} />
      </div>
    );
  }
  if (!session) return <Login />;

  if (!profile) {
    return (
      <StatusScreen icon={RefreshCw} title={profileError ? 'Не удалось загрузить профиль' : 'Загрузка…'} text={profileError ?? 'Секунду…'}>
        {profileError && (
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => void loadProfile()}>
              <RefreshCw size={18} /> Повторить
            </button>
            <button className="btn" onClick={() => void logout()}>
              <LogOut size={18} /> Выйти
            </button>
          </div>
        )}
      </StatusScreen>
    );
  }

  if (profile.role === 'pending' || profile.role === 'blocked') {
    const pending = profile.role === 'pending';
    return (
      <StatusScreen
        icon={pending ? Hourglass : Ban}
        title={pending ? 'Ждём подтверждения' : 'Доступ отключён'}
        text={
          pending
            ? `${profile.full_name || 'Вы'}, регистрация прошла. Руководитель должен подтвердить доступ — после этого нажмите «Обновить».`
            : 'Ваш доступ отключён. Обратитесь к руководителю.'
        }
      >
        <div className="row" style={{ justifyContent: 'center' }}>
          {pending && (
            <button className="btn btn-primary" onClick={() => void loadProfile()}>
              <RefreshCw size={18} /> Обновить
            </button>
          )}
          <button className="btn" onClick={() => void logout()}>
            <LogOut size={18} /> Выйти
          </button>
        </div>
      </StatusScreen>
    );
  }

  if (profile.role === 'admin') return <AdminApp profile={profile} onLogout={logout} />;
  return <DriverApp profile={profile} onLogout={logout} />;
}
