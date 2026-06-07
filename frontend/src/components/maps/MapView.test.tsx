import { render, act } from '@testing-library/react';

// These components use IMPERATIVE Leaflet (import L from 'leaflet'), NOT
// react-leaflet — there is no JSX from leaflet to assert on. So we mock the
// `leaflet` module with a chainable fake `L` and spy on the calls the
// component makes (L.map, L.marker, L.polyline, L.tileLayer, ...). Assertions
// are about *what the component asked Leaflet to do*, which is the only
// observable behavior under jsdom.

// --- Mock factory state, queryable from tests via the helpers below. ---
const mocks = {
  markers: [] as any[],
  polylines: [] as any[],
  layerGroupAddLayer: jest.fn(),
  layerGroupClearLayers: jest.fn(),
  mapFitBounds: jest.fn(),
  mapSetMaxBounds: jest.fn(),
  mapSetMinZoom: jest.fn(),
  mapInvalidateSize: jest.fn(),
  mapRemove: jest.fn(),
};

jest.mock('leaflet', () => {
  const makeLayerGroup = () => {
    const lg: any = {
      addTo: jest.fn(() => lg),
      addLayer: (...args: any[]) => mocks.layerGroupAddLayer(...args),
      clearLayers: (...args: any[]) => mocks.layerGroupClearLayers(...args),
    };
    return lg;
  };

  const map: any = {
    addTo: jest.fn(() => map),
    remove: (...a: any[]) => mocks.mapRemove(...a),
    invalidateSize: (...a: any[]) => mocks.mapInvalidateSize(...a),
    fitBounds: (...a: any[]) => mocks.mapFitBounds(...a),
    setMaxBounds: (...a: any[]) => mocks.mapSetMaxBounds(...a),
    setMinZoom: (...a: any[]) => mocks.mapSetMinZoom(...a),
    getBoundsZoom: jest.fn(() => 5),
    setView: jest.fn(),
    on: jest.fn(),
  };

  const tileLayer = { addTo: jest.fn(() => tileLayer) };

  const makeMarker = (latlng: any, opts: any) => {
    const marker: any = {
      latlng,
      opts,
      bindPopup: jest.fn(() => marker),
      addTo: jest.fn(() => marker),
      on: jest.fn(),
      getLatLng: jest.fn(() => latlng),
      setLatLng: jest.fn(),
    };
    mocks.markers.push(marker);
    return marker;
  };

  const makePolyline = (coordinates: any, opts: any) => {
    const pl: any = { coordinates, opts, addTo: jest.fn(() => pl) };
    mocks.polylines.push(pl);
    return pl;
  };

  const latLngBounds = (points: any) => {
    const b: any = { points, pad: jest.fn(() => b) };
    return b;
  };

  return {
    __esModule: true,
    default: {
      map: jest.fn(() => map),
      tileLayer: jest.fn(() => tileLayer),
      layerGroup: jest.fn(() => makeLayerGroup()),
      marker: jest.fn((latlng: any, opts: any) => makeMarker(latlng, opts)),
      polyline: jest.fn((coordinates: any, opts: any) => makePolyline(coordinates, opts)),
      latLngBounds: jest.fn((points: any) => latLngBounds(points)),
      icon: jest.fn(() => ({ _icon: true })),
      divIcon: jest.fn(() => ({ _divIcon: true })),
    },
  };
});

// Side-effect CSS import — stub so jest doesn't try to parse it.
jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true });

import L from 'leaflet';
import MapView, { MapMarker, RouteData } from './MapView';

