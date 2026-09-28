# Asistente conversacional de carga (chatbot)

Segunda modalidad de entrada para publicar una carga: en vez de completar el wizard de [`/loads/new`](../frontend/src/app/loads/new/page.tsx), el dador de carga (`CARGO_GENERATOR`) **conversa** con un asistente que le va preguntando los datos y arma el borrador en vivo.

> **Principio rector:** es una nueva **modalidad de entrada sobre el mismo contrato**, no una lógica paralela de creación. El chatbot solo **recolecta**; la carga se crea con el mismo `POST /loads` y el mismo `CreateLoadDto` con toda su validación. El LLM nunca crea la carga por su cuenta — el backend sigue siendo la fuente de verdad.

| | |
|---|---|
| **Módulo backend** | [`backend/src/loads-assistant/`](../backend/src/loads-assistant/) |
| **Rutas frontend** | `/loads/new/chat` (shipper) · `/dashboard/admin/assistant-flow` (admin) |
| **Endpoints** | `GET/PUT /loads/assistant/flow`, `POST /loads/assistant/message` |
| **Proveedores de IA** | Gemini (primario) → Groq (respaldo) → **modo básico** sin IA |
| **Configuración del flujo** | Archivo JSON editable en runtime desde el panel admin |
| **Impacto en DB** | Ninguno — no hay migración Prisma asociada |

## Flujo end-to-end

```
Shipper                Frontend (/loads/new/chat)        Backend (loads-assistant)        LLM
  │                              │                                │                        │
  │  abre el chat                │  GET /loads/assistant/flow     │                        │
  │─────────────────────────────>│───────────────────────────────>│                        │
  │  <saludo del flow>           │<── { flow, basicMode, ... } ───│                        │
  │                              │                                │                        │
  │  "mando electrónica          │  POST /loads/assistant/message │  system prompt +       │
  │   de Córdoba a Rosario"      │  { messages[], draft }         │  historial + schema    │
  │─────────────────────────────>│───────────────────────────────>│───────────────────────>│
  │                              │                                │<── JSON estructurado ──│
  │                              │      merge → sanitize          │                        │
  │  próxima pregunta +          │<── { assistantMessage, draft,  │                        │
  │  panel de borrador al día    │      missing, readyToConfirm,  │                        │
  │                              │      degraded } ───────────────│                        │
  │                              │                                │                        │
  │  (todos los obligatorios completos → botón "Crear carga")     │                        │
  │                              │  geocoding (Nominatim, lib/routing.ts)                   │
  │─────────────────────────────>│  POST /loads ← mismo DTO y validación que el wizard      │
```

Puntos a retener:

- **El backend es stateless.** No hay sesión de conversación persistida: el frontend manda en cada turno el historial completo (`messages`) y el borrador acumulado (`draft`).
- **El geocoding lo hace el frontend**, reutilizando `geocodeStructured`/`geocodeAddress` de [`frontend/src/lib/routing.ts`](../frontend/src/lib/routing.ts), y recién al confirmar. El asistente maneja direcciones como texto (`address` / `city` / `province`).
- **La creación final la dispara el frontend** con `loadsApi.create` — el mismo call que usa el wizard tradicional.

## Backend — `loads-assistant/`

