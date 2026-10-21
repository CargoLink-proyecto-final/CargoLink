import type { Metadata } from 'next';
import localFont from 'next/font/local';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import Providers from '@/components/Providers';

// Fuentes variables servidas desde el repo (Fontsource, licencia OFL). Con
// next/font/google el build las descargaba de Google en cada corrida, y cuando
// esa descarga fallaba se caía el build del CI y del deploy (#160).
const display = localFont({
  src: './fonts/outfit-latin-wght-normal.woff2',
  display: 'swap',
  variable: '--font-display',
  weight: '300 700',
});

const sans = localFont({
  src: './fonts/manrope-latin-wght-normal.woff2',
  display: 'swap',
  variable: '--font-sans',
  weight: '400 800',
});

const mono = localFont({
  src: './fonts/jetbrains-mono-latin-wght-normal.woff2',
  display: 'swap',
  variable: '--font-mono',
  weight: '400 600',
});

export const metadata: Metadata = {
  title: 'CargoLink — Plataforma de Transporte de Carga Terrestre',
  description: 'Plataforma digital que conecta publicadores de carga y transportistas para gestionar el transporte terrestre con claridad.',
  keywords: ['carga', 'logística', 'transporte', 'envíos', 'flete'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
