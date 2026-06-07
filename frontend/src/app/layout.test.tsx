import { render } from '@testing-library/react';
import RootLayout, { metadata } from './layout';

// next/font/google can't run under jsdom — stub each font factory used by the layout.
jest.mock('next/font/google', () => ({
  Outfit: () => ({ variable: 'font-display', className: 'font-display' }),
  Manrope: () => ({ variable: 'font-sans', className: 'font-sans' }),
  JetBrains_Mono: () => ({ variable: 'font-mono', className: 'font-mono' }),
}));

// Isolate from the real provider tree (react-query + auth hydration).
jest.mock('@/components/Providers', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="providers">{children}</div>
  ),
}));

describe('RootLayout', () => {
  it('exports page metadata', () => {
    expect(metadata.title).toContain('CargoLink');
    expect(metadata.description).toBeTruthy();
    expect(metadata.keywords).toEqual(
      expect.arrayContaining(['carga', 'logística', 'transporte']),
    );
  });

  it('renders children inside Providers', () => {
    // The layout returns <html><body>; render into a detached container and read
    // through baseElement so the nested document mounts without RTL choking.
    const { baseElement } = render(
      <RootLayout>
        <p>App content</p>
      </RootLayout>,
    );
    expect(baseElement.textContent).toContain('App content');
  });

  it('returns an element wrapping the providers', () => {
    const element = RootLayout({ children: <span>child</span> });
    expect(element).toBeTruthy();
    expect(element.type).toBe('html');
  });
});
