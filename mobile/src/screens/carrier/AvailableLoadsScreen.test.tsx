import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import AvailableLoadsScreen from './AvailableLoadsScreen';
import { loadsApi, usersApi } from '../../services/api';
import { formatCurrency } from '../../lib/labels';

jest.mock('../../services/api', () => ({
  loadsApi: { getAvailable: jest.fn() },
  usersApi: { getMe: jest.fn() },
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
    // Sin zona definida por defecto: el transportista recién registrado.
    (usersApi.getMe as jest.Mock).mockResolvedValue({ data: { zoneLat: null, zoneLng: null } });
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

  describe('zona de influencia', () => {
    it('nudges the carrier to set a zone when they have none', async () => {
      render(<AvailableLoadsScreen navigation={makeNav()} />);

      await waitFor(() =>
        expect(
          screen.getByText(
            'Definí tu zona de influencia en el perfil para ver primero las cargas cercanas.',
          ),
        ).toBeTruthy(),
      );
    });

    it('explains the ordering instead of the nudge once a zone exists', async () => {
      (usersApi.getMe as jest.Mock).mockResolvedValue({
        data: { zoneLat: -31.42, zoneLng: -64.18, zoneRadiusKm: 50 },
      });

      render(<AvailableLoadsScreen navigation={makeNav()} />);

      await waitFor(() =>
        expect(
          screen.getByText('2 cargas disponibles · ordenadas por cercanía a tu zona'),
        ).toBeTruthy(),
      );
      expect(screen.queryByText(/Definí tu zona/)).toBeNull();
    });

    it('keeps the nudge if the profile request fails', async () => {
      (usersApi.getMe as jest.Mock).mockRejectedValue(new Error('network'));

      render(<AvailableLoadsScreen navigation={makeNav()} />);

      await waitFor(() => expect(screen.queryByText(/Definí tu zona/)).toBeTruthy());
    });
  });

  it('shows the max budget, package count and interest on a card', async () => {
    (loadsApi.getAvailable as jest.Mock).mockResolvedValue({
      data: {
        loads: [
          {
            ...mockLoads[0],
            maxBudget: 180000,
            packageCount: 30,
            pendingPostulationsCount: 2,
          },
        ],
      },
    });

    render(<AvailableLoadsScreen navigation={makeNav()} />);

    await waitFor(() => expect(screen.getByText('Granos a Rosario')).toBeTruthy());
    expect(screen.getByText(`hasta ${formatCurrency(180000)}`)).toBeTruthy();
    expect(screen.getByText('30 bultos')).toBeTruthy();
    expect(screen.getByText('Ana Diaz - AgroSur')).toBeTruthy();
    expect(screen.getByText('2 transportistas ya se postularon')).toBeTruthy();
  });

  it('does not promise the shipper industry, which this endpoint never returns', async () => {
    // `findAll` no incluye `industry` en el select del shipper: renderizarlo acá
    // sería UI muerta y un test que lo mockee daría falsa confianza.
    (loadsApi.getAvailable as jest.Mock).mockResolvedValue({
      data: {
        loads: [{ ...mockLoads[0], shipper: { ...mockLoads[0].shipper, industry: 'Agroindustria' } }],
      },
    });

    render(<AvailableLoadsScreen navigation={makeNav()} />);

    await waitFor(() => expect(screen.getByText('Granos a Rosario')).toBeTruthy());
    expect(screen.queryByText(/Agroindustria/)).toBeNull();
  });
});
