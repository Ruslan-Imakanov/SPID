// Разбор чисел, введённых водителем. Принимает «8214,08», «8 214,08», «8.214,08», «8,214.08», «8214 ₸».

/** Сумма в тенге: точка или запятая перед ровно тремя цифрами — разделитель тысяч («8.214» = 8214). */
export function parseMoney(input: string): number {
  let s = input.replace(/[\s  ]/g, '').replace(/[₸тТtT]|тг|KZT/g, '');
  if (!/^[\d.,]+$/.test(s) || s === '') return NaN;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Два разных знака: последний — десятичный, первый — тысячи
    const dec = Math.max(lastDot, lastComma);
    s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    if (parts.length > 2 || (tail.length === 3 && parts[0] !== '0' && parts[0] !== '' && parts[0].length <= 3)) s = parts.join(''); // тысячи
    else s = parts.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Литры: запятая или точка — десятичный знак («73,34», «73.34»). */
export function parseLiters(input: string): number {
  const s = input.replace(/[\s  ]/g, '').replace(/л$/i, '').replace(',', '.');
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return NaN;
  return Number(s);
}

/** Разумный диапазон цены за литр, ₸ (для предупреждения о возможной ошибке ввода). */
export const PRICE_RANGE: Record<'petrol' | 'lpg' | 'diesel', [number, number]> = {
  petrol: [100, 700],
  lpg: [50, 300],
  diesel: [100, 700]
};

export function priceLooksWrong(fuel: 'petrol' | 'lpg' | 'diesel', liters: number, amount: number): boolean {
  if (!(liters > 0) || !(amount > 0)) return false;
  const p = amount / liters;
  const [lo, hi] = PRICE_RANGE[fuel];
  return p < lo || p > hi;
}
