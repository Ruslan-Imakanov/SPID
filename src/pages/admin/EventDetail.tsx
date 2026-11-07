import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fmtDateTime } from '../../lib/format';
import { EVENT_LABEL, FUEL_LABEL, type FleetEvent } from '../../lib/types';
import type { Fleet } from './useFleet';

function SignedPhoto({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.storage
      .from('photos')
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) setErr(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  if (err) return <div className="note bad small">Не удалось загрузить фото</div>;
  if (!url) return <div className="muted small">Загрузка фото…</div>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img className="photo-preview" src={url} alt={alt} />
    </a>
  );
}

export default function EventDetail({ event, fleet, onClose }: { event: FleetEvent; fleet: Fleet; onClose: () => void }) {
  const [odo, setOdo] = useState(String(event.odometer));
  const [liters, setLiters] = useState(event.liters !== null ? String(event.liters) : '');
  const [amount, setAmount] = useState(event.amount !== null ? String(event.amount) : '');
  const [fullTank, setFullTank] = useState(Boolean(event.full_tank));
  const [comment, setComment] = useState(event.comment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const o = Number(odo.replace(/\s/g, ''));
    if (!Number.isInteger(o) || o <= 0) return setError('Неверный пробег');
    const patch: Partial<FleetEvent> = { odometer: o, comment };
    if (event.type === 'refuel') {
      const l = Number(liters.replace(',', '.'));
      const a = Number(amount.replace(',', '.'));
      if (!(l > 0)) return setError('Неверные литры');
      if (!(a >= 0)) return setError('Неверная сумма');
      Object.assign(patch, { liters: l, amount: a, full_tank: fullTank });
    }
    setBusy(true);
    const { error } = await supabase.from('events').update(patch).eq('id', event.id);
    setBusy(false);
    if (error) return setError(error.message);
    await fleet.reload();
    onClose();
  };

  const remove = async () => {
    if (!confirm('Удалить запись? Это действие нельзя отменить.')) return;
    setBusy(true);
    const paths = [event.odometer_photo, event.receipt_photo].filter((p): p is string => Boolean(p));
    const { error } = await supabase.from('events').delete().eq('id', event.id);
    if (!error && paths.length) await supabase.storage.from('photos').remove(paths);
    setBusy(false);
    if (error) return setError(error.message);
    await fleet.reload();
    onClose();
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>
            {EVENT_LABEL[event.type]}
          </h2>
          <button className="btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="muted small">
          <b>{fleet.plateOf(event.vehicle_id)}</b> · {fleet.nameOf(event.driver_id)} · {fmtDateTime(event.occurred_at)}
          {event.fuel && ` · ${FUEL_LABEL[event.fuel]}`}
        </div>

        {event.odometer_photo ? <SignedPhoto path={event.odometer_photo} alt="Одометр" /> : <div className="note warn small">Нет фото одометра</div>}

        <label className="field">
          <span>Пробег, км</span>
          <input value={odo} onChange={(e) => setOdo(e.target.value)} inputMode="numeric" />
        </label>
        {event.type === 'refuel' && (
          <>
            <div className="row">
              <label className="field grow">
                <span>Литров</span>
                <input value={liters} onChange={(e) => setLiters(e.target.value)} inputMode="decimal" />
              </label>
              <label className="field grow">
                <span>Сумма, ₸</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              </label>
            </div>
            <label className="check">
              <input type="checkbox" checked={fullTank} onChange={(e) => setFullTank(e.target.checked)} />
              До полного бака
            </label>
            {event.receipt_photo && <SignedPhoto path={event.receipt_photo} alt="Чек" />}
          </>
        )}
        <label className="field">
          <span>Комментарий</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
        </label>
        {error && <div className="note bad">{error}</div>}
        <div className="row">
          <button className="btn primary grow" onClick={() => void save()} disabled={busy}>
            Сохранить исправления
          </button>
          <button className="btn danger" onClick={() => void remove()} disabled={busy}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
