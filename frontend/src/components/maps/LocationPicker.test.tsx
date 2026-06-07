import { render, act } from '@testing-library/react';

// LocationPicker uses imperative Leaflet (import L from 'leaflet'), not
// react-leaflet. We mock `leaflet` and capture the event handlers the
// component registers (marker 'dragend', map 'click') so we can fire them and
// assert the onChange callback is invoked with the new coordinate.

const mocks = {
  markerHandlers: {} as Record<string, (...a: any[]) => void>,
  mapHandlers: {} as Record<string, (...a: any[]) => void>,
  markerLatLng: { lat: -34.6, lng: -58.4 } as { lat: number; lng: number },
  markerSetLatLng: jest.fn(),
  mapSetView: jest.fn(),
  mapSetMaxBounds: jest.fn(),
  mapSetMinZoom: jest.fn(),
  mapRemove: jest.fn(),
  mapInvalidateSize: jest.fn(),
};

jest.mock('leaflet', () => {
  const map: any = {
    on: (evt: string, cb: any) => {
      mocks.mapHandlers[evt] = cb;
    },
    setView: (...a: any[]) => mocks.mapSetView(...a),
    setMaxBounds: (...a: any[]) => mocks.mapSetMaxBounds(...a),
    setMinZoom: (...a: any[]) => mocks.mapSetMinZoom(...a),
    getBoundsZoom: jest.fn(() => 12),
    invalidateSize: (...a: any[]) => mocks.mapInvalidateSize(...a),
    remove: (...a: any[]) => mocks.mapRemove(...a),
  };

  const tileLayer = { addTo: jest.fn(() => tileLayer) };

  const marker: any = {
    addTo: jest.fn(() => marker),
    on: (evt: string, cb: any) => {
      mocks.markerHandlers[evt] = cb;
    },
    getLatLng: jest.fn(() => mocks.markerLatLng),
    setLatLng: (...a: any[]) => mocks.markerSetLatLng(...a),
  };

  const makeLatLng = (lat: number, lng: number) => ({
    lat,
    lng,
    toBounds: jest.fn(() => ({ _bounds: true })),
  });

  return {
    __esModule: true,
    default: {
      map: jest.fn(() => map),
      tileLayer: jest.fn(() => tileLayer),
      marker: jest.fn(() => marker),
      latLng: jest.fn((lat: number, lng: number) => makeLatLng(lat, lng)),
      divIcon: jest.fn(() => ({ _divIcon: true })),
    },
  };
});

jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true });

import L from 'leaflet';
import LocationPicker from './LocationPicker';

beforeEach(() => {
  jest.useFakeTimers();
  mocks.markerHandlers = {};
  mocks.mapHandlers = {};
  mocks.markerLatLng = { lat: -34.6, lng: -58.4 };
  Object.values(mocks).forEach((m) => {
    if (typeof m === 'function' && 'mockClear' in m) (m as jest.Mock).mockClear();
  });
  (L.map as jest.Mock).mockClear();
  (L.marker as jest.Mock).mockClear();
  (L.latLng as jest.Mock).mockClear();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('LocationPicker', () => {
  it('renders a fixed-size wrapper div and initializes a map + draggable marker', () => {
    const { container } = render(
      <LocationPicker lat={-34.6} lng={-58.4} onChange={jest.fn()} />,
    );

    const wrapper = container.querySelector('div');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveStyle({ height: '240px' });

    expect(L.map).toHaveBeenCalledTimes(1);
    expect(L.marker).toHaveBeenCalledTimes(1);
    // Marker is created draggable.
    const markerOpts = (L.marker as jest.Mock).mock.calls[0][1];
    expect(markerOpts.draggable).toBe(true);
  });

  it('invalidates size after the post-mount timer', () => {
    render(<LocationPicker lat={-34.6} lng={-58.4} onChange={jest.fn()} />);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(mocks.mapInvalidateSize).toHaveBeenCalled();
  });

  it('reports the picked coordinate via onChange on marker drag-end', () => {
    const onChange = jest.fn();
    render(<LocationPicker lat={-34.6} lng={-58.4} onChange={onChange} />);

    // Simulate the user dragging the pin to a new spot.
    mocks.markerLatLng = { lat: -31.4, lng: -64.2 };
    act(() => {
      mocks.markerHandlers['dragend']();
    });

    expect(onChange).toHaveBeenCalledWith(-31.4, -64.2);
  });

  it('reports the picked coordinate and moves the marker on map click', () => {
    const onChange = jest.fn();
    render(<LocationPicker lat={-34.6} lng={-58.4} onChange={onChange} />);

    const clicked = { latlng: { lat: -33.0, lng: -60.0 } };
    act(() => {
      mocks.mapHandlers['click'](clicked);
    });

    expect(mocks.markerSetLatLng).toHaveBeenCalledWith(clicked.latlng);
    expect(onChange).toHaveBeenCalledWith(-33.0, -60.0);
  });

  it('recenters the marker and view on an external coord change', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <LocationPicker lat={-34.6} lng={-58.4} onChange={onChange} />,
    );

    act(() => {
      rerender(<LocationPicker lat={-25.0} lng={-65.0} onChange={onChange} />);
    });

    // Externally driven coord change recenters marker + map.
    expect(mocks.markerSetLatLng).toHaveBeenCalledWith([-25.0, -65.0]);
    expect(mocks.mapSetView).toHaveBeenCalledWith([-25.0, -65.0], 16);
  });

  it('does NOT recenter when the prop change echoes our own emitted position', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <LocationPicker lat={-34.6} lng={-58.4} onChange={onChange} />,
    );

    // User drags -> component emits a new position (stored in lastEmitted).
    mocks.markerLatLng = { lat: -31.4, lng: -64.2 };
    act(() => {
      mocks.markerHandlers['dragend']();
    });
    mocks.markerSetLatLng.mockClear();
    mocks.mapSetView.mockClear();

    // Parent echoes that same coord back as the controlled prop.
    act(() => {
      rerender(<LocationPicker lat={-31.4} lng={-64.2} onChange={onChange} />);
    });

    // Recenter effect should bail out (no setLatLng / setView from the echo).
    expect(mocks.markerSetLatLng).not.toHaveBeenCalled();
    expect(mocks.mapSetView).not.toHaveBeenCalled();
  });

  it('tears down the map on unmount', () => {
    const { unmount } = render(
      <LocationPicker lat={-34.6} lng={-58.4} onChange={jest.fn()} />,
    );
    unmount();
    expect(mocks.mapRemove).toHaveBeenCalled();
  });
});