| Archivo | Responsabilidad |
|---|---|
| [`loads-assistant.controller.ts`](../backend/src/loads-assistant/loads-assistant.controller.ts) | Los 3 endpoints bajo `/loads/assistant`, con `JwtAuthGuard` + `RolesGuard`. |
| [`loads-assistant.service.ts`](../backend/src/loads-assistant/loads-assistant.service.ts) | Orquesta el turno: arma el system prompt, llama al LLM, parsea, mergea, sanitiza y calcula `missing`/`readyToConfirm`. Degrada al modo básico si el LLM falla. |
| [`flow-config.ts`](../backend/src/loads-assistant/flow-config.ts) | Tipos `FlowStep`/`FlowConfig` y el flujo semilla `DEFAULT_FLOW` (9 pasos). |
| [`flow-config.service.ts`](../backend/src/loads-assistant/flow-config.service.ts) | Lee, valida y persiste la config del flujo en el archivo JSON. |
| [`basic-flow.engine.ts`](../backend/src/loads-assistant/basic-flow.engine.ts) | Modo básico sin IA: recorre los pasos del flujo y parsea con reglas. |
| [`llm/llm-provider.ts`](../backend/src/loads-assistant/llm/llm-provider.ts) | Interfaz `LlmProvider` + token de DI `LLM_PROVIDER`. |
| [`llm/gemini.provider.ts`](../backend/src/loads-assistant/llm/gemini.provider.ts) | Google AI Studio (Generative Language API), con `responseSchema` nativo. |
| [`llm/groq.provider.ts`](../backend/src/loads-assistant/llm/groq.provider.ts) | Groq (API compatible con OpenAI); el esquema va como texto en el system prompt. |
| [`llm/chain.provider.ts`](../backend/src/loads-assistant/llm/chain.provider.ts) | Encadena proveedores en orden de preferencia, con failover. |
| [`dto/`](../backend/src/loads-assistant/dto/) | `AssistantMessageDto` (turno) y `UpdateFlowDto` (edición del flujo), con `class-validator`. |
| [`types.ts`](../backend/src/loads-assistant/types.ts) | `LoadDraft`, `AssistantTurn`, `AssistantStatus`. |

El módulo se registra como `LoadsAssistantModule` en [`app.module.ts`](../backend/src/app.module.ts). No toca Prisma ni el schema.

### Anatomía de un turno (`chat`)

1. Se lee el `FlowConfig` vigente.
2. Si hay algún proveedor configurado, se arma el **system prompt**: `systemPreamble` editable + fecha/hora actual en ISO (para resolver "mañana", "el viernes") + la lista de pasos con tipo, obligatoriedad y valores válidos + reglas de salida + el borrador acumulado serializado.
3. El modelo responde JSON con `{ assistantMessage, draft }`, forzado por `RESPONSE_SCHEMA`.
4. **`merge`** — el borrador nuevo se mezcla sobre el previo campo por campo (`origin`/`dest` por subcampo). Lo que el modelo omite no se pierde.
5. **`sanitize`** — se descarta lo que no respeta el contrato de dominio: `cargoType` fuera de la whitelist `CARGO_TYPES`, pesos/precios/volúmenes no finitos o negativos, fechas no parseables. Lo descartado vuelve a `missing` y el asistente lo repregunta, en vez de arrastrar basura hasta el `POST /loads`.
6. Se calculan `missing` (campos `required` del flujo todavía vacíos) y `readyToConfirm` (`missing.length === 0`).

Si el modelo devuelve algo no parseable, la conversación no se rompe: responde "no te entendí, ¿me lo repetís?" y conserva el borrador previo.

### Cadena de proveedores y modo degradado

Tres niveles de resiliencia, en cascada:

| Nivel | Cuándo actúa | Comportamiento |
|---|---|---|
| **Gemini** | Hay `GEMINI_API_KEY` | Proveedor primario. Default `gemini-2.5-flash`, `temperature: 0.2`, timeout 20 s, `responseSchema` nativo. Un `429` (cuota del free tier) se traduce a un mensaje claro para el usuario. |
| **Groq** | Gemini falló (429, timeout, 5xx) o no tiene key | Respaldo. Default `llama-3.3-70b-versatile`, `response_format: json_object`. |
| **Modo básico** | Ningún proveedor respondió, o no hay ninguna key | `BasicFlowEngine`: sin IA, con reglas. El turno vuelve con `degraded: true`. |

El `ChainLlmProvider` se arma en el `useFactory` de [`loads-assistant.module.ts`](../backend/src/loads-assistant/loads-assistant.module.ts) — **agregar otro proveedor es implementar `LlmProvider` y sumarlo a esa lista**, sin tocar el service.

**Por qué existe el modo básico:** que una demo no se caiga por una cuota agotada. El free tier de Gemini es acotado y puede cortarse en cualquier momento.

### Modo básico — qué entiende

Recorre los pasos del **mismo `FlowConfig` editable** de a uno (lo que el admin edita en el panel también rige acá) y parsea la respuesta según el `type` del paso:

