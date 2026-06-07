import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import AvailableLoadsScreen from './AvailableLoadsScreen';
import { loadsApi } from '../../services/api';

jest.mock('../../services/api', () => ({
  loadsApi: { getAvailable: jest.fn() },
}));

const mockLoads = [
  {
    id: 'l1',
    title: 'Granos a Rosario',
    originAddress: 'Córdoba',
    destAddress: 'Rosario',
    price: 150000,
    weight: 12000,
    cargoType: 'Granos',
    shipper: { firstName: 'Ana', lastName: 'Diaz', companyName: 'AgroSur' },
  },
  {
    id: 'l2',
    title: 'Muebles a Mendoza',
    originAddress: 'Buenos Aires',
    destAddress: 'Mendoza',
    price: 90000,
    weight: 3000,
    cargoType: 'General',
    shipper: { firstName: 'Luis', lastName: 'Paz' },
  },
];

function makeNav() {
  return { navigate: jest.fn(), goBack: jest.fn() };
}

describe('AvailableLoadsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadsApi.getAvailable as jest.Mock).mockResolvedValue({ data: { loads: mockLoads } });
  });

  it('fetches and renders available loads', async () => {
    render(<AvailableLoadsScreen navigation={makeNav()} />);

    expect(loadsApi.getAvailable).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Granos a Rosario')).toBeTruthy());
    expect(screen.getByText('Muebles a Mendoza')).toBeTruthy();
    expect(screen.getByText('2 cargas disponibles')).toBeTruthy();
  });

  it('filters loads by the search query', async () => {
    render(<AvailableLoadsScreen navigation={makeNav()} />);
    await waitFor(() => expect(screen.getByText('Granos a Rosario')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Buscar cargas...'), 'mendoza');

    await waitFor(() => expect(screen.queryByText('Granos a Rosario')).toBeNull());
    expect(screen.getByText('Muebles a Mendoza')).toBeTruthy();
    expect(screen.getByText('1 cargas disponibles')).toBeTruthy();
  });

  it('navigates to LoadDetail when a card is pressed', async () => {
    const navigation = makeNav();
    render(<AvailableLoadsScreen navigation={navigation} />);
    await waitFor(() => expect(screen.getByText('Granos a Rosario')).toBeTruthy());

    fireEvent.press(screen.getByText('Granos a Rosario'));

    expect(navigation.navigate).toHaveBeenCalledWith('LoadDetail', { id: 'l1' });
  });

  it('shows the empty state when there are no loads', async () => {
    (loadsApi.getAvailable as jest.Mock).mockResolvedValue({ data: { loads: [] } });
    render(<AvailableLoadsScreen navigation={makeNav()} />);

    await waitFor(() =>
      expect(screen.getByText('No hay cargas disponibles en este momento')).toBeTruthy(),
    );
    expect(screen.getByText('0 cargas disponibles')).toBeTruthy();
  });

  it('handles a fetch error without crashing', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (loadsApi.getAvailable as jest.Mock).mockRejectedValue(new Error('network'));

    render(<AvailableLoadsScreen navigation={makeNav()} />);

    await waitFor(() => expect(loadsApi.getAvailable).toHaveBeenCalled());
    expect(screen.getByText('0 cargas disponibles')).toBeTruthy();
    spy.mockRestore();
  });
});
