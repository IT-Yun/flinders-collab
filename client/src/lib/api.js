const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

export function apiUrl(path) {
  if (!rawApiBaseUrl) {
    return path;
  }

  const normalizedBase = rawApiBaseUrl.endsWith('/')
    ? rawApiBaseUrl.slice(0, -1)
    : rawApiBaseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBase}${normalizedPath}`;
}

