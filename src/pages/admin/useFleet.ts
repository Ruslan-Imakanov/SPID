import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { FleetEvent, InsurancePolicy, Profile, Vehicle } from '../../lib/types';

export interface Fleet {
  vehicles: Vehicle[];
  profiles: Profile[];
  events: FleetEvent[];
  policies: InsurancePolicy[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  nameOf: (id: string | null) => string;
  plateOf: (id: string) => string;
}

async function fetchAllEvents(): Promise<FleetEvent[]> {
  const page = 1000;
  const out: FleetEvent[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('occurred_at', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    out.push(...((data ?? []) as FleetEvent[]).map((e) => ({ ...e, liters: e.liters === null ? null : Number(e.liters), amount: e.amount === null ? null : Number(e.amount) })));
    if (!data || data.length < page) break;
  }
  return out;
}

export function useFleet(): Fleet {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<FleetEvent[]>([]);
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, p, e, ins] = await Promise.all([
        supabase.from('vehicles').select('*').order('plate'),
        supabase.from('profiles').select('*').order('full_name'),
        fetchAllEvents(),
        supabase.from('insurance_policies').select('*').order('ends_on')
      ]);
      if (v.error) throw v.error;
      if (p.error) throw p.error;
      setVehicles(v.data as Vehicle[]);
      setProfiles(p.data as Profile[]);
      setEvents(e);
      // Страховки не должны ломать остальной кабинет, если что-то пошло не так
      setPolicies(((ins.data ?? []) as InsurancePolicy[]).map((x) => ({ ...x, cost: x.cost === null ? null : Number(x.cost) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const nameOf = useCallback(
    (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name || '(без имени)' : '—'),
    [profiles]
  );
  const plateOf = useCallback((id: string) => vehicles.find((v) => v.id === id)?.plate ?? '—', [vehicles]);

  return { vehicles, profiles, events, policies, loading, error, reload, nameOf, plateOf };
}
