# Frontend (Next.js)

Next.js 14 App Router con TypeScript strict, Tailwind, Zustand y TanStack Query. Source en [`../frontend/`](../frontend/).

## Stack y versiones

| Pieza | Versión |
|---|---|
| Next.js | 14.1 (App Router, standalone output) |
| React | 18.2 |
| TypeScript | 5.3 (strict) |
| Tailwind | 3.4 |
| Zustand | 4.5 (auth global) |
| TanStack Query | 5.17 (server state) |
| Axios | 1.6 |
| React Hook Form | 7.49 + Zod 3.22 resolvers |
| Leaflet | 1.9 + react-leaflet 4.2 |
| Socket.IO Client | 4.7 |
| lucide-react | 0.309 (icon set) |
| Recharts | 2.15 (series mensuales de los paneles) |
| date-fns | 3.2 |

`package.json` completo en [`../frontend/package.json`](../frontend/package.json).

## Estructura general

```
frontend/
├── public/                        # assets estáticos
├── src/
│   ├── app/                       # App Router (todas las rutas)
│   ├── components/                # componentes reusables
│   ├── lib/                       # api client, helpers
│   ├── store/                     # Zustand stores
│   ├── types/                     # interfaces compartidas
│   └── styles? (globals.css vive en app/)
├── next.config.js                 # output: standalone
├── tailwind.config.ts             # paleta + fuentes + sombras
├── postcss.config.js
├── tsconfig.json                  # strict, alias @/*
├── package.json                   # scripts dev/build/start/lint
├── Dockerfile                     # multi-stage
└── .env.example
```

## Rutas (`src/app/`)

App Router; cada folder con `page.tsx` es una ruta. Listado actual:

```
src/app/
├── layout.tsx                              # root layout (html, body, Providers)
├── globals.css                             # estilos globales (Tailwind base)
├── page.tsx                                # /
├── auth/
│   ├── login/page.tsx                      # /auth/login
│   ├── register/page.tsx                   # /auth/register
│   ├── forgot-password/page.tsx            # /auth/forgot-password
│   ├── reset-password/page.tsx             # /auth/reset-password?token=...
│   ├── verify-email/page.tsx               # /auth/verify-email?token=...
│   └── check-email/page.tsx                # /auth/check-email  (paso intermedio post-register)
├── dashboard/
│   ├── admin/page.tsx                      # /dashboard/admin
│   ├── carrier/page.tsx                    # /dashboard/carrier
│   └── shipper/page.tsx                    # /dashboard/shipper
├── loads/
│   ├── page.tsx                            # /loads — listado
│   ├── new/page.tsx                        # /loads/new — crear
│   └── [id]/
│       ├── page.tsx                        # /loads/[id] — detalle + postulations
│       └── edit/page.tsx                   # /loads/[id]/edit
├── tracking/
│   ├── page.tsx                            # /tracking — listado de trips activos
│   └── [id]/page.tsx                       # /tracking/[id] — mapa en tiempo real
├── messages/
│   ├── page.tsx                            # /messages — conversations
│   └── trip/[tripId]/page.tsx              # /messages/trip/[tripId] — chat
├── trips/
│   └── [id]/page.tsx                       # /trips/[id] — detalle
├── register/
│   └── page.tsx                            # /register — registro de loads cerrados + export
└── users/
    └── page.tsx                            # /users — gestión (admin)
```

El root `/` redirige según rol — la página llega con `useAuthStore` ya hidratada y empuja al dashboard correspondiente.

## Componentes (`src/components/`)

```
src/components/
├── Providers.tsx              # wrapper root (QueryClientProvider + hydrate de auth)
├── charts/                    # ChartCard, MonthlyTrendChart (recharts), RankingBars, chartTheme
├── chat/                      # bubble, input, scroll
├── layout/                    # DashboardLayout, Sidebar, navegación
├── loads/                     # cards y listado de loads
├── maps/                      # MapView (tracking), LocationPicker (crear load)
├── metrics/                   # FuelMarginCard (margen con precio de gasoil local)
├── postulations/              # PostulationsPanel, PostulationCard, PostulateModal
├── register/                  # RegisterList, RegisterRow, RegisterFilters, MessageThread
├── trips/                     # trip cards
└── ui/                        # StatCard, StatusBadge — primitives de diseño
```

### `charts/`

Las piezas de los paneles de métricas (transportista, dador de carga y empresa):

- `MonthlyTrendChart` — serie mensual de dinero en barras (recharts). Recibe los 12 meses que devuelve el backend y destaca el mes en curso; si no hay actividad muestra un mensaje en vez de 12 barras en cero.
- `RankingBars` — ranking en barras horizontales de CSS (top transportistas, tipos de carga, conductores). Preferido sobre un gráfico real para listas cortas: las etiquetas largas se leen enteras y cada fila puede linkear a un detalle.
- `ChartCard` — encabezado común (eyebrow + título + dato al costado).
- `chartTheme.ts` — colores derivados de los tokens de Tailwind y los formateadores de mes y de moneda compacta.

