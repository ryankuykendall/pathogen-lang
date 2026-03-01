// Anonymous user ID service
// Generates and persists a unique user ID in localStorage

import { generateNanoId } from '../utils/nano-id.js';

const STORAGE_KEY = 'svg-path-extended:userId';
const ID_LENGTH = 21;

// Validate ID format (21 chars, URL-safe)
function isValidId(id) {
  if (!id || typeof id !== 'string') return false;
  if (id.length !== ID_LENGTH) return false;
  return /^[0-9A-Za-z_~-]+$/.test(id);
}

// Get or create user ID
export function getUserId() {
  try {
    let userId = localStorage.getItem(STORAGE_KEY);

    if (!isValidId(userId)) {
      userId = generateNanoId();
      localStorage.setItem(STORAGE_KEY, userId);
    }

    return userId;
  } catch (e) {
    // localStorage may be unavailable (private browsing, etc.)
    // Generate an ephemeral ID for this session
    console.warn('localStorage unavailable, using ephemeral user ID');
    return generateNanoId();
  }
}

// Clear user ID (for testing/debugging)
export function clearUserId() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // Ignore errors
  }
}

// Check if user has a stored ID
export function hasUserId() {
  try {
    return isValidId(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    return false;
  }
}

export default {
  getUserId,
  clearUserId,
  hasUserId,
};
