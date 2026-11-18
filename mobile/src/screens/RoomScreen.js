import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
  FlatList,
} from 'react-native';
import { getRoomById, getRoomMembers, leaveRoom } from '../services/rooms';

const COLORS = {
  primary: '#003366',
  light: '#E6F4FE',
  text: '#1a1a1a',
  muted: '#6b7280',
  white: '#ffffff',
  error: '#dc2626',
  errorBg: '#fef2f2',
  border: '#d1e8fb',
  background: '#f0f7ff',
  tabActive: '#003366',
  tabInactive: '#e2e8f0',
  tabTextActive: '#ffffff',
  tabTextInactive: '#6b7280',
  ownerBadgeBg: '#fef3c7',
  ownerBadgeText: '#92400e',
  memberBadgeBg: '#E6F4FE',
  memberBadgeText: '#003366',
};

const TABS = ['Chat', 'Files', 'Events', 'Members'];

// ─── Placeholder tab content ───────────────────────────────────────────────

function ChatTab({ roomId }) {
  return (
    <View style={styles.tabPlaceholder}>
      <Text style={styles.tabPlaceholderIcon}>💬</Text>
      <Text style={styles.tabPlaceholderTitle}>Chat coming soon</Text>
      <Text style={styles.tabPlaceholderSubtitle}>
        Real-time messaging will be available here. For now, use the web app to chat with your team.
      </Text>
    </View>
  );
}

function FilesTab({ roomId }) {
  return (
    <View style={styles.tabPlaceholder}>
      <Text style={styles.tabPlaceholderIcon}>📁</Text>
      <Text style={styles.tabPlaceholderTitle}>Files coming soon</Text>
      <Text style={styles.tabPlaceholderSubtitle}>
        File sharing and viewing will be available here. Upload files via the web app.
      </Text>
    </View>
  );
}

function EventsTab({ roomId }) {
  return (
    <View style={styles.tabPlaceholder}>
      <Text style={styles.tabPlaceholderIcon}>📅</Text>
      <Text style={styles.tabPlaceholderTitle}>Events coming soon</Text>
      <Text style={styles.tabPlaceholderSubtitle}>
        Schedule meetings and view upcoming events here. Manage events via the web app.
      </Text>
    </View>
  );
}

