# Autenticación y autorización

JWT (Bearer token) con Passport en el backend; `sessionStorage` (web) / `AsyncStorage` (mobile) en los clientes. RBAC simple a través de un decorator + guard. Source en [`../backend/src/auth/`](../backend/src/auth/) y [`../backend/src/common/`](../backend/src/common/).

## Flujo de registro completo

```
  user                 frontend                  backend                 mail
   │                      │                         │                      │
   ├──submit register────▶│                         │                      │
   │                      ├──POST /api/auth/register▶│                     │
   │                      │                         ├──bcrypt(password)    │
   │                      │                         ├──genera token (24h)  │
   │                      │                         ├──insert User         │
   │                      │                         ├──MailService────────▶│
   │                      │◀──201 (sin token)───────┤                      │
   │                      │                         │                      │
   │◀────recibe email del MailService (real o Ethereal)────────────────────┤
   │                                                                       │
   ├──click link─────────▶│                                                │
   │                      ├──GET /api/auth/verify-email/:token─▶│         │
   │                      │                         ├──set emailVerified=true
   │                      │◀──200───────────────────┤                      │
   │                                                │                      │
   ├──submit login───────▶│                         │                      │
   │                      ├──POST /api/auth/login───▶│                     │
   │                      │                         ├──valida password
   │                      │                         ├──verifica emailVerified
   │                      │                         ├──firma JWT (sub, email, role)
   │                      │◀──{ accessToken, refreshToken, user }──┤        │
   │                      ├──sessionStorage: token + refreshToken + user   │
   │                      │                                                │
   │                      │  desde acá todas las requests llevan Bearer    │
```

## JWT

Firma con `JWT_SECRET` (env var, **requerida**: el backend no arranca sin ella, y en producción rechaza los valores de los `.env.example`; ver [`jwt-secret.ts`](../backend/src/auth/jwt-secret.ts)). Lifetime `JWT_ACCESS_EXPIRATION` (default `15m`). La variable vieja `JWT_EXPIRATION` ya no se lee.

## Sesiones: access token + refresh token

El JWT es el **access token**: corto (15 min) y stateless. La sesión larga la sostiene un **refresh token** opaco, rotativo y revocable ([`refresh-token.service.ts`](../backend/src/auth/refresh-token.service.ts), tabla `refresh_tokens`):

| Endpoint | Body | Respuesta |
|---|---|---|
| `POST /auth/login` / `GET /auth/verify-email/:token` | — | `{ user, accessToken, refreshToken }` (abre una sesión = una *familia*) |
| `POST /auth/refresh` | `{ refreshToken }` | `{ user, accessToken, refreshToken }` — el refresh token **rota**: el usado queda revocado |
| `POST /auth/logout` | `{ refreshToken }` | Revoca la sesión. Idempotente |

- En la base se guarda solo el **SHA-256** del refresh token. Vida: `REFRESH_TOKEN_TTL_DAYS` (default 30), renovada en cada rotación.
- **Detección de reuso**: si llega un refresh token ya revocado, alguien tiene una copia vieja (robo o el cliente compitiendo consigo mismo) → se revoca la familia entera y hay que volver a loguearse. Por eso los clientes **deduplican** el refresh (una sola request de refresh aunque fallen varias a la vez).
- El refresh relee al usuario de la base: una desactivación corta la renovación y un cambio de rol entra en el próximo access token.
- `reset-password` revoca **todas** las sesiones del usuario: quien conocía la clave vieja queda afuera en ≤ 15 min (lo que le quede al access token).
- Caso borde conocido (web): "Duplicar pestaña" copia el `sessionStorage`, así que las dos pestañas comparten refresh token; la segunda en renovar dispara la detección de reuso y ambas tienen que volver a loguearse.

### Payload

```ts
interface JwtPayload {
  sub: string;     // userId
  email: string;
  role: 'CARGO_GENERATOR' | 'TRANSPORTER' | 'ADMIN' | 'COMPANY_ADMIN';
}
```

`sub` (subject) sigue la convención RFC 7519.

### Validación (`JwtStrategy`)

Source: [`../backend/src/auth/jwt.strategy.ts`](../backend/src/auth/jwt.strategy.ts).

```ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService, private usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(configService), // sin fallback: tira si falta
    });
  }

  // El usuario se relee de la base en cada request: una desactivación corta las
  // sesiones al instante y un cambio de rol aplica sin esperar al vencimiento.
  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub).catch(() => null);
    if (!user || !user.isActive) throw new UnauthorizedException('Cuenta inactiva o inexistente');
    return { id: user.id, email: user.email, role: user.role };
  }
}
```

- Extrae del header `Authorization: Bearer <token>`.
- `ignoreExpiration: false` — tokens expirados fallan con 401.
- El `validate()` returnea el objeto que termina en `request.user` (lo lee `@CurrentUser()`).
- `JWT_SECRET` es obligatoria: `getJwtSecret()` corta el arranque si falta (ya no hay fallback `'default-secret'`, que permitía fabricar tokens), y en `NODE_ENV=production` también si es uno de los valores de los `.env.example`.

## Guards

### `JwtAuthGuard`

Source: [`../backend/src/common/guards/jwt-auth.guard.ts`](../backend/src/common/guards/jwt-auth.guard.ts).

```ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

Trivial — extiende `AuthGuard('jwt')` para tener un nombre consistente y para futuros overrides.

Uso típico — a nivel clase:

```ts
@ApiTags('Loads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('loads')
export class LoadsController { ... }
```

Cuando se aplica a la clase, **todos** los métodos requieren JWT. Si querés excluir uno, no hay forma elegante de "opt-out" — mejor moverlo a otro controller (es lo que hace `AuthController`, que no pone `JwtAuthGuard`).

### `RolesGuard`

Source: [`../backend/src/common/guards/roles.guard.ts`](../backend/src/common/guards/roles.guard.ts).

```ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;  // no roles → libre
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}
```

Lógica:
- Si no hay `@Roles(...)` en el handler o la clase → deja pasar.
- Si hay, exige que `user.role` esté en la lista.

**Importante**: depende de que `request.user` esté seteado. Se encadena después de `JwtAuthGuard`:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CARGO_GENERATOR')
@Post()
create(...) { }
```

El orden importa: si ponés `RolesGuard` antes de `JwtAuthGuard`, `request.user` es `undefined` y falla con un crash poco lindo.

## Decorators

### `@Roles(...)`

Source: [`../backend/src/common/decorators/roles.decorator.ts`](../backend/src/common/decorators/roles.decorator.ts).

```ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

Uso:

```ts
@Roles('CARGO_GENERATOR')                       // un solo rol
@Roles('CARGO_GENERATOR', 'TRANSPORTER')       // múltiples (OR)
@Roles('ADMIN')                                 // solo admin
```

### `@CurrentUser()`

Source: [`../backend/src/common/decorators/current-user.decorator.ts`](../backend/src/common/decorators/current-user.decorator.ts).

```ts
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
```

Uso:

```ts
@Get('me')
getProfile(@CurrentUser('id') userId: string) { ... }           // solo el id

@Post()
create(@CurrentUser() user: { id: string; email: string; role: string }) { ... }  // objeto completo
```

`request.user` lo puebla `JwtStrategy.validate()` con `{ id, email, role }`.

## Password reset

```
user            frontend              backend                 mail
 │                 │                     │                      │
 ├─submit email──▶│                     │                      │
 │                 ├──POST /forgot-password──▶│                 │
 │                 │                     ├──genera resetToken (1h)
 │                 │                     ├──save SHA-256(token) + exp en User
 │                 │                     ├──MailService────────▶│
 │                 │◀──200 (siempre)─────┤                      │
 │                 │                                            │
 │◀──recibe email con link a /auth/reset-password?token=...─────┤
 │                                                              │
 ├─click + nuevo password──▶│                                   │
 │                 ├──POST /reset-password { token, newPassword }──▶│
 │                 │                     ├──findFirst by SHA-256(token)
 │                 │                     ├──verifica resetTokenExp > now
 │                 │                     ├──bcrypt(newPassword)
 │                 │                     ├──update + clear token + exp
 │                 │                     ├──revoca todos los refresh tokens
 │                 │◀──200───────────────┤
