import { useState } from 'react';
import type { Profile } from '../../lib/types';
import DriverApp from '../DriverApp';
import { useFleet } from './useFleet';
import Report from './Report';
import Issues from './Issues';
import Journal from './Journal';
import Vehicles from './Vehicles';
import Drivers from './Drivers';

type Tab = 'report' | 'issues' | 'journal' | 'vehicles' | 'drivers' | 'input';

const TABS: { id: Tab; label: string }[] = [
  { id: 'report', label: 'Отчёт' },
  { id: 'issues', label: 'Замечания' },
  { id: 'journal', label: 'Журнал' },
  { id: 'vehicles', label: 'Машины' },
  { id: 'drivers', label: 'Водители' },
  { id: 'input', label: 'Ввод' }
];

export default function AdminApp({ profile, onLogout }: { profile: Profile; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('report');
  const fleet = useFleet();
  const pending = fleet.profiles.filter((p) => p.role === 'pending').length;

  return (
    <>
      <div className="topbar">
        <span className="brand">СПИД</span>
        <span className="small">{profile.full_name} · руководитель</span>
        <span className="spacer" />
        <button className="link small" onClick={() => void fleet.reload()}>
          Обновить
        </button>
        <button className="link small" onClick={onLogout}>
          Выйти
        </button>
      </div>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'drivers' && pending > 0 && <span className="badge warn" style={{ marginLeft: 6 }}>{pending}</span>}
          </button>
        ))}
      </nav>
      {fleet.error && (
        <div className="page">
          <div className="note bad">Ошибка загрузки: {fleet.error}</div>
        </div>
      )}
      {fleet.loading && fleet.events.length === 0 && !fleet.error && <div className="page muted">Загрузка данных…</div>}
      {tab === 'report' && <Report fleet={fleet} />}
      {tab === 'issues' && <Issues fleet={fleet} />}
      {tab === 'journal' && <Journal fleet={fleet} />}
      {tab === 'vehicles' && <Vehicles fleet={fleet} />}
      {tab === 'drivers' && <Drivers fleet={fleet} me={profile} />}
      {tab === 'input' && <DriverApp profile={profile} embedded />}
    </>
  );
}
