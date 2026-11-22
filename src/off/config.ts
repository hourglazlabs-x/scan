// Where the app reaches Open Food Facts, and how it introduces itself.

export const OFF_BASE_URL = 'https://world.openfoodfacts.org';

/**
 * Open Food Facts asks every app to send a User-Agent naming the app, its
 * version and a contact email, so they can reach the developer instead of
 * blocking the traffic.
 *
 * FOUNDER: put a real contact email in the brackets below before any build
 * reaches testers. `npm run check:release` fails until you do.
 */
export const USER_AGENT = 'MINDMODXScan/0.1.0 (CONTACT_EMAIL_PLACEHOLDER)';
