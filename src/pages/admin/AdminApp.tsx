import { useMemo, useState } from 'react';
import {
  ChartColumn,
  ChevronRight,
  Gauge,
  LayoutGrid,
  LogOut,
  Menu,
  RefreshCw,
  ScrollText,
  TriangleAlert,
  Truck,
  Users,
  type LucideIcon
} from 'lucide-react';
import { findIssues } from '../../lib/calc';
import { ROLE_LABEL, type Profile } from '../../lib/types';
import { Avatar, Logo, Sheet } from '../../components/ui';
import ProfileSheet from '../../components/ProfileSheet';
import DriverApp from '../DriverApp';
import { useFleet } from './useFleet';
import Fleet from './Fleet';
import Report from './Report';
import Issues from './Issues';
import Journal from './Journal';
import Vehicles from './Vehicles';
import People from './People';

export type Tab = 'fleet' | 'report' | 'issues' | 'journal' | 'vehicles' | 'people' | 'input';

const NAV: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'fleet', label: 'Парк', icon: LayoutGrid },
  { id: 'report', label: 'Отчёт', icon: ChartColumn },
  { id: 'issues', label: 'Замечания', icon: TriangleAlert },
  { id: 'journal', label: 'Журнал', icon: ScrollText },
  { id: 'vehicles', label: 'Машины', icon: Truck },
  { id: 'people', label: 'Сотрудники', icon: Users },
  { id: 'input', label: 'Ввод показаний', icon: Gauge }
];
const BOTTOM: Tab[] = ['fleet', 'report', 'issues', 'journal'];

export default function AdminApp({ profile, onLogout }: { profile: Profile; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('fleet');
  const [more, setMore] = useState(false);
  const [me, setMe] = useState(false);
  const [journalVehicle, setJournalVehicle] = useState('');
  const fleet = useFleet();

  const pending = fleet.profiles.filter((p) => p.role === 'pending').length;
  const issuesWeek = useMemo(() => {
    const since = Date.now() - 7 * 86_400_000;
    return findIssues(fleet.vehicles, fleet.events).filter((i) => i.severity === 'high' && Date.parse(i.at) >= since).length;
  }, [fleet.vehicles, fleet.events]);
  const badge = (id: Tab) => (id === 'people' ? pending : id === 'issues' ? issuesWeek : 0);

  const go = (t: Tab) => {
    setTab(t);
    setMore(false);
    window.scrollTo({ top: 0 });
  };
  const openJournal = (vehicleId: string) => {
    setJournalVehicle(vehicleId);
    go('journal');
  };

  return (
    <div className="shell has-bottom-nav">
      <aside className="sidebar">
        <div className="side-brand">
          <Logo size={38} />
        </div>
        <nav className="side-nav">
          {NAV.map((n) => (
            <button key={n.id} className={tab === n.id ? 'active' : ''} onClick={() => go(n.id)} aria-current={tab === n.id ? 'page' : undefined}>
              <n.icon size={20} />
              <span className="label">{n.label}</span>
              {badge(n.id) > 0 && <span className={`count${n.id === 'people' ? ' amber' : ''}`}>{badge(n.id)}</span>}
            </button>
          ))}
        </nav>
        <div className="side-sep" />
        <nav className="side-nav">
          <button onClick={() => void fleet.reload()}>
            <RefreshCw size={20} className={fleet.loading ? 'spin' : ''} />
            <span className="label">Обновить данные</span>
          </button>
        </nav>
        <div className="side-user">
          <button className="icon-btn" onClick={() => setMe(true)} aria-label="Профиль" style={{ width: 'auto', height: 'auto' }}>
            <Avatar name={profile.full_name || '?'} />
          </button>
          <div className="grow" style={{ cursor: 'pointer' }} onClick={() => setMe(true)}>
            <div className="name">{profile.full_name}</div>
            <div className="role">{ROLE_LABEL[profile.role]}</div>
          </div>
          <button className="icon-btn" onClick={onLogout} aria-label="Выйти" title="Выйти">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="mobile-bar">
          <Logo size={32} />
          <span className="spacer" />
          <button className="icon-btn" onClick={() => void fleet.reload()} aria-label="Обновить данные">
            <RefreshCw size={20} className={fleet.loading ? 'spin' : ''} />
          </button>
          <button className="icon-btn" onClick={() => setMe(true)} aria-label="Профиль">
            <Avatar name={profile.full_name || '?'} size="sm" />
          </button>
        </header>

        {fleet.error && (
          <div className="page" style={{ paddingBottom: 0 }}>
            <div className="note bad">
              <TriangleAlert size={18} /> Не удалось загрузить данные: {fleet.error}
            </div>
          </div>
        )}

        {tab === 'fleet' && <Fleet fleet={fleet} onOpenJournal={openJournal} onOpenIssues={() => go('issues')} />}
        {tab === 'report' && <Report fleet={fleet} />}
        {tab === 'issues' && <Issues fleet={fleet} />}
        {tab === 'journal' && <Journal fleet={fleet} vehicleId={journalVehicle} onVehicleChange={setJournalVehicle} />}
        {tab === 'vehicles' && <Vehicles fleet={fleet} />}
        {tab === 'people' && <People fleet={fleet} me={profile} />}
        {tab === 'input' && <DriverApp profile={profile} embedded />}
      </div>

      <nav className="bottom-nav" aria-label="Разделы">
        {BOTTOM.map((id) => {
          const n = NAV.find((x) => x.id === id)!;
          return (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}>
              <span className="nav-ico">
                <n.icon size={21} />
              </span>
              {n.label}
              {badge(id) > 0 && <span className="count">{badge(id)}</span>}
            </button>
          );
        })}
        <button className={['vehicles', 'people', 'input'].includes(tab) ? 'active' : ''} onClick={() => setMore(true)}>
          <span className="nav-ico">
            <Menu size={21} />
          </span>
          Ещё
          {pending > 0 && <span className="count amber">{pending}</span>}
        </button>
      </nav>

      {more && (
        <Sheet title="Разделы" onClose={() => setMore(false)}>
          <div className="list">
            {NAV.filter((n) => !BOTTOM.includes(n.id)).map((n) => (
              <div key={n.id} className="list-row click" role="button" tabIndex={0} onClick={() => go(n.id)}>
                <span className="type-ico">
                  <n.icon size={19} />
                </span>
                <span className="grow" style={{ fontWeight: 650 }}>
                  {n.label}
                </span>
                {badge(n.id) > 0 && <span className="count amber">{badge(n.id)}</span>}
                <ChevronRight size={18} className="faint" />
              </div>
            ))}
            <div className="list-row click" role="button" tabIndex={0} onClick={onLogout}>
              <span className="type-ico">
                <LogOut size={19} />
              </span>
              <span className="grow" style={{ fontWeight: 650 }}>
                Выйти
              </span>
            </div>
          </div>
        </Sheet>
      )}
      {me && <ProfileSheet profile={profile} onClose={() => setMe(false)} onLogout={onLogout} />}
    </div>
  );
}
