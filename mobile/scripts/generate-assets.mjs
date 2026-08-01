/**
 * Genera los assets de la app (icono, adaptive icon, splash, favicon) sin depender
 * de herramientas de diseño ni de paquetes externos: rasteriza formas simples con
 * supersampling y encodea PNG a mano con zlib (parte de Node).
 *
 * Por qué existe: `app.json` referencia `./assets/icon.png` y sin ese archivo Expo
 * no arranca. Tener el generador versionado hace que los assets sean reproducibles
 * y editables por código en vez de binarios opacos en el repo.
 *
 * Uso: node scripts/generate-assets.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

// Paleta — espejo de frontend/tailwind.config.ts
const BRAND = { r: 0x25, g: 0x63, b: 0xeb }; // primary-600
const BRAND_DEEP = { r: 0x1d, g: 0x4e, b: 0xd8 }; // primary-700
const ACCENT = { r: 0xf5, g: 0x9e, b: 0x0b }; // accent-400
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

const SS = 4; // muestras por eje para antialiasing

// ---------------------------------------------------------------- primitivas

const layer = (size) => ({ size, data: new Float32Array(size * size * 4) });

/** Cobertura [0,1] del pixel (x,y) según un predicado de pertenencia a la forma. */
function coverage(shape, x, y) {
  let hits = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      if (shape(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hits++;
    }
  }
  return hits / (SS * SS);
}

/** Pinta `shape` con `color` sobre la capa (source-over). */
function fill(target, shape, color, alpha = 1) {
  const { size, data } = target;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = coverage(shape, x, y) * alpha;
      if (a <= 0) continue;
      const i = (y * size + x) * 4;
      const dstA = data[i + 3];
      const outA = a + dstA * (1 - a);
      for (let c = 0; c < 3; c++) {
        const src = [color.r, color.g, color.b][c];
        data[i + c] = (src * a + data[i + c] * dstA * (1 - a)) / (outA || 1);
      }
      data[i + 3] = outA;
    }
  }
}

/** Recorta `shape` de la capa (destination-out): deja pasar lo que haya detrás. */
function erase(target, shape) {
  const { size, data } = target;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = coverage(shape, x, y);
      if (a <= 0) continue;
      data[(y * size + x) * 4 + 3] *= 1 - a;
    }
  }
}

/** Compone `src` sobre `dst` (source-over), ambos del mismo tamaño. */
function compose(dst, src) {
  const { size, data } = dst;
  for (let i = 0; i < size * size * 4; i += 4) {
    const a = src.data[i + 3];
    if (a <= 0) continue;
    const dstA = data[i + 3];
    const outA = a + dstA * (1 - a);
    for (let c = 0; c < 3; c++) {
      data[i + c] = (src.data[i + c] * a + data[i + c] * dstA * (1 - a)) / (outA || 1);
    }
    data[i + 3] = outA;
  }
}

// ------------------------------------------------------------------- formas

const rect = (x, y, w, h) => (px, py) => px >= x && px <= x + w && py >= y && py <= y + h;

const roundRect = (x, y, w, h, r) => (px, py) => {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
};

const circle = (cx, cy, r) => (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;

// -------------------------------------------------------------------- marca

/**
 * Camión de perfil (cabina + caja + ruedas) dibujado en una caja de 1024x1024.
 * Las ruedas se recortan con `erase` para que el hueco funcione tanto sobre el
 * fondo azul del icono como sobre transparencia en el splash/adaptive icon.
 */
function drawTruck(size, { body = WHITE, accent = ACCENT } = {}) {
  const l = layer(size);
  const k = size / 1024; // factor de escala respecto al diseño base
  const s = (v) => v * k;

  // Coordenadas ya desplazadas para que el bounding box de la marca
  // (x 112..912, y 279..745) quede centrado en el lienzo de 1024.

  // Caja de carga
  fill(l, roundRect(s(112), s(279), s(470), s(290), s(40)), body);
  // Banda de acento sobre la caja
  fill(l, roundRect(s(162), s(369), s(370), s(66), s(26)), accent);

  // Cabina: cuerpo alto + trompa más baja
  fill(l, roundRect(s(602), s(355), s(170), s(214), s(38)), body);
  fill(l, roundRect(s(716), s(455), s(196), s(114), s(38)), body);
  // Ventanilla recortada, contenida dentro del cuerpo de la cabina
  erase(l, roundRect(s(640), s(391), s(106), s(76), s(22)));

  // Chasis que une caja y cabina
  fill(l, roundRect(s(112), s(555), s(800), s(48), s(20)), body);

  // Ruedas: llanta llena y cubo recortado
  for (const cx of [284, 784]) {
    fill(l, circle(s(cx), s(641), s(104)), body);
    erase(l, circle(s(cx), s(641), s(42)));
  }

  return l;
}

// ---------------------------------------------------------------- encoding

function encodePNG(target) {
  const { size, data } = target;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filtro None
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const a = data[i + 3];
      // PNG espera color premultiplicado por nada: guardamos el color tal cual
      raw[o++] = Math.round(Math.min(255, Math.max(0, data[i])));
      raw[o++] = Math.round(Math.min(255, Math.max(0, data[i + 1])));
      raw[o++] = Math.round(Math.min(255, Math.max(0, data[i + 2])));
      raw[o++] = Math.round(Math.min(255, Math.max(0, a * 255)));
    }
  }

  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed) >>> 0);
    return Buffer.concat([len, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

// ------------------------------------------------------------------ salidas

/** Fondo con degradado vertical brand → brand-deep. */
function brandBackground(size) {
  const l = layer(size);
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      l.data[i] = BRAND.r + (BRAND_DEEP.r - BRAND.r) * t;
      l.data[i + 1] = BRAND.g + (BRAND_DEEP.g - BRAND.g) * t;
      l.data[i + 2] = BRAND.b + (BRAND_DEEP.b - BRAND.b) * t;
      l.data[i + 3] = 1;
    }
  }
  return l;
}

/** Copia `mark` escalada e insertada dentro de una capa de `size`, ocupando `scale`. */
function inset(mark, size, scale) {
  const out = layer(size);
  const target = Math.round(size * scale);
  const off = Math.round((size - target) / 2);
  const ratio = mark.size / target;
  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      const sx = Math.min(mark.size - 1, Math.floor(x * ratio));
      const sy = Math.min(mark.size - 1, Math.floor(y * ratio));
      const si = (sy * mark.size + sx) * 4;
      const di = ((y + off) * size + (x + off)) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = mark.data[si + c];
    }
  }
  return out;
}

mkdirSync(OUT_DIR, { recursive: true });

const write = (name, target) => {
  writeFileSync(join(OUT_DIR, name), encodePNG(target));
  console.log(`✓ ${name} (${target.size}x${target.size})`);
};

// Icono de app: marca blanca sobre fondo de marca.
const mark1024 = drawTruck(1024);
const icon = brandBackground(1024);
compose(icon, inset(mark1024, 1024, 0.72));
write('icon.png', icon);

// Adaptive icon (Android): sólo el foreground, con safe zone del 60%.
const adaptive = inset(mark1024, 1024, 0.6);
write('adaptive-icon.png', adaptive);

// Splash: la marca sobre transparencia, el color de fondo lo pone app.json.
write('splash-icon.png', inset(mark1024, 1024, 0.66));

// Notificación (Android): silueta monocromo, el sistema la tiñe.
write('notification-icon.png', inset(drawTruck(1024, { accent: WHITE }), 1024, 0.7));

// Favicon web.
const favicon = brandBackground(64);
compose(favicon, inset(drawTruck(64), 64, 0.74));
write('favicon.png', favicon);
