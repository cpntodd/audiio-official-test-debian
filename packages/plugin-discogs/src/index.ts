/**
 * @audiio/plugin-discogs
 *
 * Discogs API integration for artist timeline and discography.
 * Provides chronological release data for the Timeline section.
 */

import { DiscogsProvider } from './DiscogsProvider';

// Export the provider as default for plugin loading
export default DiscogsProvider;

// Also export named for flexibility
export { DiscogsProvider };
export * from './types';
