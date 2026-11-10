import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const base = {
  email: 'new@example.com',
  password: 'secret1234',
  firstName: 'New',
  lastName: 'User',
  phone: '+5493510000000',
};

async function roleErrors(role: string) {
  const dto = plainToInstance(RegisterDto, { ...base, role });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'role');
}

describe('RegisterDto role', () => {
  it.each(['CARGO_GENERATOR', 'TRANSPORTER', 'COMPANY_ADMIN'])('accepts %s', async (role) => {
    expect(await roleErrors(role)).toHaveLength(0);
  });

  it('rejects ADMIN so nobody can grant themselves admin rights at sign-up', async () => {
    expect(await roleErrors('ADMIN')).toHaveLength(1);
  });
});
