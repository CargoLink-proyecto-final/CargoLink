import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Sidebar from './Sidebar';
import { useAuthStore } from '@/store/auth';
import { messagesApi } from '@/lib/api';

const push = jest.fn();
const logout = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/dashboard/shipper',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/lib/api', () => ({
  messagesApi: { getUnreadCount: jest.fn() },
}));

const SHIPPER = {
  id: 'u1',
  email: 'shipper@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: 'CARGO_GENERATOR',
};

const TRANSPORTER = { ...SHIPPER, role: 'TRANSPORTER', email: 'carrier@example.com' };
const ADMIN = { ...SHIPPER, role: 'ADMIN' };

// Mock useAuthStore to support both `useAuthStore()` and `useAuthStore(selector)`.
function mockAuth(state: Record<string, unknown>) {
  (useAuthStore as unknown as jest.Mock).mockImplementation((sel?: (s: unknown) => unknown) =>
    sel ? sel(state) : state,
  );
  // getState is referenced for the AuthUser type only, but keep it safe.
  (useAuthStore as unknown as { getState?: () => unknown }).getState = () => state;
}

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Sidebar />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (messagesApi.getUnreadCount as jest.Mock).mockResolvedValue({ data: { unreadCount: 0 } });
});

describe('Sidebar', () => {
  it('renders nothing when there is no user', () => {
    mockAuth({ user: null, logout });
    const { container } = renderSidebar();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders shipper (CARGO_GENERATOR) nav links', () => {
    mockAuth({ user: SHIPPER, logout });
    renderSidebar();
    expect(screen.getByText('Panel')).toBeInTheDocument();
    expect(screen.getByText('Mis Cargas')).toBeInTheDocument();
    expect(screen.getByText('Nueva Carga')).toBeInTheDocument();
    expect(screen.getByText('Seguimiento')).toBeInTheDocument();
    expect(screen.getByText('Mensajes')).toBeInTheDocument();
  });

  it('renders transporter-specific nav links', () => {
    mockAuth({ user: TRANSPORTER, logout });
    renderSidebar();
    expect(screen.getByText('Cargas Disponibles')).toBeInTheDocument();
    expect(screen.getByText('Mi Empresa')).toBeInTheDocument();
    // shipper-only label should not appear
    expect(screen.queryByText('Nueva Carga')).not.toBeInTheDocument();
  });

  it('renders admin-specific nav links', () => {
    mockAuth({ user: ADMIN, logout });
    renderSidebar();
    expect(screen.getByText('Todas las Cargas')).toBeInTheDocument();
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
  });

  it('shows the role label in the brand block', () => {
    mockAuth({ user: SHIPPER, logout });
    renderSidebar();
    expect(screen.getByText('Generador de carga')).toBeInTheDocument();
  });

  it('renders the user name, email and initials', () => {
    mockAuth({ user: SHIPPER, logout });
    renderSidebar();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('shipper@example.com')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('highlights the active route', () => {
    // usePathname mock returns '/dashboard/shipper' which is the shipper Panel.
    mockAuth({ user: SHIPPER, logout });
    renderSidebar();
    const activeLink = screen.getByText('Panel').closest('a');
    expect(activeLink).toHaveClass('bg-ink-800/70');
    // a non-active link should not have the active background
    const otherLink = screen.getByText('Mis Cargas').closest('a');
    expect(otherLink).not.toHaveClass('bg-ink-800/70');
  });

  it('calls logout and redirects to login on "Cerrar sesión"', async () => {
    mockAuth({ user: SHIPPER, logout });
    renderSidebar();
    await userEvent.click(screen.getByText('Cerrar sesión'));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/auth/login');
  });

  it('toggles the mobile menu open on burger click', async () => {
    mockAuth({ user: SHIPPER, logout });
    const { container } = renderSidebar();
    const burger = screen.getByLabelText('Toggle navigation');
    const aside = container.querySelector('aside');
    expect(aside).toHaveClass('-translate-x-full');
    await userEvent.click(burger);
    expect(aside).toHaveClass('translate-x-0');
  });

  it('shows an unread badge next to Mensajes when there are unread messages', async () => {
    (messagesApi.getUnreadCount as jest.Mock).mockResolvedValue({ data: { unreadCount: 3 } });
    mockAuth({ user: SHIPPER, logout });
    renderSidebar();
    // wait for the query to resolve; the count shows in both the mobile burger
    // badge and the "Mensajes" nav badge, so there are two matching elements.
    const badges = await screen.findAllByText('3');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});
