'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { BODY_TYPES } from '@/lib/transporterProfile';
import { suggestedRequirements, type VehicleRequirements } from '@/lib/vehicleRequirements';
import type { BodyType } from '@/types';

interface Props {
  value: VehicleRequirements;
  onChange: (value: VehicleRequirements) => void;
  // Categoría elegida: sugiere la carrocería mientras el publicador no la
  // haya tocado a mano.
  cargoType?: string;
  // En edición se respeta lo guardado: no se pisa con la sugerencia.
  autoSuggest?: boolean;
  disabled?: boolean;
}

const BODY_OPTIONS: { value: BodyType | null; label: string; hint: string }[] = [
  { value: null, label: 'Cualquiera', hint: 'No importa el tipo de carrocería' },
  ...BODY_TYPES,
];

// Lo que la carga necesita del vehículo. El publicador no elige vehículos:
// describe su mercadería, y el tamaño se resuelve con el peso y el volumen.
export default function VehicleRequirementsFields({
  value,
  onChange,
  cargoType,
  autoSuggest = true,
  disabled,
}: Props) {
  const touched = useRef(false);
  const suggested = suggestedRequirements(cargoType).requiredBodyType;

  useEffect(() => {
    if (!autoSuggest || touched.current || !cargoType) return;
    if (value.requiredBodyType !== suggested) onChange({ ...value, requiredBodyType: suggested });
    // Solo reacciona al cambio de categoría.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargoType]);

  const change = (next: VehicleRequirements) => {
    touched.current = true;
    onChange(next);
  };

  const showSuggestedHint = autoSuggest && !touched.current && !!cargoType;

  return (
    <fieldset className="space-y-4 rounded-lg border border-gray-200 p-4" disabled={disabled}>
      <legend className="px-1 text-sm font-medium text-gray-700">Lo que necesita tu carga</legend>

      <div>
        <p className="text-sm text-gray-700 mb-2">
          Carrocería
          {showSuggestedHint && (
            <span className="ml-2 text-xs text-gray-500">sugerida según el tipo de carga, podés cambiarla</span>
          )}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Carrocería">
          {BODY_OPTIONS.map((option) => {
            const selected = value.requiredBodyType === option.value;
            return (
              <label
                key={option.value ?? 'ANY'}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition',
                  selected ? 'border-primary-600 bg-primary-50' : 'border-gray-200 hover:border-gray-300',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="radio"
                  name="requiredBodyType"
                  className="mt-0.5"
                  checked={selected}
                  onChange={() => change({ ...value, requiredBodyType: option.value })}
                />
                <span>
                  <span className="block text-sm font-medium text-gray-800">{option.label}</span>
                  <span className="block text-xs text-gray-500">{option.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={value.requiresRefrigeration}
            onChange={(e) => change({ ...value, requiresRefrigeration: e.target.checked })}
          />
          Necesita frío (vehículo refrigerado)
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={value.requiresHazmat}
            onChange={(e) => change({ ...value, requiresHazmat: e.target.checked })}
          />
          Es carga peligrosa
        </label>
      </div>

      <p className="text-gray-500 text-xs">
        No hace falta elegir el tamaño del vehículo: se calcula con el peso y el volumen de la carga.
      </p>
    </fieldset>
  );
}
