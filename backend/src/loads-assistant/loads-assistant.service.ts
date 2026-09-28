import { Inject, Injectable, Logger } from '@nestjs/common';
import { CARGO_TYPES } from '../loads/cargo-types.constant';
import { BasicFlowEngine } from './basic-flow.engine';
import { FlowConfigService } from './flow-config.service';
import { FlowConfig, FlowStep } from './flow-config';
import { LLM_PROVIDER, LlmMessage, LlmProvider } from './llm/llm-provider';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { AddressDraft, AssistantStatus, AssistantTurn, LoadDraft } from './types';

// Esquema (subset OpenAPI) que Gemini debe respetar en su respuesta. Fuerza una
// salida parseable: el mensaje al usuario + el borrador completo actualizado.
const ADDRESS_SCHEMA = {
  type: 'object',
  properties: {
    address: { type: 'string' },
    city: { type: 'string' },
    province: { type: 'string' },
  },
};
const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    assistantMessage: { type: 'string' },
    draft: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        cargoType: { type: 'string' },
        weight: { type: 'number' },
        volume: { type: 'number' },
        price: { type: 'number' },
        origin: ADDRESS_SCHEMA,
        dest: ADDRESS_SCHEMA,
        pickupDate: { type: 'string' },
        deliveryDate: { type: 'string' },
      },
    },
  },
  required: ['assistantMessage', 'draft'],
};

interface LlmDraftResponse {
  assistantMessage?: string;
  draft?: LoadDraft;
}

@Injectable()
export class LoadsAssistantService {
  private readonly logger = new Logger(LoadsAssistantService.name);

  constructor(
    private flowConfig: FlowConfigService,
    private basic: BasicFlowEngine,
    @Inject(LLM_PROVIDER) private llm: LlmProvider,
  ) {}

  getFlow(): Promise<FlowConfig> {
    return this.flowConfig.get();
  }

  updateFlow(dto: UpdateFlowDto): Promise<FlowConfig> {
    return this.flowConfig.save(dto);
  }

  // El asistente siempre está operativo: sin LLM configurado cae al modo básico
  // determinista, que hace las preguntas del flujo una por una.
  status(): AssistantStatus {
    const llmEnabled = this.llm.isConfigured();
    return {
      available: true,
      basicMode: !llmEnabled,
      providers: this.llm.activeProviders?.() ?? (llmEnabled ? [this.llm.name] : []),
    };
  }

  async chat(messages: LlmMessage[], priorDraft: LoadDraft = {}): Promise<AssistantTurn> {
    const flow = await this.flowConfig.get();

    if (this.llm.isConfigured()) {
      try {
        return await this.llmTurn(flow, messages, priorDraft);
      } catch (err) {
        // Ya se intentó con todos los proveedores de la cadena (ver
        // ChainLlmProvider): si ninguno respondió, seguimos en modo básico en
        // vez de cortarle la conversación al usuario.
        this.logger.warn(
          `Ningún proveedor de LLM respondió (${(err as Error).message}). Paso a modo básico.`,
        );
      }
    }
    return this.basicTurn(flow, messages, priorDraft);
  }

  // Turno degradado: sin LLM, con las reglas de BasicFlowEngine. El borrador
  // pasa por el mismo sanitize que el turno con LLM, así que el contrato de
  // dominio (cargoType de la whitelist, números y fechas válidos) no cambia.
  private basicTurn(
    flow: FlowConfig,
    messages: LlmMessage[],
    priorDraft: LoadDraft,
  ): AssistantTurn {
    const { draft: filled, failedStepId } = this.basic.applyAnswer(flow, messages, priorDraft);
    const draft = this.sanitize(filled);
    const missing = this.missingFields(flow, draft);

    return {
      assistantMessage: this.basic.nextMessage(flow, messages, draft, failedStepId),
      draft,
      missing,
      readyToConfirm: missing.length === 0,
      degraded: true,
    };
  }

  private async llmTurn(
    flow: FlowConfig,
    messages: LlmMessage[],
    priorDraft: LoadDraft,
  ): Promise<AssistantTurn> {
    const system = this.buildSystemPrompt(flow, priorDraft);

    const raw = await this.llm.generateJson({ system, messages, schema: RESPONSE_SCHEMA });

    let parsed: LlmDraftResponse;
    try {
      parsed = JSON.parse(raw) as LlmDraftResponse;
    } catch (err) {
      // Si el modelo devolvió algo no-JSON, no rompemos la conversación: pedimos
      // reformular y conservamos el borrador previo.
      this.logger.warn(`Respuesta no parseable del LLM: ${(err as Error).message}`);
      return {
        assistantMessage: 'Perdoná, no te entendí bien. ¿Me lo podés repetir de otra forma?',
        draft: priorDraft,
        missing: this.missingFields(flow, priorDraft),
        readyToConfirm: false,
        degraded: false,
      };
    }

    const draft = this.sanitize(this.merge(priorDraft, parsed.draft ?? {}));
    const missing = this.missingFields(flow, draft);

    return {
      assistantMessage: parsed.assistantMessage?.trim() || '¿Seguimos?',
      draft,
      missing,
      readyToConfirm: missing.length === 0,
      degraded: false,
    };
  }