`metrics/FuelMarginCard` calcula el margen del transportista (ingresos − litros × precio del gasoil). El precio del litro lo escribe el usuario y se guarda en `localStorage`: cambia todo el tiempo y es distinto para cada uno, así que no vive en el backend.

### `maps/MapView.tsx`

Wrap de `react-leaflet`. Recibe `{ origin, dest, current }` y dibuja tres markers con iconos de color:

- Origen → verde
- Destino → rojo
- Posición actual del carrier → azul (con animación cuando hay update)

Refresca cuando la prop `current` cambia. El padre (`/tracking/[id]/page.tsx`) polea la posición vía `tripsApi.getById()` cada N segundos.

### `maps/LocationPicker.tsx`

Mapa interactivo que devuelve `{ lat, lng, address }` al padre (formulario de crear load). Usa geocoding inverso (Nominatim, OpenStreetMap) para resolver dirección a partir de las coordenadas.

### `postulations/PostulateModal.tsx`

Modal que el carrier abre desde `/loads/[id]`. Form con `message` y `proposedPrice` opcional. Submitea a `postulationsApi.create(loadId, data)`.

### `postulations/PostulationCard.tsx`

Muestra una postulación con su status, precio y, según el rol del usuario logueado y el `lastOfferBy`, botones de acción:
- Shipper viendo PENDING → "Aceptar" + "Contraofertar".
- Shipper viendo NEGOTIATING con `lastOfferBy=transporter` → "Aceptar (precio del transporter)" + "Contraofertar".
- Carrier viendo NEGOTIATING con `lastOfferBy=shipper` → "Aceptar oferta" + "Contraofertar".
- Carrier viendo propia PENDING → "Retirar".

## Cliente API (`src/lib/api.ts`)

Source: [`../frontend/src/lib/api.ts`](../frontend/src/lib/api.ts).

### Configuración

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});
```

⚠️ El fallback en código es `:3002/api`, pero el backend real escucha en `:3001`. El `.env.example` también tiene `:3002` (heredado). Para que funcione tenés que:

- **Con Docker Compose**: viene baked en el build con `:3001/api` desde el build-arg del compose. ✅
- **Dev local**: setear `NEXT_PUBLIC_API_URL=http://localhost:3001/api` en `.env.local`.

### Interceptors

- **Request**: inyecta `Authorization: Bearer <token>` desde `sessionStorage.token` (sesión aislada por pestaña).
- **Response**: si llega 401 fuera de `/auth/*`, limpia storage y redirige a `/auth/login` con `window.location.href`. Detalle en [`autenticacion.md`](./autenticacion.md).

### Módulos exportados

Cada uno es un objeto con métodos que retornan promesas de Axios:

- `authApi` — login, register, forgotPassword, resetPassword, verifyEmail, resendVerification.
- `usersApi` — getProfile, updateProfile, getAll, getById, toggleActive.
- `loadsApi` — create, getAll, getAvailable, getMy, getById, update, cancel, getRegister, exportRegister (`responseType: 'blob'` para el ZIP).
- `tripsApi` — accept (admin), getAll, getMy, getMyLoads, getById, getMetrics, start, complete, updateLocation.
- `messagesApi` — send, getConversations, getTripMessages, markAsRead, getUnreadCount.
- `ratingsApi` — create, getUserRatings.
- `postulationsApi` — create, getForLoad, getMy, accept, counterOffer, acceptOffer, withdraw.
- `companiesApi` — list, getMyMembership, requestToJoin, cancelJoinRequest, leave, getMyCompany, getDrivers, removeDriver, getDriverStats, getRequests, decideRequest, getTrips. Ver [`empresas.md`](./empresas.md).

Los componentes los usan envueltos en `useQuery` / `useMutation` de TanStack Query.

## Estado

### Auth global — Zustand (`src/store/auth.ts`)

Source: [`../frontend/src/store/auth.ts`](../frontend/src/store/auth.ts).

```ts
interface AuthState {
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'> | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user, token) => void;
  logout: () => void;
  hydrate: () => void;
}
```

Persistencia manual a `sessionStorage` en `login()` / `logout()`. Se usa `sessionStorage` (no `localStorage`) a propósito: está aislado por pestaña, así que dos cuentas abiertas en dos pestañas del mismo navegador no comparten token ni usuario (evita el 403 cruzado). `hydrate()` se llama desde `Providers.tsx` para restaurar la sesión de la pestaña después de un reload.

### Server state — TanStack Query

`Providers.tsx` crea un `QueryClient` con defaults:

- `staleTime: 30s` — los datos se consideran frescos durante 30s, no se refetchea automáticamente.
- `retry: 1` — un solo reintento en caso de error.

Los hooks típicos:

```ts
const { data, isLoading } = useQuery({
  queryKey: ['loads', filters],
  queryFn: () => loadsApi.getAll(filters).then(r => r.data),
});

const mutation = useMutation({
  mutationFn: (data: CreateLoadDto) => loadsApi.create(data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loads'] }),
});
```

