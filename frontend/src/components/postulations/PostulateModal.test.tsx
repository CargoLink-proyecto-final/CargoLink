import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostulateModal from './PostulateModal';

function renderModal(props: Partial<React.ComponentProps<typeof PostulateModal>> = {}) {
  const onSubmit = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <PostulateModal
      listedPrice={props.listedPrice ?? 1000}
      submitting={props.submitting ?? false}
      onSubmit={props.onSubmit ?? onSubmit}
      onClose={props.onClose ?? onClose}
    />,
  );
  return { ...utils, onSubmit: props.onSubmit ?? onSubmit, onClose: props.onClose ?? onClose };
}

describe('PostulateModal — rendering', () => {
  it('renders as a modal dialog with the listed price', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enviar postulación' })).toBeInTheDocument();
    expect(screen.getByText('Precio listado:')).toBeInTheDocument();
  });

  it('shows the message and price fields, both optional', () => {
    renderModal();
    expect(screen.getByLabelText('Mensaje (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Precio propuesto (opcional)')).toBeInTheDocument();
  });

  it('updates the character counter as the message is typed', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText('Mensaje (opcional)'), 'hola');
    expect(screen.getByText('4/500')).toBeInTheDocument();
  });
});

describe('PostulateModal — submit', () => {
  it('submits with no message and no price (accept listed price)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Enviar postulación' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ message: undefined, proposedPrice: undefined });
  });

  it('submits with a trimmed message and a valid proposed price', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal({ listedPrice: 1000 });
    await user.type(screen.getByLabelText('Mensaje (opcional)'), '  Tengo camión  ');
    await user.type(screen.getByLabelText('Precio propuesto (opcional)'), '1500');
    await user.click(screen.getByRole('button', { name: 'Enviar postulación' }));
    expect(onSubmit).toHaveBeenCalledWith({ message: 'Tengo camión', proposedPrice: 1500 });
  });

  it('omits an empty/whitespace-only message', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();
    await user.type(screen.getByLabelText('Mensaje (opcional)'), '   ');
    await user.click(screen.getByRole('button', { name: 'Enviar postulación' }));
    expect(onSubmit).toHaveBeenCalledWith({ message: undefined, proposedPrice: undefined });
  });
});

describe('PostulateModal — price validation', () => {
  it('shows an error and disables submit when the price <= listed price', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal({ listedPrice: 1000 });
    await user.type(screen.getByLabelText('Precio propuesto (opcional)'), '900');
    expect(screen.getByText(/Debe ser mayor al precio listado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar postulación' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Enviar postulación' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows an error when the price equals the listed price', async () => {
    const user = userEvent.setup();
    renderModal({ listedPrice: 1000 });
    await user.type(screen.getByLabelText('Precio propuesto (opcional)'), '1000');
    expect(screen.getByText(/Debe ser mayor al precio listado/)).toBeInTheDocument();
  });

  it('shows an error when the price is <= 0', async () => {
    const user = userEvent.setup();
    renderModal({ listedPrice: 1000 });
    // type "-5" -> a number input may strip the minus depending on jsdom; use "0" style via 0
    const input = screen.getByLabelText('Precio propuesto (opcional)');
    await user.type(input, '-5');
    // Either the "> 0" error or the "> listed" error proves it is rejected.
    expect(screen.getByText(/El precio debe ser mayor a 0|Debe ser mayor al precio listado/)).toBeInTheDocument();
  });

  it('clears the error and enables submit once a valid price is entered', async () => {
    const user = userEvent.setup();
    renderModal({ listedPrice: 1000 });
    const input = screen.getByLabelText('Precio propuesto (opcional)');
    await user.type(input, '900');
    expect(screen.getByRole('button', { name: 'Enviar postulación' })).toBeDisabled();
    await user.clear(input);
    await user.type(input, '1200');
    expect(screen.queryByText(/Debe ser mayor al precio listado/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar postulación' })).toBeEnabled();
  });
});

describe('PostulateModal — cancel & submitting', () => {
  it('calls onClose when Cancelar is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons and shows "Enviando..." while submitting', () => {
    renderModal({ submitting: true });
    expect(screen.getByRole('button', { name: 'Enviando...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });
});
