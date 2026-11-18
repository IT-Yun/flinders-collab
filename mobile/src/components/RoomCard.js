import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

const COLORS = {
  primary: '#003366',
  light: '#E6F4FE',
  text: '#1a1a1a',
  muted: '#6b7280',
  white: '#ffffff',
  badge: '#003366',
  badgeText: '#ffffff',
  memberBg: '#E6F4FE',
  memberText: '#003366',
  border: '#d1e8fb',
  cardBg: '#ffffff',
};

/**
 * Format a date string to a relative time string (e.g. "2 days ago").
 * @param {string} dateString
 * @returns {string}
 */
function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * RoomCard component — displays a study room summary card.
 *
 * @param {{ room: Object, onPress: Function }} props
 * @param {Object} props.room - Room data: { id, name, course_name, course_code, member_count, created_at, description }
 * @param {Function} props.onPress - Called when the card is tapped
 */
export default function RoomCard({ room, onPress }) {
  const courseLabel = room.course_name || room.course_code || '';
  const memberCount = Number(room.member_count || 0);
  const lastActivity = formatRelativeTime(room.last_visited_at || room.created_at);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open room ${room.name}`}
    >
      {/* Top accent bar */}
      <View style={styles.accentBar} />

      <View style={styles.body}>
        {/* Header row: name + course badge */}
        <View style={styles.headerRow}>
          <Text style={styles.roomName} numberOfLines={1}>
            {room.name}
          </Text>
          {courseLabel ? (
            <View style={styles.courseBadge}>
              <Text style={styles.courseBadgeText} numberOfLines={1}>
                {courseLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Description */}
        {room.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {room.description}
          </Text>
        ) : null}

        {/* Footer: member count + last activity */}
        <View style={styles.footer}>
          <View style={styles.memberPill}>
            <Text style={styles.memberIcon}>👥</Text>
            <Text style={styles.memberText}>
              {memberCount} {memberCount === 1 ? 'Member' : 'Members'}
            </Text>
          </View>
          {lastActivity ? (
            <Text style={styles.lastActivity}>{lastActivity}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  accentBar: {
    height: 4,
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  body: {
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  roomName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
  },
  courseBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    maxWidth: 120,
  },
  courseBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.badgeText,
  },
  description: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 10,
    marginTop: 2,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  memberPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.memberBg,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  memberIcon: {
    fontSize: 12,
  },
  memberText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.memberText,
  },
  lastActivity: {
    fontSize: 11,
    color: COLORS.muted,
  },
});
