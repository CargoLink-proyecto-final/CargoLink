import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import TransporterReviewPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/admin/verifications/t1',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ userId: 't1' }),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

jest.mock('@/lib/api', () => ({
  transporterReviewApi: { getProfile: jest.fn(), review: jest.fn() },
  transporterProfileApi: { getDocumentFile: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transporterReviewApi } = require('@/lib/api') as {
  transporterReviewApi: Record<string, jest.Mock>;
};

const TYPES = [
  'DNI_FRONT',
  'DNI_BACK',
  'LICENSE_FRONT',
  'LICENSE_BACK',
  'AFIP_CONSTANCIA',
  'VEHICLE_CARD',
  'INSURANCE',
  'VTV',
] as const;

const profile = {
  user: {
    id: 't1',
    email: 'carrier@example.com',
    firstName: 'Ana',
    lastName: 'Gómez',
    phone: null,
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    cuit: '20-12345678-3',
    licenseCategory: 'E1',
    licenseExpiresAt: '2028-01-01T00:00:00.000Z',
    termsAcceptedAt: '2026-10-01T00:00:00.000Z',
    termsAcceptedVersion: '2026-09-22',
    company: null,
  },
  vehicle: {
    id: 'v1',
    userId: 't1',
    plate: 'AB123CD',
    brand: 'Scania',
    model: 'R450',
    year: 2020,
    type: 'SEMIRREMOLQUE',
    maxWeightKg: 28000,
    refrigerated: true,
    hazardousMaterials: false,
    bulkLiquid: false,
    createdAt: '',
    updatedAt: '',
  },
  documents: TYPES.map((type) => ({
    id: `doc-${type}`,
    type,
    status: 'PENDING',
    rejectionReason: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: '',
    updatedAt: '',
  })),
  status: {
    complete: true,
    approved: false,
    state: 'PENDING_REVIEW',
    missing: [],
    pendingReview: [...TYPES],
    rejected: [],
  },
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function documentRow(label: string) {
  // El label vive en un <p>; la fila es el contenedor con los botones.
  return screen.getByText(label).closest('div.px-5') as HTMLElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  (useAuthStore as unknown as jest.Mock).mockImplementation((sel?: (s: unknown) => unknown) => {
    const state = { isAuthenticated: true, user: { id: 'a1', role: 'ADMIN' } };
    return sel ? sel(state) : state;
  });
  transporterReviewApi.getProfile.mockResolvedValue({ data: profile });
  transporterReviewApi.review.mockResolvedValue({ data: profile.status });
});

describe('TransporterReviewPage', () => {
  it('shows the declared data next to the documents that back it', async () => {
    renderWithClient(<TransporterReviewPage />);

    expect(await screen.findByRole('heading', { name: 'Ana Gómez' })).toBeInTheDocument();
    expect(screen.getByText('20-12345678-3')).toBeInTheDocument();
    expect(screen.getByText('AB123CD')).toBeInTheDocument();
    expect(screen.getByText('Refrigerado')).toBeInTheDocument();
    expect(screen.getByText('Documentación en revisión')).toBeInTheDocument();
  });

  it('requires a reason before sending a rejection', async () => {
    renderWithClient(<TransporterReviewPage />);
    await screen.findByRole('heading', { name: 'Ana Gómez' });

    await userEvent.click(within(documentRow('VTV vigente')).getByRole('button', { name: /Rechazar/ }));

    expect(screen.getByText('Escribí el motivo de cada rechazo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar revisión' })).toBeDisabled();
  });

  it('sends every decision together, with the rejection reason', async () => {
    renderWithClient(<TransporterReviewPage />);
    await screen.findByRole('heading', { name: 'Ana Gómez' });

    await userEvent.click(screen.getByRole('button', { name: /Aprobar pendientes/ }));
    await userEvent.click(within(documentRow('VTV vigente')).getByRole('button', { name: /Rechazar/ }));
    await userEvent.type(screen.getByLabelText(/Motivo del rechazo/), 'Está vencida');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar revisión' }));

    await waitFor(() => expect(transporterReviewApi.review).toHaveBeenCalledTimes(1));
    const [userId, decisions] = transporterReviewApi.review.mock.calls[0];
    expect(userId).toBe('t1');
    expect(decisions).toHaveLength(TYPES.length);
    expect(decisions).toContainEqual({ documentId: 'doc-VTV', status: 'REJECTED', reason: 'Está vencida' });
    expect(decisions).toContainEqual({ documentId: 'doc-DNI_FRONT', status: 'APPROVED' });
  });
});
