import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoadDetailScreen from './LoadDetailScreen';
import { loadsApi, tripsApi } from '../../services/api';

jest.mock('../../services/api', () => ({
  loadsApi: {
    getById: jest.fn(),
    cancel: jest.fn(),
  },
  tripsApi: {
    accept: jest.fn(),
    start: jest.fn(),
    complete: jest.fn(),
  },
}));

let mockUser: any = {
  id: 'carrier1',
  role: 'TRANSPORTER',
  firstName: 'Carl',
  lastName: 'Driver',
};

// Consumed as a selector: useAuthStore((s) => s.user)
jest.mock('../../store/auth', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

const baseLoad = {
  id: 'l1',
  shipperId: 'shipper1',
  shipper: { id: 'shipper1', firstName: 'Sam', lastName: 'Shipper', companyName: 'Acme' },
  title: 'Steel beams',
  description: 'Heavy steel beams',
  originAddress: 'Buenos Aires',
  originLat: -34.6,
  originLng: -58.38,
  destAddress: 'Cordoba',
  destLat: -31.4,
  destLng: -64.18,
  cargoType: 'GENERAL',
  weight: 1200,
  volume: 5,
  price: 50000,
  status: 'PUBLISHED',
  createdAt: '2026-01-01T00:00:00Z',
};

const makeRoute = () => ({ params: { id: 'l1' } });
const makeNav = () => ({ goBack: jest.fn(), navigate: jest.fn() });

describe('LoadDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'carrier1', role: 'TRANSPORTER', firstName: 'Carl', lastName: 'Driver' };
  });

  it('fetches the load by id and renders its details', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });

    const { getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
    expect(loadsApi.getById).toHaveBeenCalledWith('l1');
    expect(getByText('Buenos Aires')).toBeTruthy();
    expect(getByText('Cordoba')).toBeTruthy();
    expect(getByText('Sam Shipper')).toBeTruthy();
    expect(getByText('Acme')).toBeTruthy();
    expect(getByText('1200 kg')).toBeTruthy();
    // El badge muestra el stage unificado de la solicitud, no el enum crudo.
    expect(getByText('Creado')).toBeTruthy();
  });

  it('renders the package details, max budget and shipper industry', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({
      data: {
        ...baseLoad,
        maxBudget: 65000,
        packageCount: 12,
        heightCm: 120,
        widthCm: 80,
        lengthCm: 100,
        shipper: { ...baseLoad.shipper, industry: 'Agroindustria' },
      },
    });

    const { getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('12')).toBeTruthy());
    expect(getByText('120 × 80 × 100 cm')).toBeTruthy();
    expect(getByText('Presupuesto máx.')).toBeTruthy();
    expect(getByText('Rubro: Agroindustria')).toBeTruthy();
  });

  it('renders a dash for the dimensions that are missing', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({
      data: { ...baseLoad, heightCm: 120 },
    });

    const { getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('120 × — × — cm')).toBeTruthy());
  });

  it('omits the optional blocks when the load has no package data', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });

    const { queryByText, getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
    expect(queryByText('Bultos')).toBeNull();
    expect(queryByText('Dimensiones')).toBeNull();
    expect(queryByText('Presupuesto máx.')).toBeNull();
  });

  it('tells a transporter how many others are interested in a published load', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({
      data: { ...baseLoad, pendingPostulationsCount: 3 },
    });

    const { getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() =>
      expect(getByText('Hay 3 transportistas interesados en esta carga.')).toBeTruthy(),
    );
  });

  it('uses the singular wording for a single interested transporter', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({
      data: { ...baseLoad, pendingPostulationsCount: 1 },
    });

    const { getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() =>
      expect(getByText('Hay 1 transportista interesado en esta carga.')).toBeTruthy(),
    );
  });

  it('hides the interest banner from the shipper', async () => {
    mockUser = { id: 'shipper1', role: 'CARGO_GENERATOR' };
    (loadsApi.getById as jest.Mock).mockResolvedValue({
      data: { ...baseLoad, pendingPostulationsCount: 3 },
    });

    const { queryByText, getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
    expect(queryByText('Hay 3 transportistas interesados en esta carga.')).toBeNull();
  });

  it('shows "Carga no encontrada" when the load is missing', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({ data: null });

    const { getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('Carga no encontrada')).toBeTruthy());
  });

  it('lets a TRANSPORTER accept a PUBLISHED load', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });
    (tripsApi.accept as jest.Mock).mockResolvedValue({});
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const nav = makeNav();

    const { getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={nav} />,
    );

    await waitFor(() => expect(getByText('Aceptar Carga')).toBeTruthy());
    fireEvent.press(getByText('Aceptar Carga'));

    await waitFor(() => expect(tripsApi.accept).toHaveBeenCalledWith('l1'));
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    expect(alertSpy).toHaveBeenCalledWith('Éxito', '¡Carga aceptada!');

    alertSpy.mockRestore();
  });

  it('does not show the accept button for a CARGO_GENERATOR', async () => {
    mockUser = { id: 'shipper1', role: 'CARGO_GENERATOR' };
    (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });

    const { queryByText, getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
    expect(queryByText('Aceptar Carga')).toBeNull();
    // Owner of a PUBLISHED load sees the cancel button instead.
    expect(getByText('Cancelar Carga')).toBeTruthy();
  });
});
