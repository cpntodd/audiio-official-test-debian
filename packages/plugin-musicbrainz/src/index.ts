/**
 * @audiio/plugin-musicbrainz
 *
 * MusicBrainz metadata provider for Audiio.
 * Provides MBIDs, genres, and tags from the audiio-musicbrainz API server.
 */

import { MusicBrainzProvider } from './MusicBrainzProvider';

// Export the provider as default for plugin loading
export default MusicBrainzProvider;

// Also export named for flexibility
export { MusicBrainzProvider };
export * from './types';
