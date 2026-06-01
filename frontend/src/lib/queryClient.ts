import { QueryClient } from '@tanstack/react-query';

// Singleton compartido del QueryClient. Vive fuera de Providers para que el
// store de auth pueda limpiar la caché en login/logout (`queryClient.clear()`)
// y así evitar que datos de una cuenta queden cacheados y se muestren a otra
// cuenta dentro de la misma pestaña.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});
