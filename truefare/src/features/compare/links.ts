import type { Platform } from '../catalog/types';

/** Hand-off deep links: land the user on the platform's search for this restaurant. */
export function deepLinkFor(platform: Platform, restaurantName: string): string {
  const q = encodeURIComponent(restaurantName);
  switch (platform) {
    case 'doordash':
      return `https://www.doordash.com/search/store/${q}`;
    case 'ubereats':
      return `https://www.ubereats.com/search?q=${q}`;
    case 'grubhub':
      return `https://www.grubhub.com/search?queryText=${q}`;
    case 'postmates':
      return `https://postmates.com/search?q=${q}`;
  }
}
