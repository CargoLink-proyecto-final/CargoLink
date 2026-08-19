import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewLoadPage from './page';

jest.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// LocationPicker is loaded via next/dynamic and touches Leaflet/window — stub it.
jest.mock('@/components/maps/LocationPicker', () => ({
  __esModule: true,
  default: () => <div data-testid="location-picker" />,
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/loads/new',
}));

jest.mock('@/lib/api', () => ({
  loadsApi: { create: jest.fn() },
}));

// Geocoding is network-bound; resolve to a fixed matching point so submit passes.
jest.mock('@/lib/routing', () => ({
  geocodeStructured: jest.fn(),
  reverseGeocode: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadsApi } = require('@/lib/api') as { loadsApi: Record<string, jest.Mock> };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { geocodeStructured, reverseGeocode } = require('@/lib/routing') as {
  geocodeStructured: jest.Mock;
  reverseGeocode: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

// Fill the required "Detalles" + date fields. Address fields are filled per-test.
async function fillBaseFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('Ej., Electrónica a Córdoba'), 'Carga test');
  await user.selectOptions(screen.getByDisplayValue('Seleccioná un tipo'), 'Mercadería general');
  // Peso, Precio are the two number inputs in the details card with no placeholder.
  const weight = document.querySelector('input[name="weight"]') as HTMLInputElement;
  const price = document.querySelector('input[name="price"]') as HTMLInputElement;
  await user.type(weight, '100');
  await user.type(price, '5000');
  const pickup = document.querySelector('input[name="pickupDate"]') as HTMLInputElement;
  // Far-future date clears the "not before today" validator.
  await user.type(pickup, '2030-01-01T10:00');
}

describe('NewLoadPage — validation', () => {
  it('blocks submission and shows required errors when fields are empty', async () => {
    const user = userEvent.setup();
    render(<NewLoadPage />);

    await user.click(screen.getByRole('button', { name: 'Crear Carga' }));

    expect(await screen.findAllByText('Requerido')).not.toHaveLength(0);
    expect(loadsApi.create).not.toHaveBeenCalled();
  });

  it('does not require a price — an empty one means "a convenir"', async () => {
    const user = userEvent.setup();
    render(<NewLoadPage />);

    expect(screen.getByText('Precio (ARS, opcional)')).toBeInTheDocument();
    expect(
      screen.getByText(/la carga sale "a convenir" y el precio lo proponen los transportistas/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Crear Carga' }));

    // Otros campos siguen marcando "Requerido", pero el precio no.
    const priceField = (document.querySelector('input[name="price"]') as HTMLInputElement)
      .parentElement;
    expect(priceField?.textContent).not.toContain('Requerido');
  });
});

describe('NewLoadPage — successful create', () => {
  it('geocodes both addresses, calls loadsApi.create and redirects', async () => {
    const user = userEvent.setup();
    geocodeStructured
      .mockResolvedValueOnce({ lat: -34.6, lng: -58.38, displayName: 'Buenos Aires, Argentina', address: { city: 'Buenos Aires', state: 'Buenos Aires', country: 'Argentina', postcode: '1043' } })
      .mockResolvedValueOnce({ lat: -31.42, lng: -64.18, displayName: 'Córdoba, Argentina', address: { city: 'Córdoba', state: 'Córdoba', country: 'Argentina', postcode: '5000' } });
    loadsApi.create.mockResolvedValue({ data: { id: 'new-1' } });

    render(<NewLoadPage />);

    await fillBaseFields(user);

    // Origin address fields
    await user.type(screen.getByPlaceholderText('Ej., Av. Corrientes'), 'Av. Corrientes');
    await user.type(screen.getByPlaceholderText('Ej., Buenos Aires'), 'Buenos Aires');
    await user.type(screen.getByPlaceholderText('Ej., CABA'), 'Buenos Aires');
    // País inputs share a placeholder ("Ej., Argentina"); first = origin.
    const countries = screen.getAllByPlaceholderText('Ej., Argentina');
    await user.type(countries[0], 'Argentina');
    const cps = screen.getAllByPlaceholderText(/Ej\., 1043/);
    await user.type(cps[0], '1043');

    // Destination address fields. Dest city + state share the "Ej., Córdoba"
    // placeholder, so target them by their registered name.
    await user.type(screen.getByPlaceholderText('Ej., Av. San Martín'), 'Av. San Martín');
    await user.type(document.querySelector('input[name="destCity"]') as HTMLInputElement, 'Córdoba');
    await user.type(document.querySelector('input[name="destState"]') as HTMLInputElement, 'Córdoba');
    await user.type(countries[1], 'Argentina');
    const destCp = screen.getByPlaceholderText(/Ej\., 5000/);
    await user.type(destCp, '5000');

    await user.click(screen.getByRole('button', { name: 'Crear Carga' }));

    await waitFor(() => expect(loadsApi.create).toHaveBeenCalledTimes(1));
    expect(loadsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Carga test',
        cargoType: 'Mercadería general',
        weight: 100,
        price: 5000,
        originLat: -34.6,
        destLat: -31.42,
      }),
    );
    expect(push).toHaveBeenCalledWith('/dashboard/shipper');
    expect(reverseGeocode).not.toHaveBeenCalled();
  });
});

describe('NewLoadPage — mismatch hard block', () => {
  it('shows the mismatch modal and does NOT create when geocode disagrees', async () => {
    const user = userEvent.setup();
    // Resolved city differs from typed city -> mismatch.
    geocodeStructured
      .mockResolvedValueOnce({ lat: -34.6, lng: -58.38, displayName: 'Rosario, Argentina', address: { city: 'Rosario', state: 'Santa Fe', country: 'Argentina', postcode: '2000' } })
      .mockResolvedValueOnce({ lat: -31.42, lng: -64.18, displayName: 'Córdoba, Argentina', address: { city: 'Córdoba', state: 'Córdoba', country: 'Argentina', postcode: '5000' } });

    render(<NewLoadPage />);
    await fillBaseFields(user);

    await user.type(screen.getByPlaceholderText('Ej., Av. Corrientes'), 'Av. Corrientes');
    await user.type(screen.getByPlaceholderText('Ej., Buenos Aires'), 'Buenos Aires');
    await user.type(screen.getByPlaceholderText('Ej., CABA'), 'Buenos Aires');
    const countries = screen.getAllByPlaceholderText('Ej., Argentina');
    await user.type(countries[0], 'Argentina');
    const cps = screen.getAllByPlaceholderText(/Ej\., 1043/);
    await user.type(cps[0], '1043');

    await user.type(screen.getByPlaceholderText('Ej., Av. San Martín'), 'Av. San Martín');
    await user.type(document.querySelector('input[name="destCity"]') as HTMLInputElement, 'Córdoba');
    await user.type(document.querySelector('input[name="destState"]') as HTMLInputElement, 'Córdoba');
    await user.type(countries[1], 'Argentina');
    await user.type(screen.getByPlaceholderText(/Ej\., 5000/), '5000');

    await user.click(screen.getByRole('button', { name: 'Crear Carga' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Corregí la dirección')).toBeInTheDocument();
    expect(loadsApi.create).not.toHaveBeenCalled();
  });
});
