import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import CompanyRequestsPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/company-admin/requests',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

jest.mock('@/lib/api', () => ({
  companiesApi: {
    getRequests: jest.fn(),
    decideRequest: jest.fn(),
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

const pendingReq = {
  id: 'r1',
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00.000Z',
  transporter: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+5491100000000' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth({ isAuthenticated: true, user: { id: 'ca1', role: 'TRANSPORTER' } });
});

describe('CompanyRequestsPage', () => {
  it('defaults to the PENDING tab and fetches with that status', async () => {
    companiesApi.getRequests.mockResolvedValue({ data: [pendingReq] });

    renderWithClient(<CompanyRequestsPage />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(companiesApi.getRequests).toHaveBeenCalledWith({ status: 'PENDING' });
  });

  it('approves a pending request', async () => {
    const user = userEvent.setup();
    companiesApi.getRequests.mockResolvedValue({ data: [pendingReq] });
    companiesApi.decideRequest.mockResolvedValue({ data: {} });

    renderWithClient(<CompanyRequestsPage />);

    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByRole('button', { name: /Aprobar/ }));

    await waitFor(() =>
      expect(companiesApi.decideRequest).toHaveBeenCalledWith('r1', 'APPROVE'),
    );
  });

  it('rejects a pending request', async () => {
    const user = userEvent.setup();
    companiesApi.getRequests.mockResolvedValue({ data: [pendingReq] });
    companiesApi.decideRequest.mockResolvedValue({ data: {} });

    renderWithClient(<CompanyRequestsPage />);

    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByRole('button', { name: /Rechazar/ }));

    await waitFor(() =>
      expect(companiesApi.decideRequest).toHaveBeenCalledWith('r1', 'REJECT'),
    );
  });

  it('switches tabs and refetches with the selected status', async () => {
    const user = userEvent.setup();
    companiesApi.getRequests.mockResolvedValue({ data: [] });

    renderWithClient(<CompanyRequestsPage />);

    await waitFor(() =>
      expect(companiesApi.getRequests).toHaveBeenCalledWith({ status: 'PENDING' }),
    );

    await user.click(screen.getByRole('button', { name: 'Aprobadas' }));

    await waitFor(() =>
      expect(companiesApi.getRequests).toHaveBeenCalledWith({ status: 'APPROVED' }),
    );
  });

  it('passes no status filter on the "Todas" tab', async () => {
    const user = userEvent.setup();
    companiesApi.getRequests.mockResolvedValue({ data: [] });

    renderWithClient(<CompanyRequestsPage />);

    await screen.findByText('No hay solicitudes en esta vista.');
    await user.click(screen.getByRole('button', { name: 'Todas' }));

    await waitFor(() =>
      expect(companiesApi.getRequests).toHaveBeenCalledWith({ status: undefined }),
    );
  });

  it('shows a status badge instead of buttons for resolved requests', async () => {
    companiesApi.getRequests.mockResolvedValue({
      data: [{ ...pendingReq, status: 'APPROVED' }],
    });

    renderWithClient(<CompanyRequestsPage />);

    await screen.findByText('Ada Lovelace');
    expect(screen.queryByRole('button', { name: /Aprobar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rechazar/ })).not.toBeInTheDocument();
  });
});
