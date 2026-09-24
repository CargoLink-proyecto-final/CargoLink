import '@testing-library/jest-dom';

// El ResponsiveContainer de recharts mide su contenedor con ResizeObserver, que
// jsdom no implementa. Sin este stub, cualquier test que monte una página con
// gráficos explota al montar. El gráfico queda en 0x0 (jsdom no hace layout),
// así que los tests verifican los números de las cards, no el SVG.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
