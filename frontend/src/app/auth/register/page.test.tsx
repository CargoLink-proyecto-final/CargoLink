import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from './page';
import { authApi } from '@/lib/api';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/auth/register',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  authApi: {
    register: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// Labels in this page are not associated to inputs (no htmlFor/id), so query
// by input type / position rather than by label text.
const allTextboxes = () => screen.getAllByRole('textbox');
const getFirstName = () => allTextboxes()[0];
const getLastName = () => allTextboxes()[1];
// Email input is type="email" — not exposed as a textbox role; query by type.
const getEmail = () =>
  document.querySelector('input[type="email"]') as HTMLInputElement;
const getPhone = () =>
  document.querySelector('input[type="tel"]') as HTMLInputElement;
const passwordInputs = () =>
  Array.from(
    document.querySelectorAll('input[type="password"]'),
  ) as HTMLInputElement[];
const getPassword = () => passwordInputs()[0];
const getConfirm = () => passwordInputs()[1];

// Fills the fields shared by every role (TRANSPORTER hides firstName/lastName).
async function fillSharedFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(getEmail(), 'ada@example.com');
  await user.type(getPassword(), 'secret123');
  await user.type(getConfirm(), 'secret123');
  await user.type(getPhone(), '+54 9 351 123 4567');
}

describe('RegisterPage — rendering', () => {
  it('renders the role selector and core fields (CARGO_GENERATOR default)', () => {
    render(<RegisterPage />);
    expect(screen.getByText('Publicador de carga')).toBeInTheDocument();
    expect(screen.getByText('Transportista')).toBeInTheDocument();
    expect(screen.getByText('Empresa')).toBeInTheDocument();
    expect(getFirstName()).toBeInTheDocument();
    expect(getEmail()).toBeInTheDocument();
    expect(screen.getByText('Nombre').closest('label')).toBeInTheDocument();
    // Default role is not COMPANY_ADMIN nor TRANSPORTER → optional company field shows.
    expect(screen.getByText('Empresa (opcional)')).toBeInTheDocument();
  });

  it('hides name fields and shows a required company field for COMPANY_ADMIN', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    // CARGO_GENERATOR default: firstName, lastName, email, phone, companyName.
    // (email type="email" and phone type="tel" both expose the textbox role in jsdom.)
    expect(allTextboxes()).toHaveLength(5);
    await user.click(screen.getByText('Empresa'));
    await waitFor(() => {
      // COMPANY_ADMIN: name fields gone → email, phone, companyName remain.
      expect(allTextboxes()).toHaveLength(3);
    });
    expect(screen.getByText(/Nombre de la empresa/)).toBeInTheDocument();
  });

  it('hides the company field for TRANSPORTER', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    await user.click(screen.getByText('Transportista'));
    await waitFor(() => {
      expect(screen.queryByText('Empresa (opcional)')).not.toBeInTheDocument();
    });
  });
});

describe('RegisterPage — validation', () => {
  it('blocks empty submit and shows required messages', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    await user.click(screen.getByRole('button', { name: 'Registrarse' }));
    expect(await screen.findByText('El correo electrónico es obligatorio')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    await user.type(getPassword(), 'secret123');
    await user.type(getConfirm(), 'different9');
    await user.click(screen.getByRole('button', { name: 'Registrarse' }));
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('enforces password complexity (needs a number)', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    await user.type(getPassword(), 'onlyletters');
    await user.click(screen.getByRole('button', { name: 'Registrarse' }));
    expect(await screen.findByText('Debe contener al menos un número')).toBeInTheDocument();
  });
});

describe('RegisterPage — submit', () => {
  it('registers (without confirmPassword) and redirects to check-email on success', async () => {
    const user = userEvent.setup();
    (authApi.register as jest.Mock).mockResolvedValue({ data: {} });
    render(<RegisterPage />);
    // Default role CARGO_GENERATOR → firstName/lastName are rendered.
    await user.type(getFirstName(), 'Ada');
    await user.type(getLastName(), 'Lovelace');
    await fillSharedFields(user);
    await user.click(screen.getByRole('button', { name: 'Registrarse' }));

    await waitFor(() => expect(authApi.register).toHaveBeenCalledTimes(1));
    const sent = (authApi.register as jest.Mock).mock.calls[0][0];
    expect(sent).toMatchObject({
      email: 'ada@example.com',
      password: 'secret123',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+54 9 351 123 4567',
      role: 'CARGO_GENERATOR',
    });
    expect(sent).not.toHaveProperty('confirmPassword');
    expect(push).toHaveBeenCalledWith('/auth/check-email?email=ada%40example.com');
  });

  it('registers a TRANSPORTER without a company field (company is unregistered)', async () => {
    const user = userEvent.setup();
    (authApi.register as jest.Mock).mockResolvedValue({ data: {} });
    render(<RegisterPage />);
    await user.click(screen.getByText('Transportista'));
    // TRANSPORTER still shows firstName/lastName (only COMPANY_ADMIN hides them).
    await user.type(getFirstName(), 'Ada');
    await user.type(getLastName(), 'Lovelace');
    await fillSharedFields(user);
    await user.click(screen.getByRole('button', { name: 'Registrarse' }));

    await waitFor(() => expect(authApi.register).toHaveBeenCalledTimes(1));
    const sent = (authApi.register as jest.Mock).mock.calls[0][0];
    expect(sent).toMatchObject({
      email: 'ada@example.com',
      firstName: 'Ada',
      role: 'TRANSPORTER',
    });
    // The company field is hidden (shouldUnregister) for transporters.
    expect(sent.companyName).toBeUndefined();
    expect(push).toHaveBeenCalledWith('/auth/check-email?email=ada%40example.com');
  });

  it('surfaces a server error message when registration fails', async () => {
    const user = userEvent.setup();
    (authApi.register as jest.Mock).mockRejectedValue({
      response: { data: { message: 'El correo ya está registrado' } },
    });
    render(<RegisterPage />);
    await user.type(getFirstName(), 'Ada');
    await user.type(getLastName(), 'Lovelace');
    await fillSharedFields(user);
    await user.click(screen.getByRole('button', { name: 'Registrarse' }));

    expect(await screen.findByText('El correo ya está registrado')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
