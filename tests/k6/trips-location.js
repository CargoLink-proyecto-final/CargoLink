// Prueba de estrés de PATCH /trips/:id/location (tracking GPS del módulo trips).
//
// Es el endpoint de más tráfico del módulo: cada transportista con un viaje en
// curso manda su posición cada pocos segundos. El viaje IN_PROGRESS lo crea
// antes backend/prisma/k6-fixture.ts y llega por TRIP_ID; acá se rampan
// usuarios virtuales que actualizan la ubicación.
//
// Nunca cierra el viaje: completeTrip llama a OSRM, que es un servidor público
// con rate limit y no se estresa.
//
// Uso y lectura de resultados: docs/calidad/pruebas-carga.md.
// Variables: BASE_URL, TRIP_ID, CARRIER_EMAIL, PASSWORD, PROFILE, MAX_VUS,
// SOAK_DURATION.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';
const TRIP_ID = __ENV.TRIP_ID;
const CARRIER_EMAIL = __ENV.CARRIER_EMAIL || 'carrier@example.com';
const PASSWORD = __ENV.PASSWORD || 'password123';
const MAX_VUS = Number(__ENV.MAX_VUS) || 50;
// stress: rampa hasta MAX_VUS (~3 min). soak: esfuerzo sostenido a carga
// normal durante SOAK_DURATION. quick: verificación rápida del script.
const PROFILE = __ENV.PROFILE || 'stress';
const SOAK_DURATION = __ENV.SOAK_DURATION || '10m';

// Producción tiene datos reales: la prueba escribe posiciones y el fixture
// crea cargas y viajes de prueba.
if (BASE_URL.includes('plataforma.cargolink.com.ar')) {
  throw new Error('No se corre carga contra producción. Usá el stack local o dev.');
}

const NORMAL_VUS = Math.ceil(MAX_VUS * 0.4);

const STAGES = {
  stress: [
    { duration: '30s', target: NORMAL_VUS }, // carga normal
    { duration: '1m', target: NORMAL_VUS },
    { duration: '30s', target: MAX_VUS }, // estrés
    { duration: '1m', target: MAX_VUS },
    { duration: '20s', target: 0 }, // recuperación
  ],
  soak: [
    { duration: '1m', target: NORMAL_VUS },
    { duration: SOAK_DURATION, target: NORMAL_VUS },
    { duration: '30s', target: 0 },
  ],
  quick: [
    { duration: '10s', target: 5 },
    { duration: '10s', target: 0 },
  ],
};

if (!STAGES[PROFILE]) {
  throw new Error(`PROFILE desconocido: ${PROFILE} (stress | soak | quick)`);
}

export const options = {
  scenarios: {
    tracking: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: STAGES[PROFILE],
    },
  },
  thresholds: {
    // Criterios de aceptación de la prueba (ver docs/calidad/pruebas-carga.md).
    'http_req_failed{endpoint:location}': ['rate<0.01'],
    'http_req_duration{endpoint:location}': ['p(95)<500', 'p(99)<1000'],
    checks: ['rate>0.99'],
  },
};

if (!TRIP_ID) {
  throw new Error('Falta TRIP_ID: correr antes backend/prisma/k6-fixture.ts');
}

export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: CARRIER_EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'setup' } },
  );
  if (res.status !== 200 && res.status !== 201) {
    fail(`login ${CARRIER_EMAIL} respondió ${res.status}: ${res.body}`);
  }
  return { token: res.json().accessToken, tripId: TRIP_ID };
}

export default function (data) {
  // Recorrido aproximado Buenos Aires → Córdoba con algo de ruido.
  const progress = Math.random();
  const lat = -34.6037 + (-31.4201 + 34.6037) * progress + (Math.random() - 0.5) * 0.01;
  const lng = -58.3816 + (-64.1888 + 58.3816) * progress + (Math.random() - 0.5) * 0.01;

  const res = http.patch(
    `${BASE_URL}/trips/${data.tripId}/location`,
    JSON.stringify({ lat, lng }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.token}`,
      },
      tags: { endpoint: 'location' },
    },
  );

  check(res, {
    'status 200': (r) => r.status === 200,
    'guarda la posición': (r) => {
      const body = r.json();
      return Math.abs(body.currentLat - lat) < 1e-6 && Math.abs(body.currentLng - lng) < 1e-6;
    },
  });

  // La app real manda la posición cada pocos segundos; acá se comprime para
  // generar más presión por usuario virtual.
  sleep(1);
}
