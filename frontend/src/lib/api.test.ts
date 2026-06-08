/**
 * Tests for src/lib/api.ts
 *
 * Strategy: mock `axios` so `axios.create` returns a fake instance whose
 * `interceptors.request.use` / `interceptors.response.use` capture the handlers.
 * Then we import the module and exercise the captured handlers directly, plus
 * spot-check that the exported API groups call the fake instance correctly.
 */

// The fake instance is built inside the (hoisted) mock factory, then read back
// out via the mocked axios.create return value once the module is imported.
jest.mock('axios', () => {
  const instance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };
  return {
    __esModule: true,
    default: {
      create: jest.fn(() => instance),
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
import axios from 'axios';
const fakeInstance = (axios.create as jest.Mock).mock.results[0]?.value
  ?? (axios.create as jest.Mock)();

// Import AFTER the mock so api.ts wires up the fake instance.
import api, {
  authApi,
  usersApi,
  loadsApi,
  tripsApi,
  messagesApi,
  ratingsApi,
  companiesApi,
  postulationsApi,
} from './api';

// Pull out the handlers captured at module-load time.
const requestHandler = fakeInstance.interceptors.request.use.mock.calls[0][0] as (
  config: any,
) => any;
const responseFulfilled = fakeInstance.interceptors.response.use.mock.calls[0][0] as (
  response: any,
) => any;
const responseRejected = fakeInstance.interceptors.response.use.mock.calls[0][1] as (
  error: any,
) => any;

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

describe('axios instance setup', () => {
  it('exports the instance created by axios.create', () => {
    expect(api).toBe(fakeInstance);
  });

  it('registers a request interceptor and a response interceptor', () => {
    // Captured at module-load time (the global beforeEach clearAllMocks resets
    // the call counters, so assert the handlers themselves were captured).
    expect(typeof requestHandler).toBe('function');
    expect(typeof responseFulfilled).toBe('function');
    expect(typeof responseRejected).toBe('function');
  });
});

describe('request interceptor', () => {
  it('adds an Authorization header when a token exists in sessionStorage', () => {
    sessionStorage.setItem('token', 'abc123');
    const config = { headers: {} as Record<string, string> };
    const out = requestHandler(config);
    expect(out.headers.Authorization).toBe('Bearer abc123');
  });

  it('omits the Authorization header when no token is present', () => {
    const config = { headers: {} as Record<string, string> };
    const out = requestHandler(config);
    expect(out.headers.Authorization).toBeUndefined();
  });

  it('returns the config object unchanged otherwise', () => {
    const config = { headers: {}, url: '/loads' };
    expect(requestHandler(config)).toBe(config);
  });
});

describe('response interceptor', () => {
  // NOTE on window.location: in this jsdom version `window.location` (and its
  // `href`) is a NON-configurable accessor, so it cannot be replaced or spied
  // via Object.defineProperty / jest.spyOn (every attempt throws
  // "Cannot redefine property: location"). Assigning `window.location.href`
  // does NOT throw — jsdom reports an un-implemented "navigation" to
  // console.error and leaves href unchanged at the origin. We therefore detect
  // the redirect through that navigation attempt (a console.error whose message
  // mentions navigation), plus the directly-observable sessionStorage clearing.
  let errorSpy: jest.SpyInstance;

  const navigationAttempted = () =>
    errorSpy.mock.calls.some((call) =>
      call.some(
        (arg) =>
          typeof (arg?.message ?? arg) === 'string' &&
          String(arg?.message ?? arg).includes('navigation'),
      ),
    );

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('passes successful responses through untouched', () => {
    const response = { data: { ok: true } };
    expect(responseFulfilled(response)).toBe(response);
  });

  it('on 401 for a non-/auth endpoint, clears session and redirects to /auth/login', async () => {
    sessionStorage.setItem('token', 'tok');
    sessionStorage.setItem('user', '{"id":"1"}');
    const error = { response: { status: 401 }, config: { url: '/loads/register' } };

    await expect(responseRejected(error)).rejects.toBe(error);

    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('user')).toBeNull();
    expect(navigationAttempted()).toBe(true);
  });

  it('does NOT redirect for a 401 on an /auth/ endpoint', async () => {
    sessionStorage.setItem('token', 'tok');
    sessionStorage.setItem('user', '{"id":"1"}');
    const error = { response: { status: 401 }, config: { url: '/auth/login' } };

    await expect(responseRejected(error)).rejects.toBe(error);

    // Session untouched, no redirect.
    expect(sessionStorage.getItem('token')).toBe('tok');
    expect(sessionStorage.getItem('user')).toBe('{"id":"1"}');
    expect(navigationAttempted()).toBe(false);
  });

  it('does NOT redirect for a non-401 status', async () => {
    sessionStorage.setItem('token', 'tok');
    const error = { response: { status: 500 }, config: { url: '/loads' } };

    await expect(responseRejected(error)).rejects.toBe(error);

    expect(sessionStorage.getItem('token')).toBe('tok');
    expect(navigationAttempted()).toBe(false);
  });

  it('does NOT redirect when there is no response (network error)', async () => {
    sessionStorage.setItem('token', 'tok');
    const error = { config: { url: '/loads' } };

    await expect(responseRejected(error)).rejects.toBe(error);

    expect(sessionStorage.getItem('token')).toBe('tok');
    expect(navigationAttempted()).toBe(false);
  });

  it('tolerates a missing config (defaults requestUrl to empty string) and redirects on 401', async () => {
    sessionStorage.setItem('token', 'tok');
    const error = { response: { status: 401 } };
    // No config.url -> isAuthEndpoint false -> redirect branch taken.
    await expect(responseRejected(error)).rejects.toBe(error);
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(navigationAttempted()).toBe(true);
  });
});

describe('exported API groups', () => {
  // authApi
  it('authApi.login posts to /auth/login with credentials', () => {
    const data = { email: 'a@b.com', password: 'pw' };
    authApi.login(data);
    expect(fakeInstance.post).toHaveBeenCalledWith('/auth/login', data);
  });

  it('authApi.verifyEmail gets the URL-encoded token endpoint', () => {
    authApi.verifyEmail('a b/c');
    expect(fakeInstance.get).toHaveBeenCalledWith('/auth/verify-email/a%20b%2Fc');
  });

  it('authApi.forgotPassword posts the email wrapped in an object', () => {
    authApi.forgotPassword('x@y.com');
    expect(fakeInstance.post).toHaveBeenCalledWith('/auth/forgot-password', {
      email: 'x@y.com',
    });
  });

  // usersApi
  it('usersApi.getProfile gets /users/me', () => {
    usersApi.getProfile();
    expect(fakeInstance.get).toHaveBeenCalledWith('/users/me');
  });

  it('usersApi.deactivateUser patches /users/:id/deactivate', () => {
    usersApi.deactivateUser('u1');
    expect(fakeInstance.patch).toHaveBeenCalledWith('/users/u1/deactivate');
  });

  it('usersApi.reactivateUser patches /users/:id/reactivate', () => {
    usersApi.reactivateUser('u1');
    expect(fakeInstance.patch).toHaveBeenCalledWith('/users/u1/reactivate');
  });

  it('usersApi.changeUserRole patches /users/:id/role with the role', () => {
    usersApi.changeUserRole('u1', 'TRANSPORTER');
    expect(fakeInstance.patch).toHaveBeenCalledWith('/users/u1/role', { role: 'TRANSPORTER' });
  });

  it('usersApi.changeUserEmail patches /users/:id/email with the email', () => {
    usersApi.changeUserEmail('u1', 'new@x.com');
    expect(fakeInstance.patch).toHaveBeenCalledWith('/users/u1/email', { email: 'new@x.com' });
  });

  // loadsApi
  it('loadsApi.getAll passes params', () => {
    loadsApi.getAll({ status: 'PUBLISHED' });
    expect(fakeInstance.get).toHaveBeenCalledWith('/loads', {
      params: { status: 'PUBLISHED' },
    });
  });

  it('loadsApi.cancel deletes /loads/:id', () => {
    loadsApi.cancel('l1');
    expect(fakeInstance.delete).toHaveBeenCalledWith('/loads/l1');
  });

  it('loadsApi.exportRegister requests a blob response', () => {
    loadsApi.exportRegister({ q: 'foo' });
    expect(fakeInstance.get).toHaveBeenCalledWith('/loads/register/export', {
      params: { q: 'foo' },
      responseType: 'blob',
    });
  });

  // tripsApi
  it('tripsApi.complete sends {} when no data is provided', () => {
    tripsApi.complete('t1');
    expect(fakeInstance.patch).toHaveBeenCalledWith('/trips/t1/complete', {});
  });

  it('tripsApi.complete forwards the data payload when provided', () => {
    tripsApi.complete('t1', { fuelLiters: 42 });
    expect(fakeInstance.patch).toHaveBeenCalledWith('/trips/t1/complete', {
      fuelLiters: 42,
    });
  });

  it('tripsApi.accept posts to /trips/accept/:loadId', () => {
    tripsApi.accept('load9');
    expect(fakeInstance.post).toHaveBeenCalledWith('/trips/accept/load9');
  });

  it('tripsApi.updateLocation patches the location endpoint with coords', () => {
    tripsApi.updateLocation('t2', { lat: 1, lng: 2 });
    expect(fakeInstance.patch).toHaveBeenCalledWith('/trips/t2/location', {
      lat: 1,
      lng: 2,
    });
  });

  // messagesApi
  it('messagesApi.send posts the content to the trip message endpoint', () => {
    messagesApi.send('t3', 'hello');
    expect(fakeInstance.post).toHaveBeenCalledWith('/messages/trip/t3', {
      content: 'hello',
    });
  });

  it('messagesApi.markAsRead patches the read endpoint', () => {
    messagesApi.markAsRead('t3');
    expect(fakeInstance.patch).toHaveBeenCalledWith('/messages/trip/t3/read');
  });

  // ratingsApi
  it('ratingsApi.create posts the rating payload', () => {
    const data = { tripId: 't4', score: 5, comment: 'great' };
    ratingsApi.create(data);
    expect(fakeInstance.post).toHaveBeenCalledWith('/ratings', data);
  });

  // companiesApi
  it('companiesApi.requestToJoin posts the companyId', () => {
    companiesApi.requestToJoin('c1');
    expect(fakeInstance.post).toHaveBeenCalledWith('/companies/join-requests', {
      companyId: 'c1',
    });
  });

  it('companiesApi.decideRequest patches the decision', () => {
    companiesApi.decideRequest('r1', 'APPROVE');
    expect(fakeInstance.patch).toHaveBeenCalledWith('/companies/me/requests/r1', {
      decision: 'APPROVE',
    });
  });

  // postulationsApi
  it('postulationsApi.counterOffer posts the price', () => {
    postulationsApi.counterOffer('p1', 1500);
    expect(fakeInstance.post).toHaveBeenCalledWith(
      '/postulations/p1/counter-offer',
      { price: 1500 },
    );
  });

  it('postulationsApi.create posts to the load postulations endpoint', () => {
    postulationsApi.create('l5', { message: 'hi', proposedPrice: 100 });
    expect(fakeInstance.post).toHaveBeenCalledWith('/loads/l5/postulations', {
      message: 'hi',
      proposedPrice: 100,
    });
  });

  it('postulationsApi.withdraw deletes /postulations/:id', () => {
    postulationsApi.withdraw('p2');
    expect(fakeInstance.delete).toHaveBeenCalledWith('/postulations/p2');
  });
});
