import { normalizeSearchText } from './text';

describe('normalizeSearchText', () => {
  it.each([
    ['Córdoba', 'cordoba'],
    ['CÓRDOBA', 'cordoba'],
    ['cordoba', 'cordoba'],
    ['Río Cuarto', 'rio cuarto'],
    ['Cañuelas', 'canuelas'],
  ])('normaliza %p a %p', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });

  // Espejo de backend/src/common/text.spec.ts: si estas dos funciones divergen,
  // el filtrado local de los combos deja de coincidir con el del server.
  it('descarta los caracteres invisibles aunque el texto se lea idéntico', () => {
    expect(normalizeSearchText('Jun\u00ed\u00adn')).toBe('junin');
    expect(normalizeSearchText('\ufeffPilar\u200b')).toBe('pilar');
  });

  it('colapsa espacios repetidos y recorta los de los bordes', () => {
    expect(normalizeSearchText('  Villa   Maria  ')).toBe('villa maria');
  });

  it('deja vacío un texto que es solo espacios', () => {
    expect(normalizeSearchText('   ')).toBe('');
  });
});
