import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { enqueue, queueAll } from './offline';
import type { FleetEvent } from './types';

const ev = (id: string): FleetEvent => ({
  id, vehicle_id: 'v', driver_id: 'd', type: 'shift_start', odometer: 100, occurred_at: '2026-11-21T08:00:00Z',
  fuel: null, liters: null, amount: null, full_tank: null, odometer_photo: null, receipt_photo: null, comment: ''
});

describe('офлайн-очередь', () => {
  it('фото сохраняются как байты и возвращаются файлами', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    const photo = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' });
    await enqueue(ev('a1'), photo, null);
    const [item] = await queueAll();
    expect(item.event.id).toBe('a1');
    expect(item.odoPhoto).toBeInstanceOf(Blob);
    expect(item.odoPhoto!.size).toBe(5);
    expect(item.odoPhoto!.type).toBe('image/jpeg');
    expect(item.receiptPhoto).toBeNull();
  });
});
