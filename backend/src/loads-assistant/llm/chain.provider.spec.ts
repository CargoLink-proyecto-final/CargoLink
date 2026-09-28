import { ServiceUnavailableException } from '@nestjs/common';
import { ChainLlmProvider } from './chain.provider';
import { LlmJsonRequest, LlmProvider } from './llm-provider';

describe('ChainLlmProvider', () => {
  const request: LlmJsonRequest = { system: 's', messages: [], schema: {} };

  const provider = (
    name: string,
    { configured = true, result }: { configured?: boolean; result?: string | Error } = {},
  ): LlmProvider => ({
    name,
    isConfigured: () => configured,
    generateJson: jest.fn().mockImplementation(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result ?? `{"from":"${name}"}`),
    ),
  });

  it('usa el primer proveedor configurado y no toca el resto', async () => {
    const backup = provider('groq');
    const chain = new ChainLlmProvider([provider('gemini'), backup]);

    await expect(chain.generateJson(request)).resolves.toBe('{"from":"gemini"}');
    expect(backup.generateJson).not.toHaveBeenCalled();
  });

  it('cae al respaldo cuando el primario falla', async () => {
    const chain = new ChainLlmProvider([
      provider('gemini', { result: new Error('429 quota exceeded') }),
      provider('groq'),
    ]);

    await expect(chain.generateJson(request)).resolves.toBe('{"from":"groq"}');
  });

  it('saltea los proveedores sin credenciales', async () => {
    const unconfigured = provider('gemini', { configured: false });
    const chain = new ChainLlmProvider([unconfigured, provider('groq')]);

    await expect(chain.generateJson(request)).resolves.toBe('{"from":"groq"}');
    expect(unconfigured.generateJson).not.toHaveBeenCalled();
  });

  it('propaga el último error cuando fallan todos', async () => {
    const chain = new ChainLlmProvider([
      provider('gemini', { result: new Error('timeout') }),
      provider('groq', { result: new Error('503') }),
    ]);

    await expect(chain.generateJson(request)).rejects.toThrow('503');
  });

  it('falla explícito si no hay ningún proveedor configurado', async () => {
    const chain = new ChainLlmProvider([provider('gemini', { configured: false })]);

    expect(chain.isConfigured()).toBe(false);
    expect(chain.activeProviders()).toEqual([]);
    await expect(chain.generateJson(request)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('reporta los proveedores activos en orden de preferencia', () => {
    const chain = new ChainLlmProvider([provider('gemini'), provider('groq')]);
    expect(chain.activeProviders()).toEqual(['gemini', 'groq']);
  });
});
