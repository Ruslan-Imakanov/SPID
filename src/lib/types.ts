export type Fuel = 'petrol' | 'lpg' | 'diesel';
export type EventType = 'shift_start' | 'shift_end' | 'refuel';
export type Role = 'pending' | 'driver' | 'admin' | 'blocked';
export type Body = 'standard' | '6m' | 'other';

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  role: Role;
  created_at?: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  body: Body;
  fuels: Fuel[];
  assigned_driver: string | null;
  active: boolean;
  notes: string;
}

export interface FleetEvent {
  id: string;
  vehicle_id: string;
  driver_id: string;
  type: EventType;
  odometer: number;
  occurred_at: string; // ISO
  fuel: Fuel | null;
  liters: number | null;
  amount: number | null;
  full_tank: boolean | null;
  odometer_photo: string | null;
  receipt_photo: string | null;
  comment: string;
}

export const FUEL_LABEL: Record<Fuel, string> = {
  petrol: 'Бензин',
  lpg: 'Газ',
  diesel: 'Дизель'
};

export const BODY_LABEL: Record<Body, string> = {
  standard: 'стандарт',
  '6m': '6 м',
  other: '—'
};

export const EVENT_LABEL: Record<EventType, string> = {
  shift_start: 'Начало смены',
  shift_end: 'Конец смены',
  refuel: 'Заправка'
};

export const ROLE_LABEL: Record<Role, string> = {
  pending: 'Ждёт подтверждения',
  driver: 'Водитель',
  admin: 'Руководитель',
  blocked: 'Отключён'
};
