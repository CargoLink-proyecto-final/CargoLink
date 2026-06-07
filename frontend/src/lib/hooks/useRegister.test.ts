/**
 * Tests for src/lib/hooks/useRegister.ts
 *
 * `toParams` is not exported, so we exercise it indirectly through the two
 * public entry points: the `useRegister` query hook and the `exportRegister`
 * download helper. We mock `@/lib/api` to capture the params handed to the API.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRegister, exportRegister } from './useRegister';
import { loadsApi } from '@/lib/api';
import type { RegisterFilters } from '@/types/register';

jest.mock('@/lib/api', () => ({
  loadsApi: {
    getRegister: jest.fn(),
    exportRegister: jest.fn(),
  },
}));

const mockedGetRegister = loadsApi.getRegister as jest.Mock;
const mockedExportRegister = loadsApi.exportRegister as jest.Mock;

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetRegister.mockResolvedValue({ data: { items: [], total: 0 } });
  mockedExportRegister.mockResolvedValue({ data: new Uint8Array([1, 2, 3]) });
});

describe('useRegister', () => {
  it('calls getRegister with page/limit and only-truthy filters', async () => {
    const filters: RegisterFilters = {
      statuses: ['DELIVERED', 'CANCELLED'],
      from: '2026-01-01',
      to: '2026-02-01',
      participant: 'u1',
      q: 'search',
    };

    renderHook(() => useRegister(filters, 2, 50), { wrapper: createWrapper() });

    await waitFor(() => expect(mockedGetRegister).toHaveBeenCalled());

    expect(mockedGetRegister).toHaveBeenCalledWith({
      page: 2,
      limit: 50,
      statuses: 'DELIVERED,CANCELLED',
      from: '2026-01-01',
      to: '2026-02-01',
      participant: 'u1',
      q: 'search',
    });
  });

  it('omits empty/falsy filters and defaults limit to 20', async () => {
    const filters: RegisterFilters = { statuses: [], q: '' };

    renderHook(() => useRegister(filters, 1), { wrapper: createWrapper() });

    await waitFor(() => expect(mockedGetRegister).toHaveBeenCalled());

    expect(mockedGetRegister).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('joins multiple statuses with a comma', async () => {
    const filters: RegisterFilters = { statuses: ['CANCELLED'] };

    renderHook(() => useRegister(filters, 1, 10), { wrapper: createWrapper() });

    await waitFor(() => expect(mockedGetRegister).toHaveBeenCalled());

    expect(mockedGetRegister).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      statuses: 'CANCELLED',
    });
  });

  it('unwraps response.data into the query result', async () => {
    mockedGetRegister.mockResolvedValue({
      data: { items: [{ id: 'x' }], total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    const { result } = renderHook(() => useRegister({}, 1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      items: [{ id: 'x' }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });
});

describe('exportRegister', () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let anchor: { href: string; download: string; click: jest.Mock };
  let createElementSpy: jest.SpyInstance;
  let appendChildSpy: jest.SpyInstance;
  let removeChildSpy: jest.SpyInstance;

  beforeEach(() => {
    createObjectURL = jest.fn(() => 'blob:fake-url');
    revokeObjectURL = jest.fn();
    // jsdom does not implement these.
    (URL as any).createObjectURL = createObjectURL;
    (URL as any).revokeObjectURL = revokeObjectURL;

    anchor = { href: '', download: '', click: jest.fn() };
    createElementSpy = jest
      .spyOn(document, 'createElement')
      .mockReturnValue(anchor as unknown as HTMLAnchorElement);
    appendChildSpy = jest
      .spyOn(document.body, 'appendChild')
      .mockImplementation((node) => node as Node);
    removeChildSpy = jest
      .spyOn(document.body, 'removeChild')
      .mockImplementation((node) => node as Node);
  });

  afterEach(() => {
    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it('calls exportRegister with toParams(filters, 1, 1)', async () => {
    const filters: RegisterFilters = { q: 'abc', participant: 'p9' };
    await exportRegister(filters);

    expect(mockedExportRegister).toHaveBeenCalledWith({
      page: 1,
      limit: 1,
      q: 'abc',
      participant: 'p9',
    });
  });

  it('triggers a zip download named registro-cargas-<date>.zip', async () => {
    const today = new Date().toISOString().slice(0, 10);

    await exportRegister({});

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    // It built a Blob with the zip mime type.
    const blobArg = createObjectURL.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe('application/zip');

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(anchor.href).toBe('blob:fake-url');
    expect(anchor.download).toBe(`registro-cargas-${today}.zip`);
    expect(anchor.click).toHaveBeenCalledTimes(1);

    // Anchor was attached and detached, and the object URL revoked.
    expect(appendChildSpy).toHaveBeenCalledWith(anchor);
    expect(removeChildSpy).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });
});
