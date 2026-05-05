---
name: backend-endpoint
description: Crear, modificar o testear endpoints del backend FastAPI de este repo. Usar cuando la tarea toca archivos bajo backend/ (main.py, schemas.py, models.py, auth.py, crud.py), rutas HTTP, schemas Pydantic, dependency injection con Session, autenticación JWT, autorización por organización, o scripts one-off de backend.
---

# Skill: Backend endpoint

Guía para trabajar en el backend FastAPI de RindePlus. Stack: FastAPI 0.104 + Python 3.12 + SQLAlchemy 2.0 + Pydantic + psycopg2. Servido por gunicorn con UvicornWorker.

## Arquitectura real del repo (importante: monolítico)

El backend es **intencionalmente monolítico**: todos los endpoints viven en `backend/main.py` (~17k líneas). Aunque rompe el patrón "routers por feature", el equipo tomó la decisión deliberada de mantenerlo así hasta que el tamaño justifique la refactorización. **No propongas dividir en routers** sin discutir primero (ADR).

### Archivos clave

```
backend/
├── main.py                     Todos los endpoints (@app.get/post/put/delete).
├── auth.py                     JWT, bcrypt, dependencies de autenticación.
├── database.py                 engine, get_db(), OrgScopedSession.
├── models.py                   SQLAlchemy ORM (~1k líneas).
├── schemas.py                  Pydantic schemas request/response (~1k líneas).
├── crud.py                     Helpers de acceso a DB (no siempre se usa — a veces los endpoints hacen queries inline).
├── ml_model.py                 Modelos de ML (scikit-learn).
├── alembic/versions/           Migraciones (ver skill `db-migration`).
└── <scripts>.py                One-off scripts (carga de datos, debug, etc.).
```

## Convenciones de endpoints

### Decorador y response model

```python
@app.post("/auth/login", response_model=schemas.Token)
def login(user_credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    """Endpoint para login de usuarios"""
    …
```

Reglas:
- **Siempre** declarar `response_model=schemas.X` → aparece en OpenAPI (`/docs`) + valida la respuesta.
- **Siempre** inyectar DB con `db: Session = Depends(get_db)`.
- Docstring corto en español explicando el propósito.
- Funciones **síncronas** por default (`def`, no `async def`) — el repo no usa asyncpg. Solo `async def` si hay una razón clara.

### Path params, query params, body

```python
@app.get("/usuarios/{user_id}", response_model=schemas.UserResponse)
def get_usuario(
    user_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    …
```

- Path params tipados en la firma.
- Para POST/PUT, body es un schema Pydantic: `user_data: schemas.UserCreate = Body(...)`.
- Query params con `Query(...)` cuando necesitás validación o defaults.

### Autenticación y autorización

Auth en `backend/auth.py`. JWT HS256, `SECRET_KEY` y `ACCESS_TOKEN_EXPIRE_MINUTES` vienen del env.

Para proteger un endpoint:
```python
from auth import get_current_user

@app.get("/protegido")
def endpoint(current_user: models.Usuario = Depends(get_current_user), …):
    …
```

Para restringir por organización (patrón del repo — multi-tenant):
- El JWT incluye `{"sub": user_id, "org": org_id}`.
- `OrgScopedSession` en `database.py` guarda `org_id` en `session.info`.
- Verificá pertenencia a org antes de devolver recursos de otra org.

Passwords: bcrypt via `passlib.context.CryptContext(schemes=["bcrypt"])`. Nunca guardes passwords en claro.

### Errores

Usá `HTTPException` con status y mensaje en **español**:
```python
raise HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Email o contraseña incorrectos",
    headers={"WWW-Authenticate": "Bearer"},
)
```

Códigos comunes: 400 (bad request), 401 (no autenticado), 403 (no autorizado), 404 (not found), 409 (conflicto), 422 (FastAPI valida Pydantic automático).

### Shape de respuesta

**No envolvemos** las respuestas en un envelope (`{data: ..., success: true}`). Devolvemos el objeto o dict directo — FastAPI serializa con el `response_model`.

Ejemplo del login:
```python
return {
    "access_token": access_token,
    "token_type": "bearer",
    "user_id": user.idUsuario,
    "user_name": user.nombre,
    …
}
```

Respetá el naming snake_case en JSON (convención del repo).

## Template mínimo de endpoint nuevo

```python
@app.get("/lotes/{lote_id}/rinde", response_model=schemas.LoteRinde)
def get_rinde_lote(
    lote_id: int = Path(..., gt=0),
    campania: str = Query(..., regex=r"^\d{4}/\d{2}$"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Devuelve el rinde de un lote para una campaña."""
    lote = db.query(models.Lote).filter(models.Lote.id == lote_id).first()
    if not lote:
        raise HTTPException(status_code=404, detail="Lote no encontrado")

    # Verificar que el lote pertenezca a la organización del usuario.
    if lote.empresa.idOrganizacion != current_user.idOrganizacion:
        raise HTTPException(status_code=403, detail="Sin acceso al lote")

    # Lógica de cálculo...
    return {
        "lote_id": lote_id,
        "campania": campania,
        "rinde_qq_ha": <valor>,
    }
```

Notas:
- Unidad de rinde en el nombre del campo (`rinde_qq_ha`) — la unidad estándar de Rinde es qq/ha (ver skill `agronomia` cuando exista).
- Chequeo de pertenencia a organización antes de devolver data.
- Docstring breve en español.

## SQLAlchemy — queries

SQLAlchemy 2.0 en este repo. Ejemplos del patrón típico:
```python
user = db.query(models.Usuario).filter(models.Usuario.email == email).first()
```

Para queries complejas o joins, mirá `main.py` para patrones existentes. `crud.py` tiene helpers reutilizables — preferí agregar ahí si la query se usa en varios endpoints.

Session management: no abrás sessions a mano — usá siempre `get_db()` como dependency.

## Schemas Pydantic

Viven en `backend/schemas.py`. Patrón típico:
- `XCreate` → input de POST.
- `XUpdate` → input de PUT/PATCH (campos opcionales).
- `XResponse` / `XRead` → shape de respuesta.

Respetá el naming existente cuando agregás nuevos (si la convención del repo dice `UserRead`, no uses `UserResponse` para lo mismo).

## Testing

El repo tiene varios archivos `backend/test_*.py` — son **scripts de debug/testing manual**, no tests automatizados con pytest configurado. Si escribís tests automatizados nuevos, coordinar estructura (hoy no hay `pytest.ini` ni suite formal).

Para probar cambios localmente:
- Levantar stack: `cd docker && ./up-dev.sh -d`.
- Invocar: `curl -X POST http://localhost:8035/<endpoint> -H "Content-Type: application/json" -d '{...}'`.
- Logs: `docker logs dev_plataforma_backend --tail 50`.
- Swagger: `http://localhost:8035/docs`.

## Checklist al cerrar un cambio de backend

- [ ] `response_model` declarado en el decorador.
- [ ] `db: Session = Depends(get_db)` presente si toca DB.
- [ ] Autenticación (`get_current_user`) en endpoints no públicos.
- [ ] Autorización por organización cuando corresponde (multi-tenant).
- [ ] Errores con `HTTPException` + mensaje en español.
- [ ] Sin passwords, tokens ni secretos en logs.
- [ ] Swagger (`/docs`) muestra el endpoint nuevo correctamente.
- [ ] Probado con curl o desde el frontend.
- [ ] Si el cambio agrega columna/tabla: migración Alembic correspondiente (ver skill `db-migration`).
