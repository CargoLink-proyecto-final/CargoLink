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
   │                      │◀──{ access_token, user }┤                      │
   │                      ├──sessionStorage.setItem('token', ...)          │
   │                      │                                                │
   │                      │  desde acá todas las requests llevan Bearer    │
```

## JWT

Firma con `JWT_SECRET` (env var, **requerida**). Lifetime `JWT_EXPIRATION` (default `7d`).

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
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'default-secret'),
    });
  }

  validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
```

- Extrae del header `Authorization: Bearer <token>`.
- `ignoreExpiration: false` — tokens expirados fallan con 401.
- El `validate()` returnea el objeto que termina en `request.user` (lo lee `@CurrentUser()`).
- ⚠️ El fallback `'default-secret'` se usa si `JWT_SECRET` no está seteada. En `docker-compose.yml` está declarada con `:?` (required), así que el container no arranca sin ella. Igual: si corrés el backend con dev local sin `.env`, te puede pasar — siempre cargá la var.

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
 │                 │                     ├──save token + exp en User
 │                 │                     ├──MailService────────▶│
 │                 │◀──200 (siempre)─────┤                      │
 │                 │                                            │
 │◀──recibe email con link a /auth/reset-password?token=...─────┤
 │                                                              │
 ├─click + nuevo password──▶│                                   │
 │                 ├──POST /reset-password { token, newPassword }──▶│
 │                 │                     ├──findUnique by resetToken
 │                 │                     ├──verifica resetTokenExp > now
 │                 │                     ├──bcrypt(newPassword)
 │                 │                     ├──update + clear token + exp
 │                 │◀──200───────────────┤
```

Nota: `forgot-password` siempre responde 200 — no leakea si el email existe o no.

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
login: (user, token) => {
  storage.set('token', token);
  storage.set('user', JSON.stringify(user));
  queryClient.clear();            // evita filtrar datos de la cuenta anterior
  set({ user, token, isAuthenticated: true });
},

logout: () => {
  storage.remove('token');
  storage.remove('user');
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

El `hydrate()` se llama desde un client component al inicializar (`Providers.tsx`) — sino tras un reload el store arranca vacío y el user aparece "deslogueado" hasta que un fetch falle con 401. Además valida el JWT guardado (`parseJwt`): si expiró o el `sub`/`role` del token no coincide con el user persistido, descarta la sesión en vez de confiar en datos inconsistentes.

### Mobile

`AsyncStorage` (asíncrono). Mismo patrón con `await`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// guardar
await AsyncStorage.setItem('token', token);

// leer (con flag de loading mientras tanto)
const token = await AsyncStorage.getItem('token');
```

## Inyección automática del header

### Web — interceptor de Axios

Source: [`../frontend/src/lib/api.ts`](../frontend/src/lib/api.ts).

```ts
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl: string = error.config?.url || '';
    const isAuthEndpoint = requestUrl.includes('/auth/');
    if (error.response?.status === 401 && typeof window !== 'undefined' && !isAuthEndpoint) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  },
);
```

- 401 fuera de `/auth/*` → limpia storage + redirect a login. El "fuera de `/auth/*`" es para no reciclar el redirect cuando el propio login falla con 401 (credenciales mal).

### Mobile — request interceptor

Source: [`../mobile/src/services/api.ts`](../mobile/src/services/api.ts).

```ts
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

⚠️ El mobile **no** tiene response interceptor para 401. Si el token expira, el comportamiento depende de cada pantalla.

## Caveats y áreas a mejorar

- **No hay refresh token**. Cuando el JWT expira (default 7d), el user tiene que re-loguearse. Para una app mobile con sesiones largas, sumar refresh tokens sería el siguiente paso.
- **`JWT_SECRET` con fallback `'default-secret'`**: ver advertencia arriba. En producción asegurate de que esté seteada.
- **Sin rate limiting** en login / register / forgot-password. Brute force trivial. Para prod: agregar `@nestjs/throttler` o un proxy nivel infra.
- **CORS abierto en WS** — ver [`websockets.md`](./websockets.md).
- **Frontend redirige a `/auth/login` por window.location**, lo que descarta cualquier estado React. Está OK para una sesión expirada (querés flush), pero ojo si lo invocás por error en un fetch interno.
- **`AsyncStorage` no es secure storage**. Tokens en plain text. Para prod mobile considerar `expo-secure-store` (Keychain en iOS, EncryptedSharedPreferences en Android).
- **No hay logout en backend**. JWT es stateless: el token sigue válido hasta su expiración aunque el cliente lo "borre". Si necesitás invalidar (p.ej. cambio de password debería desloguear todas las sesiones), tendrías que llevar una blacklist o rotar `JWT_SECRET` (escala mal, mejor blacklist por jti).

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
