import { useEffect, useState } from 'react';
import { CircleAlert, ImageOff, Save, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fmtDateTime } from '../../lib/format';
import { EVENT_LABEL, type FleetEvent } from '../../lib/types';
import { FuelTag, Plate, Sheet, Switch } from '../../components/ui';
import { EventIcon } from '../DriverApp';
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
  if (err)
    return (
      <div className="note bad">
        <ImageOff size={18} /> Не удалось загрузить фото
      </div>
    );
  if (!url) return <div className="photo-tile" style={{ minHeight: 200 }}>Загрузка фото…</div>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="photo-tile has-photo" style={{ minHeight: 240 }}>
      <img src={url} alt={alt} style={{ objectFit: 'contain' }} />
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
    <Sheet
      title={EVENT_LABEL[event.type]}
      icon={<EventIcon e={event} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-danger" onClick={() => void remove()} disabled={busy} aria-label="Удалить запись">
            <Trash2 size={18} />
          </button>
          <button className="btn btn-primary grow" onClick={() => void save()} disabled={busy}>
            <Save size={18} /> Сохранить исправления
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="row wrap" style={{ gap: 10 }}>
          <Plate plate={fleet.plateOf(event.vehicle_id)} size="sm" />
          <span className="muted small">
            {fleet.nameOf(event.driver_id)} · {fmtDateTime(event.occurred_at)}
          </span>
          {event.fuel && <FuelTag fuel={event.fuel} />}
        </div>

        {event.odometer_photo ? (
          <SignedPhoto path={event.odometer_photo} alt="Фото одометра" />
        ) : (
          <div className="note warn">
            <CircleAlert size={18} /> Нет фото одометра
          </div>
        )}

        <label className="field">
          <span className="field-label">Пробег</span>
          <span className="input-wrap">
            <input value={odo} onChange={(e) => setOdo(e.target.value)} inputMode="numeric" />
            <span className="input-suffix">км</span>
          </span>
        </label>
        {event.type === 'refuel' && (
          <>
            <div className="grid-2">
              <label className="field">
                <span className="field-label">Литров</span>
                <span className="input-wrap">
                  <input value={liters} onChange={(e) => setLiters(e.target.value)} inputMode="decimal" />
                  <span className="input-suffix">л</span>
                </span>
              </label>
              <label className="field">
                <span className="field-label">Сумма</span>
                <span className="input-wrap">
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
                  <span className="input-suffix">₸</span>
                </span>
              </label>
            </div>
            <Switch checked={fullTank} onChange={setFullTank} label="До полного бака" />
            {event.receipt_photo && <SignedPhoto path={event.receipt_photo} alt="Фото чека" />}
          </>
        )}
        <label className="field">
          <span className="field-label">Комментарий</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
        </label>
        {error && (
          <div className="note bad">
            <CircleAlert size={18} /> {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}
