// Convierte el --summary-export de k6 en tablas Markdown para el resumen del
// job de GitHub Actions. Uso: node k6-summary.js <summary.json>
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
const { metrics } = JSON.parse(fs.readFileSync(file, 'utf8'));
const profile = path.basename(file, '.json');

const ms = (v) => (v == null ? '—' : `${v.toFixed(1)} ms`);
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(2)} %`);

const duration = metrics['http_req_duration{endpoint:location}'] || {};
const failed = metrics['http_req_failed{endpoint:location}'] || {};
const reqs = metrics.http_reqs || {};

// En el summary-export cada umbral es true si se cruzó (falló).
const thresholdRows = Object.entries(metrics).flatMap(([name, metric]) =>
  Object.entries(metric.thresholds || {}).map(
    ([expr, crossed]) => `| \`${name}\` | \`${expr}\` | ${crossed ? '❌' : '✅'} |`,
  ),
);

console.log(
  [
    `### Stress k6 — PATCH /trips/:id/location (perfil ${profile})`,
    '',
    '| Métrica | Valor |',
    '|---|---|',
    `| Requests totales | ${reqs.count ?? '—'} (${reqs.rate?.toFixed(1) ?? '—'} req/s) |`,
    `| VUs máximos | ${metrics.vus_max?.value ?? '—'} |`,
    `| Latencia media | ${ms(duration.avg)} |`,
    `| p90 | ${ms(duration['p(90)'])} |`,
    `| p95 | ${ms(duration['p(95)'])} |`,
    `| p99 | ${ms(duration['p(99)'])} |`,
    `| Máxima | ${ms(duration.max)} |`,
    `| Tasa de error | ${pct(failed.value)} |`,
    `| Checks OK | ${pct(metrics.checks?.value)} |`,
    '',
    '| Métrica | Umbral | Resultado |',
    '|---|---|---|',
    ...thresholdRows,
    '',
  ].join('\n'),
);
