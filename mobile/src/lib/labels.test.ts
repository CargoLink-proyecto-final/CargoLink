import {
  getRoleLabel,
  getSolicitudStage,
  getSolicitudStageColor,
  getSolicitudStageLabel,
  getStatusLabel,
} from './labels';

describe('getSolicitudStage', () => {
  it.each([
    ['PUBLISHED', 'CREATED'],
    ['ASSIGNED', 'ASSIGNED'],
    ['IN_TRANSIT', 'STARTED'],
    ['DELIVERED', 'COMPLETED'],
    ['CANCELLED', 'CANCELLED'],
  ])('maps the LoadStatus %s to %s', (status, stage) => {
    expect(getSolicitudStage(status)).toBe(stage);
  });

  it.each([
    ['PENDING', 'CREATED'],
    ['ACCEPTED', 'ASSIGNED'],
    ['IN_PROGRESS', 'STARTED'],
    ['COMPLETED', 'COMPLETED'],
  ])('maps the TripStatus %s to %s', (status, stage) => {
    expect(getSolicitudStage(status)).toBe(stage);
  });

  it('returns null for a status outside the load/trip cycle', () => {
    expect(getSolicitudStage('WITHDRAWN')).toBeNull();
  });
});

describe('getSolicitudStageLabel', () => {
  it('labels the unified stage in Spanish', () => {
    expect(getSolicitudStageLabel('IN_TRANSIT')).toBe('Iniciado');
    expect(getSolicitudStageLabel('DELIVERED')).toBe('Completado');
  });

  it('falls back to the plain status label outside the cycle', () => {
    // WITHDRAWN sólo existe en PostulationStatus: no tiene stage de solicitud.
    expect(getSolicitudStageLabel('WITHDRAWN')).toBe('Retirada');
  });

  it('returns the raw value for an unknown status', () => {
    expect(getSolicitudStageLabel('SOMETHING_ELSE')).toBe('SOMETHING_ELSE');
  });
});

describe('getSolicitudStageColor', () => {
  it('gives the same colour to a load and a trip in the same stage', () => {
    expect(getSolicitudStageColor('IN_TRANSIT')).toBe(getSolicitudStageColor('IN_PROGRESS'));
    expect(getSolicitudStageColor('DELIVERED')).toBe(getSolicitudStageColor('COMPLETED'));
  });

  it('falls back to grey outside the cycle', () => {
    expect(getSolicitudStageColor('WITHDRAWN')).toBe('#6b7280');
  });
});

describe('getStatusLabel', () => {
  it('translates postulation statuses', () => {
    expect(getStatusLabel('NEGOTIATING')).toBe('En negociación');
    expect(getStatusLabel('REJECTED')).toBe('Rechazada');
  });

  it('returns the raw value when unmapped', () => {
    expect(getStatusLabel('NOPE')).toBe('NOPE');
  });
});

describe('getRoleLabel', () => {
  it('uses the product wording for each role', () => {
    expect(getRoleLabel('CARGO_GENERATOR')).toBe('Publicador de carga');
    expect(getRoleLabel('TRANSPORTER')).toBe('Transportista');
    expect(getRoleLabel('COMPANY_ADMIN')).toBe('Administrador de empresa');
  });

  it('returns the raw value for an unknown role', () => {
    expect(getRoleLabel('GHOST')).toBe('GHOST');
  });
});
