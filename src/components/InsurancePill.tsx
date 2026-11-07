import { ShieldAlert, ShieldCheck, ShieldOff, ShieldX } from 'lucide-react';
import type { InsStatus } from '../lib/insurance';
import { INSURANCE_LABEL } from '../lib/types';

/** Метка статуса страховки: цвет + значок + текст (цвет никогда не единственный признак). */
export default function InsurancePill({ s, withKind, prefix }: { s: InsStatus; withKind?: boolean; prefix?: string }) {
  const Icon = s.tone === 'good' ? ShieldCheck : s.tone === 'none' ? ShieldOff : s.days !== null && s.days < 0 ? ShieldX : ShieldAlert;
  const cls = s.tone === 'none' ? '' : s.tone;
  const kind = withKind && s.policy ? `${INSURANCE_LABEL[s.policy.kind]}: ` : '';
  return (
    <span className={`pill ${cls}`} title="Страховка">
      <Icon size={14} />
      {prefix}
      {kind}
      {s.tone === 'good' ? s.label.replace(/^До /, 'до ') : s.label.toLowerCase()}
    </span>
  );
}
