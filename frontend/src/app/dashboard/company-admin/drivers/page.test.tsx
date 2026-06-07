import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import CompanyDriversPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/company-admin/drivers',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

jest.mock('@/lib/api', () => ({
  companiesApi: {
    getDrivers: jest.fn(),
    removeDriver: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { companiesApi } = require('@/lib/api') as {
  companiesApi: Record<string, jest.Mock>;
};

function mockAuth(state: Record<string, unknown>) {
  (useAuthStore as unknown as jest.Mock).mockImplementation((sel?: (s: unknown) => unknown) =>
    sel ? sel(state) : state,
  );
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const drivers = [
  { id: 'd1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+5491100000000' },
  { id: 'd2', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', phone: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth({ isAuthenticated: true, user: { id: 'ca1', role: 'TRANSPORTER' } });
});

describe('CompanyDriversPage', () => {
  it('lists drivers with their contact info and count', async () => {
    companiesApi.getDrivers.mockResolvedValue({ data: drivers });

    renderWithClient(<CompanyDriversPage />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('+5491100000000')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('links each driver to its performance page', async () => {
    companiesApi.getDrivers.mockResolvedValue({ data: drivers });

    renderWithClient(<CompanyDriversPage />);

    await screen.findByText('Ada Lovelace');
    const links = screen.getAllByRole('link', { name: /Rendimiento/ });
    expect(links[0]).toHaveAttribute('href', '/dashboard/company-admin/drivers/d1');
    expect(links[1]).toHaveAttribute('href', '/dashboard/company-admin/drivers/d2');
  });

  it('removes a driver after confirmation', async () => {
    const user = userEvent.setup();
    companiesApi.getDrivers.mockResolvedValue({ data: drivers });
    companiesApi.removeDriver.mockResolvedValue({ data: {} });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithClient(<CompanyDriversPage />);

    await screen.findByText('Ada Lovelace');
    const removeButtons = screen.getAllByRole('button', { name: /Quitar/ });
    await user.click(removeButtons[0]);

    await waitFor(() => expect(companiesApi.removeDriver).toHaveBeenCalledWith('d1'));
    confirmSpy.mockRestore();
  });

  it('does not remove a driver when confirmation is cancelled', async () => {
    const user = userEvent.setup();
    companiesApi.getDrivers.mockResolvedValue({ data: drivers });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithClient(<CompanyDriversPage />);

    await screen.findByText('Ada Lovelace');
    const removeButtons = screen.getAllByRole('button', { name: /Quitar/ });
    await user.click(removeButtons[0]);

    expect(companiesApi.removeDriver).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows the empty state when there are no drivers', async () => {
    companiesApi.getDrivers.mockResolvedValue({ data: [] });

    renderWithClient(<CompanyDriversPage />);

    expect(
      await screen.findByText(
        'Todavía no tenés conductores. Aprobá solicitudes para sumar a tu flota.',
      ),
    ).toBeInTheDocument();
  });
});
