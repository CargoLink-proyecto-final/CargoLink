import { render, screen, fireEvent } from '@testing-library/react';
import FuelMarginCard from './FuelMarginCard';

const STORAGE_KEY = 'cargolink:fuel-price-per-liter';

const props = {
  totalAmount: 1_200_000,
  totalFuelLiters: 500,
  totalDistanceKm: 2000,
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('FuelMarginCard', () => {
  it('asks for the fuel price before computing anything', () => {
    render(<FuelMarginCard {...props} />);

    expect(
      screen.getByText('Cargá el precio del litro para ver cuánto te queda después del combustible.'),
    ).toBeInTheDocument();
  });

  it('subtracts the fuel cost and breaks the margin down per km', () => {
    render(<FuelMarginCard {...props} />);

    fireEvent.change(screen.getByPlaceholderText('1500'), { target: { value: '1000' } });

    // 500 L x $1000 = $500.000 → quedan $700.000 → $350 por km sobre 2000 km.
    expect(screen.getByText(/500\.000/)).toBeInTheDocument();
    expect(screen.getByText(/700\.000/)).toBeInTheDocument();
    expect(screen.getByText(/350.*por km/)).toBeInTheDocument();
  });

  it('remembers the price in this browser and reuses it on the next visit', () => {
    const { unmount } = render(<FuelMarginCard {...props} />);
    fireEvent.change(screen.getByPlaceholderText('1500'), { target: { value: '1200' } });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1200');
    unmount();

    render(<FuelMarginCard {...props} />);
    expect(screen.getByPlaceholderText('1500')).toHaveValue(1200);
  });

  it('clears the stored price when the field is emptied', () => {
    window.localStorage.setItem(STORAGE_KEY, '1200');
    render(<FuelMarginCard {...props} />);

    fireEvent.change(screen.getByPlaceholderText('1500'), { target: { value: '' } });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(
      screen.getByText('Cargá el precio del litro para ver cuánto te queda después del combustible.'),
    ).toBeInTheDocument();
  });

  it('flags a negative margin when the fuel costs more than the trips paid', () => {
    render(<FuelMarginCard totalAmount={100_000} totalFuelLiters={500} totalDistanceKm={0} />);

    fireEvent.change(screen.getByPlaceholderText('1500'), { target: { value: '1000' } });

    // $500.000 de gasoil contra $100.000 facturados.
    expect(screen.getByText(/-\s?\$?\s?400\.000/)).toBeInTheDocument();
    expect(screen.getByText('Sin km registrados')).toBeInTheDocument();
  });
});
