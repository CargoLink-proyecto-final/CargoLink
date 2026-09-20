import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FlowConfigService } from './flow-config.service';
import { DEFAULT_FLOW, FlowConfig } from './flow-config';

describe('FlowConfigService', () => {
  let filePath: string;
  let service: FlowConfigService;

  beforeEach(() => {
    filePath = join(tmpdir(), `flow-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const config = { get: () => filePath } as unknown as ConfigService;
    service = new FlowConfigService(config);
  });

  afterEach(async () => {
    await fs.unlink(filePath).catch(() => undefined);
  });

  it('returns the default flow when no file exists yet', async () => {
    const flow = await service.get();
    expect(flow.steps.length).toBe(DEFAULT_FLOW.steps.length);
  });

  it('persists a saved flow and reads it back', async () => {
    const custom: FlowConfig = {
      ...DEFAULT_FLOW,
      greeting: 'Hola custom',
      steps: [DEFAULT_FLOW.steps[0]],
    };
    await service.save(custom);
    const read = await service.get();
    expect(read.greeting).toBe('Hola custom');
    expect(read.steps).toHaveLength(1);
  });

  it('rejects a flow with no steps', async () => {
    await expect(
      service.save({ ...DEFAULT_FLOW, steps: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate step fields', async () => {
    const dup = { ...DEFAULT_FLOW, steps: [DEFAULT_FLOW.steps[0], DEFAULT_FLOW.steps[0]] };
    await expect(service.save(dup)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an enum step without options', async () => {
    const bad = {
      ...DEFAULT_FLOW,
      steps: [{ id: 'x', field: 'x', label: 'X', question: '¿?', required: true, type: 'enum' as const }],
    };
    await expect(service.save(bad)).rejects.toBeInstanceOf(BadRequestException);
  });
});
