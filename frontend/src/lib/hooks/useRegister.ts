import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { loadsApi } from '@/lib/api';
import type { RegisterFilters, RegisterResponse } from '@/types/register';

function toParams(filters: RegisterFilters, page: number, limit: number) {
  const params: Record<string, string | number> = { page, limit };
  if (filters.statuses?.length) params.statuses = filters.statuses.join(',');
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.participant) params.participant = filters.participant;
  if (filters.q) params.q = filters.q;
  return params;
}

export function useRegister(filters: RegisterFilters, page: number, limit = 20) {
  return useQuery<RegisterResponse>({
    queryKey: ['register', filters, page, limit],
    queryFn: () =>
      loadsApi.getRegister(toParams(filters, page, limit)).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}

export function exportRegister(filters: RegisterFilters) {
  return loadsApi
    .exportRegister(toParams(filters, 1, 1))
    .then((res) => {
      const today = new Date().toISOString().slice(0, 10);
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `registro-cargas-${today}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
}
