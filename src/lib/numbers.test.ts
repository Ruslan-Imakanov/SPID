import { describe, expect, it } from 'vitest';
import { parseLiters, parseMoney, priceLooksWrong } from './numbers';

describe('сумма', () => {
  it('обычные записи', () => {
    for (const [s, n] of [['8214,08', 8214.08], ['8 214,08', 8214.08], ['8214.08', 8214.08], ['8 214,08', 8214.08], ['8 214,08', 8214.08], ['821408', 821408], ['8214 ₸', 8214], ['8214,5', 8214.5], ['0,5', 0.5]] as const) {
      expect(parseMoney(s), s).toBeCloseTo(n);
    }
  });
  it('точка или запятая как разделитель тысяч не съедает цифры', () => {
    expect(parseMoney('8.214')).toBe(8214);
    expect(parseMoney('8,214')).toBe(8214);
    expect(parseMoney('12.500')).toBe(12500);
    expect(parseMoney('1.234.567')).toBe(1234567);
  });
  it('оба знака сразу', () => {
    expect(parseMoney('8.214,08')).toBeCloseTo(8214.08);
    expect(parseMoney('8,214.08')).toBeCloseTo(8214.08);
  });
  it('мусор не принимается', () => {
    expect(parseMoney('')).toBeNaN();
    expect(parseMoney('abc')).toBeNaN();
    expect(parseMoney('8-214')).toBeNaN();
  });
});

describe('литры и подозрительная цена', () => {
  it('литры', () => {
    expect(parseLiters('73,34')).toBeCloseTo(73.34);
    expect(parseLiters('73.34 л')).toBeCloseTo(73.34);
    expect(parseLiters('73 340')).toBe(73340);
    expect(parseLiters('')).toBeNaN();
  });
  it('цена за литр вне нормы — подозрение на ошибку', () => {
    expect(priceLooksWrong('lpg', 73.34, 821.14)).toBe(true); // 11 ₸/л
    expect(priceLooksWrong('lpg', 73.34, 8214)).toBe(false); // 112 ₸/л
    expect(priceLooksWrong('petrol', 40, 261)).toBe(true); // 6,5 ₸/л — вписана цена литра
    expect(priceLooksWrong('petrol', 40, 10440)).toBe(false);
  });
});
