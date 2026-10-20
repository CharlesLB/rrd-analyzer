import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analysisDtoFixture, analyzerGatewayStub, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { LibraryRepository } from './library.repository';

const PICKED_SOURCE = { name: 'atlas_prod.rrd', path: '/sources/atlas_prod.rrd', size: 2048 };

describe('LibraryRepository', () => {
  let gateway: AnalyzerGateway;
  let repository: LibraryRepository;

  beforeEach(() => {
    gateway = analyzerGatewayStub({ pickSources: vi.fn().mockResolvedValue([PICKED_SOURCE]) });
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });
    repository = TestBed.inject(LibraryRepository);
  });

  it('maps a transport row, canvas included, onto the analysis model the store reads', async () => {
    const [analysis] = await repository.listAnalyses();

    expect(analysis).toEqual({ ...analysisDtoFixture(), canvas: [['system_cpu_user'], ['system_memory_used']] });
  });

  it('listAnalyses names each chart by its own label followed by the labels merged into it', async () => {
    gateway = analyzerGatewayStub({
      listAnalyses: vi.fn().mockResolvedValue([
        analysisDtoFixture({
          canvas: [
            { seriesId: 's3', label: 'system_cpu_user', merged: [{ seriesId: 's4', label: 'system_cpu_system', axis: 0 }] },
            { seriesId: 's5', label: 'system_memory_used', merged: [] },
          ],
        }),
      ]),
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });

    const [analysis] = await TestBed.inject(LibraryRepository).listAnalyses();

    expect(analysis?.canvas).toEqual([['system_cpu_user', 'system_cpu_system'], ['system_memory_used']]);
  });

  it('sends the picked sources to the transport as name, path and size', async () => {
    await repository.createAnalysis('Capacity', [{ name: 'a.rrd', path: '/a.rrd', size: 10 }]);

    expect(gateway.createAnalysis).toHaveBeenCalledWith('Capacity', [{ name: 'a.rrd', path: '/a.rrd', size: 10 }]);
  });

  it('maps a native pick back into pending sources', async () => {
    expect(await repository.pickSources()).toEqual([PICKED_SOURCE]);
  });

  it('deletes an analysis through the transport', async () => {
    await repository.deleteAnalysis('a1');

    expect(gateway.deleteAnalysis).toHaveBeenCalledWith('a1');
  });

  it('stops watching file drops without an unhandled rejection when the host could never start watching them', async () => {
    vi.mocked(gateway.watchFileDrop).mockImplementation(() => {
      throw new Error('the runtime is gone');
    });

    const stopWatching = repository.watchFileDrop(vi.fn());
    stopWatching();
    await new Promise((resolve) => setTimeout(resolve));

    expect(gateway.watchFileDrop).toHaveBeenCalledTimes(1);
  });

  it('reports whether the host can deliver dropped file paths', () => {
    expect(repository.usesNativeFileDrop).toBe(false);
  });
});
