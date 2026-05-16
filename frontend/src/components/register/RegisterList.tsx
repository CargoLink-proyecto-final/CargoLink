'use client';

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
      <div className="p-10 text-center text-gray-400 bg-white rounded-xl border border-gray-100">
        Cargando registro…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-10 text-center text-red-500 bg-white rounded-xl border border-red-100">
        No se pudo cargar el registro{errorMessage ? `: ${errorMessage}` : ''}.
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-10 text-center text-gray-400 bg-white rounded-xl border border-gray-100">
        No hay cargas que coincidan con los filtros.
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
