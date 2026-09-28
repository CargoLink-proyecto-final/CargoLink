// Borrador de carga que el asistente va completando a lo largo de la
// conversación. Es un subconjunto laxo de CreateLoadDto: las direcciones se
// guardan como texto (origin/dest) y el frontend las geocodifica a lat/lng
// reutilizando lib/routing.ts antes de llamar a loadsApi.create. Ver la
// memoria de proyecto [[chatbot-load-creation]].
export interface AddressDraft {
  address?: string;
  city?: string;
  province?: string;
}

export interface LoadDraft {
  title?: string;
  description?: string;
  cargoType?: string;
  weight?: number;
  volume?: number;
  price?: number;
  origin?: AddressDraft;
  dest?: AddressDraft;
  // ISO 8601. Gemini convierte expresiones ("mañana 9hs") a fecha concreta
  // usando la fecha actual que se le pasa en el system prompt.
  pickupDate?: string;
  deliveryDate?: string;
}

// Lo que el service devuelve al frontend en cada turno.
export interface AssistantTurn {
  assistantMessage: string;
  draft: LoadDraft;
  // Campos requeridos que todavía están vacíos (por `field` del flujo).
  missing: string[];
  // Todos los requeridos están completos → el frontend habilita "Crear carga".
  readyToConfirm: boolean;
  // El turno se resolvió en modo básico (sin LLM): ningún proveedor respondió o
  // no hay ninguno configurado. El frontend lo avisa para explicar por qué el
  // asistente pasó a preguntar de a un dato por vez.
  degraded: boolean;
}

// Estado del asistente que consulta el frontend al abrir el chat.
export interface AssistantStatus {
  // Siempre true: el modo básico garantiza que el chat funcione sin LLM.
  available: boolean;
  // No hay ningún proveedor de LLM con credenciales.
  basicMode: boolean;
  // Proveedores configurados, en orden de preferencia (ej. ['gemini', 'groq']).
  providers: string[];
}
