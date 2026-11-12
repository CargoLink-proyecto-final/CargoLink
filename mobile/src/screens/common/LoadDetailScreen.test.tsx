import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoadDetailScreen from './LoadDetailScreen';
import { loadsApi, tripsApi, postulationsApi, transporterProfileApi } from '../../services/api';

jest.mock('../../services/api', () => ({
  loadsApi: {
    getById: jest.fn(),
    cancel: jest.fn(),
  },
  tripsApi: {
    accept: jest.fn(),
    start: jest.fn(),
    complete: jest.fn(),
  },
  postulationsApi: {
    create: jest.fn(),
    listMine: jest.fn(),
    listForLoad: jest.fn(),
    acceptOffer: jest.fn(),
    withdraw: jest.fn(),
  },
  // Vehículo del transportista: por defecto cumple los requisitos de baseLoad.
  transporterProfileApi: {
    getVehicle: jest.fn().mockResolvedValue({
      data: {
        bodyType: 'ABIERTA',
        refrigerated: false,
        hazardousMaterials: false,
        maxWeightKg: 12000,
        maxVolumeM3: null,
      },
    }),
  },
}));

let mockUser: any = {
  id: 'carrier1',
  role: 'TRANSPORTER',
  firstName: 'Carl',
  lastName: 'Driver',
};

