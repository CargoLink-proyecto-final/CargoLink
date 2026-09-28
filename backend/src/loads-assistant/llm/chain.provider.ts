import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { LlmJsonRequest, LlmProvider } from './llm-provider';

// Encadena proveedores en orden de preferencia: intenta el primero configurado
// y, si falla (timeout, 429 por cuota agotada, 5xx), pasa al siguiente. Así una
// caída de Gemini no deja al asistente sin cerebro. Si TODOS fallan, el
// LoadsAssistantService cae al modo básico determinista (sin LLM).
@Injectable()
export class ChainLlmProvider implements LlmProvider {
  readonly name = 'chain';
  private readonly logger = new Logger(ChainLlmProvider.name);

  constructor(private readonly providers: LlmProvider[]) {}

  isConfigured(): boolean {
    return this.providers.some((p) => p.isConfigured());
  }

  activeProviders(): string[] {
    return this.providers.filter((p) => p.isConfigured()).map((p) => p.name);
  }

  async generateJson(req: LlmJsonRequest): Promise<string> {
    const active = this.providers.filter((p) => p.isConfigured());
    if (active.length === 0) {
      throw new ServiceUnavailableException('No hay ningún proveedor de LLM configurado');
    }

    let lastError: unknown;
    for (const provider of active) {
      try {
        const text = await provider.generateJson(req);
        if (lastError) {
          this.logger.log(`Respondió el proveedor de respaldo "${provider.name}"`);
        }
        return text;
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `El proveedor "${provider.name}" falló: ${(err as Error).message}. Pruebo el siguiente.`,
        );
      }
    }
    throw lastError;
  }
}
