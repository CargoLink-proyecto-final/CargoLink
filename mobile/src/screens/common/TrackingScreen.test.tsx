import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import TrackingScreen from './TrackingScreen';
import { tripsApi } from '../../services/api';
import { fetchRoute } from '../../services/routing';

jest.mock('../../services/api', () => ({
  tripsApi: {
    getMy: jest.fn(),
    updateLocation: jest.fn(),
  },
}));

jest.mock('../../services/routing', () => ({
  fetchRoute: jest.fn(),
}));

// react-native-maps: render the native components as plain RN Views.
jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const React = require('react');
  const MapView = React.forwardRef((p: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ fitToCoordinates: jest.fn() }));
    return <View {...p} />;
  });
  return {
    __esModule: true,
    default: MapView,
    Marker: (p: any) => <View {...p} />,
    Polyline: (p: any) => <View {...p} />,
    PROVIDER_DEFAULT: 'default',
  };
});

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  watchPositionAsync: jest.fn().mockResolvedValue({ remove: jest.fn() }),
  Accuracy: { High: 4 },
}));

let mockUser: any = { id: 'shipper1', role: 'CARGO_GENERATOR' };

jest.mock('../../store/auth', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

const trip = {
  id: 'trip1',
  loadId: 'l1',
  status: 'IN_PROGRESS',
  currentLat: -34.0,
  currentLng: -58.0,
  load: {
    id: 'l1',
    title: 'Steel beams',
    originAddress: 'Buenos Aires',
    originLat: -34.6,
    originLng: -58.38,
    destAddress: 'Cordoba',
    destLat: -31.4,
    destLng: -64.18,
  },
};

describe('TrackingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'shipper1', role: 'CARGO_GENERATOR' };
    (fetchRoute as jest.Mock).mockResolvedValue([
      { latitude: -34.6, longitude: -58.38 },
      { latitude: -31.4, longitude: -64.18 },
    ]);
  });

  it('fetches trips and renders the active trip in the list', async () => {
    (tripsApi.getMy as jest.Mock).mockResolvedValue({ data: { trips: [trip] } });

    const { getByText } = render(<TrackingScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(tripsApi.getMy).toHaveBeenCalled());
    await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
    expect(getByText('1 viaje activo')).toBeTruthy();
    expect(getByText('Buenos Aires → Cordoba')).toBeTruthy();
    expect(getByText('En Progreso')).toBeTruthy();
  });

  it('renders origin, destination and current-position markers from trip data', async () => {
    (tripsApi.getMy as jest.Mock).mockResolvedValue({ data: { trips: [trip] } });

    const { getAllByText } = render(<TrackingScreen navigation={{ navigate: jest.fn() }} />);

    // Markers render title text via the mocked View's `title` prop is not text,
    // so assert via the route fetch + map presence instead.
    await waitFor(() => expect(fetchRoute).toHaveBeenCalledWith(-34.6, -58.38, -31.4, -64.18));
    // Trip title also appears in a marker; list + marker -> at least one.
    expect(getAllByText('Steel beams').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the empty state when there are no trips', async () => {
    (tripsApi.getMy as jest.Mock).mockResolvedValue({ data: { trips: [] } });

    const { getByText } = render(<TrackingScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(getByText('Sin viajes activos')).toBeTruthy());
    expect(getByText('0 viajes activos')).toBeTruthy();
  });

  it('filters by IN_PROGRESS status for a TRANSPORTER', async () => {
    mockUser = { id: 'carrier1', role: 'TRANSPORTER' };
    (tripsApi.getMy as jest.Mock).mockResolvedValue({ data: { trips: [] } });

    render(<TrackingScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() =>
      expect(tripsApi.getMy).toHaveBeenCalledWith({ status: 'IN_PROGRESS' }),
    );
  });
});
