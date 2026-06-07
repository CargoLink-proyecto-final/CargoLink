import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostulationCard from './PostulationCard';
import type { PostulationWithTransporter } from '@/types';

const baseTransporter: PostulationWithTransporter['transporter'] = {
  id: 't-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+5491100000000',
  companyName: 'Lovelace Logística',
  avatarUrl: null,
};

function makePostulation(
  overrides: Partial<PostulationWithTransporter> = {},
): PostulationWithTransporter {
  return {
    id: 'p-1',
    loadId: 'load-1',
    transporterId: 't-1',
    message: null,
    proposedPrice: null,
    counterOfferPrice: null,
    lastOfferBy: null,
    status: 'PENDING',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    transporter: baseTransporter,
    averageRating: 0,
    totalRatings: 0,
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof PostulationCard>> = {}) {
  const onAccept = jest.fn();
  const onCounterOffer = jest.fn();
  const utils = render(
    <PostulationCard
      postulation={props.postulation ?? makePostulation()}
      listedPrice={props.listedPrice ?? 1000}
      canAccept={props.canAccept ?? true}
      onAccept={props.onAccept ?? onAccept}
      accepting={props.accepting ?? false}
      onCounterOffer={props.onCounterOffer ?? onCounterOffer}
      counteringOffer={props.counteringOffer ?? false}
    />,
  );
  return { ...utils, onAccept: props.onAccept ?? onAccept, onCounterOffer: props.onCounterOffer ?? onCounterOffer };
}

describe('PostulationCard — rendering', () => {
  it('renders transporter name, company, email and phone', () => {
    renderCard();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Lovelace Logística')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ada@example.com/ })).toHaveAttribute(
      'href',
      'mailto:ada@example.com',
    );
    expect(screen.getByRole('link', { name: /\+5491100000000/ })).toHaveAttribute(
      'href',
      'tel:+5491100000000',
    );
  });

  it('shows initials avatar when there is no avatarUrl', () => {
    renderCard();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('renders an avatar image when avatarUrl is provided', () => {
    renderCard({
      postulation: makePostulation({
        transporter: { ...baseTransporter, avatarUrl: 'http://img/avatar.png' },
      }),
    });
    const img = screen.getByRole('img', { name: 'Ada Lovelace' });
    expect(img).toHaveAttribute('src', 'http://img/avatar.png');
  });

  it('shows "Sin calificaciones" when there are no ratings', () => {
    renderCard();
    expect(screen.getByText('Sin calificaciones')).toBeInTheDocument();
  });

  it('shows the rating stars and score when there are ratings', () => {
    renderCard({
      postulation: makePostulation({ averageRating: 4.2, totalRatings: 7 }),
    });
    expect(screen.getByText('4.2 (7)')).toBeInTheDocument();
    expect(screen.getByLabelText('4.2 estrellas')).toBeInTheDocument();
  });

  it('renders the message when present', () => {
    renderCard({ postulation: makePostulation({ message: 'Camión refrigerado disponible' }) });
    expect(screen.getByText('Camión refrigerado disponible')).toBeInTheDocument();
  });

  it('renders the status badge', () => {
    renderCard({ postulation: makePostulation({ status: 'NEGOTIATING' }) });
    expect(screen.getByText('En negociación')).toBeInTheDocument();
  });

  it('shows the listed price and the proposed price', () => {
    renderCard({
      postulation: makePostulation({ proposedPrice: 1200 }),
      listedPrice: 1000,
    });
    expect(screen.getByText('Precio listado')).toBeInTheDocument();
    expect(screen.getByText('Oferta del transportista')).toBeInTheDocument();
  });
});

describe('PostulationCard — accept action', () => {
  it('shows "Elegir transportista" for a PENDING postulation when canAccept', () => {
    const { onAccept } = renderCard({ postulation: makePostulation({ status: 'PENDING' }) });
    const btn = screen.getByRole('button', { name: 'Elegir transportista' });
    expect(btn).toBeInTheDocument();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('calls onAccept when "Elegir transportista" is clicked', async () => {
    const user = userEvent.setup();
    const { onAccept } = renderCard({ postulation: makePostulation({ status: 'PENDING' }) });
    await user.click(screen.getByRole('button', { name: 'Elegir transportista' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('does not show the accept button when canAccept is false', () => {
    renderCard({ canAccept: false, postulation: makePostulation({ status: 'PENDING' }) });
    expect(screen.queryByRole('button', { name: /Elegir transportista/ })).not.toBeInTheDocument();
  });

  it('disables the accept button and shows "Asignando..." while accepting', () => {
    renderCard({ postulation: makePostulation({ status: 'PENDING' }), accepting: true });
    const btn = screen.getByRole('button', { name: 'Asignando...' });
    expect(btn).toBeDisabled();
  });

  it('shows the accept button for NEGOTIATING when the last offer is from TRANSPORTER', () => {
    renderCard({
      postulation: makePostulation({
        status: 'NEGOTIATING',
        proposedPrice: 1100,
        counterOfferPrice: 1050,
        lastOfferBy: 'TRANSPORTER',
      }),
    });
    expect(screen.getByRole('button', { name: 'Elegir transportista' })).toBeInTheDocument();
  });

  it('hides the accept button for NEGOTIATING when the last offer is from SHIPPER', () => {
    renderCard({
      postulation: makePostulation({
        status: 'NEGOTIATING',
        proposedPrice: 1100,
        counterOfferPrice: 950,
        lastOfferBy: 'SHIPPER',
      }),
    });
    expect(screen.queryByRole('button', { name: /Elegir transportista/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Esperando respuesta del transportista/)).toBeInTheDocument();
  });
});

describe('PostulationCard — counter-offer flow', () => {
  it('shows "Contra-ofertar" for a PENDING postulation with a proposed price', () => {
    renderCard({ postulation: makePostulation({ status: 'PENDING', proposedPrice: 1200 }) });
    expect(screen.getByRole('button', { name: 'Contra-ofertar' })).toBeInTheDocument();
  });

  it('does not allow countering when there is no transporter price (proposedPrice null)', () => {
    renderCard({ postulation: makePostulation({ status: 'PENDING', proposedPrice: null }) });
    expect(screen.queryByRole('button', { name: 'Contra-ofertar' })).not.toBeInTheDocument();
  });

  it('opens an inline form when "Contra-ofertar" is clicked', async () => {
    const user = userEvent.setup();
    renderCard({ postulation: makePostulation({ status: 'PENDING', proposedPrice: 1200 }) });
    await user.click(screen.getByRole('button', { name: 'Contra-ofertar' }));
    expect(screen.getByPlaceholderText('Menos de $1200')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
  });

  it('submits a valid counter offer (below transporter price) via onCounterOffer', async () => {
    const user = userEvent.setup();
    const { onCounterOffer } = renderCard({
      postulation: makePostulation({ status: 'PENDING', proposedPrice: 1200 }),
    });
    await user.click(screen.getByRole('button', { name: 'Contra-ofertar' }));
    await user.type(screen.getByPlaceholderText('Menos de $1200'), '1100');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onCounterOffer).toHaveBeenCalledTimes(1);
    expect(onCounterOffer).toHaveBeenCalledWith(1100);
  });

  it('blocks and shows an error when the counter is >= the transporter price', async () => {
    const user = userEvent.setup();
    const { onCounterOffer } = renderCard({
      postulation: makePostulation({ status: 'PENDING', proposedPrice: 1200 }),
    });
    await user.click(screen.getByRole('button', { name: 'Contra-ofertar' }));
    await user.type(screen.getByPlaceholderText('Menos de $1200'), '1300');
    expect(screen.getByText(/Debe ser menor a la oferta del transportista/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(onCounterOffer).not.toHaveBeenCalled();
  });

  it('shows an error when the counter is <= 0', async () => {
    const user = userEvent.setup();
    renderCard({ postulation: makePostulation({ status: 'PENDING', proposedPrice: 1200 }) });
    await user.click(screen.getByRole('button', { name: 'Contra-ofertar' }));
    await user.type(screen.getByPlaceholderText('Menos de $1200'), '0');
    expect(screen.getByText('El precio debe ser mayor a 0')).toBeInTheDocument();
  });

  it('closes the inline form on Cancelar', async () => {
    const user = userEvent.setup();
    renderCard({ postulation: makePostulation({ status: 'PENDING', proposedPrice: 1200 }) });
    await user.click(screen.getByRole('button', { name: 'Contra-ofertar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByPlaceholderText('Menos de $1200')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contra-ofertar' })).toBeInTheDocument();
  });

  it('does not allow countering when canAccept is false', () => {
    renderCard({
      canAccept: false,
      postulation: makePostulation({ status: 'PENDING', proposedPrice: 1200 }),
    });
    expect(screen.queryByRole('button', { name: 'Contra-ofertar' })).not.toBeInTheDocument();
  });

  it('does not allow countering when the last offer is already from SHIPPER', () => {
    renderCard({
      postulation: makePostulation({
        status: 'NEGOTIATING',
        proposedPrice: 1200,
        counterOfferPrice: 1000,
        lastOfferBy: 'SHIPPER',
      }),
    });
    expect(screen.queryByRole('button', { name: 'Contra-ofertar' })).not.toBeInTheDocument();
  });
});
