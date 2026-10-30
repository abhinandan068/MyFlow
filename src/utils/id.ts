/**
 * Utility for generating unique IDs.
 * Uses a combination of timestamp + random to avoid collisions.
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${timestamp}_${random}`;
}
