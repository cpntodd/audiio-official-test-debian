/**
 * @audiio/plugin-fanart
 *
 * Fanart.tv integration for high-quality artist images.
 * Provides backgrounds, thumbnails, logos, and banners for artist gallery section.
 */

import { FanartProvider } from './FanartProvider';

// Export the provider as default for plugin loading
export default FanartProvider;

// Also export named for flexibility
export { FanartProvider };
export * from './types';
