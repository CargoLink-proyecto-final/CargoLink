import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './http-exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => jest.restoreAllMocks());

  it('handles an HttpException with a string response', () => {
    const ex = new HttpException('Not allowed', HttpStatus.FORBIDDEN);

    filter.catch(ex, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Not allowed',
      }),
    );
    expect(json.mock.calls[0][0].timestamp).toEqual(expect.any(String));
  });

  it('handles an HttpException with an object response and extracts extra fields', () => {
    const ex = new HttpException(
      { statusCode: 400, message: ['field is required'], error: 'Bad Request', code: 'X1' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(ex, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const body = json.mock.calls[0][0];
    expect(body.message).toEqual(['field is required']);
    // statusCode and message are stripped from the rest; error + code survive.
    expect(body.error).toBe('Bad Request');
    expect(body.code).toBe('X1');
    expect(body.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });

  it('falls back to exception.message when object response has no message field', () => {
    const ex = new HttpException({ error: 'Teapot' }, HttpStatus.I_AM_A_TEAPOT);

    filter.catch(ex, host);

    const body = json.mock.calls[0][0];
    // exception.message defaults to the JSON string of the response object.
    expect(body.message).toBeDefined();
    expect(body.error).toBe('Teapot');
  });

  it('handles a BadRequestException from validation (array message)', () => {
    const ex = new BadRequestException(['email must be an email']);

    filter.catch(ex, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json.mock.calls[0][0].message).toEqual(['email must be an email']);
  });

  it('handles a generic Error as a 500 and logs the stack', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const ex = new Error('boom');

    filter.catch(ex, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'boom',
      }),
    );
    expect(errSpy).toHaveBeenCalledWith('Unhandled exception:', ex.stack);
  });

  it('handles an unknown non-Error throwable as a generic 500', () => {
    filter.catch('just a string', host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error interno del servidor',
      }),
    );
  });
});
