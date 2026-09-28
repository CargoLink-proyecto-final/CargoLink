import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmJsonRequest, LlmProvider } from './llm-provider';

// Respaldo de Gemini. Groq expone una API compatible con la de OpenAI y tiene
// free tier sin tarjeta, así que sirve para que el asistente siga vivo cuando
// Gemini se cae o agota su cuota diaria. La key se saca en
// https://console.groq.com/keys y vive SOLO en el backend, nunca en el cliente.
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 20_000;

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

@Injectable()
export class GroqProvider implements LlmProvider {
  readonly name = 'groq';
  private readonly logger = new Logger(GroqProvider.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GROQ_API_KEY');
    this.model = config.get<string>('GROQ_MODEL') || DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async generateJson(req: LlmJsonRequest): Promise<string> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Groq no está configurado (falta GROQ_API_KEY)');
    }

    // El modo JSON de Groq no acepta un responseSchema como Gemini: el esquema
    // se le pasa como texto dentro del system prompt.
    const system = [
      req.system,
      '',
      'Respondé únicamente con un objeto JSON válido que cumpla este esquema:',
      JSON.stringify(req.schema),
    ].join('\n');

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        ...req.messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.error('Falló la llamada a Groq', err as Error);
      throw new ServiceUnavailableException('Groq no está disponible en este momento');
    } finally {
      clearTimeout(timeout);
    }

    const data = (await res.json().catch(() => ({}))) as GroqResponse;
    if (!res.ok) {
      this.logger.error(`Groq respondió ${res.status}: ${data.error?.message ?? 'sin detalle'}`);
      throw new ServiceUnavailableException('Groq no pudo procesar el mensaje');
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new ServiceUnavailableException('Groq devolvió una respuesta vacía');
    }
    return text;
  }
}
