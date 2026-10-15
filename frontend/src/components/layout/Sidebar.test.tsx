import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Sidebar from './Sidebar';
import { useAuthStore } from '@/store/auth';
import { messagesApi, postulationsApi, transporterProfileApi, transporterReviewApi } from '@/lib/api';

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
  postulationsApi: { getMy: jest.fn() },
  transporterProfileApi: { getStatus: jest.fn() },
  transporterReviewApi: { getQueue: jest.fn() },
}));

const status = (state: string, missing: string[] = []) => ({
  complete: state !== 'INCOMPLETE',
  approved: state === 'APPROVED',
  state,
  missing,
  pendingReview: [],
  rejected: [],
});

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
  (postulationsApi.getMy as jest.Mock).mockResolvedValue({ data: [] });
  (transporterProfileApi.getStatus as jest.Mock).mockResolvedValue({ data: status('APPROVED') });
  (transporterReviewApi.getQueue as jest.Mock).mockResolvedValue({ data: [] });
});

// Una postulación que dejó la pelota del lado del transportista.
function awaitingReply(id: string) {
  return { id, loadId: `l-${id}`, status: 'NEGOTIATING', lastOfferBy: 'SHIPPER', load: {} };
}

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
    expect(screen.getByText('Viajes')).toBeInTheDocument();
    expect(screen.getByText('Mensajes')).toBeInTheDocument();
    // Publicar una carga se hace desde "Mis Cargas": no hay entrada propia en el nav.
    expect(screen.queryByText('Nueva Carga')).not.toBeInTheDocument();
  });

  it('renders transporter-specific nav links', () => {
    mockAuth({ user: TRANSPORTER, logout });
    renderSidebar();
    expect(screen.getByText('Cargas Disponibles')).toBeInTheDocument();
    expect(screen.getByText('Mis Postulaciones')).toBeInTheDocument();
    expect(screen.getByText('Mi Empresa')).toBeInTheDocument();
    // "Completar perfil" no es un ítem propio del nav — vive dentro de "Mi
    // perfil" (ver los tests de más abajo), para no sumar una pestaña más.
    expect(screen.queryByText('Completar perfil')).not.toBeInTheDocument();
    // shipper-only label should not appear
    expect(screen.queryByText('Mis Cargas')).not.toBeInTheDocument();
  });

  it('badges "Mi perfil" when the transporter profile is incomplete', async () => {
    (transporterProfileApi.getStatus as jest.Mock).mockResolvedValue({
      data: status('INCOMPLETE', ['vehicle']),
    });
    mockAuth({ user: TRANSPORTER, logout });
    renderSidebar();

    await waitFor(() => {
      const link = screen.getByText('Mi perfil').closest('a');
      expect(link?.textContent).toContain('!');
    });
  });

  it('badges "Mi perfil" when a document was rejected', async () => {
    (transporterProfileApi.getStatus as jest.Mock).mockResolvedValue({ data: status('REJECTED') });
    mockAuth({ user: TRANSPORTER, logout });
    renderSidebar();

    await waitFor(() => {
      expect(screen.getByText('Mi perfil').closest('a')?.textContent).toContain('!');
    });
  });

  it('does not badge "Mi perfil" while the documents wait for the admin', async () => {
    // En revisión no hay nada que hacer del lado del transportista.
    (transporterProfileApi.getStatus as jest.Mock).mockResolvedValue({ data: status('PENDING_REVIEW') });
    mockAuth({ user: TRANSPORTER, logout });
    renderSidebar();

    await waitFor(() => expect(transporterProfileApi.getStatus).toHaveBeenCalled());
    expect(screen.getByText('Mi perfil').closest('a')?.textContent).toBe('Mi perfil');
  });

  it('does not badge "Mi perfil" when the profile is already approved', async () => {
    mockAuth({ user: TRANSPORTER, logout });
    renderSidebar();

    await waitFor(() => expect(transporterProfileApi.getStatus).toHaveBeenCalled());
    expect(screen.getByText('Mi perfil').closest('a')?.textContent).toBe('Mi perfil');
  });

  it('shipper does not query the transporter profile status', () => {
    mockAuth({ user: SHIPPER, logout });
    renderSidebar();
    expect(transporterProfileApi.getStatus).not.toHaveBeenCalled();
    expect(screen.getByText('Mi perfil').closest('a')?.textContent).toBe('Mi perfil');
  });

  it('only the transporter gets the postulations entry', () => {
    mockAuth({ user: SHIPPER, logout });
    renderSidebar();
    expect(screen.queryByText('Mis Postulaciones')).not.toBeInTheDocument();
    // El endpoint /postulations/my está restringido a TRANSPORTER: no se consulta
    // para otros roles para no disparar un 403 en cada carga de página.
    expect(postulationsApi.getMy).not.toHaveBeenCalled();
  });

  it('renders admin-specific nav links', () => {
    mockAuth({ user: ADMIN, logout });
    renderSidebar();
    expect(screen.getByText('Todas las Cargas')).toBeInTheDocument();
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
    expect(screen.getByText('Verificaciones').closest('a')).toHaveAttribute(
      'href',
      '/dashboard/admin/verifications',
    );
  });

  it('badges "Verificaciones" with the transporters waiting for review', async () => {
    (transporterReviewApi.getQueue as jest.Mock).mockResolvedValue({ data: [{ id: 't1' }, { id: 't2' }] });
    mockAuth({ user: ADMIN, logout });
    renderSidebar();

    await waitFor(() =>
      expect(screen.getByText('Verificaciones').closest('a')?.textContent).toContain('2'),
    );
  });

  it('only the admin queries the review queue', () => {
    mockAuth({ user: TRANSPORTER, logout });
    renderSidebar();
    expect(transporterReviewApi.getQueue).not.toHaveBeenCalled();
  });

  it('shows the role label in the brand block', () => {
    mockAuth({ user: SHIPPER, logout });
    renderSidebar();
    expect(screen.getByText('Publicador de carga')).toBeInTheDocument();
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

  it('badges "Mis Postulaciones" only with the ones awaiting the carrier reply', async () => {
    (postulationsApi.getMy as jest.Mock).mockResolvedValue({
      data: [
        awaitingReply('p1'),
        awaitingReply('p2'),
        // La última oferta la puso el transportista: la pelota no es suya.
        { id: 'p3', loadId: 'l3', status: 'NEGOTIATING', lastOfferBy: 'TRANSPORTER', load: {} },
        // Estados ya resueltos no piden acción.
        { id: 'p4', loadId: 'l4', status: 'ACCEPTED', lastOfferBy: 'SHIPPER', load: {} },
        { id: 'p5', loadId: 'l5', status: 'PENDING', lastOfferBy: null, load: {} },
      ],
    });
    mockAuth({ user: TRANSPORTER, logout });
    renderSidebar();

    // El conteo aparece dos veces: en el ítem del nav y en el burger de mobile.
    const badges = await screen.findAllByText('2');
    const navBadge = badges.find((el) => el.closest('a')?.getAttribute('href') === '/postulations');
    expect(navBadge).toBeDefined();
  });

  it('hides the postulations badge when nothing awaits a reply', async () => {
    (postulationsApi.getMy as jest.Mock).mockResolvedValue({
      data: [{ id: 'p1', loadId: 'l1', status: 'PENDING', lastOfferBy: null, load: {} }],
    });
    mockAuth({ user: TRANSPORTER, logout });
    renderSidebar();

    const link = await screen.findByText('Mis Postulaciones');
    expect(link.closest('a')?.textContent).toBe('Mis Postulaciones');
  });
});
