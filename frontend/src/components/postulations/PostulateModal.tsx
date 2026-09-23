'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

interface Props {
  /** `null` = carga "a convenir": el precio lo pone el transportista y es obligatorio. */
  listedPrice: number | null;
  submitting: boolean;
  /** Mensaje de error del último intento (ej. perfil incompleto), si lo hay. */
  error?: string;
  /** El error es por perfil incompleto: ofrecemos el link directo a completarlo. */
  showCompleteProfileLink?: boolean;
  onSubmit: (data: { message?: string; proposedPrice?: number }) => void;
  onClose: () => void;
}

export default function PostulateModal({
  listedPrice,
  submitting,
  error,
  showCompleteProfileLink,
  onSubmit,
  onClose,
}: Props) {
  const [message, setMessage] = useState('');
  const [proposedPrice, setProposedPrice] = useState('');

  // Sin precio listado no hay nada que aceptar en silencio: proponer uno pasa a
  // ser obligatorio, y no hay piso contra el cual compararlo.
  const priceRequired = listedPrice == null;

  const parsedPrice = proposedPrice ? Number(proposedPrice) : undefined;
  const priceError =
    proposedPrice === ''
      ? priceRequired
        ? 'Esta carga no tiene precio publicado: proponé el tuyo.'
        : null
      : parsedPrice != null && (
          parsedPrice <= 0
            ? 'El precio debe ser mayor a 0'
            : listedPrice != null && parsedPrice <= listedPrice
            ? `Debe ser mayor al precio listado (${formatCurrency(listedPrice)}). Si aceptás ese precio, dejá el campo vacío.`
            : null
        );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (priceError) return;
    const trimmedMessage = message.trim();
    const validPrice =
      parsedPrice != null &&
      !Number.isNaN(parsedPrice) &&
      (listedPrice == null ? parsedPrice > 0 : parsedPrice > listedPrice)
        ? parsedPrice
        : undefined;
    onSubmit({
      message: trimmedMessage || undefined,
      proposedPrice: validPrice,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 px-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="card w-full max-w-sm sm:max-w-md p-6 space-y-4 bg-surface-raised"
      >
        <div>
          <p className="eyebrow">Postularme</p>
          <h2 className="font-display text-xl font-semibold">
            Enviar postulación
          </h2>
          <p className="text-sm text-ink-500 mt-1">
            {listedPrice == null ? (
              <>Esta carga sale <span className="font-medium">a convenir</span>: el precio lo ponés vos.</>
            ) : (
              <>Precio listado: <span className="font-medium">{formatCurrency(listedPrice)}</span></>
            )}
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="postulation-message" className="text-sm font-medium text-ink-700">
            Mensaje (opcional)
          </label>
          <textarea
            id="postulation-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Ej: Tengo camión refrigerado disponible para mañana"
            className="w-full rounded-card border border-ink-200 p-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
          <p className="text-xs text-ink-400 text-right">{message.length}/500</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="postulation-price" className="text-sm font-medium text-ink-700">
            {priceRequired ? 'Precio propuesto' : 'Precio propuesto (opcional)'}
          </label>
          <input
            id="postulation-price"
            type="number"
            min={0}
            step="any"
            value={proposedPrice}
            onChange={(e) => setProposedPrice(e.target.value)}
            placeholder={listedPrice == null ? 'Tu precio' : `Mayor a ${formatCurrency(listedPrice)}`}
            className={`w-full rounded-card border p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${priceError ? 'border-danger-400 focus:border-danger-400' : 'border-ink-200 focus:border-primary-500'}`}
          />
          {priceError ? (
            <p className="text-xs text-danger-600">{priceError}</p>
          ) : (
            <p className="text-xs text-ink-400">
              {priceRequired
                ? 'El publicador no fijó precio, así que tu propuesta es la que define el valor del viaje.'
                : 'Dejá vacío para aceptar el precio listado. Si querés negociar, ingresá un precio estrictamente mayor.'}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-danger-50 border border-danger-600/20 p-3 text-sm text-danger-700">
            <p>{error}</p>
            {showCompleteProfileLink && (
              <Link href="/profile/complete" className="font-medium underline">
                Completar perfil
              </Link>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-ink-700 hover:text-ink-900"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || !!priceError}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {submitting ? 'Enviando...' : 'Enviar postulación'}
          </button>
        </div>
      </form>
    </div>
  );
}
