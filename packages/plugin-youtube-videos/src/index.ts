/**
 * @audiio/plugin-youtube-videos
 *
 * YouTube Data API integration for artist music videos.
 * Provides official music videos for the Music Videos section.
 */

import { YouTubeVideosProvider } from './YouTubeVideosProvider';

// Export the provider as default for plugin loading
export default YouTubeVideosProvider;

// Also export named for flexibility
export { YouTubeVideosProvider };
export * from './types';
