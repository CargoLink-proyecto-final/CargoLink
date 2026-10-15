import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import CarrierDashboard from './DashboardScreen';
import { tripsApi, transporterProfileApi } from '../../services/api';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('../../services/api', () => ({
  tripsApi: {
    getMy: jest.fn(),
  },
  transporterProfileApi: {
    getStatus: jest.fn(),
  },
}));

const mockedTripsApi = tripsApi as jest.Mocked<typeof tripsApi>;
const mockedTransporterProfileApi = transporterProfileApi as jest.Mocked<typeof transporterProfileApi>;

const makeTrip = (over: Partial<any> = {}) => ({
  id: 'trip-1',
  loadId: 'load-1',
  carrierId: 'c1',
  status: 'ACCEPTED',
  createdAt: '2024-02-01',
  load: {
    title: 'Cemento a Rosario',
    originAddress: 'Buenos Aires',
    destAddress: 'Rosario',
    shipper: { firstName: 'Ana', lastName: 'Diaz' },
  },
  ...over,
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockedTransporterProfileApi.getStatus.mockResolvedValue({
    data: profileStatus('APPROVED'),
  } as any);
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

const profileStatus = (state: string, missing: string[] = []) => ({
  complete: state !== 'INCOMPLETE',
  approved: state === 'APPROVED',
  state,
  missing,
  pendingReview: [],
  rejected: [],
});

describe('CarrierDashboard', () => {
  it('fetches the carrier trips on mount and renders them', async () => {
    mockedTripsApi.getMy.mockResolvedValue({ data: { trips: [makeTrip()] } } as any);

    render(<CarrierDashboard navigation={navigation} />);

    await waitFor(() => expect(mockedTripsApi.getMy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Cemento a Rosario')).toBeTruthy();
    expect(screen.getByText('Buenos Aires → Rosario')).toBeTruthy();
    expect(screen.getByText('Publicador de carga: Ana Diaz')).toBeTruthy();
  });

  it('computes trip stat counters by status', async () => {
    mockedTripsApi.getMy.mockResolvedValue({
      data: {
        trips: [
          makeTrip({ id: 'a', status: 'IN_PROGRESS' }),
          makeTrip({ id: 'b', status: 'ACCEPTED' }),
          makeTrip({ id: 'c', status: 'COMPLETED' }),
        ],
      },
    } as any);

    render(<CarrierDashboard navigation={navigation} />);

    // Total = 3
    expect(await screen.findByText('3')).toBeTruthy();
    expect(screen.getByText('Activos')).toBeTruthy();
    expect(screen.getByText('Aceptados')).toBeTruthy();
    expect(screen.getByText('Completados')).toBeTruthy();
  });

  it('navigates to LoadDetail with the trip loadId when a card is pressed', async () => {
    mockedTripsApi.getMy.mockResolvedValue({
      data: { trips: [makeTrip({ loadId: 'load-42' })] },
    } as any);

    render(<CarrierDashboard navigation={navigation} />);

    fireEvent.press(await screen.findByText('Cemento a Rosario'));
    expect(navigation.navigate).toHaveBeenCalledWith('LoadDetail', { id: 'load-42' });
  });

  it('renders the empty state when there are no trips', async () => {
    mockedTripsApi.getMy.mockResolvedValue({ data: { trips: [] } } as any);

    render(<CarrierDashboard navigation={navigation} />);

    expect(await screen.findByText(/Aún no hay viajes/)).toBeTruthy();
  });

  it('does not crash when the fetch rejects', async () => {
    mockedTripsApi.getMy.mockRejectedValue(new Error('network'));

    render(<CarrierDashboard navigation={navigation} />);

    await waitFor(() => expect(mockedTripsApi.getMy).toHaveBeenCalled());
    expect(screen.getByText('Mis Viajes')).toBeTruthy();
  });

  it('shows a banner prompting to complete the profile when it is incomplete', async () => {
    mockedTripsApi.getMy.mockResolvedValue({ data: { trips: [] } } as any);
    mockedTransporterProfileApi.getStatus.mockResolvedValue({
      data: profileStatus('INCOMPLETE', ['vehicle']),
    } as any);

    render(<CarrierDashboard navigation={navigation} />);

    expect(await screen.findByText('Completá tu perfil')).toBeTruthy();
    fireEvent.press(screen.getByText('Completá tu perfil'));
    expect(navigation.navigate).toHaveBeenCalledWith('CompleteProfile');
  });

  it('tells the carrier the documents are under review', async () => {
    mockedTripsApi.getMy.mockResolvedValue({ data: { trips: [] } } as any);
    mockedTransporterProfileApi.getStatus.mockResolvedValue({ data: profileStatus('PENDING_REVIEW') } as any);

    render(<CarrierDashboard navigation={navigation} />);

    expect(await screen.findByText('Documentación en revisión')).toBeTruthy();
    expect(screen.queryByText('Completá tu perfil')).toBeNull();
  });

  it('hides the profile banner once the profile is approved', async () => {
    mockedTripsApi.getMy.mockResolvedValue({ data: { trips: [] } } as any);

    render(<CarrierDashboard navigation={navigation} />);

    await waitFor(() => expect(mockedTransporterProfileApi.getStatus).toHaveBeenCalled());
    expect(screen.queryByText('Completá tu perfil')).toBeNull();
  });
});
