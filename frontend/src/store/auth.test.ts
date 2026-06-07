import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from './auth';

jest.mock('@/lib/queryClient', () => ({
  queryClient: { clear: jest.fn() },
}));

// --- JWT helpers -------------------------------------------------------------

function base64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Build a JWT-shaped string `header.payload.sig`. The signature is irrelevant
// because parseJwt only decodes the payload (the backend validates the sig).
function makeJwt(payload: Record<string, unknown>): string {
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.sig`;
}

const A_USER = {
  id: 'user-1',
  email: 'shipper@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: 'CARGO_GENERATOR',
} as const;

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600; // +1h
const PAST_EXP = Math.floor(Date.now() / 1000) - 3600; // -1h

function validTokenFor(user: typeof A_USER, exp = FUTURE_EXP): string {
  return makeJwt({ sub: user.id, role: user.role, exp });
}

// --- Test scaffolding --------------------------------------------------------

const initialState = useAuthStore.getState();

beforeEach(() => {
  sessionStorage.clear();
  (queryClient.clear as jest.Mock).mockClear();
  // Reset store state (keep the action references from the initial state).
  useAuthStore.setState(
    { user: null, token: null, isAuthenticated: false },
    false,
  );
  // Defensive: ensure actions are intact for getState() invocation.
  expect(typeof initialState.login).toBe('function');
});

// --- login -------------------------------------------------------------------

describe('login', () => {
  it('persists token and user to sessionStorage and sets state', () => {
    const token = validTokenFor(A_USER);
    useAuthStore.getState().login(A_USER, token);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(A_USER);
    expect(state.token).toBe(token);
    expect(state.isAuthenticated).toBe(true);

    expect(sessionStorage.getItem('token')).toBe(token);
    expect(JSON.parse(sessionStorage.getItem('user') as string)).toEqual(A_USER);
  });

  it('clears the query cache on login', () => {
    useAuthStore.getState().login(A_USER, validTokenFor(A_USER));
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
  });
});

// --- logout ------------------------------------------------------------------

describe('logout', () => {
  it('clears storage, state and the query cache', () => {
    useAuthStore.getState().login(A_USER, validTokenFor(A_USER));
    (queryClient.clear as jest.Mock).mockClear();

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);

    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('user')).toBeNull();
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
  });
});

// --- hydrate -----------------------------------------------------------------

describe('hydrate', () => {
  function seedStorage(token: string | null, userStr: string | null): void {
    if (token !== null) sessionStorage.setItem('token', token);
    if (userStr !== null) sessionStorage.setItem('user', userStr);
  }

  it('authenticates when token matches the stored user (happy path)', () => {
    const token = validTokenFor(A_USER);
    seedStorage(token, JSON.stringify(A_USER));

    useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(A_USER);
    expect(state.token).toBe(token);
    expect(state.isAuthenticated).toBe(true);
    // Valid session is preserved in storage.
    expect(sessionStorage.getItem('token')).toBe(token);
    expect(sessionStorage.getItem('user')).not.toBeNull();
  });

  it('rejects when there is no token', () => {
    seedStorage(null, JSON.stringify(A_USER));

    useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('rejects when there is no stored user', () => {
    seedStorage(validTokenFor(A_USER), null);

    useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('rejects and clears storage when the token is expired', () => {
    seedStorage(validTokenFor(A_USER, PAST_EXP), JSON.stringify(A_USER));

    useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('user')).toBeNull();
  });

  it('rejects and clears storage on sub mismatch', () => {
    const token = makeJwt({ sub: 'someone-else', role: A_USER.role, exp: FUTURE_EXP });
    seedStorage(token, JSON.stringify(A_USER));

    useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('user')).toBeNull();
  });

  it('rejects and clears storage on role mismatch', () => {
    const token = makeJwt({ sub: A_USER.id, role: 'TRANSPORTER', exp: FUTURE_EXP });
    seedStorage(token, JSON.stringify(A_USER));

    useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('user')).toBeNull();
  });

  it('rejects and clears storage when the stored user is not valid JSON', () => {
    seedStorage(validTokenFor(A_USER), '{not-json');

    useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('user')).toBeNull();
  });

  it('rejects and clears storage when the token is a malformed JWT', () => {
    // parseJwt returns null -> the `!claims` branch rejects.
    seedStorage('not-a-jwt', JSON.stringify(A_USER));

    useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('user')).toBeNull();
  });
});
