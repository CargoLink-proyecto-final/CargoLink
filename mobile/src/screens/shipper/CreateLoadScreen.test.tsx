import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import CreateLoadScreen from './CreateLoadScreen';
import { loadsApi } from '../../services/api';

jest.mock('../../services/api', () => ({
  loadsApi: {
    create: jest.fn(),
  },
}));

const mockedLoadsApi = loadsApi as jest.Mocked<typeof loadsApi>;

const navigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };

const fillField = (label: string | RegExp, text: string) => {
  // Each field renders its label then a TextInput; find input by placeholder is
  // more reliable since labels and inputs are separate nodes.
  fireEvent.changeText(screen.getByPlaceholderText(label as any), text);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore?.();
});

describe('CreateLoadScreen', () => {
  // cargoType es un selector de chips (no un input): se elige tocando el chip.
  const selectCargoType = (type: string) => fireEvent.press(screen.getByText(type));

  const fillAllRequired = (cargoType = 'Materiales de construcción') => {
    fillField('Ej., Electrónica a Córdoba', 'Cemento a Rosario');
    selectCargoType(cargoType);
    fillField('5000', '8000');
    fillField('150000', '250000');
    // Origen
    fireEvent.changeText(screen.getByPlaceholderText('Dirección de origen'), 'Buenos Aires');
    fireEvent.changeText(screen.getByPlaceholderText('-34.6037'), '-34.6037');
    fireEvent.changeText(screen.getByPlaceholderText('-58.3816'), '-58.3816');
    // Destino
    fireEvent.changeText(screen.getByPlaceholderText('Dirección de destino'), 'Rosario');
    fireEvent.changeText(screen.getByPlaceholderText('-31.4201'), '-32.9442');
    fireEvent.changeText(screen.getByPlaceholderText('-64.1888'), '-60.6505');
    // Fechas — ambas obligatorias: el DTO del backend no marca deliveryDate
    // como @IsOptional(), así que mandarla vacía devuelve 400.
    fireEvent.changeText(screen.getByPlaceholderText('2024-03-01'), '2024-05-01');
    fireEvent.changeText(screen.getByPlaceholderText('2024-04-01'), '2024-06-01');
  };

  it('renders the form title and submit button', () => {
    render(<CreateLoadScreen navigation={navigation} />);
    expect(screen.getByText('Crear Nueva Carga')).toBeTruthy();
    expect(screen.getByText('Crear Carga')).toBeTruthy();
  });

  it('submits a new load with parsed numeric + ISO date values', async () => {
    mockedLoadsApi.create.mockResolvedValue({ data: { id: 'new-load' } } as any);

    render(<CreateLoadScreen navigation={navigation} />);
    fillAllRequired();

    fireEvent.press(screen.getByText('Crear Carga'));

    await waitFor(() => expect(mockedLoadsApi.create).toHaveBeenCalledTimes(1));

    const payload = mockedLoadsApi.create.mock.calls[0][0];
    expect(payload).toMatchObject({
      title: 'Cemento a Rosario',
      cargoType: 'Materiales de construcción',
      weight: 8000,
      price: 250000,
      originAddress: 'Buenos Aires',
      originLat: -34.6037,
      originLng: -58.3816,
      destAddress: 'Rosario',
      destLat: -32.9442,
      destLng: -60.6505,
    });
    // fechas convertidas a ISO
    expect(payload.pickupDate).toBe(new Date('2024-05-01').toISOString());
    expect(payload.deliveryDate).toBe(new Date('2024-06-01').toISOString());
    // optional fields left undefined
    expect(payload.volume).toBeUndefined();
  });

  it('does not submit without a delivery date', async () => {
    render(<CreateLoadScreen navigation={navigation} />);
    fillAllRequired();
    fireEvent.changeText(screen.getByPlaceholderText('2024-04-01'), '');

    fireEvent.press(screen.getByText('Crear Carga'));

    await waitFor(() => expect(mockedLoadsApi.create).not.toHaveBeenCalled());
  });

  it('alerts success, resets and navigates to Dashboard after a successful create', async () => {
    mockedLoadsApi.create.mockResolvedValue({ data: { id: 'new-load' } } as any);

    render(<CreateLoadScreen navigation={navigation} />);
    fillAllRequired();
    fireEvent.press(screen.getByText('Crear Carga'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Éxito', 'Carga creada exitosamente'),
    );
    expect(navigation.navigate).toHaveBeenCalledWith('Dashboard');
  });

  it('does not submit when required fields are empty (react-hook-form validation)', async () => {
    render(<CreateLoadScreen navigation={navigation} />);

    fireEvent.press(screen.getByText('Crear Carga'));

    // give react-hook-form a tick to run validation
    await waitFor(() => {
      expect(mockedLoadsApi.create).not.toHaveBeenCalled();
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('shows the server error message when create fails', async () => {
    mockedLoadsApi.create.mockRejectedValue({
      response: { data: { message: 'Precio inválido' } },
    });

    render(<CreateLoadScreen navigation={navigation} />);
    fillAllRequired();
    fireEvent.press(screen.getByText('Crear Carga'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Precio inválido'),
    );
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('falls back to a generic error message when the server gives none', async () => {
    mockedLoadsApi.create.mockRejectedValue(new Error('boom'));

    render(<CreateLoadScreen navigation={navigation} />);
    fillAllRequired();
    fireEvent.press(screen.getByText('Crear Carga'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Error al crear la carga'),
    );
  });

  it('passes the optional volume when provided', async () => {
    mockedLoadsApi.create.mockResolvedValue({ data: {} } as any);

    render(<CreateLoadScreen navigation={navigation} />);
    fillAllRequired();
    fireEvent.changeText(screen.getByPlaceholderText('12.5'), '20');

    fireEvent.press(screen.getByText('Crear Carga'));

    await waitFor(() => expect(mockedLoadsApi.create).toHaveBeenCalled());
    expect(mockedLoadsApi.create.mock.calls[0][0].volume).toBe(20);
  });

  it('sends the optional max budget', async () => {
    mockedLoadsApi.create.mockResolvedValue({ data: {} } as any);

    render(<CreateLoadScreen navigation={navigation} />);
    fillAllRequired();
    fireEvent.changeText(screen.getByPlaceholderText('180000'), '300000');

    fireEvent.press(screen.getByText('Crear Carga'));

    await waitFor(() => expect(mockedLoadsApi.create).toHaveBeenCalled());
    expect(mockedLoadsApi.create.mock.calls[0][0].maxBudget).toBe(300000);
  });

  describe('form dinámico — información del bulto', () => {
    it('is hidden until a cargo type is chosen', () => {
      render(<CreateLoadScreen navigation={navigation} />);
      expect(screen.queryByText('Información del bulto (opcional)')).toBeNull();
    });

    it('is hidden for bulk cargo types', () => {
      render(<CreateLoadScreen navigation={navigation} />);
      fireEvent.press(screen.getByText('Materiales de construcción'));
      expect(screen.queryByText('Información del bulto (opcional)')).toBeNull();
    });

    it('is hidden for the catch-all "Otro" type', () => {
      render(<CreateLoadScreen navigation={navigation} />);
      fireEvent.press(screen.getByText('Otro'));
      expect(screen.queryByText('Información del bulto (opcional)')).toBeNull();
    });

    it('is shown for package-based cargo types', () => {
      render(<CreateLoadScreen navigation={navigation} />);
      fireEvent.press(screen.getByText('Electrónica y tecnología'));
      expect(screen.getByText('Información del bulto (opcional)')).toBeTruthy();
    });

    it('sends the package count and dimensions when filled', async () => {
      mockedLoadsApi.create.mockResolvedValue({ data: {} } as any);

      render(<CreateLoadScreen navigation={navigation} />);
      fillAllRequired('Electrónica y tecnología');
      fireEvent.changeText(screen.getByPlaceholderText('10'), '25');
      fireEvent.changeText(screen.getByPlaceholderText('120'), '110');
      fireEvent.changeText(screen.getByPlaceholderText('80'), '70');
      fireEvent.changeText(screen.getByPlaceholderText('100'), '90');

      fireEvent.press(screen.getByText('Crear Carga'));

      await waitFor(() => expect(mockedLoadsApi.create).toHaveBeenCalled());
      expect(mockedLoadsApi.create.mock.calls[0][0]).toMatchObject({
        packageCount: 25,
        heightCm: 110,
        widthCm: 70,
        lengthCm: 90,
      });
    });

    it('drops package data when the user switches to a bulk cargo type', async () => {
      mockedLoadsApi.create.mockResolvedValue({ data: {} } as any);

      render(<CreateLoadScreen navigation={navigation} />);
      fillAllRequired('Electrónica y tecnología');
      fireEvent.changeText(screen.getByPlaceholderText('10'), '25');

      // Al cambiar de tipo los campos se ocultan; el dato cargado antes quedaría
      // obsoleto, así que no tiene que viajar al backend.
      fireEvent.press(screen.getByText('Alimentos y bebidas'));
      fireEvent.press(screen.getByText('Crear Carga'));

      await waitFor(() => expect(mockedLoadsApi.create).toHaveBeenCalled());
      const payload = mockedLoadsApi.create.mock.calls[0][0];
      expect(payload.cargoType).toBe('Alimentos y bebidas');
      expect(payload.packageCount).toBeUndefined();
    });
  });
});
