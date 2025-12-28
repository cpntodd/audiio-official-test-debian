/**
 * @audiio/ml-core/node
 *
 * Node.js-specific exports for ml-core.
 * This module contains code that requires Node.js built-in modules (fs, path).
 *
 * Usage:
 * ```typescript
 * import { NodeStorage, createNodeStorage } from '@audiio/ml-core/node';
 *
 * const storage = new NodeStorage('/path/to/storage');
 * // or
 * const storage = createNodeStorage('/path/to/storage');
 * ```
 */

export { NodeStorage, createNodeStorage, type StorageAdapter } from './storage/node-storage';
