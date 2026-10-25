import { TestBed } from '@angular/core/testing';
import { inMemoryStorage } from '@rrd-analyzer/ui-shared/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from './settings.store';

const SETTINGS_STORAGE_KEY = 'rrd-analyzer.settings';

const freshStore = (): SettingsStore => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});

  return TestBed.inject(SettingsStore);
};

describe('SettingsStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', inMemoryStorage());
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills the area under a thumbnail and moves the crosshair across every chart until someone asks otherwise', () => {
    const store = TestBed.inject(SettingsStore);

    expect(store.thumbnailFill()).toBe(true);
    expect(store.synchronizedCrosshair()).toBe(true);
  });

  it('toggles each setting on its own and back', () => {
    const store = TestBed.inject(SettingsStore);

    store.toggleThumbnailFill();

    expect(store.thumbnailFill()).toBe(false);
    expect(store.synchronizedCrosshair()).toBe(true);

    store.toggleSynchronizedCrosshair();
    store.toggleThumbnailFill();

    expect(store.thumbnailFill()).toBe(true);
    expect(store.synchronizedCrosshair()).toBe(false);
  });

  it('gives each log type its own lane until someone asks for a single row, and remembers that', () => {
    const store = TestBed.inject(SettingsStore);

    expect(store.logLanes()).toBe(true);

    store.toggleLogLanes();

    expect(store.logLanes()).toBe(false);
    expect(freshStore().logLanes()).toBe(false);
  });

  it('remembers both settings for the next launch', () => {
    TestBed.inject(SettingsStore).toggleSynchronizedCrosshair();

    const relaunched = freshStore();

    expect(relaunched.synchronizedCrosshair()).toBe(false);
    expect(relaunched.thumbnailFill()).toBe(true);
  });

  it('falls back to the defaults for anything stored that is not a setting it knows', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ thumbnailFill: 'no', synchronizedCrosshair: false, other: true }));

    const store = freshStore();

    expect(store.thumbnailFill()).toBe(true);
    expect(store.synchronizedCrosshair()).toBe(false);

    localStorage.setItem(SETTINGS_STORAGE_KEY, '{not json');

    expect(freshStore().synchronizedCrosshair()).toBe(true);
  });

  it('falls back to the defaults when what is stored is valid JSON but not a set of settings', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '42');

    const store = freshStore();

    expect(store.thumbnailFill()).toBe(true);
    expect(store.synchronizedCrosshair()).toBe(true);
    expect(store.logLanes()).toBe(true);
  });

  it('keeps working when the browser refuses to store anything', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    const store = freshStore();

    store.toggleThumbnailFill();

    expect(store.thumbnailFill()).toBe(false);
  });
});