| Tipo | Acepta |
|---|---|
| `number` | Formato argentino (`1.500` = 1500, `2,5` = 2.5) y toneladas (`3 tn` → 3000). |
| `enum` | El número de la lista (`2`), el nombre exacto, o parcial y sin tildes (`electronica` → `Electrónica y tecnología`). |
| `address` | Separación por comas: `Av. Colón 1234, Córdoba, Córdoba` → address / city / province. Con un solo tramo, decide por si tiene altura numérica. |
| `date` | Relativas (`mañana`, `pasado mañana`, `hoy`, `el viernes`, `en 3 días`), numéricas (`15/03`, `15-03-2026`) y escritas (`5 de marzo`). Hora opcional (`a las 14`, `14hs`, `14:30`), default 9:00. Sin año explícito y con la fecha ya pasada, asume el año próximo. |
| `text` | Texto libre, acotado a 120 caracteres. |

En pasos opcionales, `no` / `a convenir` / `saltar` (y variantes) declinan el paso y avanzan. Si no entiende una respuesta, repregunta sumando la ayuda del paso. Cuando no queda nada pendiente, cierra con el resumen del borrador.

El resultado del modo básico pasa por el **mismo `sanitize`** que el turno con LLM, así que el contrato de dominio no cambia entre modos.

## Configuración del flujo (editable por ADMIN)

El orden, las preguntas, las etiquetas, la obligatoriedad, los textos de ayuda, el saludo y la instrucción de sistema **no están hardcodeados**: son una `FlowConfig` editable en runtime desde `/dashboard/admin/assistant-flow`.

```ts
interface FlowStep {
  id: string;          // identificador del paso
  field: string;       // clave dentro del borrador (LoadDraft)
  label: string;       // etiqueta en el panel de resumen
  question: string;    // qué pregunta el asistente
  required: boolean;
  type: 'text' | 'number' | 'enum' | 'address' | 'date';
  help?: string;
  options?: string[];  // solo para type 'enum'
}
```

**Persistencia:** archivo JSON `assistant-flow.config.json` junto al proceso del backend, o donde apunte `ASSISTANT_FLOW_CONFIG_PATH`. Está gitignoreado ([`backend/.gitignore`](../backend/.gitignore)) — el default versionado es `DEFAULT_FLOW` en `flow-config.ts`. Si el archivo no existe, se sirve el default; no es un error operativo.

**Se eligió archivo y no DB** (sin migración Prisma) porque es configuración de operación editada por un admin, no dato de dominio.

> ⚠️ **Caveat de producción:** el contenedor del backend no monta ningún volumen, así que el archivo vive en su filesystem y **cada deploy lo pierde** (los contenedores se recrean). Alcanza para dev y para la demo del proyecto; para persistencia real hay dos caminos: montar un volumen en `ASSISTANT_FLOW_CONFIG_PATH` o mover la config a DB.

`FlowConfigService.validate` rechaza con `400` una config inservible: sin pasos, con un paso sin `id`/`field`/`question`, con `field` repetido, o con un paso `enum` sin opciones.

### Flujo por defecto (`DEFAULT_FLOW`)

9 pasos — 7 obligatorios + 2 opcionales:

| # | `field` | Tipo | Obligatorio | Pregunta (resumida) |
|---|---|---|---|---|
| 1 | `title` | text | Sí | ¿Cómo querés titular la carga? |
| 2 | `cargoType` | enum | Sí | ¿Qué tipo de carga es? (whitelist `CARGO_TYPES`) |
| 3 | `weight` | number | Sí | ¿Cuánto pesa en kilogramos? |
| 4 | `origin` | address | Sí | ¿Desde dónde sale la carga? |
| 5 | `dest` | address | Sí | ¿A dónde hay que llevarla? |
| 6 | `pickupDate` | date | Sí | ¿Qué día y horario se retira? |
| 7 | `deliveryDate` | date | Sí | ¿Para cuándo tiene que llegar? |
| 8 | `price` | number | No | ¿Fijás precio o queda "a convenir"? |
| 9 | `description` | text | No | ¿Alguna aclaración sobre la carga? |

**Fuera de alcance a propósito** (son opcionales en `CreateLoadDto`; no se replica el wizard entero): `volume`, `packageCount`, dimensiones de bulto (`heightCm`/`widthCm`/`lengthCm`), `originCityId`/`destCityId` (los resuelve el backfill del backend por dirección y coordenadas), el modo coordenadas puro y el arrastre de pin en el mapa.

