import { useState, type FormEvent } from 'react';
import { ArrowLeft, Camera, Check, CircleAlert, MessageSquarePlus, ReceiptText, RefreshCw, TriangleAlert } from 'lucide-react';
import { BIG_JUMP_KM } from '../lib/calc';
import { fmtDateTime, fmtNum, uuid } from '../lib/format';
import { compressImage } from '../lib/image';
import { enqueue } from '../lib/offline';
import { EVENT_LABEL, FUEL_LABEL, type EventType, type FleetEvent, type Fuel, type Profile, type Vehicle } from '../lib/types';
import { FUEL_ICON, FuelTag, Odometer, Plate, Switch, useObjectUrl } from '../components/ui';

interface Props {
  type: EventType;
  vehicle: Vehicle;
  profile: Profile;
  /** Последняя известная запись по машине. */
  last: FleetEvent | null;
  /** Открытая смена водителя (для конца смены). */
  shift: FleetEvent | null;
  onDone: () => void;
  onCancel: () => void;
}

function PhotoTile({
  title,
  hint,
  file,
  onChange,
  required,
  small,
  icon: Icon = Camera
}: {
  title: string;
  hint?: string;
  file: Blob | null;
  onChange: (f: Blob | null) => void;
  required?: boolean;
  small?: boolean;
  icon?: typeof Camera;
}) {
  const url = useObjectUrl(file);
  return (
    <label className={`photo-tile${small ? ' small' : ''}${url ? ' has-photo' : ''}`}>
      <input type="file" accept="image/*" capture="environment" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      {url ? (
        <>
          <img src={url} alt={title} />
          <span className="photo-bar">
            <span className="row" style={{ gap: 6 }}>
              <Check size={18} /> Фото готово
            </span>
            <span className="row" style={{ gap: 6 }}>
              <RefreshCw size={16} /> Переснять
            </span>
          </span>
        </>
      ) : (
        <>
          <span className="cam">
            <Icon size={small ? 20 : 26} />
          </span>
          <span className="stack tight" style={{ gap: 2 }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>
              {title}
              {required && <span className="req"> *</span>}
            </span>
            {hint && <span className="small faint">{hint}</span>}
          </span>
        </>
      )}
    </label>
  );
}

function parseNum(s: string): number {
  return Number(s.replace(/\s/g, '').replace(',', '.'));
}

export default function EventForm({ type, vehicle, profile, last, shift, onDone, onCancel }: Props) {
  const [odo, setOdo] = useState('');
  const [odoPhoto, setOdoPhoto] = useState<Blob | null>(null);
  const [fuel, setFuel] = useState<Fuel>(vehicle.fuels[0]);
  const [liters, setLiters] = useState('');
  const [amount, setAmount] = useState('');
  const [fullTank, setFullTank] = useState(true);
  const [receipt, setReceipt] = useState<Blob | null>(null);
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [confirmOdd, setConfirmOdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const odoNum = odo ? Number(odo) : NaN;
  const odoValid = Number.isInteger(odoNum) && odoNum > 0;
  const lessThanLast = odoValid && last !== null && odoNum < last.odometer;
  const bigJump = odoValid && last !== null && odoNum - last.odometer > BIG_JUMP_KM;
  const needsConfirm = lessThanLast || bigJump;
  const diff = odoValid && last ? odoNum - last.odometer : null;
  const minDigits = Math.max(6, String(last?.odometer ?? '').length);

  const l = parseNum(liters);
  const a = parseNum(amount);
  const price = l > 0 && a > 0 ? a / l : null;
  const priceOdd = price !== null && (price < 60 || price > 700);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!odoValid) return setError('Введите пробег — цифры с одометра');
    if (needsConfirm && !confirmOdd) return setError('Проверьте пробег и подтвердите, что он верный');
    if (!odoPhoto) return setError('Сфотографируйте одометр');
    if (type === 'refuel') {
      if (!(l > 0 && l < 1000)) return setError('Введите, сколько литров залили');
      if (!(a > 0)) return setError('Введите сумму в тенге из чека');
    }
    setBusy(true);
    try {
      const [odoBlob, receiptBlob] = await Promise.all([compressImage(odoPhoto), receipt ? compressImage(receipt) : Promise.resolve(null)]);
      const notes = [comment.trim()];
      if (needsConfirm) notes.push(lessThanLast ? '[водитель подтвердил: пробег меньше прошлого]' : '[водитель подтвердил: большой скачок пробега]');
      const ev: FleetEvent = {
        id: uuid(),
        vehicle_id: vehicle.id,
        driver_id: profile.id,
        type,
        odometer: odoNum,
        occurred_at: new Date().toISOString(),
        fuel: type === 'refuel' ? fuel : null,
        liters: type === 'refuel' ? l : null,
        amount: type === 'refuel' ? a : null,
        full_tank: type === 'refuel' ? fullTank : null,
        odometer_photo: null,
        receipt_photo: null,
        comment: notes.filter(Boolean).join(' ')
      };
      await enqueue(ev, odoBlob, receiptBlob);
      onDone();
    } catch (err) {
      setError(`Не удалось сохранить: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const odoDone = odoValid && (!needsConfirm || confirmOdd);

  return (
    <div>
      <header className="form-top">
        <button className="icon-btn" onClick={onCancel} aria-label="Назад" type="button">
          <ArrowLeft size={22} />
        </button>
        <h1 className="h2">{EVENT_LABEL[type]}</h1>
        <Plate plate={vehicle.plate} size="sm" />
      </header>

      <form className="page narrow stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
        {/* Шаг 1: пробег */}
        <section className="card pad-lg">
          <div className="step">
            <span className={`step-num${odoDone ? ' done' : ''}`}>{odoDone ? <Check size={15} /> : 1}</span>
            <h2 className="h3 grow">Пробег по одометру</h2>
          </div>
          <div className="odo-input">
            <Odometer value={odo} minDigits={minDigits} />
            <input
              value={odo}
              onChange={(e) => {
                setOdo(e.target.value.replace(/\D/g, '').slice(0, 7));
                setConfirmOdd(false);
              }}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              autoFocus
              aria-label="Пробег по одометру, км"
            />
          </div>
          <div className="delta">
            {!odo && <span className="small faint">Нажмите на цифры и наберите пробег</span>}
            {last && (
              <span className="pill">
                Прошлая запись: {fmtNum(last.odometer)} км · {fmtDateTime(last.occurred_at)}
              </span>
            )}
            {diff !== null && !lessThanLast && (
              <span className={`pill ${bigJump ? 'warn' : 'good'}`}>+{fmtNum(diff)} км</span>
            )}
            {type === 'shift_end' && shift && odoValid && odoNum >= shift.odometer && (
              <span className="pill amber">за смену {fmtNum(odoNum - shift.odometer)} км</span>
            )}
          </div>
          {needsConfirm && (
            <div className="note warn stack" style={{ marginTop: 14, gap: 4 }}>
              <div className="row top" style={{ gap: 10 }}>
                <TriangleAlert size={18} />
                <span>
                  {lessThanLast
                    ? `Пробег меньше прошлой записи (${fmtNum(last!.odometer)} км). Проверьте цифры.`
                    : `Пробег вырос на ${fmtNum(diff ?? 0)} км с прошлой записи. Проверьте цифры.`}
                </span>
              </div>
              <Switch checked={confirmOdd} onChange={setConfirmOdd} label="Я проверил — пробег верный" />
            </div>
          )}
        </section>

        {/* Шаг 2: фото одометра */}
        <section className="card pad-lg">
          <div className="step">
            <span className={`step-num${odoPhoto ? ' done' : ''}`}>{odoPhoto ? <Check size={15} /> : 2}</span>
            <h2 className="h3 grow">Фото одометра</h2>
          </div>
          <PhotoTile
            title="Сфотографировать одометр"
            hint="Чтобы цифры было хорошо видно"
            file={odoPhoto}
            onChange={setOdoPhoto}
            required
          />
        </section>

        {/* Шаг 3: заправка */}
        {type === 'refuel' && (
          <section className="card pad-lg stack" style={{ gap: 14 }}>
            <div className="step" style={{ marginBottom: 0 }}>
              <span className={`step-num${l > 0 && a > 0 ? ' done' : ''}`}>{l > 0 && a > 0 ? <Check size={15} /> : 3}</span>
              <h2 className="h3 grow">Заправка</h2>
              {vehicle.fuels.length === 1 && <FuelTag fuel={fuel} />}
            </div>

            {vehicle.fuels.length > 1 && (
              <div className="fuel-choice" role="radiogroup" aria-label="Вид топлива">
                {vehicle.fuels.map((f) => {
                  const Icon = FUEL_ICON[f];
                  return (
                    <button
                      type="button"
                      key={f}
                      role="radio"
                      aria-checked={fuel === f}
                      className={`fuel-${f}${fuel === f ? ' active' : ''}`}
                      onClick={() => setFuel(f)}
                    >
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
                  <input value={liters} onChange={(e) => setLiters(e.target.value)} inputMode="decimal" placeholder="0,0" />
                  <span className="input-suffix">л</span>
                </span>
              </label>
              <label className="field">
                <span className="field-label">Сумма по чеку</span>
                <span className="input-wrap">
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" />
                  <span className="input-suffix">₸</span>
                </span>
              </label>
            </div>
            {price !== null && (
              <div className={`price-line${priceOdd ? ' t-warn' : ''}`}>
                {priceOdd ? <TriangleAlert size={16} /> : <ReceiptText size={16} />}
                <span>
                  Цена: <b>{fmtNum(price, 1)} ₸</b> за литр{priceOdd ? ' — проверьте литры и сумму' : ''}
                </span>
              </div>
            )}

            <Switch
              checked={fullTank}
              onChange={setFullTank}
              label="Заправил до полного бака"
              hint={fullTank ? 'По полным бакам считается расход' : 'Неполная заправка учтётся при следующей полной'}
            />

            <PhotoTile title="Фото чека" hint="По желанию" file={receipt} onChange={setReceipt} small icon={ReceiptText} />
          </section>
        )}

        {showComment ? (
          <section className="card">
            <label className="field">
              <span className="field-label">Комментарий</span>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} autoFocus placeholder="Например: стоял в пробке, заправка на трассе" />
            </label>
          </section>
        ) : (
          <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowComment(true)}>
            <MessageSquarePlus size={18} /> Добавить комментарий
          </button>
        )}

        <div className="sticky-foot stack" style={{ gap: 10 }}>
          {error && (
            <div className="note bad" role="alert">
              <CircleAlert size={18} />
              {error}
            </div>
          )}
          <button className="btn btn-primary btn-xl btn-block" disabled={busy}>
            <Check size={22} />
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}
