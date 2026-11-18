import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Pressable,
  Modal,
  TextInput,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import RoomCard from '../components/RoomCard';
import { getUserRooms, createRoom, joinRoom } from '../services/rooms';

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
};

/**
 * Modal for creating a new room or joining one with an invite code.
 */
function RoomActionModal({ visible, onClose, onRoomCreated, onRoomJoined }) {
  const [mode, setMode] = useState('create'); // 'create' | 'join'
  const [name, setName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const reset = () => {
    setName('');
    setCourseName('');
    setDescription('');
    setInviteCode('');
    setErrorMsg('');
    setMode('create');
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setErrorMsg('Room name is required.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const room = await createRoom({
        name: name.trim(),
        course_name: courseName.trim() || undefined,
        description: description.trim() || undefined,
      });
      reset();
      onClose();
      onRoomCreated(room);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create room.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) {
      setErrorMsg('Invite code is required.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const result = await joinRoom(inviteCode.trim());
      reset();
      onClose();
      onRoomJoined(result.room || result);
    } catch (err) {
      if (err.status === 409 && err.room) {
        // Already a member — navigate to that room
        reset();
        onClose();
        onRoomJoined(err.room);
      } else {
        setErrorMsg(err.message || 'Failed to join room.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.modalOverlay} onPress={handleClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          {/* Tab selector */}
          <View style={styles.modalTabs}>
            <Pressable
              style={[styles.modalTab, mode === 'create' && styles.modalTabActive]}
              onPress={() => { setMode('create'); setErrorMsg(''); }}
            >
              <Text style={[styles.modalTabText, mode === 'create' && styles.modalTabTextActive]}>
                Create Room
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modalTab, mode === 'join' && styles.modalTabActive]}
              onPress={() => { setMode('join'); setErrorMsg(''); }}
            >
              <Text style={[styles.modalTabText, mode === 'join' && styles.modalTabTextActive]}>
                Join Room
              </Text>
            </Pressable>
          </View>

          {errorMsg ? (
            <Text style={styles.modalError}>{errorMsg}</Text>
          ) : null}

          {mode === 'create' ? (
            <View style={styles.modalForm}>
              <Text style={styles.inputLabel}>Room Name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. COMP3700 Study Group"
                placeholderTextColor={COLORS.muted}
                autoFocus
              />
              <Text style={styles.inputLabel}>Course Name</Text>
              <TextInput
                style={styles.input}
                value={courseName}
                onChangeText={setCourseName}
                placeholder="e.g. Software Engineering"
                placeholderTextColor={COLORS.muted}
              />
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="What's this room for?"
                placeholderTextColor={COLORS.muted}
                multiline
                numberOfLines={3}
              />
              <Pressable
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handleCreate}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>Create Room</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.modalForm}>
              <Text style={styles.inputLabel}>Invite Code *</Text>
              <TextInput
                style={[styles.input, styles.inputCode]}
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="e.g. ABCD12"
                placeholderTextColor={COLORS.muted}
                autoCapitalize="characters"
                autoFocus
                maxLength={10}
              />
              <Pressable
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handleJoin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>Join Room</Text>
                )}
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * DashboardScreen — lists the user's rooms with pull-to-refresh and a FAB
 * to create or join a room.
 */
export default function DashboardScreen({ navigation }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  const fetchRooms = useCallback(async () => {
    setError('');
    try {
      const data = await getUserRooms();
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load rooms.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load on mount
  React.useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRooms();
  }, [fetchRooms]);

  const handleRoomPress = useCallback((room) => {
    navigation.navigate('Room', { roomId: room.id, roomName: room.name });
  }, [navigation]);

  const handleRoomCreated = useCallback((room) => {
    setRooms((prev) => {
      const without = prev.filter((r) => r.id !== room.id);
      return [room, ...without];
    });
    if (room?.id) {
      navigation.navigate('Room', { roomId: room.id, roomName: room.name });
    }
  }, [navigation]);

  const handleRoomJoined = useCallback((room) => {
    if (!room) return;
    setRooms((prev) => {
      const without = prev.filter((r) => r.id !== room.id);
      return [room, ...without];
    });
    navigation.navigate('Room', { roomId: room.id, roomName: room.name });
  }, [navigation]);

  const renderItem = useCallback(({ item }) => (
    <RoomCard
      room={item}
      onPress={() => handleRoomPress(item)}
    />
  ), [handleRoomPress]);

  const keyExtractor = useCallback((item) => String(item.id), []);

  const ListEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🏠</Text>
      <Text style={styles.emptyTitle}>No rooms yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button to create a room or join one with an invite code.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Rooms</Text>
        <Text style={styles.headerSubtitle}>
          {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
        </Text>
      </View>

      {/* Error banner */}
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={fetchRooms} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Room list */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading your rooms...</Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={ListEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => setModalVisible(true)}
        accessibilityLabel="Create or join a room"
        accessibilityRole="button"
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>

      {/* Create / Join modal */}
      <RoomActionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onRoomCreated={handleRoomCreated}
        onRoomJoined={handleRoomJoined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  errorBanner: {
    backgroundColor: COLORS.errorBg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    flex: 1,
  },
  retryButton: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
  },
  retryText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: COLORS.muted,
    fontSize: 14,
    marginTop: 8,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fabPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  fabIcon: {
    fontSize: 28,
    color: COLORS.white,
    fontWeight: '300',
    lineHeight: 32,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
  },
  modalTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.light,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  modalTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalTabActive: {
    backgroundColor: COLORS.primary,
  },
  modalTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.muted,
  },
  modalTabTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  modalError: {
    color: COLORS.error,
    fontSize: 13,
    marginBottom: 12,
    backgroundColor: COLORS.errorBg,
    padding: 10,
    borderRadius: 8,
  },
  modalForm: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 2,
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  inputMultiline: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  inputCode: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
