import { boundsFor } from './bounds';

describe('boundsFor', () => {
  it('devuelve null sin puntos', () => {
    expect(boundsFor([])).toBeNull();
  });

  it('arma la caja [west, south, east, north] con todos los puntos adentro', () => {
    const bounds = boundsFor([
      { latitude: -34.6, longitude: -58.38 }, // Buenos Aires
      { latitude: -31.4, longitude: -64.18 }, // Córdoba
      { latitude: -33.0, longitude: -60.0 }, // Rosario
    ]);

    expect(bounds).toEqual([-64.18, -34.6, -58.38, -31.4]);
  });

  // Un viaje que todavía no arrancó tiene origen == posición actual: la caja
  // queda de área cero y `fitBounds` deja la cámara en un zoom absurdo.
  it('infla la caja cuando todos los puntos son el mismo', () => {
    const bounds = boundsFor(
      [
        { latitude: -34.6, longitude: -58.38 },
        { latitude: -34.6, longitude: -58.38 },
      ],
      0.02,
    );

    expect(bounds).not.toBeNull();
    const [west, south, east, north] = bounds!;
    expect(east - west).toBeCloseTo(0.02);
    expect(north - south).toBeCloseTo(0.02);
    // Sigue centrada en el punto.
    expect((east + west) / 2).toBeCloseTo(-58.38);
    expect((north + south) / 2).toBeCloseTo(-34.6);
  });

  // Un viaje de largo recorrido puede ser ancho y casi plano (o al revés): sólo
  // hay que inflar el eje degenerado, no el que ya tiene extensión.
  it('infla sólo el eje que quedó corto', () => {
    const bounds = boundsFor(
      [
        { latitude: -34.6, longitude: -58.0 },
        { latitude: -34.6, longitude: -64.0 },
      ],
      0.02,
    );

    const [west, south, east, north] = bounds!;
    expect(west).toBe(-64.0);
    expect(east).toBe(-58.0);
    expect(north - south).toBeCloseTo(0.02);
  });
});
