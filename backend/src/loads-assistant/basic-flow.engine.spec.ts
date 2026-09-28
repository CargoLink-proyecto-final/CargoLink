import { BasicFlowEngine } from './basic-flow.engine';
import { DEFAULT_FLOW } from './flow-config';
import { LlmMessage } from './llm/llm-provider';
import { LoadDraft } from './types';

// El modo básico es el último recurso cuando ningún LLM responde, así que sus
// parsers son la única defensa contra respuestas mal interpretadas.
describe('BasicFlowEngine', () => {
  const engine = new BasicFlowEngine();
  const flow = DEFAULT_FLOW;

  const stepQuestion = (id: string) => flow.steps.find((s) => s.id === id)!.question;

  // Simula que el asistente ya preguntó por `stepId` y el usuario respondió.
  const turn = (stepId: string, answer: string): LlmMessage[] => [
    { role: 'assistant', content: stepQuestion(stepId) },
    { role: 'user', content: answer },
  ];

  // Borrador con todos los pasos anteriores a `stepId` ya completos, para que
  // el paso pendiente sea justamente el que se quiere ejercitar.
  const draftUpTo = (stepId: string): LoadDraft => {
    const values: Record<string, unknown> = {
      title: 'Mudanza',
      cargoType: 'Mercadería general',
      weight: 100,
      origin: { city: 'Córdoba' },
      dest: { city: 'Rosario' },
      pickupDate: '2099-01-01T12:00:00.000Z',
      deliveryDate: '2099-01-02T12:00:00.000Z',
      price: 50000,
      description: 'Sin aclaraciones',
    };
    const draft: LoadDraft = {};
    for (const step of flow.steps) {
      if (step.id === stepId) break;
      (draft as Record<string, unknown>)[step.field] = values[step.field];
    }
    return draft;
  };

  describe('números', () => {
    it('interpreta el separador de miles argentino', () => {
      const { draft } = engine.applyAnswer(flow, turn('weight', '1.500 kg'), draftUpTo('weight'));
      expect(draft.weight).toBe(1500);
    });

    it('convierte toneladas a kilos', () => {
      const { draft } = engine.applyAnswer(
        flow,
        turn('weight', '2,5 toneladas'),
        draftUpTo('weight'),
      );
      expect(draft.weight).toBe(2500);
    });

    it('marca el paso como fallido cuando no hay ningún número', () => {
      const prior = draftUpTo('weight');
      const { draft, failedStepId } = engine.applyAnswer(
        flow,
        turn('weight', 'no tengo idea'),
        prior,
      );
      expect(failedStepId).toBe('weight');
      expect(draft).toEqual(prior);
    });
  });

  describe('enum de tipo de carga', () => {
    it('acepta el número de la lista', () => {
      const { draft } = engine.applyAnswer(flow, turn('cargoType', '1'), draftUpTo('cargoType'));
      expect(draft.cargoType).toBe('Electrónica y tecnología');
    });

    it('acepta el nombre sin tildes y parcial', () => {
      const { draft } = engine.applyAnswer(
        flow,
        turn('cargoType', 'electronica'),
        draftUpTo('cargoType'),
      );
      expect(draft.cargoType).toBe('Electrónica y tecnología');
    });

    it('repregunta cuando el valor no está en la whitelist', () => {
      const { failedStepId } = engine.applyAnswer(
        flow,
        turn('cargoType', 'plutonio enriquecido'),
        draftUpTo('cargoType'),
      );
      expect(failedStepId).toBe('cargoType');
    });
  });

  describe('direcciones', () => {
    it('separa dirección, ciudad y provincia', () => {
      const { draft } = engine.applyAnswer(
        flow,
        turn('origin', 'Av. Colón 1234, Córdoba, Córdoba'),
        draftUpTo('origin'),
      );
      expect(draft.origin).toEqual({
        address: 'Av. Colón 1234',
        city: 'Córdoba',
        province: 'Córdoba',
      });
    });

    it('toma un único tramo sin altura como ciudad', () => {
      const { draft } = engine.applyAnswer(flow, turn('origin', 'Rosario'), draftUpTo('origin'));
      expect(draft.origin).toEqual({ city: 'Rosario' });
    });
  });

  describe('fechas', () => {
    it('resuelve "mañana a las 9" a una fecha futura con esa hora', () => {
      const { draft } = engine.applyAnswer(
        flow,
        turn('pickupDate', 'mañana a las 9'),
        draftUpTo('pickupDate'),
      );
      const parsed = new Date(draft.pickupDate!);
      const expected = new Date();
      expected.setDate(expected.getDate() + 1);
      expect(parsed.getDate()).toBe(expected.getDate());
      expect(parsed.getHours()).toBe(9);
    });

    it('acepta formato dd/mm', () => {
      const { draft } = engine.applyAnswer(
        flow,
        turn('pickupDate', '15/03'),
        draftUpTo('pickupDate'),
      );
      const parsed = new Date(draft.pickupDate!);
      expect(parsed.getDate()).toBe(15);
      expect(parsed.getMonth()).toBe(2);
      expect(parsed.getTime()).toBeGreaterThan(Date.now());
    });

    it('rechaza texto que no es una fecha', () => {
      const { failedStepId } = engine.applyAnswer(
        flow,
        turn('pickupDate', 'cuando puedas'),
        draftUpTo('pickupDate'),
      );
      expect(failedStepId).toBe('pickupDate');
    });
  });

  describe('pasos opcionales', () => {
    it('deja el precio vacío y avanza cuando el usuario dice que no', () => {
      const prior = draftUpTo('price');
      const messages = turn('price', 'no');
      const { draft, failedStepId } = engine.applyAnswer(flow, messages, prior);

      expect(failedStepId).toBeUndefined();
      expect(draft.price).toBeUndefined();
      // El paso ya quedó preguntado en el historial, así que no se repite.
      expect(engine.nextMessage(flow, messages, draft)).toContain(stepQuestion('description'));
    });
  });

  it('cierra con el resumen cuando no queda nada pendiente', () => {
    const draft = draftUpTo('__none__');
    const messages = flow.steps.map<LlmMessage>((s) => ({ role: 'assistant', content: s.question }));
    const message = engine.nextMessage(flow, messages, draft);

    expect(message).toContain('Mudanza');
    expect(message).toContain('Crear carga');
  });
});
