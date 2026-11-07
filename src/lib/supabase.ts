import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'spid-auth' }
});

/**
 * Водители входят по номеру телефона. Supabase требует e-mail, поэтому номер
 * превращается в служебный адрес на домене самого проекта Supabase
 * (Supabase принимает только существующие домены). Писем на него не отправляется:
 * подтверждение e-mail в Supabase должно быть выключено.
 */
const EMAIL_DOMAIN = (() => {
  try {
    return new URL(url || 'http://localhost').host;
  } catch {
    return 'localhost';
  }
})();

export function phoneToEmail(phone: string): string {
  return `${normalizePhone(phone)}@${EMAIL_DOMAIN}`;
}

/** +7 (701) 123-45-67 → 77011234567; 8 701 … → 7701… */
export function normalizePhone(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return d;
}

export function isValidPhone(phone: string): boolean {
  return /^7\d{10}$/.test(normalizePhone(phone));
}
