'use client';

import { useEffect, useState } from 'react';
import { Fuel } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

/**
 * El precio del gasoil cambia todo el tiempo y es distinto para cada
 * transportista (surtidor, tarjeta, descuentos de flota). En vez de guardarlo
 * en el backend lo pedimos acá y lo recordamos en el navegador: el número es
 * suyo y no necesita viajar al servidor para que la cuenta sirva.
 */
const STORAGE_KEY = 'cargolink:fuel-price-per-liter';

interface Props {
  /** Ingresos de los viajes completados. */
  totalAmount: number;
  /** Litros cargados en esos viajes. */
  totalFuelLiters: number;
  /** km recorridos en esos viajes. */
  totalDistanceKm: number;
}

export default function FuelMarginCard({
  totalAmount,
  totalFuelLiters,
  totalDistanceKm,
}: Props) {
  const [fuelPrice, setFuelPrice] = useState<string>('');

  useEffect(() => {
    // localStorage no existe en el server render, así que se lee al montar.
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setFuelPrice(stored);
  }, []);

  const handleChange = (value: string) => {
    setFuelPrice(value);
    if (value === '') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
  };

  const price = Number(fuelPrice);
  const hasPrice = fuelPrice !== '' && Number.isFinite(price) && price > 0;
  const fuelCost = hasPrice ? totalFuelLiters * price : null;
  const margin = fuelCost != null ? totalAmount - fuelCost : null;
  const marginPerKm =
    margin != null && totalDistanceKm > 0 ? margin / totalDistanceKm : null;

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Margen estimado</p>
          <h3 className="mt-1.5 font-display text-[19px] leading-tight text-ink-900">
            Ingresos menos combustible
          </h3>
        </div>
        <div className="p-2.5 rounded-lg bg-primary-50 text-primary-700 shrink-0">
          <Fuel size={18} />
        </div>
      </div>

      <label className="block mt-4">
        <span className="text-[12.5px] text-ink-600">Precio del litro de gasoil</span>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-ink-500">$</span>
          <input
            type="number"
            min={0}
            step="1"
            inputMode="decimal"
            value={fuelPrice}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="1500"
            className="w-32 rounded-lg border border-ink-200 px-3 py-2 text-[14px] tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition"
          />
          <span className="text-[12px] text-ink-500">se guarda en este dispositivo</span>
        </div>
      </label>

      {margin == null ? (
        <p className="mt-4 text-[13px] text-ink-500">
          Cargá el precio del litro para ver cuánto te queda después del combustible.
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <dt className="eyebrow">Gasto en combustible</dt>
            <dd className="mt-1 font-mono text-[15px] tabular-nums text-ink-800">
              {formatCurrency(fuelCost as number)}
            </dd>
            <p className="text-[11.5px] text-ink-500">{totalFuelLiters} L cargados</p>
          </div>
          <div>
            <dt className="eyebrow">Te queda</dt>
            <dd
              className={
                margin >= 0
                  ? 'mt-1 font-mono text-[15px] tabular-nums text-success-700'
                  : 'mt-1 font-mono text-[15px] tabular-nums text-danger-600'
              }
            >
              {formatCurrency(margin)}
            </dd>
            <p className="text-[11.5px] text-ink-500">
              {marginPerKm != null
                ? `${formatCurrency(marginPerKm)} por km`
                : 'Sin km registrados'}
            </p>
          </div>
        </dl>
      )}
    </section>
  );
}
