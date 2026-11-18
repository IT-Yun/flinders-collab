const BOARD_LAST_SEEN_PREFIX = 'board-last-seen';

function buildBoardLastSeenKey(userId) {
  return `${BOARD_LAST_SEEN_PREFIX}:${userId}`;
}

export function readBoardLastSeen(userId) {
  if (!userId || typeof window === 'undefined') return 0;

  const rawValue = window.localStorage.getItem(buildBoardLastSeenKey(userId));
  const timestamp = Number(rawValue);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function writeBoardLastSeen(userId, timestamp) {
  if (!userId || typeof window === 'undefined') return;

  const safeTimestamp = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
  window.localStorage.setItem(buildBoardLastSeenKey(userId), String(safeTimestamp));
  window.dispatchEvent(new CustomEvent('board-notifications-read', {
    detail: { userId, timestamp: safeTimestamp },
  }));
}

export function getLatestBoardTimestamp(posts = []) {
  return posts.reduce((latest, post) => {
    const createdAt = new Date(post?.created_at).getTime();
    return Number.isFinite(createdAt) && createdAt > latest ? createdAt : latest;
  }, 0);
}