```

Notas:

- `forgot-password` siempre responde 200 — no leakea si el email existe o no. El mail se manda **sin esperar** al SMTP: si la respuesta tardara segundos solo cuando la cuenta existe, el tiempo la delataría. Cuentas inactivas/eliminadas no reciben link.
- Los tokens de reset y de verificación de email se guardan **hasheados** (SHA-256, [`token-crypto.ts`](../backend/src/auth/token-crypto.ts)): un dump de la base no alcanza para tomar cuentas.
- El login corre bcrypt contra un hash dummy cuando el email no existe, para que el tiempo de respuesta sea el mismo.

## Política de contraseñas y registro

- Contraseñas nuevas (registro y reset): mínimo **8**, máximo **72** (bcrypt ignora lo que pase de 72 bytes), validado en backend, web y mobile. El login no aplica el mínimo para no dejar afuera cuentas viejas.
- Costo de bcrypt: **12** (`BCRYPT_ROUNDS`). Las cuentas creadas con costo 10 se re-hashean en su próximo login exitoso. El hash dummy del login tiene el mismo costo (un test lo fija): si los costos difieren, el tiempo de respuesta vuelve a delatar qué emails existen. Mientras queden cuentas de costo 10 sin re-hashear, esas siguen siendo distinguibles por tiempo; el rate limit hace lenta esa enumeración.
- Roles auto-registrables: `CARGO_GENERATOR`, `TRANSPORTER`, `COMPANY_ADMIN`. **`ADMIN` no** — se valida en el DTO y otra vez en el service.

## Rate limiting

`AuthController` usa `ClientIpThrottlerGuard` (`@nestjs/throttler`, storage en memoria), contando por IP real del cliente (`CF-Connecting-IP`, porque detrás del Cloudflare Tunnel `req.ip` es siempre el contenedor `cloudflared`):

| Endpoint | Límite por IP |
|---|---|
| `login` | 10 / min |
| `register` | 5 / 10 min |
| `forgot-password`, `resend-verification` | 5 / 15 min |
| `reset-password` | 10 / 15 min |
| `refresh` | 30 / min |
| resto de `/auth/*` | 20 / min |

Pasado el límite responde `429`. Confiar en `CF-Connecting-IP` es seguro solo mientras el backend **no** publique puertos (hoy `ports: !reset []` en `deploy/vps/compose.*.yml`); si se expusiera directo, un cliente podría falsearlo.

## Verificación de email — caso `EMAIL_NOT_VERIFIED`

Si el user intenta login antes de verificar, el backend responde:

```jsonc
{
  "statusCode": 403,
  "code": "EMAIL_NOT_VERIFIED",
  "email": "john@example.com",
  "message": "..."
}
```

El frontend lo agarra y redirige a una pantalla que ofrece reenviar el email (`POST /api/auth/resend-verification`).

## Cliente — token storage

### Frontend web

`sessionStorage` (**no** `localStorage`), vía un pequeño wrapper SSR-safe. Definido en [`../frontend/src/store/auth.ts`](../frontend/src/store/auth.ts):

```ts
// Sesión POR PESTAÑA: sessionStorage está aislado por browsing context, así que
// dos cuentas abiertas en dos pestañas no comparten token (localStorage sí lo
// compartía y causaba 403 cruzados: una pestaña mandaba el token de la otra).
login: (user, token, refreshToken) => {
  storage.set('token', token);
  storage.set('refreshToken', refreshToken);
  storage.set('user', JSON.stringify(user));
  queryClient.clear();            // evita filtrar datos de la cuenta anterior
  set({ user, token, isAuthenticated: true });
},

setSession: (user, token, refreshToken) => { /* tras un refresh: sin limpiar la caché */ },

logout: () => {
  revokeSession(storage.get('refreshToken'));   // POST /auth/logout, best effort
  clearStorage();
  queryClient.clear();
  set({ user: null, token: null, isAuthenticated: false });
},

