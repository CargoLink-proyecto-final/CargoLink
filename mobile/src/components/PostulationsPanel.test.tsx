import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import PostulationsPanel, {
  canAccept,
  canCounterOffer,
  transporterCurrentOffer,
} from './PostulationsPanel';
import { postulationsApi } from '../services/api';
import { formatCurrency } from '../lib/labels';
import { Postulation } from '../types';

jest.mock('../services/api', () => ({
  postulationsApi: {
    listForLoad: jest.fn(),
    accept: jest.fn(),
    counterOffer: jest.fn(),
  },
}));

const LISTED = 100000;

const make = (over: Partial<Postulation> = {}): Postulation => ({
  id: 'p1',
  loadId: 'l1',
  transporterId: 't1',
  transporter: { id: 't1', firstName: 'Carl', lastName: 'Driver', companyName: 'Fletes SA' },
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

// El backend rechaza cada combinación que estos helpers excluyen, así que se
// testean sueltos: son el contrato que evita ofrecer botones que dan 400/403.
describe('reglas de negociación', () => {
  describe('transporterCurrentOffer', () => {
    it('usa el precio listado cuando el transportista no propuso nada', () => {
      expect(transporterCurrentOffer(make(), LISTED)).toBe(LISTED);
    });

    it('usa el precio propuesto', () => {
      expect(transporterCurrentOffer(make({ proposedPrice: 120000 }), LISTED)).toBe(120000);
    });

    it('prefiere su contra-oferta cuando fue el último en ofertar', () => {
      const p = make({
        status: 'NEGOTIATING',
        proposedPrice: 120000,
        counterOfferPrice: 115000,
        lastOfferBy: 'TRANSPORTER',
      });
      expect(transporterCurrentOffer(p, LISTED)).toBe(115000);
    });

    it('ignora una contra-oferta que hizo el publicador', () => {
      const p = make({
        status: 'NEGOTIATING',
        proposedPrice: 120000,
        counterOfferPrice: 110000,
        lastOfferBy: 'SHIPPER',
      });
      expect(transporterCurrentOffer(p, LISTED)).toBe(120000);
    });
  });

  describe('canAccept', () => {
    it('permite aceptar una postulación pendiente', () => {
      expect(canAccept(make())).toBe(true);
    });

    it('permite aceptar cuando el transportista respondió', () => {
      expect(canAccept(make({ status: 'NEGOTIATING', lastOfferBy: 'TRANSPORTER' }))).toBe(true);
    });

    it('bloquea mientras espera respuesta a la propia contra-oferta', () => {
      // El backend: "Esperá la respuesta del transportista antes de aceptar".
      expect(canAccept(make({ status: 'NEGOTIATING', lastOfferBy: 'SHIPPER' }))).toBe(false);
    });

    it.each(['ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const)('bloquea en estado %s', (status) => {
      expect(canAccept(make({ status }))).toBe(false);
    });
  });

  describe('canCounterOffer', () => {
    it('bloquea si el transportista no puso precio: no hay contra qué negociar', () => {
      // El backend: "El transportista no propuso un precio, no hay nada que negociar."
      expect(canCounterOffer(make())).toBe(false);
    });

    it('permite contra-ofertar sobre un precio propuesto', () => {
      expect(canCounterOffer(make({ proposedPrice: 120000 }))).toBe(true);
    });

    it('bloquea cuando ya es turno del transportista', () => {
      const p = make({ status: 'NEGOTIATING', proposedPrice: 120000, lastOfferBy: 'SHIPPER' });
      expect(canCounterOffer(p)).toBe(false);
    });

    it('bloquea sobre una postulación ya aceptada', () => {
      expect(canCounterOffer(make({ status: 'ACCEPTED', proposedPrice: 120000 }))).toBe(false);
    });
  });
});

describe('PostulationsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (postulationsApi.accept as jest.Mock).mockResolvedValue({ data: {} });
    (postulationsApi.counterOffer as jest.Mock).mockResolvedValue({ data: {} });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  const renderPanel = (over: Partial<React.ComponentProps<typeof PostulationsPanel>> = {}) =>
    render(<PostulationsPanel loadId="l1" listedPrice={LISTED} isOpen {...over} />);

  it('shows the empty state when nobody postulated', async () => {
    (postulationsApi.listForLoad as jest.Mock).mockResolvedValue({ data: [] });

    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('Todavía no se postuló ningún transportista.')).toBeTruthy(),
    );
  });

  it('lists each postulation with its transporter and current asking price', async () => {
    (postulationsApi.listForLoad as jest.Mock).mockResolvedValue({
      data: [make({ proposedPrice: 120000, message: 'Tengo semi' })],
    });

    renderPanel();

    await waitFor(() => expect(screen.getByText('Carl Driver')).toBeTruthy());
    expect(screen.getByText('Fletes SA')).toBeTruthy();
    expect(screen.getByText('Tengo semi')).toBeTruthy();
    expect(screen.getByText(`Pide ${formatCurrency(120000)}`)).toBeTruthy();
  });

  it('marks a postulation that accepts the listed price', async () => {
    (postulationsApi.listForLoad as jest.Mock).mockResolvedValue({ data: [make()] });

    renderPanel();

    await waitFor(() =>
      expect(
        screen.getByText(`Pide ${formatCurrency(LISTED)} (acepta el precio publicado)`),
      ).toBeTruthy(),
    );
  });

  it('accepts a postulation after confirmation', async () => {
    (postulationsApi.listForLoad as jest.Mock).mockResolvedValue({ data: [make()] });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Aceptar')).toBeTruthy());
    fireEvent.press(screen.getByText('Aceptar'));

    // Se confirma con un Alert antes de asignar el viaje.
    const actions = (Alert.alert as jest.Mock).mock.calls[0][2] as any[];
    await actions.find((a) => a.text === 'Aceptar').onPress();

    await waitFor(() => expect(postulationsApi.accept).toHaveBeenCalledWith('p1'));
  });

  it('sends a counter-offer as a number', async () => {
    (postulationsApi.listForLoad as jest.Mock).mockResolvedValue({
      data: [make({ proposedPrice: 120000 })],
    });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Contra-ofertar')).toBeTruthy());
    fireEvent.press(screen.getByText('Contra-ofertar'));
    fireEvent.changeText(screen.getByPlaceholderText('Menor a 120000'), '110000');
    fireEvent.press(screen.getByText('Enviar contra-oferta'));

    await waitFor(() => expect(postulationsApi.counterOffer).toHaveBeenCalledWith('p1', 110000));
  });

  it('refuses to send a price that is not a number', async () => {
    (postulationsApi.listForLoad as jest.Mock).mockResolvedValue({
      data: [make({ proposedPrice: 120000 })],
    });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Contra-ofertar')).toBeTruthy());
    fireEvent.press(screen.getByText('Contra-ofertar'));
    fireEvent.changeText(screen.getByPlaceholderText('Menor a 120000'), 'abc');
    fireEvent.press(screen.getByText('Enviar contra-oferta'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Precio inválido', 'Ingresá un monto.'),
    );
    expect(postulationsApi.counterOffer).not.toHaveBeenCalled();
  });

  it('surfaces the server rejection of a counter-offer', async () => {
    (postulationsApi.listForLoad as jest.Mock).mockResolvedValue({
      data: [make({ proposedPrice: 120000 })],
    });
    (postulationsApi.counterOffer as jest.Mock).mockRejectedValue({
      response: { data: { message: 'El precio debe ser menor a la oferta del transportista ($120000).' } },
    });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Contra-ofertar')).toBeTruthy());
    fireEvent.press(screen.getByText('Contra-ofertar'));
    fireEvent.changeText(screen.getByPlaceholderText('Menor a 120000'), '130000');
    fireEvent.press(screen.getByText('Enviar contra-oferta'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'El precio debe ser menor a la oferta del transportista ($120000).',
      ),
    );
  });

  it('tells the shipper their own counter-offer is awaiting a reply', async () => {
    (postulationsApi.listForLoad as jest.Mock).mockResolvedValue({
      data: [make({ status: 'NEGOTIATING', proposedPrice: 120000, counterOfferPrice: 110000, lastOfferBy: 'SHIPPER' })],
    });

    renderPanel();

    await waitFor(() =>
      expect(
        screen.getByText(`Ofreciste ${formatCurrency(110000)} — esperando su respuesta.`),
      ).toBeTruthy(),
    );
    // Con la pelota del otro lado el backend rechaza ambas acciones.
    expect(screen.queryByText('Aceptar')).toBeNull();
    expect(screen.queryByText('Contra-ofertar')).toBeNull();
  });

  it('hides the actions once the load is no longer open', async () => {
    (postulationsApi.listForLoad as jest.Mock).mockResolvedValue({
      data: [make({ proposedPrice: 120000 })],
    });

    renderPanel({ isOpen: false });

    await waitFor(() => expect(screen.getByText('Carl Driver')).toBeTruthy());
    expect(screen.queryByText('Aceptar')).toBeNull();
    expect(screen.queryByText('Contra-ofertar')).toBeNull();
  });

  it('averages the current offers, not the proposed ones', async () => {
    (postulationsApi.listForLoad as jest.Mock).mockResolvedValue({
      data: [
        make({ id: 'a', proposedPrice: 120000 }),
        // Su contra-oferta manda sobre el precio propuesto.
        make({ id: 'b', status: 'NEGOTIATING', proposedPrice: 200000, counterOfferPrice: 140000, lastOfferBy: 'TRANSPORTER' }),
      ],
    });

    renderPanel();

    await waitFor(() =>
      expect(screen.getByText(`Oferta promedio: ${formatCurrency(130000)}`)).toBeTruthy(),
    );
  });

  it('does not crash when the request fails', async () => {
    (postulationsApi.listForLoad as jest.Mock).mockRejectedValue(new Error('network'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('Todavía no se postuló ningún transportista.')).toBeTruthy(),
    );
  });
});
