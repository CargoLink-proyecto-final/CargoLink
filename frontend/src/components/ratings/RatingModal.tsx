'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Star } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSubmit: (score: number, comment: string) => void;
  isPending: boolean;
  rateeRoleLabel: string;
  rateeName: string;
}

export default function RatingModal({
  onClose,
  onSubmit,
  isPending,
  rateeRoleLabel,
  rateeName,
}: Props) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');

  return createPortal(
    <div
      style={{ zIndex: 10000 }}
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div>
          <h3 className="text-lg font-bold">Calificar {rateeRoleLabel}</h3>
          {rateeName && <p className="text-sm text-gray-500">{rateeName}</p>}
        </div>
        <div className="flex gap-2 justify-center">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => setScore(s)}>
              <Star
                size={32}
                className={s <= score ? 'text-yellow-500' : 'text-gray-300'}
                fill={s <= score ? 'currentColor' : 'none'}
              />
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          placeholder="Dejar un comentario (opcional)"
          rows={3}
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSubmit(score, comment)}
            disabled={isPending}
            className="flex-1 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {isPending ? 'Enviando...' : 'Enviar Calificación'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
