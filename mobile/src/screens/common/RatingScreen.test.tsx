import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import RatingScreen from './RatingScreen';
import { ratingsApi } from '../../services/api';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('../../services/api', () => ({
  ratingsApi: {
    create: jest.fn(),
  },
}));

// RatingScreen does not read the auth store, but mock defensively in case it
// is imported transitively. (It is not, so no mock needed here.)

const makeRoute = () => ({ params: { tripId: 't1' } });
const makeNav = () => ({ goBack: jest.fn() });

describe('RatingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ratingsApi.create as jest.Mock).mockResolvedValue({});
  });

  it('defaults to a 5-star score ("Excelente")', () => {
    const { getByText } = render(
      <RatingScreen route={makeRoute()} navigation={makeNav()} />,
    );
    expect(getByText('Excelente')).toBeTruthy();
  });

  it('submits the default score via ratingsApi.create and goes back', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const nav = makeNav();

    const { getByText } = render(
      <RatingScreen route={makeRoute()} navigation={nav} />,
    );

    fireEvent.press(getByText('Enviar Calificación'));

    await waitFor(() =>
      expect(ratingsApi.create).toHaveBeenCalledWith({
        tripId: 't1',
        score: 5,
        comment: undefined,
      }),
    );
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    expect(alertSpy).toHaveBeenCalledWith('¡Gracias!', expect.any(String));

    alertSpy.mockRestore();
  });

  it('submits the selected score and trimmed comment', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText, getByPlaceholderText, UNSAFE_root } = render(
      <RatingScreen route={makeRoute()} navigation={makeNav()} />,
    );

    // Select a 3-star score by pressing the 3rd star's TouchableOpacity.
    // Stars render in order 1..5; press the parent touchable of the 3rd icon.
    const { TouchableOpacity } = require('react-native');
    const touchables = UNSAFE_root.findAllByType(TouchableOpacity);
    // First 5 touchables are the stars (1..5), then submit, then skip.
    fireEvent.press(touchables[2]); // 3rd star -> score 3
    expect(getByText('Bueno')).toBeTruthy();

    const comment = getByPlaceholderText('Deja un comentario (opcional)');
    fireEvent.changeText(comment, '  great trip  ');

    fireEvent.press(getByText('Enviar Calificación'));

    await waitFor(() =>
      expect(ratingsApi.create).toHaveBeenCalledWith({
        tripId: 't1',
        score: 3,
        comment: 'great trip',
      }),
    );
  });

  it('shows an error alert when the submission fails', async () => {
    (ratingsApi.create as jest.Mock).mockRejectedValue({
      response: { data: { message: 'boom' } },
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const nav = makeNav();

    const { getByText } = render(
      <RatingScreen route={makeRoute()} navigation={nav} />,
    );

    fireEvent.press(getByText('Enviar Calificación'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Error', 'boom'));
    expect(nav.goBack).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('skips rating and goes back when "Omitir por ahora" is pressed', () => {
    const nav = makeNav();
    const { getByText } = render(
      <RatingScreen route={makeRoute()} navigation={nav} />,
    );

    fireEvent.press(getByText('Omitir por ahora'));
    expect(nav.goBack).toHaveBeenCalled();
    expect(ratingsApi.create).not.toHaveBeenCalled();
  });
});
