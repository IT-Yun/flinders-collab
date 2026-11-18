export async function syncAppBadge(count) {
  if (typeof navigator === 'undefined') return;

  const normalizedCount = Math.max(0, Number(count || 0));

  try {
    if (normalizedCount > 0 && typeof navigator.setAppBadge === 'function') {
      await navigator.setAppBadge(normalizedCount);
      return;
    }

    if (normalizedCount === 0 && typeof navigator.clearAppBadge === 'function') {
      await navigator.clearAppBadge();
    }
  } catch {
    // Ignore unsupported badge API failures.
  }
}
