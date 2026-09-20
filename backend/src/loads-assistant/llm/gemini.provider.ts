import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmJsonRequest, LlmProvider } from './llm-provider';

// Google AI Studio (Generative Language API). Free tier sin tarjeta; la key se
// saca en https://aistudio.google.com/apikey y vive SOLO en el backend
// (secreto GCP), nunca en el cliente.
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 20_000;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GEMINI_API_KEY');
    this.model = config.get<string>('GEMINI_MODEL') || DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async generateJson(req: LlmJsonRequest): Promise<string> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'El asistente no está disponible: falta configurar GEMINI_API_KEY',
      );
    }

    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({
        // Gemini nombra al asistente como "model".
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: req.schema,
        temperature: 0.2,
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(
        `${API_BASE}/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
    } catch (err) {
      this.logger.error('Fallo la llamada a Gemini', err as Error);
      throw new ServiceUnavailableException('El asistente no está disponible en este momento');
    } finally {
      clearTimeout(timeout);
    }

    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      this.logger.error(`Gemini respondió ${res.status}: ${data.error?.message ?? 'sin detalle'}`);
      // 429 = límite del free tier alcanzado; se lo comunicamos al usuario.
      if (res.status === 429) {
        throw new ServiceUnavailableException(
          'El asistente alcanzó su límite de uso por hoy. Probá el formulario tradicional.',
        );
      }
      throw new ServiceUnavailableException('El asistente no pudo procesar el mensaje');
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new ServiceUnavailableException('El asistente devolvió una respuesta vacía');
    }
    return text;
  }
}
