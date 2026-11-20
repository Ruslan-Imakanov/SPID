// Push-уведомления о выезде и возвращении.
//  GET  → публичный VAPID-ключ (ключи создаются при первом обращении и хранятся в push_config).
//  POST → вызывается триггером БД с секретом x-trigger-secret: шлёт push водителю и руководителям.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function config(): Promise<Record<string, string>> {
  const { data } = await db.from('push_config').select('key,value');
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value as string]));
}

async function vapid(): Promise<{ publicKey: string; privateKey: string }> {
  let c = await config();
  if (!c.vapid) {
    const k = webpush.generateVAPIDKeys();
    await db.from('push_config').upsert({ key: 'vapid', value: JSON.stringify(k) }, { onConflict: 'key', ignoreDuplicates: true });
    c = await config();
  }
  return JSON.parse(c.vapid);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const keys = await vapid();
  if (req.method === 'GET') return json({ publicKey: keys.publicKey });

  // Тест из приложения: пользователь с действующим входом получает уведомление на свои устройства
  const bearer = req.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (bearer && !req.headers.get('x-trigger-secret')) {
    const { data: u } = await db.auth.getUser(bearer);
    if (!u?.user) return json({ error: 'unauthorized' }, 401);
    webpush.setVapidDetails('https://gsm-kontrol.imakanovr.workers.dev', keys.publicKey, keys.privateKey);
    const { data: mine } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', u.user.id);
    let ok = 0;
    let bad = 0;
    const gone: string[] = [];
    await Promise.all(
      (mine ?? []).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: 'ГСМ Контроль', body: 'Уведомления работают', tag: 'test', url: './' }), { TTL: 600 });
          ok++;
        } catch (e) {
          bad++;
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) gone.push(s.id as string);
        }
      })
    );
    if (gone.length) await db.from('push_subscriptions').delete().in('id', gone);
    return json({ sent: ok, failed: bad, removed: gone.length });
  }

  const c = await config();
  if (!c.trigger_secret || req.headers.get('x-trigger-secret') !== c.trigger_secret) return json({ error: 'forbidden' }, 403);

  const p = await req.json();
  webpush.setVapidDetails('https://gsm-kontrol.imakanovr.workers.dev', keys.publicKey, keys.privateKey);

  const started = p.type === 'shift_start';
  const where = [p.plate, p.region].filter(Boolean).join(' → ');
  const km = typeof p.km === 'number' && p.km >= 0 ? ` · ${p.km} км` : '';
  const forAdmins = {
    title: started ? `${p.driver || 'Водитель'} выехал` : `${p.driver || 'Водитель'} вернулся`,
    body: started ? where : `${[p.plate, p.region].filter(Boolean).join(' · ')}${km}`,
    tag: `trip-${p.event_id}`,
    url: './'
  };
  const forDriver = {
    title: started ? 'Смена начата' : 'Смена закончена',
    body: started ? where : `${[p.plate, p.region].filter(Boolean).join(' · ')}${km}`,
    tag: `trip-${p.event_id}`,
    url: './'
  };

  const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin');
  const adminIds = new Set((admins ?? []).map((a) => a.id as string));
  const { data: subs } = await db.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').in('user_id', [...adminIds, p.driver_id]);

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      // Сам водитель получает «своё» сообщение, остальные руководители — сообщение о водителе
      const payload = s.user_id === p.driver_id ? forDriver : forAdmins;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id as string);
      }
    })
  );
  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);
  return json({ sent, failed, removed: dead.length });
});
