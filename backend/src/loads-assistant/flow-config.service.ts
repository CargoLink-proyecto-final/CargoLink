import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { DEFAULT_FLOW, FlowConfig, FlowStep, StepType } from './flow-config';

const VALID_TYPES: StepType[] = ['text', 'number', 'enum', 'address', 'date'];

/**
 * Persiste la configuración del flujo conversacional en un único archivo JSON.
 *
 * Decisión (2026-08-27): archivo de config editable por ADMIN, sin migración de
 * DB. Ruta configurable con ASSISTANT_FLOW_CONFIG_PATH; por defecto vive junto
 * al proceso del backend. Si el archivo no existe, se sirve DEFAULT_FLOW.
 *
 * ⚠️ Cloud Run tiene filesystem efímero: una edición hecha por el panel NO
 * sobrevive a un redeploy ni se comparte entre instancias. Alcanza para dev y
 * para la demo del proyecto; para persistencia real habría que mover esto a DB
 * (ver memoria [[chatbot-load-creation]]).
 */
@Injectable()
export class FlowConfigService {
  private readonly logger = new Logger(FlowConfigService.name);
  private readonly filePath: string;

  constructor(private config: ConfigService) {
    this.filePath =
      this.config.get<string>('ASSISTANT_FLOW_CONFIG_PATH') ||
      join(process.cwd(), 'assistant-flow.config.json');
  }

  async get(): Promise<FlowConfig> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as FlowConfig;
      return this.validate(parsed);
    } catch (err: unknown) {
      // Sin archivo aún (o ilegible) → flujo semilla. No es un error operativo.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.logger.warn(
          `No se pudo leer ${this.filePath}, usando flujo por defecto: ${(err as Error).message}`,
        );
      }
      return DEFAULT_FLOW;
    }
  }

  async save(config: FlowConfig): Promise<FlowConfig> {
    const clean = this.validate(config);
    try {
      await fs.writeFile(this.filePath, JSON.stringify(clean, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error(`No se pudo guardar el flujo en ${this.filePath}`, err as Error);
      throw new BadRequestException('No se pudo persistir la configuración del flujo');
    }
    return clean;
  }

  // Valida forma y normaliza. Lanza BadRequest si la config es inservible: el
  // asistente depende de estos campos, no queremos guardar basura desde el panel.
  private validate(config: FlowConfig): FlowConfig {
    if (!config || typeof config !== 'object') {
      throw new BadRequestException('La configuración del flujo es inválida');
    }
    if (!Array.isArray(config.steps) || config.steps.length === 0) {
      throw new BadRequestException('El flujo debe tener al menos un paso');
    }

    const seen = new Set<string>();
    const steps: FlowStep[] = config.steps.map((step, i) => {
      if (!step.id || !step.field || !step.question) {
        throw new BadRequestException(`El paso #${i + 1} necesita id, field y question`);
      }
      if (seen.has(step.field)) {
        throw new BadRequestException(`El campo "${step.field}" está repetido en el flujo`);
      }
      seen.add(step.field);
      const type: StepType = VALID_TYPES.includes(step.type) ? step.type : 'text';
      if (type === 'enum' && (!Array.isArray(step.options) || step.options.length === 0)) {
        throw new BadRequestException(`El paso "${step.id}" es enum pero no tiene opciones`);
      }
      return {
        id: String(step.id),
        field: String(step.field),
        label: String(step.label ?? step.field),
        question: String(step.question),
        required: Boolean(step.required),
        type,
        help: step.help ? String(step.help) : undefined,
        options: type === 'enum' ? step.options!.map(String) : undefined,
      };
    });

    return {
      version: Number(config.version) || 1,
      systemPreamble: String(config.systemPreamble ?? DEFAULT_FLOW.systemPreamble),
      greeting: String(config.greeting ?? DEFAULT_FLOW.greeting),
      steps,
    };
  }
}
