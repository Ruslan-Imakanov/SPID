import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './lib/supabase';
import type { Profile } from './lib/types';
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
      <div className="center-screen">
        <div className="card">
          <h1>Нужна настройка</h1>
          <p className="muted">
            Не заданы адрес и ключ Supabase. Создайте файл <code>.env</code> по образцу <code>.env.example</code> и пересоберите
            приложение.
          </p>
        </div>
      </div>
    );
  }

  if (session === undefined) return <div className="center-screen muted">Загрузка…</div>;
  if (!session) return <Login />;

  if (!profile) {
    return (
      <div className="center-screen">
        <div className="card stack">
          {profileError ? <div className="note bad">{profileError}</div> : <div className="muted">Загрузка профиля…</div>}
          {profileError && (
            <div className="row">
              <button className="btn" onClick={() => void loadProfile()}>
                Повторить
              </button>
              <button className="btn" onClick={() => void logout()}>
                Выйти
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (profile.role === 'pending' || profile.role === 'blocked') {
    return (
      <div className="center-screen">
        <div className="card stack">
          <h1>{profile.role === 'pending' ? 'Ждём подтверждения' : 'Доступ отключён'}</h1>
          <p className="muted">
            {profile.role === 'pending'
              ? `${profile.full_name || 'Вы'} зарегистрированы. Руководитель должен подтвердить доступ, после этого нажмите «Обновить».`
              : 'Обратитесь к руководителю.'}
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => void loadProfile()}>
              Обновить
            </button>
            <button className="btn" onClick={() => void logout()}>
              Выйти
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (profile.role === 'admin') return <AdminApp profile={profile} onLogout={logout} />;
  return <DriverApp profile={profile} onLogout={logout} />;
}
