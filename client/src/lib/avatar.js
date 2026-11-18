/**
 * Supabase Storage image transform helper.
 * Pro plan enables on-the-fly resizing via /render/image/ endpoint.
 *
 * Converts:
 *   .../storage/v1/object/public/avatars/...
 * To:
 *   .../storage/v1/render/image/public/avatars/...?width=W&height=H
 */

const DEFAULT_SIZE = 200;

export function optimizedAvatarUrl(url, size = DEFAULT_SIZE) {
  if (!url || typeof url !== 'string') return url;

  try {
    const parsed = new URL(url, window.location.origin);
    if (!parsed.pathname.includes('/storage/v1/object/public/')) {
      return parsed.toString();
    }

    parsed.pathname = parsed.pathname.replace(
      '/storage/v1/object/public/',
      '/storage/v1/render/image/public/',
    );
    parsed.searchParams.set('width', String(size));
    parsed.searchParams.set('height', String(size));
    parsed.searchParams.set('resize', 'cover');
    return parsed.toString();
  } catch {
    if (!url.includes('/storage/v1/object/public/')) return url;

    const transformed = url.replace(
      '/storage/v1/object/public/',
      '/storage/v1/render/image/public/',
    );

    const separator = transformed.includes('?') ? '&' : '?';
    return `${transformed}${separator}width=${size}&height=${size}&resize=cover`;
  }
}

/**
 * Small thumbnail (for bubble avatars, list items)
 */
export function avatarThumb(url) {
  return optimizedAvatarUrl(url, 96);
}

/**
 * Medium size (for profile cards, dialogs)
 */
export function avatarMedium(url) {
  return optimizedAvatarUrl(url, 200);
}

/**
 * Large size (for profile page hero)
 */
export function avatarLarge(url) {
  return optimizedAvatarUrl(url, 400);
}
