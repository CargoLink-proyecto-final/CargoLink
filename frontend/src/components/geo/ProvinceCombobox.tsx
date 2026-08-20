'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Combobox, { ComboboxOption } from '@/components/ui/Combobox';
import { geoApi } from '@/lib/api';

export interface Province {
  id: string;
  code: string;
  name: string;
  iso: string | null;
  country: string;
}

interface ProvinceComboboxProps {
  value: string;
  /** Devuelve el nombre (lo que guardan los formularios) y el id para acotar ciudades. */
  onChange: (name: string, province?: Province) => void;
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
  id?: string;
  'aria-label'?: string;
}

// Son 24 y no cambian: se traen una vez y se filtran en el cliente.
export function useProvinces() {
  return useQuery<Province[]>({
    queryKey: ['geo', 'provinces'],
    queryFn: () => geoApi.getProvinces().then((r) => r.data),
    staleTime: Infinity,
  });
}

const normalize = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function ProvinceCombobox({
  value, onChange, placeholder = 'Elegí una provincia', disabled, inputClassName, id,
  'aria-label': ariaLabel,
}: ProvinceComboboxProps) {
  const { data: provinces = [], isLoading } = useProvinces();
  const [query, setQuery] = useState('');

  const options: ComboboxOption[] = useMemo(() => {
    const q = normalize(query.trim());
    return provinces
      .filter((p) => !q || normalize(p.name).includes(q))
      .map((p) => ({ id: p.id, value: p.name }));
  }, [provinces, query]);

  return (
    <Combobox
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(name, option) =>
        onChange(name, provinces.find((p) => p.id === option?.id))
      }
      options={options}
      onQueryChange={setQuery}
      loading={isLoading}
      disabled={disabled}
      placeholder={placeholder}
      emptyLabel="Sin provincias que coincidan"
      inputClassName={inputClassName}
    />
  );
}
