const BINDING_PACKAGE = 'desktop';
const BINDING_STRUCT = 'API';

type BoundMethod = (...args: readonly unknown[]) => Promise<unknown>;

type BoundStruct = Record<string, BoundMethod>;

type WailsBindings = Record<string, Record<string, BoundStruct>>;

type WailsEnvironment = { readonly platform: string };

type WailsRuntime = {
  OnFileDrop(handler: (x: number, y: number, paths: string[]) => void, useDropTarget: boolean): void;
  OnFileDropOff(): void;
  Environment(): Promise<WailsEnvironment>;
  WindowMinimise(): void;
  WindowToggleMaximise(): void;
  WindowIsMaximised(): Promise<boolean>;
  Quit(): void;
};

type WailsWindow = typeof globalThis & { go?: WailsBindings; runtime?: WailsRuntime };

export const isDesktopRuntime = (): boolean => (globalThis as WailsWindow).go?.[BINDING_PACKAGE]?.[BINDING_STRUCT] !== undefined;

export const desktopBinding = (method: string): BoundMethod | undefined => (globalThis as WailsWindow).go?.[BINDING_PACKAGE]?.[BINDING_STRUCT]?.[method];

export const desktopBindingName = (method: string): string => `${BINDING_PACKAGE}.${BINDING_STRUCT}.${method}`;

export const desktopRuntimeApi = (): WailsRuntime | undefined => (globalThis as WailsWindow).runtime;
