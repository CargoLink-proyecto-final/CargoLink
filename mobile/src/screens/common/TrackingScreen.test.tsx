import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import TrackingScreen from './TrackingScreen';
import { tripsApi } from '../../services/api';
import { fetchRoute } from '../../services/routing';

jest.mock('../../services/api', () => ({
  tripsApi: {
    getMy: jest.fn(),
    getMyLoads: jest.fn(),
    updateLocation: jest.fn(),
  },
}));

jest.mock('../../services/routing', () => ({
  fetchRoute: jest.fn(),
}));

// MapLibre: render the native components as plain RN Views. El nombre de
// `mockFitBounds` tiene que empezar con "mock" para que jest lo deje usar
// adentro del factory (que se hoistea arriba de las declaraciones).
const mockFitBounds = jest.fn();

jest.mock('@maplibre/maplibre-react-native', () => {
  const { View } = require('react-native');
  const React = require('react');
  const Camera = React.forwardRef((p: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ fitBounds: mockFitBounds }));
    return <View {...p} />;
  });
  return {
    __esModule: true,
    Map: (p: any) => <View {...p} />,
    Camera,
    Marker: (p: any) => <View {...p} />,
    GeoJSONSource: (p: any) => <View {...p} />,
    Layer: (p: any) => <View {...p} />,
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
    (tripsApi.getMy as jest.Mock).mockResolvedValue({ data: { trips: [] } });
    (tripsApi.getMyLoads as jest.Mock).mockResolvedValue({ data: { trips: [] } });
    (fetchRoute as jest.Mock).mockResolvedValue([
      { latitude: -34.6, longitude: -58.38 },
      { latitude: -31.4, longitude: -64.18 },
    ]);
  });

  it('fetches trips and renders the active trip in the list', async () => {
    (tripsApi.getMyLoads as jest.Mock).mockResolvedValue({ data: { trips: [trip] } });

    const { getByText } = render(<TrackingScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(tripsApi.getMyLoads).toHaveBeenCalled());
    await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
    expect(getByText('1 viaje activo')).toBeTruthy();
    expect(getByText('Buenos Aires → Cordoba')).toBeTruthy();
    expect(getByText('En Progreso')).toBeTruthy();
  });

  it('renders origin, destination and current-position markers from trip data', async () => {
    (tripsApi.getMyLoads as jest.Mock).mockResolvedValue({ data: { trips: [trip] } });

    const { getAllByText } = render(<TrackingScreen navigation={{ navigate: jest.fn() }} />);

    // Los marcadores de MapLibre renderizan una vista propia sin texto, así que
    // se asserta el pedido de ruta y la presencia del viaje en pantalla.
    await waitFor(() => expect(fetchRoute).toHaveBeenCalledWith(-34.6, -58.38, -31.4, -64.18));
    expect(getAllByText('Steel beams').length).toBeGreaterThanOrEqual(1);
  });

  // La cámara tiene que encuadrar los tres puntos del viaje: origen, destino y
  // la última posición del conductor. Con react-native-maps esto era
  // `fitToCoordinates`; MapLibre pide la caja ya calculada.
  it('encuadra la cámara sobre origen, destino y posición actual', async () => {
    (tripsApi.getMyLoads as jest.Mock).mockResolvedValue({ data: { trips: [trip] } });

    render(<TrackingScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(mockFitBounds).toHaveBeenCalled());
    expect(mockFitBounds).toHaveBeenCalledWith(
      // [west, south, east, north]
      [-64.18, -34.6, -58.0, -31.4],
      expect.objectContaining({ padding: { top: 50, right: 50, bottom: 50, left: 50 } }),
    );
  });

  it('no mueve la cámara cuando no hay viajes activos', async () => {
    (tripsApi.getMyLoads as jest.Mock).mockResolvedValue({ data: { trips: [] } });

    const { getByText } = render(<TrackingScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(getByText('Sin viajes activos')).toBeTruthy());
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it('shows the empty state when there are no trips', async () => {
    (tripsApi.getMyLoads as jest.Mock).mockResolvedValue({ data: { trips: [] } });

    const { getByText } = render(<TrackingScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(getByText('Sin viajes activos')).toBeTruthy());
    expect(getByText('0 viajes activos')).toBeTruthy();
  });

  it('filters by IN_PROGRESS status for a TRANSPORTER', async () => {
    mockUser = { id: 'carrier1', role: 'TRANSPORTER' };

    render(<TrackingScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() =>
      expect(tripsApi.getMy).toHaveBeenCalledWith({ status: 'IN_PROGRESS' }),
    );
    expect(tripsApi.getMyLoads).not.toHaveBeenCalled();
  });

  // Los viajes propios están partidos por rol en el backend: `GET /trips/my` es
  // TRANSPORTER-only y `GET /trips/my-loads` CARGO_GENERATOR-only. Llamar el que
  // no corresponde devuelve 403 y deja la pantalla muda.
  it('uses the shipper-only endpoint for a CARGO_GENERATOR', async () => {
    render(<TrackingScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(tripsApi.getMyLoads).toHaveBeenCalled());
    expect(tripsApi.getMy).not.toHaveBeenCalled();
  });

  it('filters by IN_PROGRESS for the shipper too', async () => {
    // Sin el filtro entrarían viajes COMPLETED/CANCELLED, que la pantalla
    // contaría como activos y dibujaría con la última posición del conductor.
    render(<TrackingScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() =>
      expect(tripsApi.getMyLoads).toHaveBeenCalledWith({ status: 'IN_PROGRESS' }),
    );
  });
});
