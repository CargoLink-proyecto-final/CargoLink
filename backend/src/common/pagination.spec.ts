import { MAX_PAGE_SIZE, parsePagination } from './pagination';

describe('parsePagination', () => {
  it('uses the defaults when nothing is sent', () => {
    expect(parsePagination(undefined, undefined)).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('accepts numeric strings from the query string', () => {
    expect(parsePagination('3', '10')).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it('caps the page size so a single request cannot dump a whole table', () => {
    expect(parsePagination(1, 1_000_000).limit).toBe(MAX_PAGE_SIZE);
  });

  it('honours a custom max', () => {
    expect(parsePagination(1, 500, 50, 200).limit).toBe(200);
  });

  it('falls back to defaults on invalid values', () => {
    expect(parsePagination(-2, 'abc', 50)).toEqual({ page: 1, limit: 50, skip: 0 });
    expect(parsePagination(0, 0)).toEqual({ page: 1, limit: 20, skip: 0 });
  });
});
