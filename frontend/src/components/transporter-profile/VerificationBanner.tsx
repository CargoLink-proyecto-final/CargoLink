import Link from 'next/link';
import { ArrowRight, CheckCircle2, ClipboardCheck, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  VERIFICATION_META,
  VERIFICATION_TONE_CLASSES,
  describeMissing,
  documentLabel,
} from '@/lib/transporterProfile';
import type { ProfileStatus, VerificationState } from '@/types';

const STATE_ICON: Record<VerificationState, typeof CheckCircle2> = {
  INCOMPLETE: ClipboardCheck,
  REJECTED: XCircle,
  PENDING_REVIEW: Clock,
  APPROVED: CheckCircle2,
};

interface Props {
  status: ProfileStatus;
  // Con link: banner compacto para el panel. Sin link: versión detallada para
  // la página de completar perfil (lista qué falta y qué se rechazó).
  href?: string;
  className?: string;
}

export default function VerificationBanner({ status, href, className }: Props) {
  const meta = VERIFICATION_META[status.state];
  const tone = VERIFICATION_TONE_CLASSES[meta.tone];
  const Icon = STATE_ICON[status.state];
  const showDetails = !href;

  return (
    <section
      className={cn(
        'rounded-xl border px-5 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3',
        tone.box,
        className,
      )}
      role="status"
    >
      <div className="flex items-start gap-3 min-w-0">
        <Icon size={20} className={cn('shrink-0 mt-0.5', tone.text)} />
        <div className="min-w-0">
          <p className={cn('text-[13.5px] font-medium', tone.text)}>{meta.title}</p>
          <p className="text-[12.5px] text-ink-600 mt-0.5">{meta.description}</p>

          {showDetails && status.rejected.length > 0 && (
            <p className="text-[12.5px] text-ink-700 mt-2">
              <span className="font-medium">Rechazados:</span>{' '}
              {status.rejected.map(documentLabel).join(', ')}
            </p>
          )}
          {showDetails && status.missing.length > 0 && (
            <div className="text-[12.5px] text-ink-700 mt-2">
              <p className="font-medium">Te falta completar:</p>
              <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                {status.missing.map((code) => (
                  <li key={code}>{describeMissing(code)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {href && (
        <Link
          href={href}
          className="shrink-0 self-center inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-700 hover:underline"
        >
          {status.state === 'PENDING_REVIEW' ? 'Ver estado' : 'Ir a mi perfil'} <ArrowRight size={14} />
        </Link>
      )}
    </section>
  );
}
