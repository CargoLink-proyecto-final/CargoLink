'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Combobox, { ComboboxOption } from '@/components/ui/Combobox';
import { geoApi } from '@/lib/api';
import { normalizeSearchText } from '@/lib/text';

export interface City {
  id: string;
  code: string;
  name: string;
  department: string | null;
  /** CPA orientativo: null cuando el padrón no tiene uno confiable. */
  postalCode: string | null;
  lat: number;
  lng: number;
  provinceId: string;
  provinceName: string;
  country: string;
}

interface CityComboboxProps {
  value: string;
  /** Id de la ciudad elegida — desambigua la marca entre homónimos. */
  selectedId?: string;
  onChange: (name: string, city?: City) => void;
  /** Si viene, la búsqueda se limita a esa provincia. */
  provinceId?: string;
  /**
   * Lista cerrada de ciudades. Cuando viene, no se consulta el padrón completo:
   * el filtro de cargas la usa para ofrecer solo ciudades con resultados.
   */
  cities?: City[];
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
  id?: string;
  'aria-label'?: string;
}

export default function CityCombobox({
  value, selectedId, onChange, provinceId, cities: fixedCities, placeholder = 'Escribí para buscar…',
  disabled, inputClassName, id, 'aria-label': ariaLabel,
}: CityComboboxProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // El padrón tiene 4.027 localidades: se busca en el server, nunca se baja entero.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: searched = [], isFetching } = useQuery<City[]>({
    queryKey: ['geo', 'cities', provinceId ?? '', debouncedQuery],
    queryFn: () =>
      geoApi.searchCities({ provinceId, q: debouncedQuery || undefined }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: !fixedCities,
  });

  // Con lista cerrada el filtrado es local: son pocas y ya están en memoria.
  const cities = useMemo(() => {
    if (!fixedCities) return searched;
    const q = normalizeSearchText(debouncedQuery);
    if (!q) return fixedCities;
    return fixedCities.filter((city) => normalizeSearchText(city.name).includes(q));
  }, [fixedCities, searched, debouncedQuery]);

  const options: ComboboxOption[] = useMemo(
    () =>
      cities.map((city) => ({
        id: city.id,
        value: city.name,
        // Sin esto no se distinguen los homónimos: hay tres "Pilar" en el país.
        hint: [city.department, city.provinceName].filter(Boolean).join(', '),
      })),
    [cities],
  );

  return (
    <Combobox
      id={id}
      aria-label={ariaLabel}
      value={value}
      selectedId={selectedId}
      onChange={(name, option) => onChange(name, cities.find((c) => c.id === option?.id))}
      options={options}
      onQueryChange={setQuery}
      loading={isFetching && !fixedCities}
      disabled={disabled}
      placeholder={placeholder}
      emptyLabel="Sin ciudades que coincidan"
      inputClassName={inputClassName}
    />
  );
}
