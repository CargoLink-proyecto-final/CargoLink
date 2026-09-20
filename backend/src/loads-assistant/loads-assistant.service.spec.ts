import { Test, TestingModule } from '@nestjs/testing';
import { LoadsAssistantService } from './loads-assistant.service';
import { BasicFlowEngine } from './basic-flow.engine';
import { FlowConfigService } from './flow-config.service';
import { LLM_PROVIDER, LlmProvider } from './llm/llm-provider';
import { DEFAULT_FLOW } from './flow-config';

describe('LoadsAssistantService', () => {
  let service: LoadsAssistantService;

  const buildLlm = (payload: unknown): LlmProvider => ({
    name: 'mock',
    generateJson: jest.fn().mockResolvedValue(
      typeof payload === 'string' ? payload : JSON.stringify(payload),
    ),
    isConfigured: jest.fn().mockReturnValue(true),
  });

  // Proveedor que siempre falla, para ejercitar la degradación a modo básico.
  const brokenLlm = (): LlmProvider => ({
    name: 'broken',
    generateJson: jest.fn().mockRejectedValue(new Error('429 quota exceeded')),
    isConfigured: jest.fn().mockReturnValue(true),
  });

  async function makeService(provider: LlmProvider): Promise<LoadsAssistantService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoadsAssistantService,
        BasicFlowEngine,
        { provide: FlowConfigService, useValue: { get: jest.fn().mockResolvedValue(DEFAULT_FLOW) } },
        { provide: LLM_PROVIDER, useValue: provider },
      ],
    }).compile();
    return module.get(LoadsAssistantService);
  }

  it('normalizes a valid cargoType to the exact whitelist value', async () => {
    service = await makeService(
      buildLlm({
        assistantMessage: '¿Cuánto pesa?',
        draft: { title: 'Envío', cargoType: 'electrónica y tecnología' },
      }),
    );
    const turn = await service.chat([{ role: 'user', content: 'electrónica' }]);
    expect(turn.draft.cargoType).toBe('Electrónica y tecnología');
  });

  it('drops a cargoType outside the whitelist so it gets re-asked', async () => {
    service = await makeService(
      buildLlm({ assistantMessage: 'ok', draft: { cargoType: 'algo raro' } }),
    );
    const turn = await service.chat([{ role: 'user', content: 'x' }]);
    expect(turn.draft.cargoType).toBeUndefined();
    expect(turn.missing).toContain('cargoType');
  });

  it('merges the prior draft with the model output, keeping earlier fields', async () => {
    service = await makeService(buildLlm({ assistantMessage: 'ok', draft: { weight: 500 } }));
    const turn = await service.chat([{ role: 'user', content: '500kg' }], { title: 'Previo' });
    expect(turn.draft.title).toBe('Previo');
    expect(turn.draft.weight).toBe(500);
  });

  it('flags readyToConfirm only when every required field is filled', async () => {
    service = await makeService(
      buildLlm({
        assistantMessage: 'listo',
        draft: {
          title: 'Envío',
          cargoType: 'Mercadería general',
          weight: 500,
          origin: { city: 'Córdoba' },
          dest: { city: 'Rosario' },
          pickupDate: '2099-01-01T10:00:00.000Z',
          deliveryDate: '2099-01-02T10:00:00.000Z',
        },
      }),
    );
    const turn = await service.chat([{ role: 'user', content: 'todo' }]);
    expect(turn.missing).toEqual([]);
    expect(turn.readyToConfirm).toBe(true);
  });

  it('rejects an unparseable weight and keeps asking for it', async () => {
    service = await makeService(
      buildLlm({ assistantMessage: 'ok', draft: { weight: -5 } }),
    );
    const turn = await service.chat([{ role: 'user', content: 'menos cinco' }]);
    expect(turn.draft.weight).toBeUndefined();
    expect(turn.missing).toContain('weight');
  });

  // Cronología de fechas: el wizard tradicional la valida en el cliente, así que
  // el chat tiene que aplicar las mismas reglas o queda como puerta trasera para
  // publicar cargas con fechas imposibles.
  describe('cronología de fechas', () => {
    const isoIn = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString();
    };

    it('drops a pickupDate in the past so it gets re-asked', async () => {
      service = await makeService(
        buildLlm({ assistantMessage: 'ok', draft: { pickupDate: isoIn(-3) } }),
      );
      const turn = await service.chat([{ role: 'user', content: 'el lunes pasado' }]);
      expect(turn.draft.pickupDate).toBeUndefined();
      expect(turn.missing).toContain('pickupDate');
    });

    it('drops a deliveryDate that is not after the pickupDate', async () => {
      service = await makeService(
        buildLlm({
          assistantMessage: 'ok',
          draft: { pickupDate: isoIn(5), deliveryDate: isoIn(1) },
        }),
      );
      const turn = await service.chat([{ role: 'user', content: 'mañana' }]);
      expect(turn.draft.pickupDate).toBeDefined();
      expect(turn.draft.deliveryDate).toBeUndefined();
    });

    it('keeps a chronologically valid pair', async () => {
      const pickupDate = isoIn(2);
      const deliveryDate = isoIn(4);
      service = await makeService(
        buildLlm({ assistantMessage: 'ok', draft: { pickupDate, deliveryDate } }),
      );
      const turn = await service.chat([{ role: 'user', content: 'pasado mañana' }]);
      expect(turn.draft.pickupDate).toBe(pickupDate);
      expect(turn.draft.deliveryDate).toBe(deliveryDate);
    });
  });

  it('falls back gracefully when the model returns non-JSON', async () => {
    service = await makeService(buildLlm('esto no es json {'));
    const prior = { title: 'Mantener' };
    const turn = await service.chat([{ role: 'user', content: 'hola' }], prior);
    expect(turn.draft).toEqual(prior);
    expect(turn.readyToConfirm).toBe(false);
    expect(turn.assistantMessage).toMatch(/repetir/i);
  });

  describe('degradación a modo básico', () => {
    it('sigue la conversación con reglas cuando ningún proveedor responde', async () => {
      service = await makeService(brokenLlm());
      const turn = await service.chat([
        { role: 'assistant', content: DEFAULT_FLOW.greeting },
        { role: 'user', content: 'Mudanza chica' },
      ]);

      expect(turn.degraded).toBe(true);
      expect(turn.draft.title).toBe('Mudanza chica');
      // Avanza al siguiente paso del flujo en vez de cortar con un error.
      expect(turn.assistantMessage).toContain(DEFAULT_FLOW.steps[1].question);
    });

    it('marca degraded:false cuando el LLM sí respondió', async () => {
      service = await makeService(buildLlm({ assistantMessage: 'ok', draft: { title: 'X' } }));
      const turn = await service.chat([{ role: 'user', content: 'hola' }]);
      expect(turn.degraded).toBe(false);
    });
  });

  describe('status', () => {
    it('reporta basicMode cuando no hay proveedores configurados', async () => {
      service = await makeService({
        name: 'chain',
        generateJson: jest.fn(),
        isConfigured: () => false,
        activeProviders: () => [],
      });

      expect(service.status()).toEqual({ available: true, basicMode: true, providers: [] });
    });

    it('lista los proveedores activos de la cadena', async () => {
      service = await makeService({
        name: 'chain',
        generateJson: jest.fn(),
        isConfigured: () => true,
        activeProviders: () => ['gemini', 'groq'],
      });

      expect(service.status()).toEqual({
        available: true,
        basicMode: false,
        providers: ['gemini', 'groq'],
      });
    });
  });
});
