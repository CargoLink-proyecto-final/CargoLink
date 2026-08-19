import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  geoApi: {
    getProvinces: jest.fn(),
    searchCities: jest.fn(),
  },
}));

// Geocoding is network-bound; resolve to a fixed matching point so submit passes.
jest.mock('@/lib/routing', () => ({
  geocodeStructured: jest.fn(),
  reverseGeocode: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadsApi, geoApi } = require('@/lib/api') as {
  loadsApi: Record<string, jest.Mock>;
  geoApi: Record<string, jest.Mock>;
};

const PROVINCES = [
  { id: 'prov-ba', code: '06', name: 'Buenos Aires', iso: 'AR-B', country: 'Argentina' },
  { id: 'prov-cba', code: '14', name: 'Córdoba', iso: 'AR-X', country: 'Argentina' },
];
const CITIES = [
  { id: 'city-ba', code: '06441010', name: 'Buenos Aires', department: 'La Plata', postalCode: '1043', lat: -34.6, lng: -58.37, provinceId: 'prov-ba', provinceName: 'Buenos Aires', country: 'Argentina' },
  { id: 'city-cba', code: '14014010', name: 'Córdoba', department: 'Capital', postalCode: '5000', lat: -31.42, lng: -64.18, provinceId: 'prov-cba', provinceName: 'Córdoba', country: 'Argentina' },
];

// Ciudad y provincia son selects con búsqueda: se abren y se elige del listado.
// index 0 = origen, 1 = destino.
async function pickPlace(
  user: ReturnType<typeof userEvent.setup>,
  label: 'Ciudad' | 'Provincia',
  index: 0 | 1,
  option: RegExp,
) {
  await user.click(screen.getAllByRole('combobox', { name: label })[index]);
  await user.click(await screen.findByRole('option', { name: option }));
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NewLoadPage />
    </QueryClientProvider>,
  );
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { geocodeStructured, reverseGeocode } = require('@/lib/routing') as {
  geocodeStructured: jest.Mock;
  reverseGeocode: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  geoApi.getProvinces.mockResolvedValue({ data: PROVINCES });
  geoApi.searchCities.mockResolvedValue({ data: CITIES });
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
  // Entrega es obligatoria y tiene que ser posterior a la recogida.
  const delivery = document.querySelector('input[name="deliveryDate"]') as HTMLInputElement;
  await user.type(delivery, '2030-01-02T10:00');
}

describe('NewLoadPage — validation', () => {
  it('blocks submission and shows required errors when fields are empty', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Crear Carga' }));

    expect(await screen.findAllByText('Requerido')).not.toHaveLength(0);
    expect(loadsApi.create).not.toHaveBeenCalled();
  });
});

describe('NewLoadPage — ciudad y provincia', () => {
  it('completa la provincia sola al elegir una ciudad del padrón', async () => {
    const user = userEvent.setup();
    renderPage();

    const province = screen.getAllByRole('combobox', { name: 'Provincia' })[0] as HTMLInputElement;
    expect(province.value).toBe('');

    await pickPlace(user, 'Ciudad', 0, /^Córdoba/);

    expect(province.value).toBe('Córdoba');
  });

  it('completa también país y código postal desde la ciudad', async () => {
    const user = userEvent.setup();
    renderPage();

    await pickPlace(user, 'Ciudad', 0, /^Córdoba/);

    const country = screen.getAllByPlaceholderText('Ej., Argentina')[0] as HTMLInputElement;
    const postal = screen.getAllByPlaceholderText(/Ej\., 1043/)[0] as HTMLInputElement;
    expect(country.value).toBe('Argentina');
    expect(postal.value).toBe('5000');
  });

  it('no pisa el código postal cuando la ciudad no tiene uno en el padrón', async () => {
    const user = userEvent.setup();
    geoApi.searchCities.mockResolvedValue({
      data: [{ ...CITIES[1], postalCode: null }],
    });
    renderPage();

    const postal = screen.getAllByPlaceholderText(/Ej\., 1043/)[0] as HTMLInputElement;
    await user.type(postal, '5009');
    await pickPlace(user, 'Ciudad', 0, /^Córdoba/);

    expect(postal.value).toBe('5009');
  });

  it('marca como elegida solo la ciudad seleccionada, no sus homónimas', async () => {
    const user = userEvent.setup();
    // Dos "Pilar" distintas: la marca tiene que distinguirlas por id.
    geoApi.searchCities.mockResolvedValue({
      data: [
        { id: 'pilar-ba', code: '06638040', name: 'Pilar', department: 'Pilar', postalCode: '1629', lat: -34.4, lng: -58.9, provinceId: 'prov-ba', provinceName: 'Buenos Aires', country: 'Argentina' },
        { id: 'pilar-cba', code: '14126070', name: 'Pilar', department: 'Río Segundo', postalCode: '5972', lat: -31.6, lng: -63.8, provinceId: 'prov-cba', provinceName: 'Córdoba', country: 'Argentina' },
      ],
    });
    renderPage();

    await pickPlace(user, 'Ciudad', 0, /Río Segundo/);
    await user.click(screen.getAllByRole('combobox', { name: 'Ciudad' })[0]);

    // Scope al listbox: los <option> del select nativo de tipo de carga también
    // tienen role="option" y contaminarían la consulta global.
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  });
});

describe('NewLoadPage — successful create', () => {
  it('geocodes both addresses, calls loadsApi.create and redirects', async () => {
    const user = userEvent.setup();
    geocodeStructured
      .mockResolvedValueOnce({ lat: -34.6, lng: -58.38, displayName: 'Buenos Aires, Argentina', address: { city: 'Buenos Aires', state: 'Buenos Aires', country: 'Argentina', postcode: '1043' } })
      .mockResolvedValueOnce({ lat: -31.42, lng: -64.18, displayName: 'Córdoba, Argentina', address: { city: 'Córdoba', state: 'Córdoba', country: 'Argentina', postcode: '5000' } });
    loadsApi.create.mockResolvedValue({ data: { id: 'new-1' } });

    renderPage();

    await fillBaseFields(user);

    // Origin address fields
    await user.type(screen.getByPlaceholderText('Ej., Av. Corrientes'), 'Av. Corrientes');
    await pickPlace(user, 'Provincia', 0, /^Buenos Aires$/);
    await pickPlace(user, 'Ciudad', 0, /^Buenos Aires/);
    // País y Código Postal quedan completos al elegir la ciudad del padrón.

    // Destination address fields.
    await user.type(screen.getByPlaceholderText('Ej., Av. San Martín'), 'Av. San Martín');
    await pickPlace(user, 'Provincia', 1, /^Córdoba$/);
    await pickPlace(user, 'Ciudad', 1, /^Córdoba/);

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

    renderPage();
    await fillBaseFields(user);

    await user.type(screen.getByPlaceholderText('Ej., Av. Corrientes'), 'Av. Corrientes');
    await pickPlace(user, 'Provincia', 0, /^Buenos Aires$/);
    await pickPlace(user, 'Ciudad', 0, /^Buenos Aires/);
    // País y Código Postal quedan completos al elegir la ciudad del padrón.

    await user.type(screen.getByPlaceholderText('Ej., Av. San Martín'), 'Av. San Martín');
    await pickPlace(user, 'Provincia', 1, /^Córdoba$/);
    await pickPlace(user, 'Ciudad', 1, /^Córdoba/);

    await user.click(screen.getByRole('button', { name: 'Crear Carga' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Corregí la dirección')).toBeInTheDocument();
    expect(loadsApi.create).not.toHaveBeenCalled();
  });
});