### Forms — React Hook Form + Zod

```ts
const schema = z.object({
  title: z.string().min(1),
  price: z.number().positive(),
  pickupDate: z.string().datetime(),
});

const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema),
});
```

## Tailwind

Config: [`../frontend/tailwind.config.ts`](../frontend/tailwind.config.ts).

### Paleta

| Token | Color base | Para qué |
|---|---|---|
| `primary` 50-950 | Azul corporativo (#3B82F6 / #2563EB / #1D4ED8) | acciones primarias, links |
| `accent` 50-700 | Ámbar (#F59E0B / #D97706) | highlights, estados activos |
| `ink` 50-950 | Grises fríos (Tailwind gray scale) | texto, bordes |
| `surface` (default, raised, sunk, edge) | blancos y grises claros | fondos por nivel de elevación |
| `success` / `warning` / `danger` / `info` | semánticos | badges, alerts |

### Tipografía

```ts
fontFamily: {
  display: ['var(--font-display)', ...],   // Outfit
  sans:    ['var(--font-sans)', ...],      // Manrope
  mono:    ['var(--font-mono)', ...],      // JetBrains Mono
},
```

Las CSS vars las setea `app/layout.tsx` con `next/font/google`.

### Otros tokens

- `letterSpacing.eyebrow: '0.18em'` — para microcopy uppercase tipo eyebrow.
- `boxShadow.card` / `raised` / `ring` — elevaciones consistentes.
- `borderRadius.card: '14px'` — radio de tarjetas.

## Scripts

```bash
npm run dev      # next dev -p 3003  (watch, HMR)
npm run build    # next build → .next/  (incluye standalone)
npm run start    # next start (serve de la build)
npm run lint     # next lint
```

Nota: `npm run dev` levanta en **3003** (no 3000). El runtime de la imagen Docker sí escucha en **3000**.

## `next.config.js`

```js
{
  output: 'standalone',
  reactStrictMode: true,
}
```

`output: 'standalone'` empaqueta solo lo necesario en `.next/standalone/` → la imagen Docker queda chica.

## `tsconfig.json` — alias

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```

`@/types`, `@/lib/api`, `@/store/auth` resuelven a `src/types`, `src/lib/api`, `src/store/auth`. Usalo siempre — evita rutas relativas largas (`../../../store/auth`).

## SSR — qué corre en server vs cliente

- Componentes de `app/**/page.tsx` son **server components** por default (no `'use client'`).
- Cualquier componente que use hooks (`useState`, `useEffect`, Zustand, React Query) **tiene que llevar `'use client'`** en la primera línea del archivo.
- `sessionStorage`/`localStorage` no existen en server — siempre chequeá `typeof window !== 'undefined'` o usá `useEffect`.
- El layout root (`app/layout.tsx`) corre en server; el `Providers.tsx` que renderiza es client (lleva `'use client'`).

## WebSockets desde el frontend

`socket.io-client` está en deps. La integración vive típicamente en componentes de chat o tracking (`'use client'`):

```ts
'use client';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '@/store/auth';

useEffect(() => {
  const { user } = useAuthStore.getState();
  if (!user) return;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  const wsUrl = apiUrl.replace(/\/api$/, '') + '/chat';

  const socket = io(wsUrl, { query: { userId: user.id } });
  socket.on('newMessage', (msg) => { /* handle */ });
  return () => { socket.disconnect(); };
}, []);
```

Detalle del protocolo en [`websockets.md`](./websockets.md).

## Dockerfile

Source: [`../frontend/Dockerfile`](../frontend/Dockerfile). 3 stages — deps → build (con `NEXT_PUBLIC_API_URL` baked) → runner standalone. Detalle en [`docker.md`](./docker.md).

## Caveats

- **`NEXT_PUBLIC_API_URL` se bakea en build**. Si cambiás el endpoint, hay que rebuild de la imagen (`docker compose up -d --build frontend`).
- **`output: 'standalone'`** no copia `public/`. Si tenés assets ahí, el Dockerfile actual los pierde (`COPY --from=build /app/.next/standalone ./` + `COPY --from=build /app/.next/static ./.next/static` no incluye `/app/public`). Si agregás algo a `public/`, sumá `COPY --from=build /app/public ./public` al Dockerfile.
- **Sin tests configurados**. No hay Vitest ni Jest en el frontend hoy.
- **Sin middleware.ts**. Las protecciones por rol viven en cada page (componente client que lee `useAuthStore`). Esto significa que la URL es navegable aunque el rol no corresponda — la página se renderiza vacía hasta que decide redirigir. Para prod: considerar `middleware.ts` que rechace por rol antes del render.
- **`window.location.href = '/auth/login'`** en el interceptor descarta toda la SPA. OK para 401 (es lo que querés), pero no usarlo dentro de la app para navegación normal — usar `useRouter()` de `next/navigation`.
