import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VehicleRequirementsFields from './VehicleRequirementsFields';
import { EMPTY_REQUIREMENTS, type VehicleRequirements } from '@/lib/vehicleRequirements';

interface HarnessProps {
  initialCargoType?: string;
  initialValue?: VehicleRequirements;
  autoSuggest?: boolean;
  onChange?: (v: VehicleRequirements) => void;
}

// Simula el formulario de la carga: la categoría la elige otro campo.
function Harness({ initialCargoType, initialValue = EMPTY_REQUIREMENTS, autoSuggest, onChange }: HarnessProps) {
  const [value, setValue] = useState<VehicleRequirements>(initialValue);
  const [cargoType, setCargoType] = useState(initialCargoType);
  return (
    <>
      <select aria-label="Tipo de carga" value={cargoType ?? ''} onChange={(e) => setCargoType(e.target.value)}>
        <option value="">—</option>
        <option>Electrónica y tecnología</option>
        <option>Maquinaria e industria</option>
        <option>Materiales de construcción</option>
      </select>
      <VehicleRequirementsFields
        value={value}
        cargoType={cargoType}
        autoSuggest={autoSuggest}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    </>
  );
}

const bodyRadio = (label: string) => screen.getByRole('radio', { name: new RegExp(`^${label}`) });

describe('VehicleRequirementsFields', () => {
  it('starts accepting any body type', () => {
    render(<Harness />);
    expect(bodyRadio('Cualquiera')).toBeChecked();
  });

  it('suggests the body type when the cargo category changes', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Tipo de carga'), 'Electrónica y tecnología');
    expect(bodyRadio('Cerrada')).toBeChecked();
    expect(screen.getByText(/sugerida según el tipo de carga/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Tipo de carga'), 'Maquinaria e industria');
    expect(bodyRadio('Abierta')).toBeChecked();
  });

  it('stops suggesting once the shipper picks a body type by hand', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Tipo de carga'), 'Electrónica y tecnología');
    await user.click(bodyRadio('Volcadora'));
    await user.selectOptions(screen.getByLabelText('Tipo de carga'), 'Maquinaria e industria');

    expect(bodyRadio('Volcadora')).toBeChecked();
    expect(screen.queryByText(/sugerida según el tipo de carga/)).not.toBeInTheDocument();
  });

  it('keeps the saved value when editing (no auto-suggest)', () => {
    render(
      <Harness
        autoSuggest={false}
        initialCargoType="Electrónica y tecnología"
        initialValue={{ ...EMPTY_REQUIREMENTS, requiredBodyType: 'CISTERNA' }}
      />,
    );
    expect(bodyRadio('Cisterna')).toBeChecked();
  });

  it('sets the cold and hazmat flags', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/Necesita frío/));
    await user.click(screen.getByLabelText('Es carga peligrosa'));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ requiresRefrigeration: true, requiresHazmat: true }),
    );
  });
});
