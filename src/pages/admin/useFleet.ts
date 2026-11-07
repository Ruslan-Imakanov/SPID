import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { FleetEvent, Profile, Vehicle } from '../../lib/types';

export interface Fleet {
  vehicles: Vehicle[];
  profiles: Profile[];
  events: FleetEvent[];
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, p, e] = await Promise.all([
        supabase.from('vehicles').select('*').order('plate'),
        supabase.from('profiles').select('*').order('full_name'),
        fetchAllEvents()
      ]);
      if (v.error) throw v.error;
      if (p.error) throw p.error;
      setVehicles(v.data as Vehicle[]);
      setProfiles(p.data as Profile[]);
      setEvents(e);
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

  return { vehicles, profiles, events, loading, error, reload, nameOf, plateOf };
}
