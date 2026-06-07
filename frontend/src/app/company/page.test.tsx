import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyCompanyPage from './page';
import { companiesApi } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/company',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

jest.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}));

jest.mock('@/lib/api', () => ({
  companiesApi: {
    getMyMembership: jest.fn(),
    list: jest.fn(),
    requestToJoin: jest.fn(),
    cancelJoinRequest: jest.fn(),
    leave: jest.fn(),
  },
}));

const getMyMembership = companiesApi.getMyMembership as jest.Mock;
const list = companiesApi.list as jest.Mock;
const requestToJoin = companiesApi.requestToJoin as jest.Mock;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MyCompanyPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // No company yet → directory is enabled and listed.
  getMyMembership.mockResolvedValue({ data: { company: null, requests: [] } });
  list.mockResolvedValue({
    data: [
      { id: 'c1', name: 'Flota Norte', _count: { members: 3 } },
      { id: 'c2', name: 'Flota Sur', _count: { members: 1 } },
    ],
  });
  requestToJoin.mockResolvedValue({ data: {} });
});

describe('MyCompanyPage', () => {
  it('lists the available companies from the directory', async () => {
    renderPage();
    expect(await screen.findByText('Flota Norte')).toBeInTheDocument();
    expect(screen.getByText('Flota Sur')).toBeInTheDocument();
    expect(screen.getByText('3 conductores')).toBeInTheDocument();
    expect(screen.getByText('1 conductor')).toBeInTheDocument();
  });

  it('calls requestToJoin with the company id when clicking "Solicitar ingreso"', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Flota Norte');

    const joinButtons = screen.getAllByRole('button', { name: /Solicitar ingreso/i });
    await user.click(joinButtons[0]);

    await waitFor(() => expect(requestToJoin).toHaveBeenCalledWith('c1'));
  });

  it('shows the membership card when the user already belongs to a company', async () => {
    getMyMembership.mockResolvedValue({
      data: { company: { id: 'c9', name: 'Mi Flota' }, requests: [] },
    });
    renderPage();
    expect(await screen.findByText('Mi Flota')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salir/i })).toBeInTheDocument();
    // The directory section is not shown for a member: even if the directory
    // query briefly fires (enabled is true while membership is still undefined),
    // its results never render once membership.company is set.
    expect(screen.queryByText('Empresas disponibles')).not.toBeInTheDocument();
  });
});
