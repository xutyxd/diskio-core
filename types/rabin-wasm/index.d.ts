declare module "rabin-wasm" {
    /**
     * Rabin fingerprinting for chunking (WASM accelerated).
     */
    export default class Rabin {
      constructor(asModule: unknown, bits?: number, min?: number, max?: number, windowSize?: number, polynomial?: number);
  
      /**
       * Fingerprint a buffer and return chunk boundaries.
       */
      fingerprint(data: Uint8Array): number[];
    }

    export function create(avg?: number, min?: number, max?: number, windowSize?: number, polynomial?: number): Promise<Rabin>;
  }