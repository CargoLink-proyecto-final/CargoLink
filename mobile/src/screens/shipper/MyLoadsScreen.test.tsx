import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import MyLoadsScreen from './MyLoadsScreen';
import { loadsApi } from '../../services/api';

jest.mock('../../services/api', () => ({
  loadsApi: {
    getMy: jest.fn(),
  },
}));

// @expo/vector-icons renders fine under jest-expo, but stub to keep output stable.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: (props: any) => <Text>{props.name}</Text> };
});

const mockedLoadsApi = loadsApi as jest.Mocked<typeof loadsApi>;

const makeLoad = (over: Partial<any> = {}) => ({
  id: 'load-1',
  shipperId: 's1',
  shipper: { id: 's1', firstName: 'Ana', lastName: 'Diaz' },
  title: 'Cemento a Rosario',
  originAddress: 'Buenos Aires',
  destAddress: 'Rosario',
  cargoType: 'Construcción',
  weight: 8000,
  price: 250000,
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

describe('MyLoadsScreen', () => {
  it("lists the shipper's loads with a translated status label", async () => {
    mockedLoadsApi.getMy.mockResolvedValue({
      data: { loads: [makeLoad({ status: 'IN_TRANSIT' })] },
    } as any);

    render(<MyLoadsScreen navigation={navigation} />);

    expect(await screen.findByText('Cemento a Rosario')).toBeTruthy();
    expect(screen.getByText('Buenos Aires → Rosario')).toBeTruthy();
    expect(screen.getByText('$250,000')).toBeTruthy();
    expect(screen.getByText('8000 kg')).toBeTruthy();
    expect(screen.getByText('Construcción')).toBeTruthy();
    // STATUS_LABELS mapping
    expect(screen.getByText('En tránsito')).toBeTruthy();
  });

  it('shows a pluralized count of loads', async () => {
    mockedLoadsApi.getMy.mockResolvedValue({
      data: { loads: [makeLoad({ id: 'a' }), makeLoad({ id: 'b' })] },
    } as any);

    render(<MyLoadsScreen navigation={navigation} />);

    expect(await screen.findByText('2 cargas')).toBeTruthy();
  });

  it('navigates to LoadDetail on card press', async () => {
    mockedLoadsApi.getMy.mockResolvedValue({
      data: { loads: [makeLoad({ id: 'load-7' })] },
    } as any);

    render(<MyLoadsScreen navigation={navigation} />);

    fireEvent.press(await screen.findByText('Cemento a Rosario'));
    expect(navigation.navigate).toHaveBeenCalledWith('LoadDetail', { id: 'load-7' });
  });

  it('navigates to CreateLoad when the FAB is pressed', async () => {
    mockedLoadsApi.getMy.mockResolvedValue({ data: { loads: [] } } as any);

    render(<MyLoadsScreen navigation={navigation} />);

    // FAB contains the stubbed "add" Ionicon
    fireEvent.press(await screen.findByText('add'));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateLoad');
  });

  it('renders the empty state when there are no loads', async () => {
    mockedLoadsApi.getMy.mockResolvedValue({ data: { loads: [] } } as any);

    render(<MyLoadsScreen navigation={navigation} />);

    expect(await screen.findByText(/Aún no tienes cargas/)).toBeTruthy();
    expect(screen.getByText('0 cargas')).toBeTruthy();
  });

  it('does not crash when the fetch rejects', async () => {
    mockedLoadsApi.getMy.mockRejectedValue(new Error('network'));

    render(<MyLoadsScreen navigation={navigation} />);

    await waitFor(() => expect(mockedLoadsApi.getMy).toHaveBeenCalled());
    expect(screen.getByText('Mis Cargas')).toBeTruthy();
  });
});
