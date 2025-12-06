declare module "rabin-wasm" {
    /**
     * Rabin fingerprinting for chunking (WASM accelerated).
     */
    export default class Rabin {
      constructor(asModule: unknown, bits?: number, min?: number, max?: number, windowSize?: number, polynomial?: number | bigint);
  
      /**
       * Fingerprint a buffer and return chunk boundaries.
       */
      fingerprint(data: Uint8Array): Int32Array[];
    }

    export function create(bits?: number, min?: number, max?: number, windowSize?: number, polynomial?: number | bigint): Promise<Rabin>;
  }