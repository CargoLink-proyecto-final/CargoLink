import { Injectable } from '@nestjs/common';
import { FlowConfig, FlowStep } from './flow-config';
import { LlmMessage } from './llm/llm-provider';
import { AddressDraft, LoadDraft } from './types';

// Modo básico: último recurso cuando NINGÚN proveedor de LLM responde (sin key
// configurada, cuota agotada, caída de la API). En vez de dejar el chat muerto,
// el asistente recorre los pasos del flujo en orden, hace la pregunta de cada
// uno y parsea la respuesta con reglas. Es menos flexible que el LLM (un dato
// por turno, sin lenguaje natural libre) pero permite terminar de publicar la
// carga y que una demo no se caiga. Usa el MISMO FlowConfig editable, así que
// lo que el admin edita en el panel también rige acá.

// Palabras con las que el usuario declina un paso opcional.
const SKIP_WORDS = [
  'no',
  'nada',
  'ninguna',
  'ninguno',
  'saltar',
  'omitir',
  'siguiente',
  'paso',
  'a convenir',
  'no se',
  'ns',
  'sin precio',
  'despues',
  'luego',
  '-',
];

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

// Domingo = 0 … Sábado = 6, para alinearlo con Date.getDay().
const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const DEFAULT_HOUR = 9;

// Minúsculas y sin tildes, para comparar lo que escribe el usuario.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export interface BasicAnswer {
  draft: LoadDraft;
  // Paso cuya respuesta no se pudo interpretar: hay que repreguntarlo con ayuda.
  failedStepId?: string;
}

@Injectable()
export class BasicFlowEngine {
  // Aplica el último mensaje del usuario al paso pendiente y devuelve el
  // borrador actualizado.
  applyAnswer(flow: FlowConfig, messages: LlmMessage[], prior: LoadDraft): BasicAnswer {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content.trim() ?? '';
    if (!lastUser) return { draft: prior };

    const step = this.pendingStep(flow, messages, prior);
    // Sin pasos pendientes el usuario está confirmando: no tocamos el borrador.
    if (!step) return { draft: prior };

    // En un paso opcional, "no" / "a convenir" significa dejarlo vacío. Como el
    // paso ya quedó preguntado en el historial, el próximo turno lo saltea.
    if (!step.required && this.isSkip(lastUser)) return { draft: prior };

    const value = this.parse(step, lastUser);
    if (value === null) return { draft: prior, failedStepId: step.id };

    return { draft: this.assign(prior, step, value) };
  }

  // Arma el mensaje del asistente: repregunta si no entendió, pregunta el
  // siguiente paso, o cierra con el resumen para confirmar.
  nextMessage(
    flow: FlowConfig,
    messages: LlmMessage[],
    draft: LoadDraft,
    failedStepId?: string,
  ): string {
    if (failedStepId) {
      const failed = flow.steps.find((s) => s.id === failedStepId);
      if (failed) return `No llegué a entenderte. ${this.ask(failed)}`;
    }

    const next = this.pendingStep(flow, messages, draft);
    if (next) return this.ask(next);

    return [
      'Listo, con esto ya puedo publicar la carga:',
      '',
      this.summary(flow, draft),
      '',
      'Si está todo bien, tocá "Crear carga". Si querés corregir algo, decime qué.',
    ].join('\n');
  }

  // Primer paso que todavía necesita respuesta. Los opcionales que ya se
  // preguntaron y siguen vacíos se consideran declinados (el usuario los pasó).
  private pendingStep(
    flow: FlowConfig,
    messages: LlmMessage[],
    draft: LoadDraft,
  ): FlowStep | undefined {
    return flow.steps.find((step) => {
      if (this.isFilled(step, draft)) return false;
      if (!step.required && this.alreadyAsked(step, messages)) return false;
      return true;
    });
  }

  private alreadyAsked(step: FlowStep, messages: LlmMessage[]): boolean {
    return messages.some((m) => m.role === 'assistant' && m.content.includes(step.question));
  }

  private ask(step: FlowStep): string {
    const parts = [step.question];
    if (step.type === 'enum' && step.options?.length) {
      parts.push(step.options.map((o, i) => `${i + 1}. ${o}`).join('\n'));
      parts.push('Podés responder con el número o con el nombre.');
    }
    if (step.type === 'date') {
      parts.push('Ejemplos: "mañana a las 9", "15/03 14hs", "el viernes".');
    }
    if (step.type === 'number') {
      parts.push('Decime solo el número.');
    }
    if (step.help) parts.push(step.help);
    if (!step.required) parts.push('Si querés saltearlo, respondé "no".');
    return parts.join('\n');
  }

  private summary(flow: FlowConfig, draft: LoadDraft): string {
    return flow.steps
      .map((step) => {
        const value = this.display(step, draft);
        return value ? `• ${step.label}: ${value}` : null;
      })
      .filter(Boolean)
      .join('\n');
  }