## Endpoints

Source: [`loads-assistant.controller.ts`](../backend/src/loads-assistant/loads-assistant.controller.ts). Todos requieren JWT.

| Método | Path | Roles | Descripción |
|---|---|---|---|
| GET | `/loads/assistant/flow` | `CARGO_GENERATOR`, `ADMIN` | Config del flujo + estado del asistente |
| POST | `/loads/assistant/message` | `CARGO_GENERATOR` | Un turno de conversación |
| PUT | `/loads/assistant/flow` | `ADMIN` | Editar la config del flujo |

### GET `/loads/assistant/flow`

```jsonc
{
  "flow": { "version": 1, "systemPreamble": "…", "greeting": "…", "steps": [ /* … */ ] },
  "available": true,              // siempre true: el modo básico garantiza que el chat funcione
  "basicMode": false,             // true = no hay ningún proveedor con credenciales
  "providers": ["gemini", "groq"] // proveedores configurados, en orden de preferencia
}
```

### POST `/loads/assistant/message`

Request — historial completo + borrador acumulado (el backend es stateless):

```jsonc
{
  "messages": [
    { "role": "assistant", "content": "¡Hola! Te ayudo a publicar tu carga…" },
    { "role": "user", "content": "Mando electrónica de Córdoba a Rosario, 800 kilos" }
  ],
  "draft": { "title": "Electrónica a Rosario" }   // opcional
}
```

Response:

```jsonc
{
  "assistantMessage": "¿Qué día querés que se retire la carga?",
  "draft": {
    "title": "Electrónica a Rosario",
    "cargoType": "Electrónica y tecnología",
    "weight": 800,
    "origin": { "city": "Córdoba", "province": "Córdoba" },
    "dest": { "city": "Rosario", "province": "Santa Fe" }
  },
  "missing": ["pickupDate", "deliveryDate"],  // campos required todavía vacíos
  "readyToConfirm": false,                    // true → el front habilita "Crear carga"
  "degraded": false                           // true → el turno se resolvió sin IA
}
```

El `content` de cada mensaje admite hasta 4000 caracteres (`class-validator`).

### PUT `/loads/assistant/flow`

Body = `FlowConfig` completa (`version`, `systemPreamble`, `greeting`, `steps[]`). Responde la config ya validada y normalizada. `400` si la config es inválida (ver arriba) o si no se pudo escribir el archivo.

## Frontend

### `/loads/new/chat` — el chat del shipper

[`frontend/src/app/loads/new/chat/page.tsx`](../frontend/src/app/loads/new/chat/page.tsx). Layout de dos columnas:

- **Chat** (2/3): burbujas usuario/asistente, indicador "escribiendo…", `Enter` envía y `Shift+Enter` hace salto de línea, autoscroll al último mensaje.
- **Panel de borrador** (1/3, sticky): un ítem por paso del flujo, con check verde si está completo y "Pendiente" si no. El botón **Crear carga** se habilita solo con `readyToConfirm`.

Al confirmar: geocodifica origen y destino (estructurado primero, texto libre como fallback) y llama a `loadsApi.create`. Si alguna dirección no se puede ubicar, muestra el error y pide aclararla **en el chat** — no crea la carga a medias. Creada la carga, redirige a `/dashboard/shipper`.

Si el turno vuelve con `degraded: true`, aparece un aviso ámbar de "modo básico" explicando que la IA no está disponible, **sin bloquear el input** y con link al formulario tradicional.

### `/dashboard/admin/assistant-flow` — el panel del admin

[`frontend/src/app/dashboard/admin/assistant-flow/page.tsx`](../frontend/src/app/dashboard/admin/assistant-flow/page.tsx). Edita saludo, instrucción de sistema y, por cada paso, etiqueta, pregunta, ayuda y obligatoriedad, más reordenamiento con flechas ↑/↓. Guard de rol en cliente (el `PUT` igual exige `ADMIN` en el backend). Las opciones de un paso `enum` se muestran pero no se editan: vienen de `CARGO_TYPES`.

