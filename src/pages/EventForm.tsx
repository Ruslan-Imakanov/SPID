import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BIG_JUMP_KM } from '../lib/calc';
import { fmtDateTime, fmtNum, uuid } from '../lib/format';
import { compressImage } from '../lib/image';
import { enqueue } from '../lib/offline';
import { EVENT_LABEL, FUEL_LABEL, type EventType, type FleetEvent, type Fuel, type Profile, type Vehicle } from '../lib/types';

interface Props {
  type: EventType;
  vehicle: Vehicle;
  profile: Profile;
  /** Последняя известная запись по машине. */
  last: FleetEvent | null;
  onDone: () => void;
  onCancel: () => void;
}

function PhotoInput({ label, file, onChange, required }: { label: string; file: Blob | null; onChange: (f: Blob | null) => void; required?: boolean }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return (
    <div className="stack">
      {url && <img className="photo-preview" src={url} alt={label} />}
      <label className="photo-pick">
        <input type="file" accept="image/*" capture="environment" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
        📷 {file ? 'Переснять' : label}
        {required && !file && <span className="bad"> *</span>}
      </label>
    </div>
  );
}

function parseNum(s: string): number {
  return Number(s.replace(/\s/g, '').replace(',', '.'));
}

export default function EventForm({ type, vehicle, profile, last, onDone, onCancel }: Props) {
  const [odo, setOdo] = useState('');
  const [odoPhoto, setOdoPhoto] = useState<Blob | null>(null);
  const [fuel, setFuel] = useState<Fuel>(vehicle.fuels[0]);
  const [liters, setLiters] = useState('');
  const [amount, setAmount] = useState('');
  const [fullTank, setFullTank] = useState(true);
  const [receipt, setReceipt] = useState<Blob | null>(null);
  const [comment, setComment] = useState('');
  const [confirmOdd, setConfirmOdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const odoNum = parseNum(odo);
  const odoValid = odo.trim() !== '' && Number.isInteger(odoNum) && odoNum > 0;
  const lessThanLast = odoValid && last !== null && odoNum < last.odometer;
  const bigJump = odoValid && last !== null && odoNum - last.odometer > BIG_JUMP_KM;
  const needsConfirm = lessThanLast || bigJump;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!odoValid) return setError('Введите пробег целым числом, как на одометре');
    if (needsConfirm && !confirmOdd) return setError('Проверьте пробег и поставьте галочку подтверждения');
    if (!odoPhoto) return setError('Сфотографируйте одометр');
    let l: number | null = null;
    let a: number | null = null;
    if (type === 'refuel') {
      l = parseNum(liters);
      a = parseNum(amount);
      if (!(l > 0 && l < 1000)) return setError('Введите количество литров');
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

  return (
    <form className="page narrow" onSubmit={submit}>
      <div className="card stack">
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>
            {EVENT_LABEL[type]}
          </h2>
          <span className="plate">{vehicle.plate}</span>
        </div>

        <label className="field">
          <span>Пробег по одометру, км</span>
          <input
            className="huge"
            value={odo}
            onChange={(e) => {
              setOdo(e.target.value.replace(/[^\d\s]/g, ''));
              setConfirmOdd(false);
            }}
            inputMode="numeric"
            pattern="[0-9 ]*"
            placeholder={last ? fmtNum(last.odometer) : '000000'}
            autoFocus
          />
        </label>
        {last && (
          <div className="small muted">
            Последняя запись: {fmtNum(last.odometer)} км, {fmtDateTime(last.occurred_at)}
            {odoValid && !lessThanLast && <> · с тех пор +{fmtNum(odoNum - last.odometer)} км</>}
          </div>
        )}
        {needsConfirm && (
          <div className="note warn stack">
            <div>
              {lessThanLast
                ? `Пробег меньше последней записи (${fmtNum(last!.odometer)} км). Проверьте цифры.`
                : `Пробег больше прошлой записи на ${fmtNum(odoNum - last!.odometer)} км. Проверьте цифры.`}
            </div>
            <label className="check">
              <input type="checkbox" checked={confirmOdd} onChange={(e) => setConfirmOdd(e.target.checked)} />
              Я проверил, пробег верный
            </label>
          </div>
        )}

        <PhotoInput label="Сфотографировать одометр" file={odoPhoto} onChange={setOdoPhoto} required />
      </div>

      {type === 'refuel' && (
        <div className="card stack">
          {vehicle.fuels.length > 1 && (
            <div className="seg">
              {vehicle.fuels.map((f) => (
                <button type="button" key={f} className={fuel === f ? 'active' : ''} onClick={() => setFuel(f)}>
                  {FUEL_LABEL[f]}
                </button>
              ))}
            </div>
          )}
          {vehicle.fuels.length === 1 && <div className="muted">Топливо: {FUEL_LABEL[fuel]}</div>}
          <div className="row">
            <label className="field grow">
              <span>Литров</span>
              <input value={liters} onChange={(e) => setLiters(e.target.value)} inputMode="decimal" placeholder="0,0" />
            </label>
            <label className="field grow">
              <span>Сумма, ₸</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={fullTank} onChange={(e) => setFullTank(e.target.checked)} />
            Заправил до полного бака
          </label>
          {!fullTank && <div className="note info small">Неполная заправка учтётся, расход посчитается при следующей заправке до полного.</div>}
          <PhotoInput label="Фото чека (по желанию)" file={receipt} onChange={setReceipt} />
        </div>
      )}

      <div className="card">
        <label className="field">
          <span>Комментарий (по желанию)</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
        </label>
      </div>

      {error && <div className="note bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="stack">
        <button className="btn primary big" disabled={busy}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button type="button" className="btn" style={{ width: '100%' }} onClick={onCancel} disabled={busy}>
          Отмена
        </button>
      </div>
    </form>
  );
}
