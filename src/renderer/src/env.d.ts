/// <reference types="vite/client" />
import type { DecaApi } from '../../preload';

declare global {
  interface Window {
    /** Native bridge; undefined when the renderer runs outside Electron (tests, plain browser). */
    deca?: DecaApi;
  }
}

export {};
