'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import RegisterFiltersBar from '@/components/register/RegisterFilters';
import RegisterList from '@/components/register/RegisterList';
import { useRegister } from '@/lib/hooks/useRegister';
import { useAuthStore } from '@/store/auth';
import type { RegisterFilters } from '@/types/register';

function subtitleFor(role: string | undefined): string {
  switch (role) {
    case 'ADMIN':
      return 'Todas las cargas cerradas del sistema.';
    case 'CARGO_GENERATOR':
      return 'Mis cargas entregadas y canceladas.';
    case 'TRANSPORTER':
      return 'Cargas que transporté.';
    default:
      return '';
  }
}

export default function RegisterPage() {
  const user = useAuthStore((s) => s.user);
  const [filters, setFilters] = useState<RegisterFilters>({});
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useRegister(filters, page);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  const handleFiltersChange = (next: RegisterFilters) => {
    setFilters(next);
    setPage(1);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Registro de cargas</h1>
          <p className="text-sm text-gray-500">{subtitleFor(user?.role)}</p>
        </header>

        <RegisterFiltersBar
          filters={filters}
          onChange={handleFiltersChange}
          isAdmin={user?.role === 'ADMIN'}
          total={total}
        />

        <RegisterList
          items={items}
          isLoading={isLoading}
          isError={isError}
          errorMessage={(error as Error | null)?.message}
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 p-3">
            <span className="text-sm text-gray-500">
              Página {data?.page} de {totalPages} ({total} en total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
