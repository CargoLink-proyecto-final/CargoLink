// Flujo E2E del módulo de viajes (trips) contra un entorno desplegado.
//
//   E2E_PASSWORD=... node deploy/vps/e2e-trips.mjs <base_url>
//   E2E_PASSWORD=... node deploy/vps/e2e-trips.mjs https://dev.cargolink.com.ar
//   E2E_PASSWORD=... node deploy/vps/e2e-trips.mjs http://localhost:3001   # stack local
//
// Recorre el ciclo completo por la API pública, como lo haría la app:
// el dador publica una carga → el transportista se postula → el dador acepta
// (se crea el viaje) → el transportista lo inicia, manda una ubicación y lo
// cierra → el dador lo califica. Al cerrar, el backend calcula la distancia con
// OSRM real, así que el flujo también prueba la integración externa.
//
// ESCRIBE DATOS: solo para dev. Las cuentas e2e-* las crea el seed cuando el
// entorno define E2E_PASSWORD (backend/prisma/seed-e2e.ts).
//
// Lo corre deploy.sh después del smoke, dentro del contenedor del backend (el
// host del VPS no tiene por qué tener node). Sale con código 1 si algún paso
// falla. Solo usa fetch de Node 20: sin dependencias.

const SHIPPER_EMAIL = 'e2e-shipper@cargolink.test';
const CARRIER_EMAIL = 'e2e-carrier@cargolink.test';
const REQUEST_TIMEOUT_MS = 20_000;

const baseUrl = (process.argv[2] || process.env.E2E_BASE_URL || '').replace(/\/+$/, '');
const password = process.env.E2E_PASSWORD;
if (!baseUrl || !password) {
  console.error('Uso: E2E_PASSWORD=... node e2e-trips.mjs <base_url>');
  process.exit(2);
}
const api = `${baseUrl}/api`;

class StepError extends Error {}

async function call(method, path, { token, body, expect = [200, 201] } = {}) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!expect.includes(res.status)) {
    const detail = typeof data === 'object' && data?.message ? data.message : text.slice(0, 200);
    throw new StepError(`${method} ${path} → ${res.status} (esperaba ${expect.join('/')}): ${detail}`);
  }
  return data;
}

function assert(condition, message) {
  if (!condition) throw new StepError(message);
}

const results = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - started;
    results.push({ name, ok: true, ms, detail });
    console.log(`  ok   ${name} (${ms} ms)${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof StepError ? err.message : `${err.name}: ${err.message}`;
    results.push({ name, ok: false, ms, detail: message });
    console.log(`  FAIL ${name} (${ms} ms) — ${message}`);
    throw err;
  }
}

async function login(email) {
  const data = await call('POST', '/auth/login', { body: { email, password } });
  assert(data?.accessToken, `login de ${email} sin accessToken`);
  return data.accessToken;
}

async function run() {
  const ctx = {};
  const runId = new Date().toISOString();

  await step('login del dador y del transportista', async () => {
    ctx.shipper = await login(SHIPPER_EMAIL);
    ctx.carrier = await login(CARRIER_EMAIL);
  });

  await step('el dador publica una carga', async () => {
    const day = 24 * 60 * 60 * 1000;
    const load = await call('POST', '/loads', {
      token: ctx.shipper,
      body: {
        title: `[E2E] Córdoba → Carlos Paz ${runId}`,
        description: 'Carga generada por el E2E post-deploy. Se cierra sola.',
        originAddress: 'Av. Colón 567, Córdoba',
        originLat: -31.4201,
        originLng: -64.1888,
        destAddress: 'Av. San Martín 1000, Villa Carlos Paz',
        destLat: -31.4241,
        destLng: -64.4978,
        cargoType: 'Alimentos y bebidas',
        weight: 1000,
        pickupDate: new Date(Date.now() + day).toISOString(),
        deliveryDate: new Date(Date.now() + 2 * day).toISOString(),
        price: 100000,
      },
    });
    assert(load?.id, 'la carga creada no tiene id');
    assert(load.status === 'PUBLISHED', `la carga quedó en ${load.status}, esperaba PUBLISHED`);
    ctx.loadId = load.id;
    return `carga ${load.id}`;
  });

  await step('el transportista se postula al precio publicado', async () => {
    const postulation = await call('POST', `/loads/${ctx.loadId}/postulations`, {
      token: ctx.carrier,
      body: {},
    });
    assert(postulation?.id, 'la postulación no tiene id');
    ctx.postulationId = postulation.id;
  });

  await step('el dador acepta y se crea el viaje', async () => {
    const accepted = await call('POST', `/postulations/${ctx.postulationId}/accept`, {
      token: ctx.shipper,
    });
    assert(accepted?.trip?.id, 'aceptar no devolvió el viaje');
    assert(accepted.trip.status === 'ACCEPTED', `el viaje quedó en ${accepted.trip.status}`);
    ctx.tripId = accepted.trip.id;
    return `viaje ${ctx.tripId}`;
  });

  await step('el transportista inicia el viaje', async () => {
    const trip = await call('PATCH', `/trips/${ctx.tripId}/start`, { token: ctx.carrier });
    const status = Array.isArray(trip) ? trip[0]?.status : trip?.status;
    assert(status === 'IN_PROGRESS', `el viaje quedó en ${status}, esperaba IN_PROGRESS`);
  });

  await step('el transportista reporta su ubicación', async () => {
    const trip = await call('PATCH', `/trips/${ctx.tripId}/location`, {
      token: ctx.carrier,
      body: { lat: -31.4223, lng: -64.34 },
    });
    assert(trip?.currentLat === -31.4223, 'la ubicación no quedó guardada');
  });

  await step('el transportista cierra el viaje y OSRM calcula la distancia', async () => {
    const [trip] = await call('PATCH', `/trips/${ctx.tripId}/complete`, {
      token: ctx.carrier,
      body: { fuelLiters: 12 },
    });
    assert(trip?.status === 'COMPLETED', `el viaje quedó en ${trip?.status}, esperaba COMPLETED`);
    // null = OSRM no respondió y se aplicó la contingencia (#155). El cierre
    // anduvo, pero la integración no: para el E2E eso es un fallo.
    assert(
      typeof trip.distanceKm === 'number' && trip.distanceKm > 0,
      'distanceKm vino null: OSRM no respondió (se aplicó la contingencia)',
    );
    return `${trip.distanceKm.toFixed(1)} km por ruta (OSRM)`;
  });

  await step('el dador ve el viaje cerrado y lo califica', async () => {
    const trip = await call('GET', `/trips/${ctx.tripId}`, { token: ctx.shipper });
    assert(trip?.status === 'COMPLETED', `el dador ve el viaje en ${trip?.status}`);
    assert(trip.load?.status === 'DELIVERED', `la carga quedó en ${trip.load?.status}, esperaba DELIVERED`);
    await call('POST', '/ratings', {
      token: ctx.shipper,
      body: { tripId: ctx.tripId, score: 5, comment: 'E2E post-deploy' },
    });
  });
}

console.log(`E2E trips contra ${baseUrl}`);
const started = Date.now();
let ok = true;
try {
  await run();
} catch {
  ok = false;
}
const total = ((Date.now() - started) / 1000).toFixed(1);
const passed = results.filter((r) => r.ok).length;
console.log(ok ? `E2E OK: ${passed} pasos en ${total} s` : `E2E FALLÓ en el paso ${passed + 1} (${total} s)`);
process.exit(ok ? 0 : 1);
