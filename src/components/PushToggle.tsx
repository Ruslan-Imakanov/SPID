import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, CircleAlert, Send, Share } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';

/** Включение push-уведомлений на этом устройстве. compact — одна строка-приглашение. */
export default function PushToggle({ userId, compact }: { userId: string; compact?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('gsm-push-hide') === '1';
    } catch {
      return false;
    }
  });

  const refresh = useCallback(() => void pushState().then(setState), []);
  useEffect(refresh, [refresh]);

  const [testMsg, setTestMsg] = useState<string | null>(null);
  const sendTest = async () => {
    setBusy(true);
    setTestMsg(null);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-trip`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: '{}'
      });
      const j = (await res.json()) as { sent?: number; failed?: number };
      setTestMsg(j.sent ? 'Отправлено — сообщение должно прийти за несколько секунд.' : 'Не получилось отправить. Выключите и включите уведомления заново.');
    } catch {
      setTestMsg('Нет связи с сервером.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(state === 'on' ? await disablePush() : await enablePush(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось включить уведомления');
    } finally {
      setBusy(false);
    }
  };

  if (state === null) return null;
  if (compact && (state === 'on' || state === 'unsupported' || state === 'denied' || hidden)) return null;

  if (state === 'ios-install')
    return (
      <div className="note">
        <Share size={18} />
        <span>
          <b>Уведомления на iPhone.</b> Откройте приложение в Safari → «Поделиться» → «На экран „Домой“», запустите его с экрана и включите уведомления.
        </span>
      </div>
    );
  if (state === 'unsupported')
    return (
      <div className="note">
        <BellOff size={18} /> Этот браузер не поддерживает уведомления.
      </div>
    );
  if (state === 'denied')
    return (
      <div className="note warn">
        <BellOff size={18} /> Уведомления запрещены в настройках браузера. Разрешите их для этого сайта и вернитесь сюда.
      </div>
    );

  return (
    <div className={compact ? 'note amber' : 'stack tight'} style={compact ? { alignItems: 'center' } : { gap: 8 }}>
      {compact && <Bell size={18} />}
      {!compact && <div className="field-label">Уведомления о рейсах</div>}
      <span className={compact ? 'grow' : 'small muted'}>
        {state === 'on' ? 'Включены: вы получите сообщение, когда водитель выедет и вернётся.' : 'Включите, чтобы получать сообщения о выезде и возвращении.'}
      </span>
      <div className="row" style={{ gap: 6 }}>
        <button className={`btn btn-sm${state === 'on' ? '' : ' btn-primary'}`} onClick={() => void toggle()} disabled={busy}>
          {state === 'on' ? <BellOff size={16} /> : <Bell size={16} />} {state === 'on' ? 'Выключить' : 'Включить'}
        </button>
        {state === 'on' && (
          <button className="btn btn-sm" onClick={() => void sendTest()} disabled={busy}>
            <Send size={16} /> Проверить
          </button>
        )}
        {compact && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setHidden(true);
              try {
                localStorage.setItem('gsm-push-hide', '1');
              } catch {
                /* ignore */
              }
            }}
          >
            Позже
          </button>
        )}
      </div>
      {testMsg && <div className="small muted" style={{ flexBasis: '100%' }}>{testMsg}</div>}
      {error && (
        <div className="note bad" style={{ flexBasis: '100%' }}>
          <CircleAlert size={18} /> {error}
        </div>
      )}
    </div>
  );
}
