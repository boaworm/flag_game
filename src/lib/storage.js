/**
 * localStorage that never throws. It is unavailable in private windows and can
 * be blocked outright, and a kids' game must not break because of it.
 */

export function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing to do — the session simply will not be remembered.
  }
}
