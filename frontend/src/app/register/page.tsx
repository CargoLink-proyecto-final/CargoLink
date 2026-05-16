'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import RegisterFiltersBar from '@/components/register/RegisterFilters';
import RegisterList from '@/components/register/RegisterList';
import { useRegister } from '@/lib/hooks/useRegister';
import { useAuthStore } from '@/store/auth';
import type { RegisterFilters } from '@/types/register';

const ROLE_COPY: Record<string, { eyebrow: string; subtitle: string }> = {
  ADMIN: {
    eyebrow: 'Vista de administrador',
    subtitle: 'Todas las cargas cerradas del sistema — entregadas y canceladas.',
  },
  CARGO_GENERATOR: {
    eyebrow: 'Tu historial',
    subtitle: 'Cargas que publicaste y ya cerraron — entregadas o canceladas.',
  },
  TRANSPORTER: {
    eyebrow: 'Tu historial',
    subtitle: 'Viajes que completaste como transportista.',
  },
};

export default function RegisterPage() {
  const user = useAuthStore((s) => s.user);
  const [filters, setFilters] = useState<RegisterFilters>({});
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useRegister(filters, page);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  const handleFiltersChange = (next: RegisterFilters) => { setFilters(next); setPage(1); };
  const copy = ROLE_COPY[user?.role ?? 'ADMIN'] ?? ROLE_COPY.ADMIN;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <header className="flex flex-col gap-3">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="font-display text-[38px] leading-[1.05]">
            Registro de <span className="font-semibold text-primary-700">cargas</span>
          </h1>
          <p className="text-[14px] text-ink-500 max-w-xl">{copy.subtitle}</p>
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
          <div className="flex items-center justify-between card px-4 py-3">
            <span className="text-[12px] text-ink-500 font-mono">
              Página {data?.page} / {totalPages} · {total} en total
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-[12px] border border-ink-200 rounded-md hover:bg-surface-sunk disabled:opacity-40"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-[12px] border border-ink-200 rounded-md hover:bg-surface-sunk disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
