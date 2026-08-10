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

const next = () => screen.getByRole('button', { name: 'Siguiente' });

// Fill the "Detalles" step (step 0) and advance to "Origen".
async function fillDetailsAndAdvance(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('Ej., Electrónica a Córdoba'), 'Carga test');
  await user.selectOptions(screen.getByDisplayValue('Seleccioná un tipo'), 'Mercadería general');
  const weight = document.querySelector('input[name="weight"]') as HTMLInputElement;
  const price = document.querySelector('input[name="price"]') as HTMLInputElement;
  await user.type(weight, '100');
  await user.type(price, '5000');
  await user.click(next());
}

// Fill the "Origen" step (step 1) and advance to "Destino".
async function fillOriginAndAdvance(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('Ej., Av. Corrientes'), 'Av. Corrientes');
  await user.type(screen.getByPlaceholderText('Ej., Buenos Aires'), 'Buenos Aires');
  await user.type(screen.getByPlaceholderText('Ej., CABA'), 'Buenos Aires');
  // "Ej., Argentina" is shared by origin + dest country inputs — both are
  // always mounted (steps are hidden via CSS, not unmounted), so index [0] = origin.
  await user.type(screen.getAllByPlaceholderText('Ej., Argentina')[0], 'Argentina');
  await user.type(screen.getByPlaceholderText(/Ej\., 1043/), '1043');
  await user.click(next());
}

// Fill the "Destino" step (step 2) and advance to "Fechas".
async function fillDestAndAdvance(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('Ej., Av. San Martín'), 'Av. San Martín');
  await user.type(document.querySelector('input[name="destCity"]') as HTMLInputElement, 'Córdoba');
  await user.type(document.querySelector('input[name="destState"]') as HTMLInputElement, 'Córdoba');
  await user.type(screen.getAllByPlaceholderText('Ej., Argentina')[1], 'Argentina');
  await user.type(screen.getByPlaceholderText(/Ej\., 5000/), '5000');
  await user.click(next());
}

// Fill the "Fechas" step (step 3). Does not submit.
async function fillDates(user: ReturnType<typeof userEvent.setup>) {
  const pickup = document.querySelector('input[name="pickupDate"]') as HTMLInputElement;
  await user.type(pickup, '2030-01-01T10:00');
  const delivery = document.querySelector('input[name="deliveryDate"]') as HTMLInputElement;
  await user.type(delivery, '2030-01-02T10:00');
}

describe('NewLoadPage — wizard navigation', () => {
  it('blocks advancing past the "Detalles" step when required fields are empty', async () => {
    const user = userEvent.setup();
    render(<NewLoadPage />);

    await user.click(next());

    expect(await screen.findAllByText('Requerido')).not.toHaveLength(0);
    // Still on step 0 — the "Origen" step content stays hidden.
    expect(screen.getByText('Detalles de la Carga')).toBeVisible();
    expect(loadsApi.create).not.toHaveBeenCalled();
  });

  it('walks Detalles -> Origen -> Destino -> Fechas, showing one step at a time', async () => {
    const user = userEvent.setup();
    render(<NewLoadPage />);

    expect(screen.getByText('Detalles de la Carga')).toBeVisible();
    await fillDetailsAndAdvance(user);

    expect(screen.getByText('Detalles de la Carga')).not.toBeVisible();
    expect(screen.getByPlaceholderText('Ej., Av. Corrientes')).toBeVisible();
    await fillOriginAndAdvance(user);

    expect(screen.getByPlaceholderText('Ej., Av. Corrientes')).not.toBeVisible();
    expect(screen.getByPlaceholderText('Ej., Av. San Martín')).toBeVisible();
    await fillDestAndAdvance(user);

    expect(screen.getByPlaceholderText('Ej., Av. San Martín')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Crear Carga' })).toBeVisible();
  });

  it('goes back to the previous step with "Atrás" without losing already-typed data', async () => {
    const user = userEvent.setup();
    render(<NewLoadPage />);

    await fillDetailsAndAdvance(user);
    await user.click(screen.getByRole('button', { name: 'Atrás' }));

    expect(screen.getByText('Detalles de la Carga')).toBeVisible();
    expect(screen.getByPlaceholderText('Ej., Electrónica a Córdoba')).toHaveValue('Carga test');
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

    await fillDetailsAndAdvance(user);
    await fillOriginAndAdvance(user);
    await fillDestAndAdvance(user);
    await fillDates(user);

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
  it('shows the mismatch modal, jumps back to the offending step, and does NOT create when geocode disagrees', async () => {
    const user = userEvent.setup();
    // Resolved city differs from typed city -> mismatch.
    geocodeStructured
      .mockResolvedValueOnce({ lat: -34.6, lng: -58.38, displayName: 'Rosario, Argentina', address: { city: 'Rosario', state: 'Santa Fe', country: 'Argentina', postcode: '2000' } })
      .mockResolvedValueOnce({ lat: -31.42, lng: -64.18, displayName: 'Córdoba, Argentina', address: { city: 'Córdoba', state: 'Córdoba', country: 'Argentina', postcode: '5000' } });

    render(<NewLoadPage />);

    await fillDetailsAndAdvance(user);
    await fillOriginAndAdvance(user);
    await fillDestAndAdvance(user);
    await fillDates(user);

    await user.click(screen.getByRole('button', { name: 'Crear Carga' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Corregí la dirección')).toBeInTheDocument();
    expect(loadsApi.create).not.toHaveBeenCalled();
    // Jumped back to the "Origen" step, where the mismatch originated.
    expect(screen.getByPlaceholderText('Ej., Av. Corrientes')).toBeVisible();
  });
});
