// app/(tabs)/index.tsx
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChatListItem } from '../../Components/chat/ChatListItem';
import { UserSearchModal } from '../../Components/common/UserSearchModal';
import { UserSettingsModal } from '../../Components/common/UserSettingsModal';
import { Avatar } from '../../Components/common/Avatar';
import { useAuth } from '../../Contexts/AuthContext';
import { api } from '../../utils/api';
import { Alert } from 'react-native';

interface Thread {
  id: string;
  type: string;
  otherUser?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    lastActiveAt?: string;
  };
  group?: {
    name: string;
    pictureUrl?: string;
    memberCount?: number;
  };
  lastMessage?: {
    body: string;
    timestamp: string;
    senderName?: string;
  } | null;
  lastMessageAt?: string;
  unreadCount?: number;
}

export default function Chats() {
  const router = useRouter();
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [messageModalVisible, setMessageModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredThreads, setFilteredThreads] = useState<Thread[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  useEffect(() => {
    loadThreads();
    loadPendingRequests();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = threads.filter((thread) => {
        const name = getThreadName(thread).toLowerCase();
        return name.includes(searchQuery.toLowerCase());
      });
      setFilteredThreads(filtered);
    } else {
      setFilteredThreads(threads);
    }
  }, [searchQuery, threads]);

  const loadThreads = async () => {
    try {
      setLoading(true);
      const response = await api.getThreads();
      // Filter to show only DIRECT threads (not groups) and only those with messages
      const directThreads = (response.threads || []).filter(
        (thread: Thread) => 
          thread.type === 'DIRECT' && 
          thread.lastMessage !== null && 
          thread.lastMessage !== undefined
      );
      setThreads(directThreads);
    } catch (error) {
      console.error('Failed to load threads:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadThreads();
    await loadPendingRequests();
    setRefreshing(false);
  };

  const loadPendingRequests = async () => {
    try {
      setLoadingRequests(true);
      const [pendingRes, sentRes] = await Promise.all([
        api.getPendingContactRequests(),
        api.getSentContactRequests(),
      ]);
      setPendingRequests(pendingRes.requests || []);
      setSentRequests(sentRes.requests || []);
    } catch (error: any) {
      console.error('Failed to load pending requests:', error);
      // Don't show error for rate limit - it's temporary
      if (error.response?.status !== 429) {
        // Only log non-rate-limit errors
      }
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await api.acceptContactRequest(requestId);
      Alert.alert('Success', 'Contact request accepted');
      await loadPendingRequests();
      await loadThreads();
    } catch (error: any) {
      console.error('Accept request error:', error);
      const errorMsg = error.response?.data?.error || 'Failed to accept request';
      Alert.alert('Error', errorMsg);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    Alert.alert(
      'Reject Request',
      'Are you sure you want to reject this contact request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.rejectContactRequest(requestId);
              Alert.alert('Success', 'Contact request rejected');
              await loadPendingRequests();
            } catch (error: any) {
              console.error('Reject request error:', error);
              const errorMsg = error.response?.data?.error || 'Failed to reject request';
              Alert.alert('Error', errorMsg);
            }
          },
        },
      ]
    );
  };

  const handleCancelSentRequest = async (requestId: string) => {
    Alert.alert(
      'Cancel Request',
      'Are you sure you want to cancel this contact request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.cancelContactRequest(requestId);
              Alert.alert('Success', 'Contact request cancelled');
              await loadPendingRequests();
            } catch (error: any) {
              console.error('Cancel request error:', error);
              const errorMsg = error.response?.data?.error || 'Failed to cancel request';
              Alert.alert('Error', errorMsg);
            }
          },
        },
      ]
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (timestamp: string) => {
    if (!timestamp) return '';
    
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return '';
      }
      
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes} min ago`;
      if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
      if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
      
      return date.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting time:', error);
      return '';
    }
  };

  const getThreadName = (thread: Thread) => {
    if (thread.type === 'GROUP' && thread.group) {
      return thread.group.name || 'Group Chat';
    }
    
    // For direct threads, use otherUser from backend
    if (thread.type === 'DIRECT' && thread.otherUser) {
      return thread.otherUser.displayName;
    }
    
    return 'Unknown User';
  };

  const getThreadAvatar = (thread: Thread) => {
    if (thread.type === 'GROUP' && thread.group) {
      return thread.group.name?.[0]?.toUpperCase() || 'G';
    }
    
    // For direct threads, use otherUser
    if (thread.type === 'DIRECT' && thread.otherUser) {
      return thread.otherUser.displayName?.[0]?.toUpperCase() || '?';
    }
    
    return '?';
  };

  const getThreadAvatarUrl = (thread: Thread) => {
    if (thread.type === 'GROUP' && thread.group) {
      return thread.group.pictureUrl || null;
    }
    
    // For direct threads, use otherUser avatarUrl
    if (thread.type === 'DIRECT' && thread.otherUser) {
      return thread.otherUser.avatarUrl || null;
    }
    
    return null;
  };

  const formatChatItem = (thread: Thread) => {
    return {
      id: thread.id,
      name: getThreadName(thread),
      lastMessage: thread.lastMessage?.body || 'No messages yet',
      time: thread.lastMessage?.timestamp 
        ? formatTime(thread.lastMessage.timestamp)
        : '',
      avatar: getThreadAvatar(thread),
      avatarUrl: getThreadAvatarUrl(thread),
      unreadCount: thread.unreadCount,
    };
  };

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Chats',
            headerRight: () => (
              <View style={styles.headerButtons}>
                <TouchableOpacity
                  onPress={() => setSearchModalVisible(true)}
                  style={styles.headerButton}
                >
                  <Ionicons name="person-add" size={24} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSettingsModalVisible(true)}
                  style={styles.headerButton}
                >
                  <Ionicons name="settings" size={24} color="#007AFF" />
                </TouchableOpacity>
              </View>
            ),
          }}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
        <UserSearchModal
          visible={searchModalVisible}
          onClose={() => setSearchModalVisible(false)}
          onRequestSent={loadThreads}
        />
        <UserSettingsModal
          visible={settingsModalVisible}
          onClose={() => setSettingsModalVisible(false)}
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Chats',
          headerRight: () => (
            <View style={styles.headerButtons}>
              <TouchableOpacity
                onPress={() => setSearchModalVisible(true)}
                style={styles.headerButton}
              >
                <Ionicons name="person-add" size={24} color="#007AFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSettingsModalVisible(true)}
                style={styles.headerButton}
              >
                <Ionicons name="settings" size={24} color="#007AFF" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <View style={styles.container}>
        {/* Pending Requests Section */}
        {(pendingRequests.length > 0 || sentRequests.length > 0) && (
          <View style={styles.pendingRequestsSection}>
            <Text style={styles.pendingRequestsTitle}>Pending Requests</Text>
            
            {/* Received Requests */}
            {pendingRequests.length > 0 && (
              <View style={styles.requestsGroup}>
                <Text style={styles.requestsGroupTitle}>Received ({pendingRequests.length})</Text>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={pendingRequests}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <View style={styles.requestItem}>
                      <Avatar
                        letter={getInitials(item.fromUser?.displayName || '?')}
                        avatarUrl={item.fromUser?.avatarUrl}
                        size={50}
                      />
                      <Text style={styles.requestName} numberOfLines={1}>
                        {item.fromUser?.displayName || 'Unknown'}
                      </Text>
                      <View style={styles.requestActions}>
                        <TouchableOpacity
                          style={[styles.requestButton, styles.acceptButton]}
                          onPress={() => handleAcceptRequest(item.id)}
                        >
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.requestButton, styles.rejectButton]}
                          onPress={() => handleRejectRequest(item.id)}
                        >
                          <Ionicons name="close" size={18} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                />
              </View>
            )}

            {/* Sent Requests */}
            {sentRequests.length > 0 && (
              <View style={styles.requestsGroup}>
                <Text style={styles.requestsGroupTitle}>Sent ({sentRequests.length})</Text>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={sentRequests}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <View style={styles.requestItem}>
                      <Avatar
                        letter={getInitials(item.toUser?.displayName || '?')}
                        avatarUrl={item.toUser?.avatarUrl}
                        size={50}
                      />
                      <Text style={styles.requestName} numberOfLines={1}>
                        {item.toUser?.displayName || 'Unknown'}
                      </Text>
                      <TouchableOpacity
                        style={[styles.requestButton, styles.cancelButton]}
                        onPress={() => handleCancelSentRequest(item.id)}
                      >
                        <Ionicons name="close-circle" size={18} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  )}
                />
              </View>
            )}
          </View>
        )}

        {/* Search Bar */}
        {threads.length > 0 && (
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search chats..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#999"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#999" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {threads.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No chats yet</Text>
            <Text style={styles.emptySubtext}>
              Start a conversation by adding a contact
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setSearchModalVisible(true)}
            >
              <Text style={styles.addButtonText}>Add Contact</Text>
            </TouchableOpacity>
          </View>
        ) : filteredThreads.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No results found</Text>
            <Text style={styles.emptySubtext}>
              Try searching with a different name
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredThreads}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ChatListItem
                chat={formatChatItem(item)}
                onPress={() => router.push(`/chat/${item.id}`)}
              />
            )}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          />
        )}

        {/* Floating Action Button */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setMessageModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <UserSearchModal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        onRequestSent={() => {
          loadThreads();
          loadPendingRequests();
        }}
      />

      <UserSearchModal
        visible={messageModalVisible}
        onClose={() => setMessageModalVisible(false)}
        mode="message"
        onRequestSent={() => {
          loadThreads();
        }}
      />

      <UserSettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 44,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 24,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pendingRequestsSection: {
    backgroundColor: '#f8f8f8',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  pendingRequestsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  requestsGroup: {
    marginBottom: 12,
  },
  requestsGroupTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  requestItem: {
    alignItems: 'center',
    marginRight: 16,
    width: 80,
  },
  requestName: {
    fontSize: 12,
    color: '#000',
    marginTop: 6,
    marginBottom: 8,
    textAlign: 'center',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  requestButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  cancelButton: {
    backgroundColor: '#FF9500',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});