hydrate: () => {
  if (typeof window === 'undefined') return;   // SSR-safe
  const token = storage.get('token');
  const userStr = storage.get('user');
  // ...descarta la sesión si el token expiró o no matchea al user guardado
  // (claims.sub === user.id && claims.role === user.role). Defensa en profundidad.
},
```

El `hydrate()` se llama desde un client component al inicializar (`Providers.tsx`) — sino tras un reload el store arranca vacío y el user aparece "deslogueado" hasta que un fetch falle con 401. Además valida el JWT guardado (`parseJwt`): si el `sub`/`role` del token no coincide con el user persistido, descarta la sesión en vez de confiar en datos inconsistentes. Un access token **vencido** solo descarta la sesión si no hay refresh token; si lo hay, el interceptor lo renueva en la primera request.

### Mobile

`AsyncStorage` (asíncrono). Mismo patrón con `await`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// guardar (login guarda token, refreshToken y user)
await AsyncStorage.setItem('token', token);
await AsyncStorage.setItem('refreshToken', refreshToken);

// leer (con flag de loading mientras tanto)
const token = await AsyncStorage.getItem('token');
```

## Inyección automática del header

### Web — interceptor de Axios

Source: [`../frontend/src/lib/api.ts`](../frontend/src/lib/api.ts).

La lógica de refresh vive en [`../frontend/src/lib/session.ts`](../frontend/src/lib/session.ts) (`refreshSession`, deduplicado, con una instancia de axios sin interceptores).

- **Request**: agrega `Authorization: Bearer <token>`. Si el access token vence en menos de 30 s, lo renueva **antes** de mandar la request.
- **Response 401** fuera de `/auth/*`: renueva la sesión **una vez** y reintenta la request (`config._retried`). Si el backend rechaza el refresh token (400/401) → `logout()` + redirect a `/auth/login`. Si el refresh falla por red, **no** desloguea: devuelve el error original.
- El "fuera de `/auth/*`" es para no reciclar el redirect cuando el propio login falla con 401 (credenciales mal).

### Mobile — request interceptor

Source: [`../mobile/src/services/api.ts`](../mobile/src/services/api.ts).

```ts
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

Response interceptor: mismo esquema que la web (renovar una vez y reintentar; si el refresh es rechazado, logout). Como el store importa `services/api.ts`, el cliente no puede importar el store: el store registra `setSessionHandlers({ onRefreshed, onExpired })` al cargarse.

El socket del chat se autentica con el access token en `auth.token` (una función, para que cada reconexión lea el token vigente). Ver [`websockets.md`](./websockets.md).

## Caveats y áreas a mejorar

- **Rate limit en memoria**: alcanza con una réplica del backend. Con varias, cada una cuenta por su lado; habría que pasar a un storage compartido (Redis). Tampoco hay bloqueo por cuenta: un ataque distribuido desde muchas IPs contra un mismo email no se frena.
- **Tokens en `sessionStorage`**: un XSS podría leerlos (también el refresh token). La alternativa es una cookie `httpOnly` para el refresh token, que exige que web y API compartan sitio o configurar `SameSite`/CORS con credenciales.
- **Frontend redirige a `/auth/login` por window.location**, lo que descarta cualquier estado React. Está OK para una sesión expirada (querés flush), pero ojo si lo invocás por error en un fetch interno.
- **`AsyncStorage` no es secure storage**. Tokens en plain text. Para prod mobile considerar `expo-secure-store` (Keychain en iOS, EncryptedSharedPreferences en Android).
- **El access token no se puede revocar**: es stateless y vive hasta 15 min después del logout o del reset. Lo que se revoca es el refresh token, así que la sesión no se puede extender. Una desactivación de cuenta sí corta al instante, porque `JwtStrategy` relee al usuario en cada request.

## Cómo proteger un endpoint nuevo

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Foo')
@ApiBearerAuth()                              // documenta Bearer en Swagger
@UseGuards(JwtAuthGuard)                      // todos los métodos requieren JWT
@Controller('foo')
export class FooController {
  @Get()
  @UseGuards(RolesGuard)                      // chequeo de rol
  @Roles('ADMIN', 'CARGO_GENERATOR')          // OR de roles
  list(@CurrentUser('id') userId: string) {
    return this.fooService.listForUser(userId);
  }
}
```

Sin `@ApiBearerAuth()` el endpoint sigue funcionando, pero en Swagger no aparece el candado y no podés probarlo con el botón "Authorize".
