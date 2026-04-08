import type { Metadata } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'CargoLink - Plataforma de Transporte de Carga Terrestre',
  description: 'Plataforma digital que conecta transportistas y transportadores para una gestión eficiente del transporte de carga terrestre.',
  keywords: ['carga', 'logística', 'transporte', 'envíos', 'flete'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
