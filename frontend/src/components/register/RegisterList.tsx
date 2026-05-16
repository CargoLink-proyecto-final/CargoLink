'use client';

import { Inbox } from 'lucide-react';
import type { RegisterItem } from '@/types/register';
import RegisterRow from './RegisterRow';

interface Props {
  items: RegisterItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export default function RegisterList({ items, isLoading, isError, errorMessage }: Props) {
  if (isLoading) {
    return (
      <div className="card p-16 text-center text-ink-400 text-sm">Cargando registro…</div>
    );
  }

  if (isError) {
    return (
      <div className="card p-10 text-center text-danger-600 bg-danger-50/30">
        No se pudo cargar el registro{errorMessage ? ` — ${errorMessage}` : '.'}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card p-16 text-center">
        <div className="inline-flex w-12 h-12 rounded-full bg-ink-100 items-center justify-center mb-4">
          <Inbox size={18} className="text-ink-400" />
        </div>
        <p className="font-display text-[20px] text-ink-800">Sin resultados</p>
        <p className="mt-1 text-[13px] text-ink-500">Ajustá los filtros o el rango de fechas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <RegisterRow key={item.id} item={item} />
      ))}
    </div>
  );
}
