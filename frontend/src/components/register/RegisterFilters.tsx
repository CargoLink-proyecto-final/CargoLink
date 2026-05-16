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
    if (set.has(value)) set.delete(value);
    else set.add(value);
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
    try {
      await exportRegister(filters);
    } catch (err: any) {
      setExportError(
        err?.response?.data?.message || err?.message || 'Falló la exportación',
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3 bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            value={filters.q ?? ''}
            onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
            placeholder="Buscar por título, tipo, origen o destino…"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
          />
        </div>
        {isAdmin && (
          <input
            value={filters.participant ?? ''}
            onChange={(e) => onChange({ ...filters, participant: e.target.value || undefined })}
            placeholder="Generador o transportista…"
            className="lg:w-64 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <label className="text-gray-500">Desde</label>
            <input
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <label className="text-gray-500 ml-2">Hasta</label>
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
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
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition',
                    active
                      ? 'bg-primary-50 text-primary-700 border-primary-200'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50',
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
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <X size={14} /> Limpiar
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{total} cargas</span>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || total === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white transition"
          >
            <Download size={14} />
            {exporting ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      {exportError && (
        <p className="text-xs text-red-500">{exportError}</p>
      )}
    </div>
  );
}
