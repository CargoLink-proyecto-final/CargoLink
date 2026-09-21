import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeSearchText } from '../common/text';

// Tope de resultados por búsqueda: el padrón tiene 4.027 localidades y el
// combo del front las consume con type-ahead, no necesita el listado entero.
const CITY_SEARCH_LIMIT = 50;

@Injectable()
export class GeoService {
  constructor(private prisma: PrismaService) {}

  findProvinces() {
    return this.prisma.province.findMany({
      select: { id: true, code: true, name: true, iso: true, country: true },
      orderBy: { name: 'asc' },
    });
  }

  async searchCities(params: { provinceId?: string; q?: string; limit?: number }) {
    const take = Math.min(params.limit ?? CITY_SEARCH_LIMIT, CITY_SEARCH_LIMIT);
    // Se compara normalizado contra `searchName`, no contra `name`: el ILIKE que
    // genera `mode: 'insensitive'` ignora mayúsculas pero no acentos, y quien
    // escribe "cordoba" espera Córdoba.
    const q = params.q ? normalizeSearchText(params.q) : undefined;
    const scope = params.provinceId ? { provinceId: params.provinceId } : {};

    const query = (where: Prisma.CityWhereInput, limit: number) =>
      this.prisma.city.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          department: true,
          postalCode: true,
          lat: true,
          lng: true,
          province: { select: { id: true, name: true, country: true } },
        },
        orderBy: [{ name: 'asc' }],
        take: limit,
      });

    if (!q) {
      return this.shape(await query(scope, take));
    }

    // Relevancia para el type-ahead: "pil" tiene que traer Pilar antes que
    // "Barrio El Cepillo". Se resuelve en dos pasadas — prefijo primero, y solo
    // si sobra lugar se completa con coincidencias en el medio del nombre.
    const prefix = await query({ ...scope, searchName: { startsWith: q } }, take);
    if (prefix.length >= take) return this.shape(prefix);

    const rest = await query(
      {
        ...scope,
        searchName: { contains: q },
        id: { notIn: prefix.map((city) => city.id) },
      },
      take - prefix.length,
    );

    return this.shape([...prefix, ...rest]);
  }

  private shape<T extends { province: { id: string; name: string; country: string } }>(
    cities: T[],
  ) {
    return cities.map(({ province, ...city }) => ({
      ...city,
      provinceId: province.id,
      provinceName: province.name,
      country: province.country,
    }));
  }
}
