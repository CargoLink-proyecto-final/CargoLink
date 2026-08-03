import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import ShipperDashboard from './DashboardScreen';
import { loadsApi } from '../../services/api';
import { formatCurrency } from '../../lib/labels';

jest.mock('../../services/api', () => ({
  loadsApi: {
    getMy: jest.fn(),
  },
}));

const mockedLoadsApi = loadsApi as jest.Mocked<typeof loadsApi>;

const makeLoad = (over: Partial<any> = {}) => ({
  id: 'load-1',
  shipperId: 's1',
  shipper: { id: 's1', firstName: 'Ana', lastName: 'Diaz' },
  title: 'Electrónica a Córdoba',
  originAddress: 'Buenos Aires',
  destAddress: 'Córdoba',
  cargoType: 'Electrónica',
  weight: 5000,
  price: 150000,
  status: 'PUBLISHED',
  pickupDate: '2024-03-01',
  createdAt: '2024-02-01',
  originLat: 0,
  originLng: 0,
  destLat: 0,
  destLng: 0,
  ...over,
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('ShipperDashboard', () => {
  it('fetches the shipper loads on mount and renders them', async () => {
    mockedLoadsApi.getMy.mockResolvedValue({ data: { loads: [makeLoad()] } } as any);

    render(<ShipperDashboard navigation={navigation} />);

    await waitFor(() => {
      expect(mockedLoadsApi.getMy).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Electrónica a Córdoba')).toBeTruthy();
    expect(screen.getByText('Buenos Aires → Córdoba')).toBeTruthy();
    expect(screen.getByText(formatCurrency(150000))).toBeTruthy();
    expect(screen.getByText('5000 kg')).toBeTruthy();
    // Stage unificado en vez del enum crudo.
    expect(screen.getByText('Creado')).toBeTruthy();
  });

  it('adds up the pending postulations across every load', async () => {
    mockedLoadsApi.getMy.mockResolvedValue({
      data: {
        loads: [
          makeLoad({ id: 'a', pendingPostulationsCount: 2 }),
          makeLoad({ id: 'b', pendingPostulationsCount: 3 }),
          makeLoad({ id: 'c' }),
        ],
      },
    } as any);

    render(<ShipperDashboard navigation={navigation} />);

    expect(
      await screen.findByText('Tenés 5 postulaciones esperando respuesta.'),
    ).toBeTruthy();
  });

  it('uses the singular wording for a single pending postulation', async () => {
    mockedLoadsApi.getMy.mockResolvedValue({
      data: { loads: [makeLoad({ pendingPostulationsCount: 1 })] },
    } as any);

    render(<ShipperDashboard navigation={navigation} />);

    expect(await screen.findByText('Tenés 1 postulación esperando respuesta.')).toBeTruthy();
  });

  it('hides the banner when nothing is pending', async () => {
    mockedLoadsApi.getMy.mockResolvedValue({ data: { loads: [makeLoad()] } } as any);

    render(<ShipperDashboard navigation={navigation} />);

    await screen.findByText('Electrónica a Córdoba');
    expect(screen.queryByText(/esperando respuesta/)).toBeNull();
  });

  it('computes stat counters by load status', async () => {
    mockedLoadsApi.getMy.mockResolvedValue({
      data: {
        loads: [
          makeLoad({ id: 'a', status: 'PUBLISHED' }),
          makeLoad({ id: 'b', status: 'PUBLISHED' }),
          makeLoad({ id: 'c', status: 'IN_TRANSIT' }),
          makeLoad({ id: 'd', status: 'DELIVERED' }),
        ],
      },
    } as any);

    render(<ShipperDashboard navigation={navigation} />);

    // Total = 4
    expect(await screen.findByText('4')).toBeTruthy();
    // Publicadas stat label exists alongside its value 2
    expect(screen.getByText('Publicadas')).toBeTruthy();
    expect(screen.getByText('En Tránsito')).toBeTruthy();
    expect(screen.getByText('Entregadas')).toBeTruthy();
  });

  it('navigates to LoadDetail when a card is pressed', async () => {
    mockedLoadsApi.getMy.mockResolvedValue({
      data: { loads: [makeLoad({ id: 'load-99' })] },
    } as any);

    render(<ShipperDashboard navigation={navigation} />);

    const card = await screen.findByText('Electrónica a Córdoba');
    fireEvent.press(card);

    expect(navigation.navigate).toHaveBeenCalledWith('LoadDetail', { id: 'load-99' });
  });

  it('renders the empty state when there are no loads', async () => {
    mockedLoadsApi.getMy.mockResolvedValue({ data: { loads: [] } } as any);

    render(<ShipperDashboard navigation={navigation} />);

    expect(await screen.findByText(/Aún no hay cargas/)).toBeTruthy();
  });

  it('tolerates a missing loads array in the response', async () => {
    mockedLoadsApi.getMy.mockResolvedValue({ data: {} } as any);

    render(<ShipperDashboard navigation={navigation} />);

    expect(await screen.findByText(/Aún no hay cargas/)).toBeTruthy();
  });

  it('does not crash when the fetch rejects', async () => {
    mockedLoadsApi.getMy.mockRejectedValue(new Error('network'));

    render(<ShipperDashboard navigation={navigation} />);

    await waitFor(() => expect(mockedLoadsApi.getMy).toHaveBeenCalled());
    expect(screen.getByText('Mis Cargas')).toBeTruthy();
  });
});
