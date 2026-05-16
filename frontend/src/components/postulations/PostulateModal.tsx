'use client';

import { useState, FormEvent } from 'react';
import { formatCurrency } from '@/lib/utils';

interface Props {
  listedPrice: number;
  submitting: boolean;
  onSubmit: (data: { message?: string; proposedPrice?: number }) => void;
  onClose: () => void;
}

export default function PostulateModal({
  listedPrice,
  submitting,
  onSubmit,
  onClose,
}: Props) {
  const [message, setMessage] = useState('');
  const [proposedPrice, setProposedPrice] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedMessage = message.trim();
    const parsedPrice = proposedPrice ? Number(proposedPrice) : undefined;
    onSubmit({
      message: trimmedMessage || undefined,
      proposedPrice:
        parsedPrice != null && !Number.isNaN(parsedPrice) && parsedPrice > 0
          ? parsedPrice
          : undefined,
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
        className="card w-full max-w-md p-6 space-y-4 bg-surface-raised"
      >
        <div>
          <p className="eyebrow">Postularme</p>
          <h2 className="font-display text-xl font-semibold">
            Enviar postulación
          </h2>
          <p className="text-sm text-ink-500 mt-1">
            Precio listado: <span className="font-medium">{formatCurrency(listedPrice)}</span>
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
            Precio propuesto (opcional)
          </label>
          <input
            id="postulation-price"
            type="number"
            min={1}
            step={1}
            value={proposedPrice}
            onChange={(e) => setProposedPrice(e.target.value)}
            placeholder={String(listedPrice)}
            className="w-full rounded-card border border-ink-200 p-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
          <p className="text-xs text-ink-400">
            Dejá vacío para aceptar el precio listado.
          </p>
        </div>

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
            disabled={submitting}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {submitting ? 'Enviando...' : 'Enviar postulación'}
          </button>
        </div>
      </form>
    </div>
  );
}
