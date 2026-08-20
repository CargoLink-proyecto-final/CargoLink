'use client';

import { useState, FormEvent } from 'react';
import { Mail, Phone } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import RatingStars from '@/components/ratings/RatingStars';
import { formatCurrency, formatPrice } from '@/lib/utils';
import type { PostulationWithTransporter } from '@/types';

interface Props {
  postulation: PostulationWithTransporter;
  /** `null` = carga "a convenir": no hay precio de referencia contra el cual comparar. */
  listedPrice: number | null;
  canAccept: boolean;
  onAccept: () => void;
  accepting: boolean;
  onCounterOffer: (price: number) => void;
  counteringOffer: boolean;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export default function PostulationCard({
  postulation,
  listedPrice,
  canAccept,
  onAccept,
  accepting,
  onCounterOffer,
  counteringOffer,
}: Props) {
  const { transporter, averageRating, totalRatings, message, proposedPrice, counterOfferPrice, lastOfferBy, status } =
    postulation;
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterPriceInput, setCounterPriceInput] = useState('');

  const isNegotiating = status === 'NEGOTIATING';
  // The transporter's current asking price — shipper's counter must not exceed it
  const transporterCurrentOffer =
    isNegotiating && lastOfferBy === 'TRANSPORTER' && counterOfferPrice != null
      ? counterOfferPrice
      : proposedPrice;

  // Shipper can counter only when there's a transporter price to negotiate against
  const canCounter =
    canAccept &&
    (status === 'PENDING' || status === 'NEGOTIATING') &&
    lastOfferBy !== 'SHIPPER' &&
    transporterCurrentOffer != null;

  const counterParsed = Number(counterPriceInput);
  const counterError =
    counterPriceInput !== '' && (
      counterParsed <= 0
        ? 'El precio debe ser mayor a 0'
        : transporterCurrentOffer != null && counterParsed >= transporterCurrentOffer
        ? `Debe ser menor a la oferta del transportista ($${transporterCurrentOffer}). Si aceptás ese precio, usá "Elegir transportista".`
        : null
    );

  function handleCounterSubmit(e: FormEvent) {
    e.preventDefault();
    if (!counterParsed || counterParsed <= 0) return;
    if (transporterCurrentOffer != null && counterParsed >= transporterCurrentOffer) return;
    onCounterOffer(counterParsed);
    setShowCounterForm(false);
    setCounterPriceInput('');
  }

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

      {/* Price negotiation summary */}
      {(proposedPrice != null || isNegotiating) && (
        <div className="rounded-card border border-ink-200/60 bg-surface-sunk p-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Precio listado</span>
            <span className="font-medium">{formatPrice(listedPrice)}</span>
          </div>
          {proposedPrice != null && (
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Oferta del transportista</span>
              <span className="font-medium">
                {formatCurrency(proposedPrice)}
                {listedPrice != null && proposedPrice !== listedPrice && (
                  <span className={`ml-2 text-xs ${proposedPrice < listedPrice ? 'text-success-700' : 'text-warning-700'}`}>
                    {proposedPrice < listedPrice ? '↓' : '↑'} {formatCurrency(Math.abs(proposedPrice - listedPrice))}
                  </span>
                )}
              </span>
            </div>
          )}
          {isNegotiating && counterOfferPrice != null && (
            <div className="flex items-center justify-between border-t border-ink-200/60 pt-1.5">
              <span className="text-ink-500">
                {lastOfferBy === 'SHIPPER' ? 'Tu contra-oferta' : 'Contra-oferta del transportista'}
              </span>
              <span className="font-semibold text-primary-700">
                {formatCurrency(counterOfferPrice)}
                {listedPrice != null && counterOfferPrice !== listedPrice && (
                  <span className={`ml-2 text-xs ${counterOfferPrice < listedPrice ? 'text-success-700' : 'text-warning-700'}`}>
                    {counterOfferPrice < listedPrice ? '↓' : '↑'} {formatCurrency(Math.abs(counterOfferPrice - listedPrice))}
                  </span>
                )}
              </span>
            </div>
          )}
          {isNegotiating && lastOfferBy === 'SHIPPER' && (
            <p className="text-xs text-ink-400 italic pt-0.5">Esperando respuesta del transportista…</p>
          )}
        </div>
      )}

      {/* Counter-offer inline form */}
      {showCounterForm && canCounter && (
        <form onSubmit={handleCounterSubmit} className="space-y-1">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="any"
              value={counterPriceInput}
              onChange={(e) => setCounterPriceInput(e.target.value)}
              placeholder={`Menos de $${transporterCurrentOffer ?? listedPrice ?? ''}`}
              className={`flex-1 rounded-card border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${counterError ? 'border-danger-400 focus:border-danger-400' : 'border-ink-200 focus:border-primary-500'}`}
              autoFocus
            />
            <button
              type="submit"
              disabled={counteringOffer || !counterPriceInput || !!counterError}
              className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {counteringOffer ? '...' : 'Enviar'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCounterForm(false); setCounterPriceInput(''); }}
              className="text-sm text-ink-500 hover:text-ink-700 px-2 py-1.5"
            >
              Cancelar
            </button>
          </div>
          {counterError && (
            <p className="text-xs text-danger-600">{counterError}</p>
          )}
        </form>
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
        <div className="flex items-center gap-2">
          {canCounter && !showCounterForm && (
            <button
              onClick={() => setShowCounterForm(true)}
              className="border border-primary-600 text-primary-700 hover:bg-primary-50 text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              Contra-ofertar
            </button>
          )}
          {canAccept && (status === 'PENDING' || (status === 'NEGOTIATING' && lastOfferBy === 'TRANSPORTER')) && (
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
    </div>
  );
}