  private display(step: FlowStep, draft: LoadDraft): string {
    if (step.type === 'address') {
      const a = draft[step.field as 'origin' | 'dest'];
      return a ? [a.address, a.city, a.province].filter(Boolean).join(', ') : '';
    }
    const value = (draft as Record<string, unknown>)[step.field];
    if (value == null || value === '') return '';
    if (step.type === 'date') {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime())
        ? String(value)
        : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    }
    return String(value);
  }

  private isSkip(text: string): boolean {
    const n = normalize(text).replace(/[.!]/g, '');
    return SKIP_WORDS.includes(n);
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

  private assign(
    prior: LoadDraft,
    step: FlowStep,
    value: string | number | AddressDraft,
  ): LoadDraft {
    return { ...prior, [step.field]: value } as LoadDraft;
  }

  // Devuelve null cuando no pudo interpretar la respuesta.
  private parse(step: FlowStep, text: string): string | number | AddressDraft | null {
    switch (step.type) {
      case 'number':
        return this.parseNumber(text);
      case 'enum':
        return this.parseEnum(step, text);
      case 'address':
        return this.parseAddress(text);
      case 'date':
        return this.parseDate(text);
      default:
        // El primer turno suele ser una frase libre ("mando electrónica a
        // Rosario"): en modo básico entra tal cual como título, acotada.
        return text.slice(0, 120);
    }
  }

  // Acepta formato argentino: "1.500" = 1500, "2,5" = 2.5. Interpreta toneladas.
  private parseNumber(text: string): number | null {
    const n = normalize(text);
    const match = n.match(/\d[\d.,]*/);
    if (!match) return null;

    let raw = match[0].replace(/[.,]$/, '');
    if (raw.includes('.') && raw.includes(',')) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes(',')) {
      raw = raw.replace(',', '.');
    } else if (raw.includes('.')) {
      // "1.500" son miles; "2.5" es decimal.
      const decimals = raw.split('.').pop() ?? '';
      raw = decimals.length === 3 ? raw.replace(/\./g, '') : raw;
    }

    const value = Number(raw);
    if (!Number.isFinite(value)) return null;

    const tons = /\b(t|tn|ton|tons|tonelada|toneladas)\b/.test(n);
    return tons ? value * 1000 : value;
  }

  // Acepta el número de la lista o el nombre (aun parcial y sin tildes).
  private parseEnum(step: FlowStep, text: string): string | null {
    const options = step.options ?? [];
    if (options.length === 0) return text.trim() || null;

    const n = normalize(text);
    const index = Number(n);
    if (Number.isInteger(index) && index >= 1 && index <= options.length) {
      return options[index - 1];
    }

    const exact = options.find((o) => normalize(o) === n);
    if (exact) return exact;

    // Coincidencia parcial: "electronica" matchea "Electrónica y tecnología".
    const partial = options.find((o) => {
      const head = normalize(o).split(' ')[0];
      return n.includes(head) || normalize(o).includes(n);
    });
    return partial ?? null;
  }

  // "Av. Colón 1234, Córdoba, Córdoba" → address / city / province.
  private parseAddress(text: string): AddressDraft | null {
    const parts = text
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return null;

    if (parts.length >= 3) {
      return { address: parts[0], city: parts[1], province: parts[2] };
    }
    if (parts.length === 2) {
      // Con altura de calle el primer tramo es la dirección; si no, es ciudad.
      return /\d/.test(parts[0])
        ? { address: parts[0], city: parts[1] }
        : { city: parts[0], province: parts[1] };
    }
    return /\d/.test(parts[0]) ? { address: parts[0] } : { city: parts[0] };
  }

  // Fechas en español: relativas ("mañana", "el viernes", "en 3 días"),
  // numéricas ("15/03", "15-03-2026") y con mes escrito ("5 de marzo").
  private parseDate(text: string): string | null {
    const n = normalize(text);
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DEFAULT_HOUR, 0, 0, 0);
    let matched = false;

    const numeric = n.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
    const written = n.match(new RegExp(`(\\d{1,2})\\s+de\\s+(${MONTHS.join('|')})`));
    const inDays = n.match(/en\s+(\d{1,3})\s+dias?/);
    const weekday = Object.keys(WEEKDAYS).find((d) => n.includes(d));

    if (numeric) {
      const day = Number(numeric[1]);
      const month = Number(numeric[2]) - 1;
      if (day < 1 || day > 31 || month < 0 || month > 11) return null;
      const year = numeric[3]
        ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
        : now.getFullYear();
      date.setFullYear(year, month, day);
      // Sin año explícito y con la fecha ya pasada, se asume el año próximo.
      if (!numeric[3] && date.getTime() < now.getTime()) date.setFullYear(year + 1);
      matched = true;
    } else if (written) {
      const day = Number(written[1]);
      const month = MONTHS.indexOf(written[2]);
      if (day < 1 || day > 31) return null;
      date.setMonth(month, day);
      if (date.getTime() < now.getTime()) date.setFullYear(now.getFullYear() + 1);
      matched = true;
    } else if (inDays) {
      date.setDate(date.getDate() + Number(inDays[1]));
      matched = true;
    } else if (n.includes('pasado manana')) {
      date.setDate(date.getDate() + 2);
      matched = true;
    } else if (n.includes('manana')) {
      date.setDate(date.getDate() + 1);
      matched = true;
    } else if (n.includes('hoy')) {
      matched = true;
    } else if (weekday !== undefined) {
      // Próxima ocurrencia de ese día, siempre futura.
      const target = WEEKDAYS[weekday];
      const delta = ((target - date.getDay() + 7) % 7) || 7;
      date.setDate(date.getDate() + delta);
      matched = true;
    }

    if (!matched) return null;

    // Hora opcional: "a las 14", "14hs", "14:30". Con fecha numérica se omite
    // para no confundir el "15/03" con una hora.
    const time = n.match(
      /a\s+las\s+(\d{1,2})(?::(\d{2}))?|(\d{1,2})(?::(\d{2}))?\s*(?:hs|hrs|horas)\b/,
    );
    if (time && !numeric) {
      const hour = Number(time[1] ?? time[3]);
      const minutes = Number(time[2] ?? time[4] ?? 0);
      if (hour <= 23 && minutes <= 59) date.setHours(hour, minutes, 0, 0);
    }

    return date.toISOString();
  }
}
