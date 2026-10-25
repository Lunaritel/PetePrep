/// <reference types="vite/client" />
import type { DecaApi } from '../../preload';

declare global {
  const __APP_VERSION__: string;
  const __WEB_BUILD__: boolean;
  interface Window {
    /** Native bridge; undefined when the renderer runs outside Electron (tests, plain browser). */
    deca?: DecaApi;
  }
}

export {};
