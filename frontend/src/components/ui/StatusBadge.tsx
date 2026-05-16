import { cn } from '@/lib/utils';
import { getStatusLabel } from '@/lib/utils';

type Tone = 'info' | 'warning' | 'primary' | 'success' | 'danger' | 'neutral';

const STATUS_TONES: Record<string, Tone> = {
  PUBLISHED: 'info',
  ASSIGNED: 'warning',
  IN_TRANSIT: 'primary',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  PENDING: 'neutral',
  ACCEPTED: 'info',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

const TONE_STYLES: Record<Tone, { dot: string; text: string; ring: string }> = {
  info:    { dot: 'bg-info-600',    text: 'text-info-700',    ring: 'ring-info-600/15' },
  warning: { dot: 'bg-warning-600', text: 'text-warning-700', ring: 'ring-warning-600/15' },
  primary: { dot: 'bg-primary-600', text: 'text-primary-700', ring: 'ring-primary-600/15' },
  success: { dot: 'bg-success-600', text: 'text-success-700', ring: 'ring-success-600/15' },
  danger:  { dot: 'bg-danger-600',  text: 'text-danger-700',  ring: 'ring-danger-600/15' },
  neutral: { dot: 'bg-ink-500',     text: 'text-ink-700',     ring: 'ring-ink-400/15' },
};

interface Props {
  status: string;
  size?: 'sm' | 'md';
  className?: string;
}

export default function StatusBadge({ status, size = 'sm', className }: Props) {
  const tone = STATUS_TONES[status] ?? 'neutral';
  const styles = TONE_STYLES[tone];
  const label = getStatusLabel(status);
  const padding = size === 'md' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-surface-raised ring-1 font-medium uppercase',
        'tracking-[0.12em]',
        padding,
        styles.text,
        styles.ring,
        className,
      )}
    >
      <span className={cn('inline-block w-1.5 h-1.5 rounded-full', styles.dot)} aria-hidden />
      {label}
    </span>
  );
}
