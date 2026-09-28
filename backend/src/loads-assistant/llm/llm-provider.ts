// Contrato del proveedor de LLM. El asistente depende solo de esta interfaz,
// no de Gemini en concreto: cambiar o encadenar proveedores es implementar
// otra clase. Ver memoria de proyecto [[chatbot-load-creation]] (el free tier
// de Gemini es acotado y puede cortarse en plena demo).

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmJsonRequest {
  // Instrucción de sistema (rol, tono, reglas, esquema esperado).
  system: string;
  // Historial de la conversación en orden cronológico.
  messages: LlmMessage[];
  // Esquema JSON (subset OpenAPI) que la respuesta debe cumplir.
  schema: Record<string, unknown>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface LlmProvider {
  // Identificador corto para logs y para el estado que ve el panel admin.
  readonly name: string;
  // Devuelve el texto JSON crudo generado por el modelo (a parsear por el caller).
  generateJson(req: LlmJsonRequest): Promise<string>;
  // Si el proveedor no está configurado (falta API key), el asistente cae al
  // modo básico en vez de romper con un stacktrace.
  isConfigured(): boolean;
  // Solo la implementan los proveedores compuestos (ChainLlmProvider): lista
  // los miembros que hoy tienen credenciales.
  activeProviders?(): string[];
}
