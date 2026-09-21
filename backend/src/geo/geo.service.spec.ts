import { Test, TestingModule } from '@nestjs/testing';
import { GeoService } from './geo.service';
import { PrismaService } from '../prisma/prisma.service';

describe('GeoService', () => {
  let service: GeoService;
  let prisma: {
    province: { findMany: jest.Mock };
    city: { findMany: jest.Mock };
  };

  const city = {
    id: 'city-1',
    code: '06638040',
    name: 'Pilar',
    department: 'Pilar',
    lat: -34.45,
    lng: -58.91,
    province: { id: 'prov-1', name: 'Buenos Aires' },
  };

  beforeEach(async () => {
    prisma = {
      province: { findMany: jest.fn().mockResolvedValue([]) },
      city: { findMany: jest.fn().mockResolvedValue([city]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GeoService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<GeoService>(GeoService);
  });

  describe('findProvinces', () => {
    it('returns provinces sorted by name', async () => {
      await service.findProvinces();
      expect(prisma.province.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });
  });

  describe('searchCities', () => {
    it('flattens the province relation into provinceId/provinceName', async () => {
      const result = await service.searchCities({});
      expect(result).toEqual([
        {
          id: 'city-1',
          code: '06638040',
          name: 'Pilar',
          department: 'Pilar',
          lat: -34.45,
          lng: -58.91,
          provinceId: 'prov-1',
          provinceName: 'Buenos Aires',
        },
      ]);
    });

    it('scopes by province and looks for the prefix first', async () => {
      await service.searchCities({ provinceId: 'prov-1', q: 'pil' });
      expect(prisma.city.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { provinceId: 'prov-1', searchName: { startsWith: 'pil' } },
        }),
      );
    });

    // El motivo de existir de `searchName`: ILIKE ignora mayúsculas pero no
    // acentos, así que "CÓRDOBA", "cordoba" y "Córdoba" tienen que caer todos
    // en la misma búsqueda.
    it.each([['cordoba'], ['Córdoba'], ['CÓRDOBA'], ['  córdoba  ']])(
      'normalizes %p before hitting the database',
      async (q) => {
        await service.searchCities({ q });
        expect(prisma.city.findMany).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ where: { searchName: { startsWith: 'cordoba' } } }),
        );
      },
    );

    it('treats a query of only whitespace as no query at all', async () => {
      await service.searchCities({ q: '   ' });
      expect(prisma.city.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.city.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('falls back to mid-name matches only to fill the remaining slots', async () => {
      prisma.city.findMany
        .mockResolvedValueOnce([city])
        .mockResolvedValueOnce([{ ...city, id: 'city-2', name: 'Barrio El Cepillo' }]);

      const result = await service.searchCities({ q: 'pil' });

      expect(prisma.city.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            searchName: { contains: 'pil' },
            id: { notIn: ['city-1'] },
          },
          take: 49,
        }),
      );
      // El prefijo manda: Pilar antes que Barrio El Cepillo.
      expect(result.map((c) => c.name)).toEqual(['Pilar', 'Barrio El Cepillo']);
    });

    it('skips the second query when the prefix already fills the page', async () => {
      prisma.city.findMany.mockResolvedValueOnce(
        Array.from({ length: 50 }, (_, i) => ({ ...city, id: `city-${i}` })),
      );
      await service.searchCities({ q: 'pil' });
      expect(prisma.city.findMany).toHaveBeenCalledTimes(1);
    });

    it('does not filter when no province or query is given', async () => {
      await service.searchCities({});
      expect(prisma.city.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('caps the page size even when a larger limit is requested', async () => {
      await service.searchCities({ limit: 5000 });
      expect(prisma.city.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });
  });
});
