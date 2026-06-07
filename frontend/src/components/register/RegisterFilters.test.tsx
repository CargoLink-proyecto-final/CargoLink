import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterFiltersBar from './RegisterFilters';
import type { RegisterFilters } from '@/types/register';

const exportRegisterMock = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/hooks/useRegister', () => ({
  exportRegister: (...args: any[]) => exportRegisterMock(...args),
}));

function renderBar(overrides: Partial<React.ComponentProps<typeof RegisterFiltersBar>> = {}) {
  const onChange = jest.fn();
  const props = {
    filters: {} as RegisterFilters,
    onChange,
    isAdmin: false,
    total: 5,
    ...overrides,
  };
  render(<RegisterFiltersBar {...props} />);
  return { onChange, props };
}

describe('RegisterFiltersBar', () => {
  beforeEach(() => {
    exportRegisterMock.mockClear();
  });

  it('renders the search input, status buttons and date inputs', () => {
    renderBar();
    expect(
      screen.getByPlaceholderText(/Buscar por título/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entregada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelada' })).toBeInTheDocument();
    expect(screen.getByText('Desde')).toBeInTheDocument();
    expect(screen.getByText('Hasta')).toBeInTheDocument();
    expect(screen.getByText('5 cargas')).toBeInTheDocument();
  });

  it('hides the participant input for non-admins and shows it for admins', () => {
    const { props } = renderBar({ isAdmin: false });
    expect(
      screen.queryByPlaceholderText(/Generador o transportista/),
    ).not.toBeInTheDocument();

    render(<RegisterFiltersBar {...props} isAdmin />);
    expect(
      screen.getByPlaceholderText(/Generador o transportista/),
    ).toBeInTheDocument();
  });

  it('calls onChange with q when typing in the search box', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar();
    await user.type(screen.getByPlaceholderText(/Buscar por título/), 'X');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ q: 'X' }));
  });

  it('calls onChange with participant when admin types in the participant box', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar({ isAdmin: true });
    await user.type(
      screen.getByPlaceholderText(/Generador o transportista/),
      'A',
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ participant: 'A' }),
    );
  });

  it('calls onChange with the from/to dates', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar();
    const dateInputs = document.querySelectorAll('input[type="date"]');
    await user.type(dateInputs[0] as HTMLElement, '2026-01-01');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-01-01' }),
    );

    onChange.mockClear();
    await user.type(dateInputs[1] as HTMLElement, '2026-02-01');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ to: '2026-02-01' }),
    );
  });

  it('toggles a status off when both are active by default', async () => {
    const user = userEvent.setup();
    // No statuses in filters => both treated active by default.
    const { onChange } = renderBar({ filters: {} });
    await user.click(screen.getByRole('button', { name: 'Entregada' }));
    // Clicking DELIVERED removes it, leaving only CANCELLED.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: ['CANCELLED'] }),
    );
  });

  it('shows a clear button when a filter is active and resets via onChange({})', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar({ filters: { q: 'foo' } });
    const clearBtn = screen.getByRole('button', { name: /Limpiar/ });
    await user.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('invokes exportRegister with the current filters on export click', async () => {
    const user = userEvent.setup();
    const filters: RegisterFilters = { q: 'metal' };
    renderBar({ filters, total: 5 });
    await user.click(screen.getByRole('button', { name: /Exportar CSV/ }));
    expect(exportRegisterMock).toHaveBeenCalledWith(filters);
  });

  it('disables the export button when total is 0', () => {
    renderBar({ total: 0 });
    expect(screen.getByRole('button', { name: /Exportar CSV/ })).toBeDisabled();
  });
});
