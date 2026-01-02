/**
 * @audiio/ml-core/node
 *
 * Node.js-specific exports for ml-core.
 * This module contains code that requires Node.js built-in modules (fs, path)
 * or WASM modules that require Node.js environment.
 *
 * Usage:
 * ```typescript
 * import { NodeStorage, EssentiaProvider, FingerprintProvider } from '@audiio/ml-core/node';
 *
 * const storage = new NodeStorage('/path/to/storage');
 * const essentia = new EssentiaProvider();
 * await essentia.initialize();
 * ```
 */

// Storage
export { NodeStorage, createNodeStorage, type StorageAdapter } from './storage/node-storage';

// Node.js-only providers (require WASM or Node.js fs)
export { EssentiaProvider } from './providers/essentia-provider';
export { FingerprintProvider } from './providers/fingerprint-provider';
