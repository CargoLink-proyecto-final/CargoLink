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
  const fillAllRequired = () => {
    fillField('Ej., Electrónica a Córdoba', 'Cemento a Rosario');
    fillField('Electrónica', 'Construcción');
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
    // Fechas
    fireEvent.changeText(screen.getByPlaceholderText('2024-03-01'), '2024-05-01');
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
      cargoType: 'Construcción',
      weight: 8000,
      price: 250000,
      originAddress: 'Buenos Aires',
      originLat: -34.6037,
      originLng: -58.3816,
      destAddress: 'Rosario',
      destLat: -32.9442,
      destLng: -60.6505,
    });
    // pickupDate converted to ISO
    expect(payload.pickupDate).toBe(new Date('2024-05-01').toISOString());
    // optional fields left undefined
    expect(payload.volume).toBeUndefined();
    expect(payload.deliveryDate).toBeUndefined();
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

  it('passes optional volume and deliveryDate when provided', async () => {
    mockedLoadsApi.create.mockResolvedValue({ data: {} } as any);

    render(<CreateLoadScreen navigation={navigation} />);
    fillAllRequired();
    fireEvent.changeText(screen.getByPlaceholderText('12.5'), '20');
    fireEvent.changeText(screen.getByPlaceholderText('2024-04-01'), '2024-06-01');

    fireEvent.press(screen.getByText('Crear Carga'));

    await waitFor(() => expect(mockedLoadsApi.create).toHaveBeenCalled());
    const payload = mockedLoadsApi.create.mock.calls[0][0];
    expect(payload.volume).toBe(20);
    expect(payload.deliveryDate).toBe(new Date('2024-06-01').toISOString());
  });
});
