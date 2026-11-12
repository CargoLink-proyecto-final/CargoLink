// Convierte el coverage-summary.json de jest en una tabla Markdown para el
// resumen del job de GitHub Actions. Uso: node coverage-summary.js <título> <json>
const fs = require('fs');

const [title, file] = process.argv.slice(2);
const { total } = JSON.parse(fs.readFileSync(file, 'utf8'));

const rows = ['statements', 'branches', 'functions', 'lines'].map(
  (key) =>
    `| ${key} | ${total[key].pct.toFixed(1)} % | ${total[key].covered}/${total[key].total} |`,
);

console.log(
  [`### Cobertura ${title}`, '', '| Métrica | % | Cubierto |', '|---|---|---|', ...rows, ''].join('\n'),
);