beforeEach(() => {
  jest.useFakeTimers();
  mocks.markers = [];
  mocks.polylines = [];
  Object.values(mocks).forEach((m) => {
    if (typeof m === 'function' && 'mockClear' in m) (m as jest.Mock).mockClear();
  });
  (L.map as jest.Mock).mockClear();
  (L.tileLayer as jest.Mock).mockClear();
  (L.marker as jest.Mock).mockClear();
  (L.polyline as jest.Mock).mockClear();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

const sampleMarkers: MapMarker[] = [
  { id: 'origin', lat: -34.6, lng: -58.4, title: 'Buenos Aires' },
  { id: 'dest', lat: -31.4, lng: -64.2, title: 'Córdoba', status: 'DELIVERED' },
];

const sampleRoute: RouteData[] = [
  { coordinates: [[-34.6, -58.4], [-31.4, -64.2]], color: '#3b82f6' },
];

describe('MapView', () => {
  it('renders a wrapper div and initializes a Leaflet map with a tile layer', () => {
    const { container } = render(<MapView />);

    // The component renders exactly one wrapper div.
    expect(container.querySelector('div')).toBeInTheDocument();
    // Map + tile layer get created on mount.
    expect(L.map).toHaveBeenCalledTimes(1);
    expect(L.tileLayer).toHaveBeenCalledTimes(1);
  });

  it('creates a marker per location once the post-mount timer fires', () => {
    render(<MapView markers={sampleMarkers} />);

    // Markers are drawn inside the 250ms invalidateSize timer.
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(mocks.mapInvalidateSize).toHaveBeenCalled();
    // A marker is created for each location. (React StrictMode may double-invoke
    // effects in dev/test, so assert the per-batch shape rather than an exact
    // total: every batch of created markers is a multiple of the location count.)
    expect(L.marker).toHaveBeenCalled();
    expect((L.marker as jest.Mock).mock.calls.length % sampleMarkers.length).toBe(0);
    // Each marker binds a popup with its title.
    expect(mocks.markers[0].bindPopup).toHaveBeenCalled();
    const popupTexts = mocks.markers.map(
      (m) => (m.bindPopup as jest.Mock).mock.calls[0][0],
    );
    expect(popupTexts.some((t: string) => t.includes('Buenos Aires'))).toBe(true);
  });

  it('renders a polyline when a route is provided', () => {
    render(<MapView markers={sampleMarkers} routes={sampleRoute} />);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(L.polyline).toHaveBeenCalled();
    expect(mocks.polylines[0].coordinates).toEqual(sampleRoute[0].coordinates);
    expect(mocks.polylines[0].opts.color).toBe('#3b82f6');
  });

  it('skips routes with fewer than 2 coordinates', () => {
    const shortRoute: RouteData[] = [{ coordinates: [[-34.6, -58.4]] }];
    render(<MapView routes={shortRoute} />);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(L.polyline).not.toHaveBeenCalled();
  });

  it('fits bounds and locks the viewport when there are >= 2 points', () => {
    render(<MapView markers={sampleMarkers} routes={sampleRoute} />);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(mocks.mapFitBounds).toHaveBeenCalled();
    expect(mocks.mapSetMaxBounds).toHaveBeenCalled();
    expect(mocks.mapSetMinZoom).toHaveBeenCalled();
  });

  it('does not fit bounds with a single point', () => {
    render(<MapView markers={[sampleMarkers[0]]} />);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    // One marker per draw, but applyBoundsAndConstraints bails (< 2 points).
    expect(L.marker).toHaveBeenCalled();
    expect(mocks.mapFitBounds).not.toHaveBeenCalled();
  });

  it('redraws markers when the markers prop changes', () => {
    const { rerender } = render(<MapView markers={sampleMarkers} />);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    const initialMarkerCalls = (L.marker as jest.Mock).mock.calls.length;
    const newMarkers: MapMarker[] = [
      ...sampleMarkers,
      { id: 'truck', lat: -33, lng: -60, title: 'Camión' },
    ];

    act(() => {
      rerender(<MapView markers={newMarkers} />);
    });

    // The markers effect re-runs drawMarkers (clearLayers + new markers).
    expect(mocks.layerGroupClearLayers).toHaveBeenCalled();
    expect((L.marker as jest.Mock).mock.calls.length).toBeGreaterThan(initialMarkerCalls);
  });

  it('tears down the map on unmount', () => {
    const { unmount } = render(<MapView markers={sampleMarkers} />);

    act(() => {
      jest.advanceTimersByTime(300);
    });
    unmount();

    expect(mocks.mapRemove).toHaveBeenCalled();
  });
});
