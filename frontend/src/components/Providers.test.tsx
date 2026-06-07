import { render, screen } from '@testing-library/react';
import Providers from './Providers';
import { useAuthStore } from '@/store/auth';

const hydrate = jest.fn();

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  // Providers uses `useAuthStore((s) => s.hydrate)`.
  (useAuthStore as unknown as jest.Mock).mockImplementation(
    (sel?: (s: unknown) => unknown) => {
      const state = { hydrate };
      return sel ? sel(state) : state;
    },
  );
});

describe('Providers', () => {
  it('hydrates the auth store on mount', async () => {
    render(
      <Providers>
        <p>Child</p>
      </Providers>,
    );
    // After effects run, hydrate is called and content appears.
    expect(await screen.findByText('Child')).toBeInTheDocument();
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it('renders children once mounted (inside the QueryClientProvider)', async () => {
    render(
      <Providers>
        <p>Inside providers</p>
      </Providers>,
    );
    expect(await screen.findByText('Inside providers')).toBeInTheDocument();
  });
});
