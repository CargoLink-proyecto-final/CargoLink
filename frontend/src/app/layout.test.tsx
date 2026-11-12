import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react';
import RootLayout, { metadata } from './layout';

// next/font/local can't run under jsdom — stub the factory, keeping each font's CSS variable name.
jest.mock('next/font/local', () => ({
  __esModule: true,
  default: ({ variable }: { variable: string }) => {
    const name = variable.replace(/^--/, '');
    return { variable: name, className: name };
  },
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

  it('applies the three font variables to <html>', () => {
    const element = RootLayout({ children: <span>child</span> });
    expect(element.props.className).toBe('font-display font-sans font-mono');
  });

  // #160: next/font/google bajaba las fuentes en cada build y, si Google no
  // respondía, se caía el build. Las fuentes tienen que salir del repo.
  it('loads its fonts from the repo instead of Google Fonts (#160)', () => {
    // Arrange
    const source = readFileSync(join(__dirname, 'layout.tsx'), 'utf8');
    // Act
    const fontFiles = Array.from(source.matchAll(/src: '\.\/(fonts\/[^']+)'/g), (m) => m[1]);
    // Assert
    expect(source).not.toMatch(/from 'next\/font\/google'/);
    expect(fontFiles).toHaveLength(3);
    fontFiles.forEach((file) => expect(existsSync(join(__dirname, file))).toBe(true));
  });
});