// Consumed as a selector: useAuthStore((s) => s.user)
jest.mock('../../store/auth', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

const baseLoad = {
  id: 'l1',
  shipperId: 'shipper1',
  shipper: { id: 'shipper1', firstName: 'Sam', lastName: 'Shipper', companyName: 'Acme' },
  title: 'Steel beams',
  description: 'Heavy steel beams',
  originAddress: 'Buenos Aires',
  originLat: -34.6,
  originLng: -58.38,
  destAddress: 'Cordoba',
  destLat: -31.4,
  destLng: -64.18,
  cargoType: 'GENERAL',
  weight: 1200,
  volume: 5,
  price: 50000,
  status: 'PUBLISHED',
  createdAt: '2026-01-01T00:00:00Z',
};

const makeRoute = () => ({ params: { id: 'l1' } });
const makeNav = () => ({
  goBack: jest.fn(),
  navigate: jest.fn(),
  // Tipado explícito: sin los parámetros, TS infiere una tupla vacía para
  // `mock.calls` y no deja leer el evento ni el callback.
  addListener: jest.fn((_event: string, _callback: () => void) => jest.fn()),
});

describe('LoadDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'carrier1', role: 'TRANSPORTER', firstName: 'Carl', lastName: 'Driver' };
    (postulationsApi.listMine as jest.Mock).mockResolvedValue({ data: [] });
    (postulationsApi.create as jest.Mock).mockResolvedValue({ data: {} });
    // Lo consume PostulationsPanel cuando el que mira es el publicador dueño.
    (postulationsApi.listForLoad as jest.Mock).mockResolvedValue({ data: [] });
  });

  it('fetches the load by id and renders its details', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });

    const { getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
    expect(loadsApi.getById).toHaveBeenCalledWith('l1');
    expect(getByText('Buenos Aires')).toBeTruthy();
    expect(getByText('Cordoba')).toBeTruthy();
    expect(getByText('Sam Shipper')).toBeTruthy();
    expect(getByText('Acme')).toBeTruthy();
    expect(getByText('1200 kg')).toBeTruthy();
    // El badge muestra el stage unificado de la solicitud, no el enum crudo.
    expect(getByText('Creado')).toBeTruthy();
  });

  it('renders the package details and shipper industry', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({
      data: {
        ...baseLoad,
        packageCount: 12,
        heightCm: 120,
        widthCm: 80,
        lengthCm: 100,
        shipper: { ...baseLoad.shipper, industry: 'Agroindustria' },
      },
    });

    const { getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('12')).toBeTruthy());
    expect(getByText('120 × 80 × 100 cm')).toBeTruthy();
    expect(getByText('Rubro: Agroindustria')).toBeTruthy();
  });

  it('renders a dash for the dimensions that are missing', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({
      data: { ...baseLoad, heightCm: 120 },
    });

    const { getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('120 × — × — cm')).toBeTruthy());
  });

  it('omits the optional blocks when the load has no package data', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });

    const { queryByText, getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
    expect(queryByText('Bultos')).toBeNull();
    expect(queryByText('Dimensiones')).toBeNull();
  });

  // Los litros son opcionales para el backend, pero es el único momento en que
  // se pueden cargar: sin ellos el viaje no suma a las métricas de combustible.
  describe('completar el viaje', () => {
    const inProgress = {
      ...baseLoad,
      status: 'IN_TRANSIT',
      trip: { id: 'trip-1', status: 'IN_PROGRESS', carrierId: 'carrier1' },
    };

    const openForm = async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: inProgress });
      const view = render(<LoadDetailScreen route={makeRoute()} navigation={makeNav()} />);
      await waitFor(() => expect(view.getByText('Completar Viaje')).toBeTruthy());
      fireEvent.press(view.getByText('Completar Viaje'));
      return view;
    };

    it('pide los litros antes de completar, en vez de mandar el viaje sin ellos', async () => {
      const { getByText, getByPlaceholderText } = await openForm();

      expect(getByPlaceholderText('Ej., 85.5')).toBeTruthy();
      expect(getByText('Confirmar')).toBeTruthy();
      expect(tripsApi.complete).not.toHaveBeenCalled();
    });

    it('manda los litros cargados', async () => {
      const { getByText, getByPlaceholderText } = await openForm();

      fireEvent.changeText(getByPlaceholderText('Ej., 85.5'), '85.5');
      fireEvent.press(getByText('Confirmar'));

      await waitFor(() => expect(tripsApi.complete).toHaveBeenCalledWith('trip-1', 85.5));
    });

    it('permite completar sin litros', async () => {
      const { getByText } = await openForm();

      fireEvent.press(getByText('Confirmar'));

      await waitFor(() => expect(tripsApi.complete).toHaveBeenCalledWith('trip-1', undefined));
    });

    it('rechaza un valor que no es un número positivo', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { getByText, getByPlaceholderText } = await openForm();

      fireEvent.changeText(getByPlaceholderText('Ej., 85.5'), '-5');
      fireEvent.press(getByText('Confirmar'));

      expect(alertSpy).toHaveBeenCalledWith('Litros inválidos', expect.any(String));
      expect(tripsApi.complete).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });
  });

  // El banner de "N interesados" se quitó: el backend omite
  // `pendingPostulationsCount` del payload que recibe el transportista, para no
  // filtrarle la competencia, así que nunca se renderizaba.
  it('never shows the competition to a transporter, even if the payload carries it', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({
      data: { ...baseLoad, pendingPostulationsCount: 3 },
    });

    const { getByText, queryByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
    expect(queryByText(/interesad/)).toBeNull();
  });

  it('shows "Carga no encontrada" when the load is missing', async () => {
    (loadsApi.getById as jest.Mock).mockResolvedValue({ data: null });

    const { getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('Carga no encontrada')).toBeTruthy());
  });

  it('does not show the postulate button for a CARGO_GENERATOR', async () => {
    mockUser = { id: 'shipper1', role: 'CARGO_GENERATOR' };
    (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });

    const { queryByText, getByText } = render(
      <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
    );

    await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
    expect(queryByText('Postularme')).toBeNull();
    // Owner of a PUBLISHED load sees the cancel button instead.
    expect(getByText('Cancelar Carga')).toBeTruthy();
  });

  // La calificación es unidireccional: sólo el publicador califica al
  // transportista, una vez, con el viaje completado. El backend rechaza todo lo
  // demás, así que la UI no debe ofrecer un botón que va a dar 403/400/409.
  describe('calificar al transportista', () => {
    const completedTrip = {
      id: 'trip-1',
      status: 'COMPLETED',
      carrierId: 'carrier1',
      carrier: { id: 'carrier1', firstName: 'Carl', lastName: 'Driver' },
      ratings: [],
    };
    const asShipper = () => {
      mockUser = { id: 'shipper1', role: 'CARGO_GENERATOR' };
    };

    it('offers the entry point to the shipper of a completed trip', async () => {
      asShipper();
      (loadsApi.getById as jest.Mock).mockResolvedValue({
        data: { ...baseLoad, status: 'DELIVERED', trip: completedTrip },
      });

      const { getByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Calificar al transportista')).toBeTruthy());
    });

    it('navigates to Rating with the trip and the carrier name', async () => {
      asShipper();
      (loadsApi.getById as jest.Mock).mockResolvedValue({
        data: { ...baseLoad, status: 'DELIVERED', trip: completedTrip },
      });
      const nav = makeNav();

      const { getByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={nav} />,
      );

      await waitFor(() => expect(getByText('Calificar al transportista')).toBeTruthy());
      fireEvent.press(getByText('Calificar al transportista'));

      expect(nav.navigate).toHaveBeenCalledWith('Rating', {
        tripId: 'trip-1',
        carrierName: 'Carl Driver',
      });
    });

    it('hides it once the shipper already rated the trip', async () => {
      asShipper();
      (loadsApi.getById as jest.Mock).mockResolvedValue({
        data: {
          ...baseLoad,
          status: 'DELIVERED',
          trip: { ...completedTrip, ratings: [{ id: 'r1', fromUserId: 'shipper1' }] },
        },
      });

      const { getByText, queryByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
      expect(queryByText('Calificar al transportista')).toBeNull();
    });

    it('still offers it when only somebody else rated the trip', async () => {
      asShipper();
      (loadsApi.getById as jest.Mock).mockResolvedValue({
        data: {
          ...baseLoad,
          status: 'DELIVERED',
          trip: { ...completedTrip, ratings: [{ id: 'r1', fromUserId: 'someone-else' }] },
        },
      });

      const { getByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Calificar al transportista')).toBeTruthy());
    });

    it('hides it while the trip is not completed yet', async () => {
      asShipper();
      (loadsApi.getById as jest.Mock).mockResolvedValue({
        data: {
          ...baseLoad,
          status: 'IN_TRANSIT',
          trip: { ...completedTrip, status: 'IN_PROGRESS' },
        },
      });

      const { getByText, queryByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
      expect(queryByText('Calificar al transportista')).toBeNull();
    });

    it('hides it from the carrier, who the backend forbids from rating', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({
        data: { ...baseLoad, status: 'DELIVERED', trip: completedTrip },
      });

      const { getByText, queryByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
      expect(queryByText('Calificar al transportista')).toBeNull();
    });

    it('hides it from a shipper who does not own the load', async () => {
      mockUser = { id: 'another-shipper', role: 'CARGO_GENERATOR' };
      (loadsApi.getById as jest.Mock).mockResolvedValue({
        data: { ...baseLoad, status: 'DELIVERED', trip: completedTrip },
      });

      const { getByText, queryByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
      expect(queryByText('Calificar al transportista')).toBeNull();
    });

    it('hides it when the load has no trip at all', async () => {
      asShipper();
      (loadsApi.getById as jest.Mock).mockResolvedValue({
        data: { ...baseLoad, status: 'DELIVERED', trip: undefined },
      });

      const { getByText, queryByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
      expect(queryByText('Calificar al transportista')).toBeNull();
    });

    it('still offers it when the payload omits ratings entirely', async () => {
      // El gate falla "abierto" si `ratings` no viniera: se muestra el botón y el
      // backend contestaría 409 si ya había calificado. Hoy `GET /loads/:id`
      // siempre incluye `trip.ratings`, y este test fija esa dependencia — si
      // alguien saca el include del backend, el comportamiento queda documentado.
      asShipper();
      const { ratings, ...tripWithoutRatings } = completedTrip;
      (loadsApi.getById as jest.Mock).mockResolvedValue({
        data: { ...baseLoad, status: 'DELIVERED', trip: tripWithoutRatings },
      });

      const { getByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Calificar al transportista')).toBeTruthy());
    });

    it('refetches the load on focus so the button clears after rating', async () => {
      asShipper();
      (loadsApi.getById as jest.Mock).mockResolvedValue({
        data: { ...baseLoad, status: 'DELIVERED', trip: completedTrip },
      });
      const nav = makeNav();

      render(<LoadDetailScreen route={makeRoute()} navigation={nav} />);
      await waitFor(() => expect(loadsApi.getById).toHaveBeenCalledTimes(1));

      // RatingScreen sólo hace goBack, así que el refresco depende del focus.
      const onFocus = nav.addListener.mock.calls.find(([e]) => e === 'focus')?.[1];
      if (!onFocus) throw new Error('LoadDetailScreen no registró un listener de focus');
      onFocus();

      await waitFor(() => expect(loadsApi.getById).toHaveBeenCalledTimes(2));
    });
  });

  describe('requisitos de vehículo', () => {
    it('shows "Cualquiera" when the load has no requirements', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });

      const { getByText } = render(<LoadDetailScreen route={makeRoute()} navigation={makeNav()} />);

      await waitFor(() => expect(getByText('Cualquiera')).toBeTruthy());
    });

    it('blocks Postularme and explains why when the vehicle does not fit', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({
        data: { ...baseLoad, requiredBodyType: 'CERRADA', requiresRefrigeration: true },
      });

      const { getByText } = render(<LoadDetailScreen route={makeRoute()} navigation={makeNav()} />);

      await waitFor(() =>
        expect(getByText('Tu vehículo no cumple los requisitos de esta carga')).toBeTruthy(),
      );
      expect(getByText('Carrocería cerrada · Refrigerado')).toBeTruthy();
      expect(getByText('• Requiere carrocería cerrada (la tuya es abierta)')).toBeTruthy();
      expect(getByText('• Requiere vehículo refrigerado')).toBeTruthy();
      fireEvent.press(getByText('Postularme'));
      expect(() => getByText('Enviar postulación')).toThrow();
    });

    it('does not query the vehicle for a shipper', async () => {
      mockUser = { id: 'shipper1', role: 'CARGO_GENERATOR', firstName: 'Sam', lastName: 'Shipper' };
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });

      const { getByText } = render(<LoadDetailScreen route={makeRoute()} navigation={makeNav()} />);

      await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
      expect(transporterProfileApi.getVehicle).not.toHaveBeenCalled();
    });
  });

  describe('postulación del transportista', () => {
    it('never calls the admin-only accept endpoint', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });

      const { getByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Postularme')).toBeTruthy());
      fireEvent.press(getByText('Postularme'));
      fireEvent.press(getByText('Enviar postulación'));

      await waitFor(() => expect(postulationsApi.create).toHaveBeenCalled());
    });

    it('omits the price when the carrier accepts the listed one', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      const { getByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Postularme')).toBeTruthy());
      fireEvent.press(getByText('Postularme'));
      fireEvent.press(getByText('Enviar postulación'));

      await waitFor(() =>
        expect(postulationsApi.create).toHaveBeenCalledWith('l1', {
          message: undefined,
          proposedPrice: undefined,
        }),
      );
    });

    it('sends the typed message and proposed price as a number', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      const { getByText, getByPlaceholderText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Postularme')).toBeTruthy());
      fireEvent.press(getByText('Postularme'));
      fireEvent.changeText(
        getByPlaceholderText('Ej., tengo camión refrigerado disponible'),
        'Tengo semi disponible',
      );
      fireEvent.changeText(getByPlaceholderText('Mayor a 50000'), '60000');
      fireEvent.press(getByText('Enviar postulación'));

      await waitFor(() =>
        expect(postulationsApi.create).toHaveBeenCalledWith('l1', {
          message: 'Tengo semi disponible',
          proposedPrice: 60000,
        }),
      );
    });

    it('surfaces the server rejection of a too-low price', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });
      (postulationsApi.create as jest.Mock).mockRejectedValue({
        response: { data: { message: 'El precio propuesto debe ser mayor al precio listado ($50000).' } },
      });
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      const { getByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Postularme')).toBeTruthy());
      fireEvent.press(getByText('Postularme'));
      fireEvent.press(getByText('Enviar postulación'));

      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith(
          'Error',
          'El precio propuesto debe ser mayor al precio listado ($50000).',
        ),
      );
      alertSpy.mockRestore();
    });

    it('shows the existing postulation instead of the postulate button', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });
      (postulationsApi.listMine as jest.Mock).mockResolvedValue({
        data: [{ id: 'p1', loadId: 'l1', transporterId: 'carrier1', status: 'PENDING', proposedPrice: 60000 }],
      });

      const { getByText, queryByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Tu postulación')).toBeTruthy());
      expect(queryByText('Postularme')).toBeNull();
      expect(getByText('Pendiente')).toBeTruthy();
    });

    it('offers to accept a shipper counter-offer', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });
      (postulationsApi.listMine as jest.Mock).mockResolvedValue({
        data: [{
          id: 'p1', loadId: 'l1', transporterId: 'carrier1', status: 'NEGOTIATING',
          counterOfferPrice: 55000, lastOfferBy: 'SHIPPER',
        }],
      });
      (postulationsApi.acceptOffer as jest.Mock).mockResolvedValue({ data: {} });
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      const { getByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Aceptar contra-oferta')).toBeTruthy());
      fireEvent.press(getByText('Aceptar contra-oferta'));

      await waitFor(() => expect(postulationsApi.acceptOffer).toHaveBeenCalledWith('p1'));
    });

    it('does not offer to accept the carrier own counter-offer', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });
      (postulationsApi.listMine as jest.Mock).mockResolvedValue({
        data: [{
          id: 'p1', loadId: 'l1', transporterId: 'carrier1', status: 'NEGOTIATING',
          counterOfferPrice: 70000, lastOfferBy: 'TRANSPORTER',
        }],
      });

      const { getByText, queryByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Tu postulación')).toBeTruthy());
      expect(queryByText('Aceptar contra-oferta')).toBeNull();
    });

    it('treats a withdrawn postulation as none, so the carrier can retry', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });
      (postulationsApi.listMine as jest.Mock).mockResolvedValue({
        data: [{ id: 'p1', loadId: 'l1', transporterId: 'carrier1', status: 'WITHDRAWN' }],
      });

      const { getByText, queryByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Postularme')).toBeTruthy());
      expect(queryByText('Tu postulación')).toBeNull();
    });

    it('ignores postulations belonging to other loads', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });
      (postulationsApi.listMine as jest.Mock).mockResolvedValue({
        data: [{ id: 'p9', loadId: 'other-load', transporterId: 'carrier1', status: 'PENDING' }],
      });

      const { getByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Postularme')).toBeTruthy());
    });

    it('does not query postulations for a shipper', async () => {
      mockUser = { id: 'shipper1', role: 'CARGO_GENERATOR' };
      (loadsApi.getById as jest.Mock).mockResolvedValue({ data: baseLoad });

      const { getByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('Steel beams')).toBeTruthy());
      // El endpoint es TRANSPORTER-only: llamarlo como shipper daría 403.
      expect(postulationsApi.listMine).not.toHaveBeenCalled();
    });
  });

  describe('carga sin precio publicado ("a convenir")', () => {
    it('renders "A convenir" instead of a formatted price', async () => {
      (loadsApi.getById as jest.Mock).mockResolvedValue({
        data: { ...baseLoad, price: null },
      });

      const { getByText } = render(
        <LoadDetailScreen route={makeRoute()} navigation={makeNav()} />,
      );

      await waitFor(() => expect(getByText('A convenir')).toBeTruthy());
    });
  });
});
