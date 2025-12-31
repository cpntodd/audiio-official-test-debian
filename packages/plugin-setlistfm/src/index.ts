/**
 * @audiio/plugin-setlistfm
 *
 * Setlist.fm API integration for past concert setlists.
 * Provides setlist data for the Recent Setlists section.
 */

import { SetlistFmProvider } from './SetlistFmProvider';

// Export the provider as default for plugin loading
export default SetlistFmProvider;

// Also export named for flexibility
export { SetlistFmProvider };
export * from './types';
