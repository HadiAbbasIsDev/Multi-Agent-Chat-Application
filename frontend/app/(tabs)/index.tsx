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
import { useAuth } from '../../Contexts/AuthContext';
import { api } from '../../utils/api';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredThreads, setFilteredThreads] = useState<Thread[]>([]);

  useEffect(() => {
    loadThreads();
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
      setThreads(response.threads || []);
    } catch (error) {
      console.error('Failed to load threads:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadThreads();
    setRefreshing(false);
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

  const formatChatItem = (thread: Thread) => {
    return {
      id: thread.id,
      name: getThreadName(thread),
      lastMessage: thread.lastMessage?.body || 'No messages yet',
      time: thread.lastMessage?.timestamp 
        ? formatTime(thread.lastMessage.timestamp)
        : '',
      avatar: getThreadAvatar(thread),
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
              <TouchableOpacity onPress={() => setSearchModalVisible(true)}>
                <Ionicons name="person-add" size={24} color="#007AFF" />
              </TouchableOpacity>
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
            <TouchableOpacity
              onPress={() => setSearchModalVisible(true)}
              style={styles.headerButton}
            >
              <Ionicons name="person-add" size={24} color="#007AFF" />
            </TouchableOpacity>
          ),
        }}
      />
      <View style={styles.container}>
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
      </View>

      <UserSearchModal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        onRequestSent={loadThreads}
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
  headerButton: {
    marginRight: 12,
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
});