Entrada en el sidebar de admin (ícono `Bot`) en [`Sidebar.tsx`](../frontend/src/components/layout/Sidebar.tsx).

### Puntos de entrada

- Botón **"✨ Crear con asistente"** en el header de `/loads/new`.
- Link **"Usar formulario tradicional"** en el header del chat — el camino de vuelta siempre está a mano.
- Cliente HTTP: `assistantApi` en [`lib/api.ts`](../frontend/src/lib/api.ts) (`getFlow`, `sendMessage`, `updateFlow`).

## Variables de entorno

| Variable | Requerida | Default | Para qué |
|---|---|---|---|
| `GEMINI_API_KEY` | No | vacío | Key de [Google AI Studio](https://aistudio.google.com/apikey). Sin ella, Gemini se saltea. |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Modelo de Gemini. |
| `GROQ_API_KEY` | No | vacío | Key de [Groq](https://console.groq.com/keys). Sin ella, no hay respaldo. |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Modelo de Groq. |
| `ASSISTANT_FLOW_CONFIG_PATH` | No | `assistant-flow.config.json` junto al proceso | Dónde se persiste el flujo editado por el panel. |

**Sin ninguna key el asistente funciona igual**, en modo básico. Las keys viven **solo en el backend** — en el `.env` del clone del VPS, como el resto de los secretos — y nunca en el bundle del cliente. Tabla consolidada en [`docker.md`](./docker.md).

> ⚠️ El free tier de AI Studio permite que Google use los prompts para entrenar. Para producción real conviene pasar a tier pago.

## Seguridad y límites

- **Autorización:** `POST /loads/assistant/message` es solo `CARGO_GENERATOR`; `PUT /loads/assistant/flow` es solo `ADMIN`; el `GET` lo comparten shipper y admin.
- **El LLM no escribe en la DB.** No tiene acceso a Prisma ni a herramientas: su única salida es un JSON con el borrador. La carga la crea el frontend contra `POST /loads`, con toda la validación del `CreateLoadDto`.
- **`sanitize` es la última línea de defensa** contra alucinaciones del modelo: un `cargoType` inventado se descarta y se vuelve a preguntar.
- **Sin rate limiting propio** — el gasto de cuota está acotado solo por los límites del proveedor.
- **Timeout de 20 s** por proveedor; con la cadena completa, un turno puede tardar hasta ~40 s antes de degradar a modo básico.
- El historial de la conversación viaja al proveedor de LLM en cada turno. No se persiste en la DB de CargoLink.

## Tests

`backend/src/loads-assistant/**/*.spec.ts` — 4 suites, 34 tests, sin red (los proveedores se mockean):

| Suite | Cubre |
|---|---|
| `loads-assistant.service.spec.ts` | Normalización de `cargoType`, descarte fuera de whitelist, merge del borrador, `readyToConfirm`, peso inválido, respuesta no-JSON, degradación a modo básico, `status`. |
| `basic-flow.engine.spec.ts` | Números en formato argentino y toneladas, enum por número/nombre parcial, direcciones, fechas relativas y numéricas, pasos opcionales declinados, resumen final. |
| `chain.provider.spec.ts` | Preferencia por el primario, failover al respaldo, salteo de proveedores sin key, propagación del último error, listado de activos. |
| `flow-config.service.spec.ts` | Default sin archivo, persistir y releer, rechazo de flujo vacío / `field` duplicado / `enum` sin opciones. |

```bash
cd backend && npm test -- loads-assistant
```

## Pendientes conocidos

- **Persistencia de la config del flujo** — hoy se pierde en cada deploy (montar un volumen o mover a DB).
- **Rate limiting** por usuario sobre `/loads/assistant/message`.
- **Resolución de `cityId`** desde el asistente: hoy se delega al backfill del backend.
- **Sin soporte mobile** — el asistente es solo web por ahora.

## Ver también

- [`api.md`](./api.md) — referencia REST completa, incluido `POST /loads`.
- [`frontend.md`](./frontend.md) — rutas y convenciones del App Router.
- [`docker.md`](./docker.md) — tabla consolidada de variables de entorno.
- [`backend.md`](./backend.md) — estructura NestJS, guards y decorators.
