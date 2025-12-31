/**
 * @audiio/plugin-bandsintown
 *
 * Bandsintown API integration for upcoming concerts.
 * Provides concert events for the Upcoming Shows section.
 */

import { BandsintownProvider } from './BandsintownProvider';

// Export the provider as default for plugin loading
export default BandsintownProvider;

// Also export named for flexibility
export { BandsintownProvider };
export * from './types';
