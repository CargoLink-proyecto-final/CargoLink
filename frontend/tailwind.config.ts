import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Original CargoLink blue
        primary: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
          950: '#172554',
        },
        // Original amber/yellow accent
        accent: {
          50: '#FEF3C7',
          100: '#FDE68A',
          200: '#FCD34D',
          300: '#FBBF24',
          400: '#F59E0B',
          500: '#D97706',
          600: '#B45309',
          700: '#92400E',
        },
        // Neutrals — cool grays (Tailwind gray scale)
        ink: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
          950: '#030712',
        },
        // Surfaces — cool white/gray
        surface: {
          DEFAULT: '#F9FAFB',
          raised: '#FFFFFF',
          sunk: '#F3F4F6',
          edge: '#E5E7EB',
        },
        success: { 50: '#ECFDF5', 600: '#059669', 700: '#047857' },
        warning: { 50: '#FFFBEB', 600: '#D97706', 700: '#B45309' },
        danger:  { 50: '#FEF2F2', 600: '#DC2626', 700: '#B91C1C' },
        info:    { 50: '#EFF6FF', 600: '#2563EB', 700: '#1D4ED8' },
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular'],
      },
      letterSpacing: {
        eyebrow: '0.18em',
      },
      boxShadow: {
        card: '0 1px 0 rgba(17, 24, 39, 0.04), 0 1px 2px rgba(17, 24, 39, 0.06)',
        raised: '0 1px 0 rgba(17, 24, 39, 0.04), 0 8px 24px -8px rgba(17, 24, 39, 0.12)',
        ring: '0 0 0 4px rgba(37, 99, 235, 0.15)',
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
};

export default config;
