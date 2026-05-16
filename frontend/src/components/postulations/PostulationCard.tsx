'use client';

import { Mail, Phone, Star } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/utils';
import type { PostulationWithTransporter } from '@/types';

interface Props {
  postulation: PostulationWithTransporter;
  listedPrice: number;
  canAccept: boolean;
  onAccept: () => void;
  accepting: boolean;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function RatingStars({ score }: { score: number }) {
  const rounded = Math.round(score);
  return (
    <div className="flex items-center gap-0.5" aria-label={`${score} estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          className={
            i <= rounded
              ? 'fill-warning-500 text-warning-500'
              : 'text-ink-300'
          }
        />
      ))}
    </div>
  );
}

export default function PostulationCard({
  postulation,
  listedPrice,
  canAccept,
  onAccept,
  accepting,
}: Props) {
  const { transporter, averageRating, totalRatings, message, proposedPrice, status } =
    postulation;
  const priceDelta =
    proposedPrice != null ? proposedPrice - listedPrice : null;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {transporter.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={transporter.avatarUrl}
              alt={`${transporter.firstName} ${transporter.lastName}`}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 font-semibold flex items-center justify-center">
              {initials(transporter.firstName, transporter.lastName)}
            </div>
          )}
          <div>
            <p className="font-display font-semibold text-ink-900">
              {transporter.firstName} {transporter.lastName}
            </p>
            {transporter.companyName && (
              <p className="text-sm text-ink-500">{transporter.companyName}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {totalRatings > 0 ? (
                <>
                  <RatingStars score={averageRating} />
                  <span className="text-xs text-ink-600">
                    {averageRating.toFixed(1)} ({totalRatings})
                  </span>
                </>
              ) : (
                <span className="text-xs text-ink-400 italic">Sin calificaciones</span>
              )}
            </div>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {message && (
        <p className="text-sm text-ink-700 whitespace-pre-line bg-surface-sunk rounded-card p-3 border border-ink-200/60">
          {message}
        </p>
      )}

      {proposedPrice != null && (
        <div className="flex items-center justify-between text-sm">
          <div>
            <span className="text-ink-500">Precio listado: </span>
            <span className="font-medium">{formatCurrency(listedPrice)}</span>
          </div>
          <div>
            <span className="text-ink-500">Propuesto: </span>
            <span className="font-medium">{formatCurrency(proposedPrice)}</span>
            {priceDelta != null && priceDelta !== 0 && (
              <span
                className={`ml-2 text-xs ${
                  priceDelta < 0 ? 'text-success-700' : 'text-warning-700'
                }`}
              >
                {priceDelta < 0 ? '↓' : '↑'} {formatCurrency(Math.abs(priceDelta))}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-ink-200/60">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
          <a
            href={`mailto:${transporter.email}`}
            className="inline-flex items-center gap-1 hover:text-primary-700"
          >
            <Mail size={12} /> {transporter.email}
          </a>
          {transporter.phone && (
            <a
              href={`tel:${transporter.phone}`}
              className="inline-flex items-center gap-1 hover:text-primary-700"
            >
              <Phone size={12} /> {transporter.phone}
            </a>
          )}
        </div>
        {canAccept && (
          <button
            onClick={onAccept}
            disabled={accepting}
            className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {accepting ? 'Asignando...' : 'Elegir transportista'}
          </button>
        )}
      </div>
    </div>
  );
}
