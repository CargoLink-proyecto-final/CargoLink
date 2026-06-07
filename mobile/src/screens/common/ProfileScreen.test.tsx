import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import ProfileScreen from './ProfileScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const mockLogout = jest.fn();
let mockUser: any = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'Diaz',
  role: 'CARGO_GENERATOR',
  isActive: true,
};

// useAuthStore is consumed as a plain hook returning the whole store object here.
jest.mock('../../store/auth', () => ({
  useAuthStore: () => ({ user: mockUser, logout: mockLogout }),
}));

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      id: 'u1',
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Diaz',
      role: 'CARGO_GENERATOR',
      isActive: true,
    };
  });

  it('renders the user name, email and role', () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText('Ana Diaz')).toBeTruthy();
    expect(getByText('ana@example.com')).toBeTruthy();
    expect(getByText('CARGO_GENERATOR')).toBeTruthy();
  });

  it('renders the avatar initials from first + last name', () => {
    const { getByText } = render(<ProfileScreen />);
    // firstName[0] + lastName[0]
    expect(getByText('AD')).toBeTruthy();
  });

  it('renders nothing when there is no user', () => {
    mockUser = null;
    const { queryByText } = render(<ProfileScreen />);
    expect(queryByText('Cerrar Sesión')).toBeNull();
  });

  it('opens a confirmation alert and logs out via its destructive action', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getAllByText } = render(<ProfileScreen />);

    // There are two "Cerrar Sesión" texts (the menu item title and the button).
    // The pressable button is the last one.
    const buttons = getAllByText('Cerrar Sesión');
    fireEvent.press(buttons[buttons.length - 1]);

    expect(alertSpy).toHaveBeenCalledWith(
      'Cerrar Sesión',
      '¿Estás seguro?',
      expect.any(Array),
    );

    // Invoke the destructive button's onPress as Alert would.
    const actions = alertSpy.mock.calls[0][2] as any[];
    const confirm = actions.find((a) => a.style === 'destructive');
    confirm.onPress();
    expect(mockLogout).toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
