import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

type Tone = 'primary' | 'ink' | 'success' | 'info' | 'warning' | 'danger';

const TONE: Record<Tone, { icon: string; rule: string }> = {
  primary: { icon: 'text-primary-700 bg-primary-50',  rule: 'bg-primary-500' },
  ink:     { icon: 'text-ink-900 bg-ink-100',         rule: 'bg-ink-800' },
  success: { icon: 'text-success-700 bg-success-50',  rule: 'bg-success-600' },
  info:    { icon: 'text-info-700 bg-info-50',        rule: 'bg-info-600' },
  warning: { icon: 'text-warning-700 bg-warning-50',  rule: 'bg-warning-600' },
  danger:  { icon: 'text-danger-700 bg-danger-50',    rule: 'bg-danger-600' },
};

interface Props {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
}

export default function StatCard({ label, value, icon: Icon, tone = 'ink', hint }: Props) {
  const t = TONE[tone];
  return (
    <div className="card p-5 relative overflow-hidden">
      <div className={cn('absolute top-0 left-0 h-[3px] w-12 rounded-br-full', t.rule)} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{label}</p>
          <p className="mt-2 font-display font-semibold text-[26px] sm:text-[34px] leading-none text-ink-900 tabular-nums tracking-tight">
            {value}
          </p>
          {hint && <p className="mt-2 text-[12px] text-ink-500">{hint}</p>}
        </div>
        <div className={cn('p-2.5 rounded-lg shrink-0', t.icon)}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}