function MembersTab({ members, loading }) {
  if (loading) {
    return (
      <View style={styles.tabLoading}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.tabLoadingText}>Loading members...</Text>
      </View>
    );
  }

  if (!members.length) {
    return (
      <View style={styles.tabPlaceholder}>
        <Text style={styles.tabPlaceholderIcon}>👥</Text>
        <Text style={styles.tabPlaceholderTitle}>No members found</Text>
      </View>
    );
  }

  return (
    <View style={styles.membersList}>
      {members.map((member) => (
        <View key={member.id || member.membership_id} style={styles.memberRow}>
          {/* Avatar circle */}
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {(member.full_name || member.university_email || '?')[0].toUpperCase()}
            </Text>
          </View>
          {/* Info */}
          <View style={styles.memberInfo}>
            <Text style={styles.memberName} numberOfLines={1}>
              {member.full_name || member.university_email || 'Unknown'}
            </Text>
            {member.university_email ? (
              <Text style={styles.memberEmail} numberOfLines={1}>
                {member.university_email}
              </Text>
            ) : null}
          </View>
          {/* Role badge */}
          <View style={[
            styles.roleBadge,
            member.role === 'owner' ? styles.roleBadgeOwner : styles.roleBadgeMember,
          ]}>
            <Text style={[
              styles.roleBadgeText,
              member.role === 'owner' ? styles.roleBadgeTextOwner : styles.roleBadgeTextMember,
            ]}>
              {member.role === 'owner' ? '👑 Owner' : 'Member'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── RoomScreen ────────────────────────────────────────────────────────────

/**
 * RoomScreen — shows room details and tab-based content sections.
 * Receives roomId and optional roomName via route.params.
 */
export default function RoomScreen({ route, navigation }) {
  const { roomId, roomName } = route.params || {};
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [activeTab, setActiveTab] = useState('Chat');
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [error, setError] = useState('');
  const [leavingRoom, setLeavingRoom] = useState(false);

  // Fetch room details on mount
  const fetchRoom = useCallback(async () => {
    if (!roomId) {
      setError('Room ID is missing.');
      setLoading(false);
      return;
    }
    setError('');
    try {
      const data = await getRoomById(roomId);
      setRoom(data);
      // Set header title
      if (navigation && data?.name) {
        navigation.setOptions({ title: data.name });
      }
    } catch (err) {
      setError(err.message || 'Failed to load room.');
    } finally {
      setLoading(false);
    }
  }, [roomId, navigation]);

  React.useEffect(() => {
    fetchRoom();
    // Set preliminary title from params while loading
    if (navigation && roomName) {
      navigation.setOptions({ title: roomName });
    }
  }, [fetchRoom, navigation, roomName]);

  // Lazy-load members when Members tab is first opened
  const fetchMembers = useCallback(async () => {
    if (membersLoaded || !roomId) return;
    setMembersLoading(true);
    try {
      const data = await getRoomMembers(roomId);
      setMembers(Array.isArray(data) ? data : []);
      setMembersLoaded(true);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [roomId, membersLoaded]);

  const handleTabPress = useCallback((tab) => {
    setActiveTab(tab);
    if (tab === 'Members') {
      fetchMembers();
    }
  }, [fetchMembers]);

  const handleLeaveRoom = useCallback(() => {
    Alert.alert(
      'Leave Room',
      `Are you sure you want to leave "${room?.name || 'this room'}"? You can rejoin later with an invite code.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLeavingRoom(true);
            try {
              await leaveRoom(roomId);
              navigation.goBack();
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not leave room.');
            } finally {
              setLeavingRoom(false);
            }
          },
        },
      ]
    );
  }, [room, roomId, navigation]);

  // ── Render: Loading ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading room...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: Error ───────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={fetchRoom}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: Room ────────────────────────────────────────────────────────
  const courseLabel = room?.course_name || room?.course_code || '';
  const memberCount = Number(room?.member_count || 0);
  const isOwner = room?.my_role === 'owner';
  const inviteCode = room?.invite_code || '';

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Room header info */}
      <View style={styles.roomHeader}>
        <View style={styles.roomHeaderTop}>
          <View style={styles.roomHeaderInfo}>
            {courseLabel ? (
              <View style={styles.courseBadge}>
                <Text style={styles.courseBadgeText}>{courseLabel}</Text>
              </View>
            ) : null}
            <Text style={styles.roomTitle} numberOfLines={2}>
              {room?.name || roomName || 'Room'}
            </Text>
            {room?.description ? (
              <Text style={styles.roomDescription} numberOfLines={2}>
                {room.description}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.roomMeta}>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>
              👥 {memberCount} {memberCount === 1 ? 'member' : 'members'}
            </Text>
          </View>
          {inviteCode ? (
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>🔑 {inviteCode}</Text>
            </View>
          ) : null}
          {isOwner ? (
            <View style={[styles.metaPill, styles.metaPillOwner]}>
              <Text style={[styles.metaPillText, styles.metaPillTextOwner]}>👑 Owner</Text>
            </View>
          ) : null}
        </View>

        {/* Leave room button — only for non-owners */}
        {!isOwner && (
          <Pressable
            style={[styles.leaveButton, leavingRoom && styles.leaveButtonDisabled]}
            onPress={handleLeaveRoom}
            disabled={leavingRoom}
          >
            {leavingRoom ? (
              <ActivityIndicator size="small" color={COLORS.error} />
            ) : (
              <Text style={styles.leaveButtonText}>Leave Room</Text>
            )}
          </Pressable>
        )}
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
      >
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
            onPress={() => handleTabPress(tab)}
          >
            <Text style={[styles.tabButtonText, activeTab === tab && styles.tabButtonTextActive]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Tab content */}
      <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentInner}>
        {activeTab === 'Chat' && <ChatTab roomId={roomId} />}
        {activeTab === 'Files' && <FilesTab roomId={roomId} />}
        {activeTab === 'Events' && <EventsTab roomId={roomId} />}
        {activeTab === 'Members' && (
          <MembersTab members={members} loading={membersLoading} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.muted,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  errorMessage: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 14,
  },
  // Room header
  roomHeader: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  roomHeaderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  roomHeaderInfo: {
    flex: 1,
  },
  courseBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 6,
  },
  courseBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  roomTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    lineHeight: 26,
  },
  roomDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
    lineHeight: 18,
  },
  roomMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  metaPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaPillOwner: {
    backgroundColor: COLORS.ownerBadgeBg,
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
  },
  metaPillTextOwner: {
    color: COLORS.ownerBadgeText,
  },
  leaveButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  leaveButtonDisabled: {
    opacity: 0.6,
  },
  leaveButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },
  // Tab bar
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.tabInactive,
  },
  tabButtonActive: {
    backgroundColor: COLORS.tabActive,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.tabTextInactive,
  },
  tabButtonTextActive: {
    color: COLORS.tabTextActive,
    fontWeight: '600',
  },
  // Tab content
  tabContent: {
    flex: 1,
  },
  tabContentInner: {
    flexGrow: 1,
  },
  // Placeholder
  tabPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  tabPlaceholderIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  tabPlaceholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  tabPlaceholderSubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  tabLoading: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
    gap: 10,
  },
  tabLoadingText: {
    fontSize: 13,
    color: COLORS.muted,
  },
  // Members list
  membersList: {
    padding: 16,
    gap: 2,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  memberEmail: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  roleBadge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleBadgeOwner: {
    backgroundColor: COLORS.ownerBadgeBg,
  },
  roleBadgeMember: {
    backgroundColor: COLORS.memberBadgeBg,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  roleBadgeTextOwner: {
    color: COLORS.ownerBadgeText,
  },
  roleBadgeTextMember: {
    color: COLORS.memberBadgeText,
  },
});
