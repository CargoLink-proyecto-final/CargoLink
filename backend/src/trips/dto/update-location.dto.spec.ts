import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateLocationDto } from './update-location.dto';

const invalidFields = async (body: unknown) => {
  const errors = await validate(plainToInstance(UpdateLocationDto, body));
  return errors.map((e) => e.property);
};

describe('UpdateLocationDto', () => {
  it('accepts valid coordinates', async () => {
    expect(await invalidFields({ lat: -31.4223, lng: -64.34 })).toEqual([]);
  });

  it('accepts the coordinate limits', async () => {
    expect(await invalidFields({ lat: -90, lng: 180 })).toEqual([]);
    expect(await invalidFields({ lat: 90, lng: -180 })).toEqual([]);
  });

  it('rejects coordinates out of range', async () => {
    expect(await invalidFields({ lat: 91, lng: -181 })).toEqual(['lat', 'lng']);
  });

  it('rejects non-numeric values', async () => {
    expect(await invalidFields({ lat: 'abc', lng: null })).toEqual(['lat', 'lng']);
  });

  it('rejects numeric strings', async () => {
    expect(await invalidFields({ lat: '-34.6', lng: '-58.4' })).toEqual(['lat', 'lng']);
  });

  it('requires both fields', async () => {
    expect(await invalidFields({})).toEqual(['lat', 'lng']);
  });
});
