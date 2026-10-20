import { type Mock, vi } from 'vitest';

export type DesktopRuntimeStub = {
  readonly Environment: Mock<() => Promise<{ platform: string }>>;
  readonly WindowMinimise: Mock<() => void>;
  readonly WindowToggleMaximise: Mock<() => void>;
  readonly WindowIsMaximised: Mock<() => Promise<boolean>>;
  readonly Quit: Mock<() => void>;
};

export const stubDesktopRuntime = (platform: string): DesktopRuntimeStub => {
  const runtime: DesktopRuntimeStub = {
    Environment: vi.fn(async () => ({ platform })),
    WindowMinimise: vi.fn(),
    WindowToggleMaximise: vi.fn(),
    WindowIsMaximised: vi.fn(async () => false),
    Quit: vi.fn(),
  };

  vi.stubGlobal('runtime', runtime);

  return runtime;
};
