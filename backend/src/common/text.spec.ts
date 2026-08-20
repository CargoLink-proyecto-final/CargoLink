import { normalizeSearchText } from './text';

describe('normalizeSearchText', () => {
  it.each([
    ['Córdoba', 'cordoba'],
    ['CÓRDOBA', 'cordoba'],
    ['cordoba', 'cordoba'],
    ['Río Cuarto', 'rio cuarto'],
    ['Cañuelas', 'canuelas'],
    ['Ushuaia', 'ushuaia'],
  ])('normaliza %p a %p', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });

  // El snapshot del padrón traía 53 localidades con un soft-hyphen incrustado
  // por un mal decode de origen. El dato ya se corrigió, pero el strip se queda
  // como defensa: es invisible al leer, así que un nombre que lo tenga no
  // aparece ni escribiéndolo exacto, y nadie se daría cuenta de por qué.
  it('descarta el soft-hyphen aunque el texto se lea idéntico', () => {
    expect(normalizeSearchText('Junín')).toBe('junin');
    expect(normalizeSearchText('Jun\u00ed\u00adn')).toBe('junin');
  });

  it('descarta el resto de los caracteres invisibles', () => {
    expect(normalizeSearchText('\ufeffPilar\u200b')).toBe('pilar');
  });

  it('colapsa espacios repetidos y recorta los de los bordes', () => {
    expect(normalizeSearchText('  Villa   Maria  ')).toBe('villa maria');
  });

  it('deja vacío un texto que es solo espacios', () => {
    expect(normalizeSearchText('   ')).toBe('');
  });

  // Idempotencia: `cities.search_name` guarda la salida de esta función y el
  // seed la vuelve a aplicar en cada arranque para detectar divergencias.
  it('es idempotente', () => {
    const once = normalizeSearchText('Coronel Mart\u00ed\u00adnez de Hoz');
    expect(normalizeSearchText(once)).toBe(once);
  });
});
