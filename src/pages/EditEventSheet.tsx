import { useState } from 'react';
import { CircleAlert, Save, TriangleAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtDateTime, fmtNum } from '../lib/format';
import { parseLiters, parseMoney, priceLooksWrong } from '../lib/numbers';
import { EVENT_LABEL, FUEL_LABEL, type FleetEvent, type Fuel, type Vehicle } from '../lib/types';
import { FUEL_ICON, Plate, Sheet, Switch } from '../components/ui';

/** Сколько времени после записи водитель может её исправить (должно совпадать с базой). */
export const EDIT_WINDOW_MS = 3 * 24 * 3_600_000;

export function canDriverEdit(e: FleetEvent, now = Date.now()): boolean {
  return !e.closed_by && now - Date.parse(e.occurred_at) <= EDIT_WINDOW_MS;
}

/** Водитель исправляет свою запись: пробег, а для заправки ещё литры, сумму, вид топлива и «до полного». */
export default function EditEventSheet({ event, vehicle, onClose, onSaved }: { event: FleetEvent; vehicle: Vehicle | undefined; onClose: () => void; onSaved: () => void }) {
  const refuel = event.type === 'refuel';
  const [odo, setOdo] = useState(String(event.odometer));
  const [liters, setLiters] = useState(event.liters !== null ? String(event.liters).replace('.', ',') : '');
  const [amount, setAmount] = useState(event.amount !== null ? String(event.amount).replace('.', ',') : '');
  const [fuel, setFuel] = useState<Fuel | null>(event.fuel);
  const [full, setFull] = useState(Boolean(event.full_tank));
  const [confirmPrice, setConfirmPrice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const l = parseLiters(liters);
  const a = parseMoney(amount);
  const price = l > 0 && a > 0 ? a / l : null;
  const odd = refuel && fuel !== null && priceLooksWrong(fuel, l, a);

  const save = async () => {
    setError(null);
    const o = Number(odo.replace(/\s/g, ''));
    if (!Number.isInteger(o) || o <= 0) return setError('Введите пробег цифрами');
    if (refuel) {
      if (!(l > 0 && l < 1000)) return setError('Введите, сколько литров залили');
      if (!(a > 0)) return setError('Введите сумму по чеку');
      if (odd && !confirmPrice) return setError('Цена за литр выглядит неверно. Проверьте или подтвердите, что всё верно');
    }
    setBusy(true);
    const { error } = await supabase.rpc('driver_fix_event', {
      p_event: event.id,
      p_odometer: o,
      p_liters: refuel ? l : null,
      p_amount: refuel ? a : null,
      p_full_tank: refuel ? full : null,
      p_fuel: refuel ? fuel : null
    });
    setBusy(false);
    if (error) return setError(error.message);
    onSaved();
  };

  return (
    <Sheet
      title="Исправить запись"
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-block" onClick={() => void save()} disabled={busy}>
          <Save size={18} /> {busy ? 'Сохраняю…' : 'Сохранить исправление'}
        </button>
      }
    >
      <div className="stack loose">
        <div className="row wrap" style={{ gap: 10 }}>
          {vehicle && <Plate plate={vehicle.plate} size="sm" />}
          <b>{EVENT_LABEL[event.type]}</b>
          <span className="small muted">{fmtDateTime(event.occurred_at)}</span>
        </div>
        <div className="note">Руководитель увидит, что запись исправлена, и что в ней было раньше.</div>

        <label className="field">
          <span className="field-label">Пробег</span>
          <span className="input-wrap">
            <input value={odo} onChange={(e) => setOdo(e.target.value.replace(/[^\d\s]/g, ''))} inputMode="numeric" />
            <span className="input-suffix">км</span>
          </span>
        </label>

        {refuel && (
          <>
            {vehicle && vehicle.fuels.length > 1 && (
              <div className="fuel-choice" role="radiogroup" aria-label="Вид топлива">
                {vehicle.fuels.map((f) => {
                  const Icon = FUEL_ICON[f];
                  return (
                    <button type="button" key={f} role="radio" aria-checked={fuel === f} className={`fuel-${f}${fuel === f ? ' active' : ''}`} onClick={() => setFuel(f)}>
                      <span className="fuel-ico">
                        <Icon size={20} />
                      </span>
                      {FUEL_LABEL[f]}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="grid-2">
              <label className="field">
                <span className="field-label">Залито</span>
                <span className="input-wrap">
                  <input value={liters} onChange={(e) => { setLiters(e.target.value); setConfirmPrice(false); }} inputMode="decimal" />
                  <span className="input-suffix">л</span>
                </span>
              </label>
              <label className="field">
                <span className="field-label">Сумма по чеку</span>
                <span className="input-wrap">
                  <input value={amount} onChange={(e) => { setAmount(e.target.value); setConfirmPrice(false); }} inputMode="decimal" />
                  <span className="input-suffix">₸</span>
                </span>
              </label>
            </div>
            {price !== null && (
              <div className={`price-line${odd ? ' t-warn' : ''}`}>
                {odd ? <TriangleAlert size={16} /> : null}
                <span>
                  К оплате <b>{fmtNum(a, 2)} ₸</b> за <b>{fmtNum(l, 2)} л</b> · цена <b>{fmtNum(price, 1)} ₸</b> за литр
                </span>
              </div>
            )}
            {odd && (
              <div className="note warn stack" style={{ gap: 4 }}>
                <span>
                  <b>Цена литра {fmtNum(price ?? 0, 1)} ₸ выглядит неверно.</b> Сумма — это вся сумма по чеку, а не цена литра.
                </span>
                <Switch checked={confirmPrice} onChange={setConfirmPrice} label="Я проверил — сумма и литры верные" />
              </div>
            )}
            <Switch checked={full} onChange={setFull} label="Заправил до полного бака" />
          </>
        )}

        {error && (
          <div className="note bad">
            <CircleAlert size={18} /> {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}
