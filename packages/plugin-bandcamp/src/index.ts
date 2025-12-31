/**
 * @audiio/plugin-bandcamp
 *
 * Bandcamp integration for merchandise detection.
 * Automatically finds artist Bandcamp pages and merch links.
 */

import { BandcampProvider } from './BandcampProvider';

// Export the provider as default for plugin loading
export default BandcampProvider;

// Also export named for flexibility
export { BandcampProvider };
export * from './types';
