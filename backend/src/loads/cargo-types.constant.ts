// Taxonomía fija de categorías de carga. Debe reflejar exactamente las
// opciones del <select> del wizard de creación de carga en el frontend
// (frontend/src/app/loads/new/page.tsx y frontend/src/app/loads/page.tsx).
// Si agregás una categoría, actualizá las tres listas.
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
