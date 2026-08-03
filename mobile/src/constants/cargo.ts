// Espejo de `CARGO_TYPES` en frontend/src/app/loads/new/page.tsx. Mobile y web
// son apps separadas sin código compartido, así que la lista se duplica: si se
// agrega un tipo allá, hay que agregarlo acá.
export const CARGO_TYPES = [
  'Electrónica y tecnología',
  'Alimentos y bebidas',
  'Materiales de construcción',
  'Muebles y artículos del hogar',
  'Ropa y textiles',
  'Maquinaria e industria',
  'Mercadería general',
  'Otro',
] as const;

export type CargoType = (typeof CARGO_TYPES)[number];

// Form dinámico (P6): las dimensiones del bulto aplican a cargas en
// bultos/unidades. Para mercadería a granel (alimentos, materiales de
// construcción) el volumen total es la métrica representativa, así que esos
// campos no se muestran ni se envían.
const BULK_CARGO_TYPES = new Set<string>([
  'Alimentos y bebidas',
  'Materiales de construcción',
]);

export function showsPackageDetails(cargoType: string | undefined): boolean {
  return !!cargoType && cargoType !== 'Otro' && !BULK_CARGO_TYPES.has(cargoType);
}
