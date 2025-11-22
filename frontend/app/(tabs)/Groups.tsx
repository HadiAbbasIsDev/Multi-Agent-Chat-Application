// app/(tabs)/Groups.tsx
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChatListItem } from '../../Components/chat/ChatListItem';
import { CreateGroupModal } from '../../Components/common/CreateGroupModal';
import { api } from '../../utils/api';

interface Group {
  id: string;
  type: string;
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
}

export default function Groups() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const response = await api.getThreads();
      // Filter to show only GROUP threads
      const groupThreads = (response.threads || []).filter(
        (thread: Group) => thread.type === 'GROUP'
      );
      setGroups(groupThreads);
    } catch (error) {
      console.error('Failed to load groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGroups();
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

  const formatGroupItem = (group: Group) => {
    return {
      id: group.id,
      name: group.group?.name || 'Group Chat',
      lastMessage: group.lastMessage?.body || 'No messages yet',
      time: group.lastMessage?.timestamp 
        ? formatTime(group.lastMessage.timestamp)
        : '',
      avatar: group.group?.name?.[0]?.toUpperCase() || 'G',
      unreadCount: 0,
    };
  };

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Groups',
            headerRight: () => (
              <TouchableOpacity
                onPress={() => setCreateModalVisible(true)}
                style={styles.headerButton}
              >
                <Ionicons name="add" size={28} color="#007AFF" />
              </TouchableOpacity>
            ),
          }}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
        <CreateGroupModal
          visible={createModalVisible}
          onClose={() => setCreateModalVisible(false)}
          onGroupCreated={loadGroups}
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Groups',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setCreateModalVisible(true)}
              style={styles.headerButton}
            >
              <Ionicons name="add" size={28} color="#007AFF" />
            </TouchableOpacity>
          ),
        }}
      />
      <View style={styles.container}>
        {groups.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No groups yet</Text>
            <Text style={styles.emptySubtext}>
              Create a group to start chatting with multiple people
            </Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setCreateModalVisible(true)}
            >
              <Text style={styles.createButtonText}>Create Group</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ChatListItem
                chat={formatGroupItem(item)}
                onPress={() => router.push(`/group/${item.id}`)}
              />
            )}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          />
        )}
      </View>

      <CreateGroupModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onGroupCreated={loadGroups}
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
  createButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 24,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});