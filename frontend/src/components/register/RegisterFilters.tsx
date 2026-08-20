'use client';

import { useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import type { RegisterFilters, RegisterStatus } from '@/types/register';
import { exportRegister } from '@/lib/hooks/useRegister';
import { cn } from '@/lib/utils';

interface Props {
  filters: RegisterFilters;
  onChange: (next: RegisterFilters) => void;
  isAdmin: boolean;
  total: number;
}

const STATUS_OPTIONS: { value: RegisterStatus; label: string }[] = [
  { value: 'DELIVERED', label: 'Entregada' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

export default function RegisterFiltersBar({ filters, onChange, isAdmin, total }: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const statuses = filters.statuses ?? ['DELIVERED', 'CANCELLED'];

  const toggleStatus = (value: RegisterStatus) => {
    const set = new Set(statuses);
    if (set.has(value)) set.delete(value); else set.add(value);
    const next = Array.from(set) as RegisterStatus[];
    onChange({ ...filters, statuses: next.length ? next : undefined });
  };

  const clear = () => onChange({});

  const hasFilters =
    !!filters.from || !!filters.to || !!filters.q || !!filters.participant ||
    (filters.statuses && filters.statuses.length > 0 && filters.statuses.length < 2);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try { await exportRegister(filters); }
    catch (err: any) {
      setExportError(err?.response?.data?.message || err?.message || 'Falló la exportación');
    } finally { setExporting(false); }
  };

  return (
    <div className="card p-4 space-y-4">
      <div className="flex flex-col md:flex-row gap-2 md:gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} />
          <input
            value={filters.q ?? ''}
            onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
            placeholder="Buscar por título, tipo, origen o destino…"
            className="w-full pl-9 pr-4 py-2 bg-transparent border border-ink-200 rounded-lg text-[14px] focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
          />
        </div>
        {isAdmin && (
          <input
            value={filters.participant ?? ''}
            onChange={(e) => onChange({ ...filters, participant: e.target.value || undefined })}
            placeholder="Publicador o transportista…"
            className="w-full md:w-72 px-3 py-2 border border-ink-200 rounded-lg text-[13.5px] focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
          />
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-2 md:gap-3 md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[13px] text-ink-600">
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-500">Desde</span>
            <input
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
              className="px-2.5 py-1.5 border border-ink-200 rounded-md text-[12.5px] font-mono outline-none focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600"
            />
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-500 ml-2">Hasta</span>
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
              className="px-2.5 py-1.5 border border-ink-200 rounded-md text-[12.5px] font-mono outline-none focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {STATUS_OPTIONS.map((opt) => {
              const active = statuses.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleStatus(opt.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[11px] font-medium uppercase tracking-[0.12em] border transition',
                    active
                      ? 'bg-primary-50 text-primary-700 border-primary-600/30'
                      : 'bg-surface-raised text-ink-500 border-ink-200 hover:bg-surface-sunk',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={clear}
              className="text-[11px] uppercase tracking-wider text-ink-500 hover:text-ink-700 flex items-center gap-1"
            >
              <X size={12} /> Limpiar
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink-500 font-mono">
            {total} cargas
          </span>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || total === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12.5px] bg-ink-900 hover:bg-ink-800 disabled:bg-ink-300 text-surface-raised transition"
          >
            <Download size={14} />
            {exporting ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      {exportError && (
        <p className="text-xs text-danger-600">{exportError}</p>
      )}
    </div>
  );
}
