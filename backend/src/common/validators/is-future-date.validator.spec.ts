import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsFutureDate } from './is-future-date.validator';

class FutureDateFixture {
  @IsFutureDate({ message: 'no puede ser una fecha pasada' })
  date?: string;
}

function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('IsFutureDate', () => {
  it('accepts a future date', async () => {
    const errors = await validate(plainToInstance(FutureDateFixture, { date: daysFromToday(30) }));
    expect(errors).toHaveLength(0);
  });

  it('accepts today', async () => {
    const errors = await validate(plainToInstance(FutureDateFixture, { date: daysFromToday(0) }));
    expect(errors).toHaveLength(0);
  });

  it('rejects a past date', async () => {
    const errors = await validate(plainToInstance(FutureDateFixture, { date: daysFromToday(-1) }));
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isFutureDate', 'no puede ser una fecha pasada');
  });

  it('rejects a value that is not a parseable date', async () => {
    const errors = await validate(plainToInstance(FutureDateFixture, { date: 'no-es-una-fecha' }));
    expect(errors).toHaveLength(1);
  });
});
