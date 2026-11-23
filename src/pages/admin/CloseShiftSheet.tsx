import { useState } from 'react';
import { CircleAlert, Square } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fmtDateTime, fmtNum, uuid } from '../../lib/format';
import { Avatar, Plate, Sheet } from '../../components/ui';
import type { Fleet } from './useFleet';

export interface OpenShift {
  vehicleId: string;
  driverId: string;
  startAt: string;
  startOdo: number;
  regionId: string | null;
}

function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Руководитель закрывает за водителя забытую смену. */
export default function CloseShiftSheet({ shift, fleet, onClose }: { shift: OpenShift; fleet: Fleet; onClose: () => void }) {
  // Подсказка: самый большой пробег, который известен по машине после выезда
  const known = Math.max(
    shift.startOdo,
    ...fleet.events.filter((e) => e.vehicle_id === shift.vehicleId && Date.parse(e.occurred_at) >= Date.parse(shift.startAt)).map((e) => e.odometer)
  );
  const [odo, setOdo] = useState(String(known));
  const [at, setAt] = useState(() => localInput(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const odoNum = Number(odo.replace(/\s/g, ''));
  const odoOk = Number.isInteger(odoNum) && odoNum >= shift.startOdo;
  const km = odoOk ? odoNum - shift.startOdo : null;
  const name = fleet.nameOf(shift.driverId);

  const save = async () => {
    setError(null);
    if (!odoOk) return setError(`Пробег должен быть целым числом не меньше пробега выезда (${fmtNum(shift.startOdo)} км)`);
    const when = new Date(at);
    if (Number.isNaN(when.getTime())) return setError('Укажите дату и время возвращения');
    if (when.getTime() <= Date.parse(shift.startAt)) return setError('Возвращение не может быть раньше выезда');
    if (when.getTime() > Date.now() + 5 * 60_000) return setError('Время возвращения не может быть в будущем');
    setBusy(true);
    const { data } = await supabase.auth.getSession();
    const me = data.session?.user.id ?? null;
    const { error } = await supabase.from('events').insert({
      id: uuid(),
      vehicle_id: shift.vehicleId,
      driver_id: shift.driverId,
      type: 'shift_end',
      odometer: odoNum,
      occurred_at: when.toISOString(),
      region_id: shift.regionId,
      closed_by: me,
      comment: `[смену закрыл руководитель${me ? `: ${fleet.nameOf(me)}` : ''}]`
    });
    setBusy(false);
    if (error) return setError(error.message);
    await fleet.reload();
    onClose();
  };

  return (
    <Sheet
      title="Закрыть смену"
      icon={<Avatar name={name} />}
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-block" onClick={() => void save()} disabled={busy}>
          <Square size={18} /> {busy ? 'Закрываю…' : 'Закрыть смену'}
        </button>
      }
    >
      <div className="stack loose">
        <div className="row wrap" style={{ gap: 10 }}>
          <Plate plate={fleet.plateOf(shift.vehicleId)} size="sm" />
          <b>{name}</b>
          {shift.regionId && <span className="pill amber">{fleet.regionName(shift.regionId)}</span>}
        </div>
        <div className="note">
          Выезд: {fmtNum(shift.startOdo)} км, {fmtDateTime(shift.startAt)}. Укажите, когда и с каким пробегом машина вернулась. Запись пометится
          как закрытая руководителем.
        </div>
        <label className="field">
          <span className="field-label">Пробег при возвращении</span>
          <span className="input-wrap">
            <input value={odo} onChange={(e) => setOdo(e.target.value.replace(/[^\d\s]/g, ''))} inputMode="numeric" />
            <span className="input-suffix">км</span>
          </span>
        </label>
        {km !== null && (
          <div className="small muted">
            За рейс: <b>{fmtNum(km)} км</b>
            {km === 0 && ' — пробег такой же, как при выезде. Если знаете точнее, впишите.'}
          </div>
        )}
        <label className="field">
          <span className="field-label">Когда вернулся</span>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
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