  private buildSystemPrompt(flow: FlowConfig, draft: LoadDraft): string {
    const today = new Date().toISOString();
    const stepLines = flow.steps
      .map((s) => {
        const req = s.required ? 'OBLIGATORIO' : 'opcional';
        const opts = s.type === 'enum' && s.options ? ` Valores válidos: ${s.options.join(' | ')}.` : '';
        return `- ${s.field} (${s.type}, ${req}): ${s.question}${opts}`;
      })
      .join('\n');

    return [
      flow.systemPreamble,
      '',
      `Fecha y hora actual (ISO): ${today}. Usala para convertir expresiones como "mañana" o "el viernes" a fecha concreta.`,
      '',
      'Tenés que recolectar estos datos para publicar la carga:',
      stepLines,
      '',
      'Reglas de salida:',
      '- Respondé SIEMPRE con un JSON con "assistantMessage" (tu próximo mensaje al usuario, en español) y "draft" (el borrador COMPLETO y actualizado).',
      '- En "draft" mezclá lo ya recolectado con lo nuevo. No borres datos ya cargados salvo que el usuario los corrija.',
      '- No inventes datos: si un campo no lo dijo el usuario, dejalo fuera del draft.',
      '- Las direcciones (origin/dest) tienen address (calle y número), city y province por separado.',
      '- Las fechas (pickupDate, deliveryDate) van en formato ISO 8601. pickupDate no puede ser anterior a la fecha actual; deliveryDate debe ser posterior a pickupDate.',
      '- cargoType debe ser EXACTAMENTE uno de los valores válidos listados; si el usuario describe otra cosa, elegí la categoría más cercana o "Otro".',
      '- Pedí un solo dato faltante por vez, priorizando los obligatorios. Cuando estén todos los obligatorios, invitá a revisar el resumen y confirmar.',
      '',
      `Borrador acumulado hasta ahora: ${JSON.stringify(draft)}`,
    ].join('\n');
  }

  // Mezcla el borrador previo con el que devolvió el modelo. El modelo gana en
  // los campos que trae; los que omite se conservan del previo. origin/dest se
  // mezclan por subcampo.
  private merge(prev: LoadDraft, next: LoadDraft): LoadDraft {
    const mergeAddr = (a?: AddressDraft, b?: AddressDraft): AddressDraft | undefined => {
      if (!a && !b) return undefined;
      return {
        address: b?.address ?? a?.address,
        city: b?.city ?? a?.city,
        province: b?.province ?? a?.province,
      };
    };
    return {
      title: next.title ?? prev.title,
      description: next.description ?? prev.description,
      cargoType: next.cargoType ?? prev.cargoType,
      weight: next.weight ?? prev.weight,
      volume: next.volume ?? prev.volume,
      price: next.price ?? prev.price,
      origin: mergeAddr(prev.origin, next.origin),
      dest: mergeAddr(prev.dest, next.dest),
      pickupDate: next.pickupDate ?? prev.pickupDate,
      deliveryDate: next.deliveryDate ?? prev.deliveryDate,
    };
  }

  // Descarta valores que no respetan el contrato de dominio para que el flujo
  // los vuelva a pedir en vez de arrastrar basura hasta el create.
  private sanitize(draft: LoadDraft): LoadDraft {
    const clean: LoadDraft = { ...draft };

    if (clean.cargoType) {
      const match = CARGO_TYPES.find(
        (t) => t.toLowerCase() === clean.cargoType!.trim().toLowerCase(),
      );
      clean.cargoType = match; // undefined si no matchea → se vuelve a preguntar
    }
    if (clean.weight != null && (!Number.isFinite(clean.weight) || clean.weight <= 0)) {
      clean.weight = undefined;
    }
    if (clean.price != null && (!Number.isFinite(clean.price) || clean.price < 0)) {
      clean.price = undefined;
    }
    if (clean.volume != null && (!Number.isFinite(clean.volume) || clean.volume < 0)) {
      clean.volume = undefined;
    }
    if (clean.pickupDate && Number.isNaN(Date.parse(clean.pickupDate))) {
      clean.pickupDate = undefined;
    }
    if (clean.deliveryDate && Number.isNaN(Date.parse(clean.deliveryDate))) {
      clean.deliveryDate = undefined;
    }

    // Mismas reglas de cronología que el formulario tradicional (ver el wizard
    // en frontend/src/app/loads/new/page.tsx): la recogida no puede quedar en el
    // pasado y la entrega tiene que ser posterior a la recogida. Sin esto el
    // chat publica cargas con fechas invertidas, porque CreateLoadDto solo pide
    // que cada fecha sea parseable. Se descarta el valor en vez de tirar error
    // para que el flujo lo vuelva a preguntar.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    if (clean.pickupDate && Date.parse(clean.pickupDate) < startOfToday.getTime()) {
      clean.pickupDate = undefined;
    }
    if (
      clean.deliveryDate &&
      clean.pickupDate &&
      Date.parse(clean.deliveryDate) <= Date.parse(clean.pickupDate)
    ) {
      clean.deliveryDate = undefined;
    }

    return clean;
  }

  // Campos obligatorios del flujo que siguen vacíos en el borrador.
  private missingFields(flow: FlowConfig, draft: LoadDraft): string[] {
    return flow.steps.filter((s) => s.required && !this.isFilled(s, draft)).map((s) => s.field);
  }

  private isFilled(step: FlowStep, draft: LoadDraft): boolean {
    if (step.type === 'address') {
      const addr = draft[step.field as 'origin' | 'dest'];
      return !!(addr && (addr.address?.trim() || addr.city?.trim()));
    }
    const value = (draft as Record<string, unknown>)[step.field];
    if (typeof value === 'string') return value.trim().length > 0;
    return value != null;
  }
}
