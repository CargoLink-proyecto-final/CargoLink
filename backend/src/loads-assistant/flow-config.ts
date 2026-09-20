import { CARGO_TYPES } from '../loads/cargo-types.constant';

// Tipos de dato que el asistente sabe recolectar. Definen cómo el frontend
// pinta el resumen del borrador y cómo se le pide a Gemini que normalice el
// valor extraído (ver loads-assistant.service.ts).
export type StepType = 'text' | 'number' | 'enum' | 'address' | 'date';

// Un paso del flujo conversacional. `field` es la clave dentro del borrador
// (LoadDraft) que este paso completa. El flujo es editable por ADMIN desde un
// panel, así que estas mismas propiedades son las que se editan.
export interface FlowStep {
  id: string;
  field: string;
  label: string;
  question: string;
  required: boolean;
  type: StepType;
  help?: string;
  // Solo para type 'enum': lista cerrada de valores admitidos.
  options?: string[];
}

export interface FlowConfig {
  version: number;
  // Preámbulo que encabeza el system prompt de Gemini: define tono y rol del
  // asistente. Editable para ajustar la personalidad sin tocar código.
  systemPreamble: string;
  // Mensaje con el que el asistente saluda al abrir el chat.
  greeting: string;
  steps: FlowStep[];
}

// Flujo por defecto (semilla). El FlowConfigService lo devuelve cuando todavía
// no hay una versión editada persistida. Cubre "la información importante" que
// hace una carga válida contra CreateLoadDto; los campos opcionales del DTO
// (volumen, dimensiones de bulto, cityId) quedan fuera a propósito — ver la
// memoria de proyecto [[chatbot-load-creation]].
export const DEFAULT_FLOW: FlowConfig = {
  version: 1,
  systemPreamble:
    'Sos el asistente de CargoLink, una plataforma de transporte de cargas por carretera. ' +
    'Ayudás a un dador de carga (shipper) a publicar una carga conversando en español rioplatense, ' +
    'de forma cordial, clara y breve. Hacé una sola pregunta por turno y no inventes datos: si algo ' +
    'no lo dijo el usuario, dejá el campo vacío. Aceptá que el usuario dé varios datos en un mismo ' +
    'mensaje y completá todos los que puedas.',
  greeting:
    '¡Hola! Te ayudo a publicar tu carga. Contame en tus palabras qué querés transportar, ' +
    'desde dónde y hacia dónde. Podés darme todo junto o de a poco.',
  steps: [
    {
      id: 'title',
      field: 'title',
      label: 'Título',
      question: '¿Cómo querés titular la carga? Por ejemplo: "Electrónica a Córdoba".',
      required: true,
      type: 'text',
      help: 'Un nombre corto que identifique la carga.',
    },
    {
      id: 'cargoType',
      field: 'cargoType',
      label: 'Tipo de carga',
      question: '¿Qué tipo de carga es?',
      required: true,
      type: 'enum',
      options: [...CARGO_TYPES],
      help: 'Elegí la categoría que mejor describa la mercadería.',
    },
    {
      id: 'weight',
      field: 'weight',
      label: 'Peso (kg)',
      question: '¿Cuánto pesa la carga en kilogramos?',
      required: true,
      type: 'number',
    },
    {
      id: 'origin',
      field: 'origin',
      label: 'Origen',
      question: '¿Desde dónde sale la carga? Decime dirección, ciudad y provincia.',
      required: true,
      type: 'address',
      help: 'Cuanto más precisa la dirección, mejor se ubica en el mapa.',
    },
    {
      id: 'dest',
      field: 'dest',
      label: 'Destino',
      question: '¿A dónde hay que llevarla? Decime dirección, ciudad y provincia.',
      required: true,
      type: 'address',
    },
    {
      id: 'pickupDate',
      field: 'pickupDate',
      label: 'Fecha de retiro',
      question: '¿Qué día y horario querés que se retire la carga?',
      required: true,
      type: 'date',
      help: 'No puede ser anterior a hoy.',
    },
    {
      id: 'deliveryDate',
      field: 'deliveryDate',
      label: 'Fecha de entrega deseada',
      question: '¿Para cuándo te gustaría que llegue?',
      required: true,
      type: 'date',
      help: 'Debe ser posterior al retiro. Es estimativa.',
    },
    {
      id: 'price',
      field: 'price',
      label: 'Precio (ARS)',
      question: '¿Querés fijar un precio en pesos, o lo dejás "a convenir" con los transportistas?',
      required: false,
      type: 'number',
      help: 'Opcional. Si lo dejás vacío, la carga sale "a convenir".',
    },
    {
      id: 'description',
      field: 'description',
      label: 'Descripción',
      question: '¿Querés agregar alguna aclaración sobre la carga? (opcional)',
      required: false,
      type: 'text',
    },
  ],
};
