import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Combobox, { ComboboxOption } from './Combobox';

const OPTIONS: ComboboxOption[] = [
  { id: '1', value: 'Pilar', hint: 'Pilar, Buenos Aires' },
  { id: '2', value: 'Pilar', hint: 'Río Segundo, Córdoba' },
  { id: '3', value: 'Rosario', hint: 'Rosario, Santa Fe' },
];

function setup(props: Partial<React.ComponentProps<typeof Combobox>> = {}) {
  const onChange = jest.fn();
  const onQueryChange = jest.fn();
  render(
    <Combobox
      value=""
      onChange={onChange}
      options={OPTIONS}
      onQueryChange={onQueryChange}
      aria-label="Ciudad"
      {...props}
    />,
  );
  return { onChange, onQueryChange, input: screen.getByRole('combobox', { name: 'Ciudad' }) };
}

describe('Combobox', () => {
  it('keeps the list closed until the field gets focus', () => {
    setup();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens on focus and lists every option', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('reabre la lista al volver a clickear, ya con el foco puesto', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.click(input);
    await user.click(screen.getByText('Rosario, Santa Fe'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('marca solo la opción elegida cuando hay homónimas', async () => {
    const user = userEvent.setup();
    const { input } = setup({ value: 'Pilar', selectedId: '2' });
    await user.click(input);
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
  });

  it('reports what the user types so the caller can filter or query', async () => {
    const user = userEvent.setup();
    const { input, onQueryChange } = setup();
    await user.click(input);
    await user.type(input, 'pil');
    expect(onQueryChange).toHaveBeenLastCalledWith('pil');
  });

  it('shows the hint so homonyms can be told apart', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.click(input);
    expect(screen.getByText('Río Segundo, Córdoba')).toBeInTheDocument();
  });

  it('emits the chosen option on click and closes the list', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.click(input);
    await user.click(screen.getByText('Río Segundo, Córdoba'));
    expect(onChange).toHaveBeenCalledWith('Pilar', OPTIONS[1]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selects with the keyboard: arrow down moves the highlight, enter confirms', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.click(input);
    // Al abrir queda resaltada la primera; dos flechas bajan hasta la tercera.
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('Rosario', OPTIONS[2]);
  });

  it('closes on escape without choosing anything', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.click(input);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears the selection with the reset button', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ value: 'Pilar' });
    await user.click(screen.getByRole('button', { name: 'Borrar selección' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('tells the user when nothing matches', async () => {
    const user = userEvent.setup();
    const { input } = setup({ options: [], emptyLabel: 'Sin ciudades que coincidan' });
    await user.click(input);
    expect(screen.getByText('Sin ciudades que coincidan')).toBeInTheDocument();
  });
});
