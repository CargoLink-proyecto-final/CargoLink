/**
 * Normalización para búsquedas tolerantes (type-ahead de ciudades/provincias).
 * Deja el texto comparable sin importar mayúsculas, acentos ni basura invisible:
 * escribir "cordoba" tiene que encontrar "Córdoba".
 *
 * Los tres pasos, en orden:
 * 1. NFD + strip de combining marks — descompone "ó" en "o" + tilde y tira la
 *    tilde. Alcanza también a la "ñ", que queda "n": es intencional, quien
 *    escribe "canuelas" espera Cañuelas.
 * 2. Strip de caracteres de formato invisibles (soft-hyphen, zero-width, BOM).
 *    El snapshot del padrón traía 53 localidades con un U+00AD incrustado por un
 *    mal decode de origen — se leían bien pero no matcheaban ni escribiendo el
 *    nombre exacto. Ese dato ya se corrigió en `argentina-geo.json`, pero el
 *    strip se queda: cuesta nada y cubre lo que pegue el usuario en el input.
 * 3. Lowercase + colapso de espacios repetidos.
 *
 * Es la fuente de verdad de `cities.search_name`: el mismo texto que guarda el
 * seed es el que se compara contra el input del usuario. El equivalente del
 * front vive en `frontend/src/lib/text.ts` — si cambia uno, cambian los dos.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
