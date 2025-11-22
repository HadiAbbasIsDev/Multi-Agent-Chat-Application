import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../../utils/api';
import { Avatar } from './Avatar';

interface User {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  lastActiveAt?: string;
}

interface UserProfileModalProps {
  visible: boolean;
  onClose: () => void;
  user: User | null;
  threadId?: string;
  onContactRemoved?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  visible,
  onClose,
  user,
  threadId,
  onContactRemoved,
}) => {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [fullUser, setFullUser] = useState<User | null>(user);

  // Fetch full user details when modal opens
  useEffect(() => {
    if (visible && user && !user.email) {
      const fetchUserDetails = async () => {
        try {
          const response = await api.getUserById(user.id);
          setFullUser({
            id: response.id,
            displayName: response.displayName,
            email: response.email,
            avatarUrl: response.avatarUrl,
            lastActiveAt: response.lastActiveAt,
          });
        } catch (error) {
          console.error('Failed to fetch user details:', error);
          setFullUser(user); // Use partial data if fetch fails
        }
      };
      fetchUserDetails();
    } else if (visible && user) {
      setFullUser(user);
    }
  }, [visible, user]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const displayUser = fullUser || user;
  if (!displayUser) return null;

  const formatLastActive = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return 'Active now';
      if (minutes < 60) return `Active ${minutes}m ago`;
      if (hours < 24) return `Active ${hours}h ago`;
      if (days < 7) return `Active ${days}d ago`;
      
      return `Active ${date.toLocaleDateString()}`;
    } catch {
      return 'Unknown';
    }
  };

  const handleRemoveContact = async () => {
    Alert.alert(
      'Remove Contact',
      `Are you sure you want to remove ${displayUser.displayName} from your contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading('remove');
              await api.removeContact(displayUser.id);
              Alert.alert('Success', 'Contact removed successfully');
              onContactRemoved?.();
              onClose();
            } catch (error: any) {
              console.error('Remove contact error:', error);
              const errorMsg = error.response?.data?.error || 'Failed to remove contact';
              Alert.alert('Error', errorMsg);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleMute = async () => {
    Alert.alert(
      'Mute Notifications',
      `Mute notifications from ${displayUser.displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mute',
          onPress: async () => {
            try {
              setLoading('mute');
              // Note: Backend doesn't have mute API yet
              // This would need to be implemented
              Alert.alert(
                'Feature Coming Soon',
                'Mute feature needs backend API support. Please contact support.',
                [{ text: 'OK' }]
              );
              // TODO: Implement when backend adds POST /api/users/:userId/mute endpoint
            } catch (error: any) {
              console.error('Mute error:', error);
              Alert.alert('Error', 'Failed to mute user');
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleBlock = async () => {
    Alert.alert(
      'Block User',
      `Are you sure you want to block ${displayUser.displayName}? You won't be able to message each other.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading('block');
              // Note: Backend doesn't have block API yet
              // This would need to be implemented
              Alert.alert(
                'Feature Coming Soon',
                'Block user feature needs backend API support. Please contact support.',
                [{ text: 'OK' }]
              );
              // TODO: Implement when backend adds POST /api/users/:userId/block endpoint
            } catch (error: any) {
              console.error('Block error:', error);
              Alert.alert('Error', 'Failed to block user');
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleViewProfile = () => {
    onClose();
    // Navigate to full profile screen if you have one
    // router.push(`/profile/${displayUser.id}`);
    Alert.alert('Profile', `Viewing profile for ${displayUser.displayName}`);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Profile</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.content} 
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={true}
            >
            {/* User Info */}
            <View style={styles.userInfoSection}>
              <Avatar
                letter={getInitials(displayUser.displayName)}
                avatarUrl={displayUser.avatarUrl}
                size={100}
              />
              <Text style={styles.userName}>{displayUser.displayName}</Text>
              {displayUser.email && (
                <Text style={styles.userEmail}>{displayUser.email}</Text>
              )}
              <Text style={styles.lastActive}>
                {formatLastActive(displayUser.lastActiveAt)}
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.actionsSection}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleViewProfile}
              >
                <Ionicons name="person-outline" size={24} color="#007AFF" />
                <Text style={styles.actionText}>View Profile</Text>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleMute}
                disabled={loading === 'mute'}
              >
                {loading === 'mute' ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Ionicons name="notifications-off-outline" size={24} color="#007AFF" />
                )}
                <Text style={styles.actionText}>Mute Notifications</Text>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonDanger]}
                onPress={handleRemoveContact}
                disabled={loading === 'remove'}
              >
                {loading === 'remove' ? (
                  <ActivityIndicator size="small" color="#FF3B30" />
                ) : (
                  <Ionicons name="person-remove-outline" size={24} color="#FF3B30" />
                )}
                <Text style={[styles.actionText, styles.actionTextDanger]}>
                  Remove Contact
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonDanger]}
                onPress={handleBlock}
                disabled={loading === 'block'}
              >
                {loading === 'block' ? (
                  <ActivityIndicator size="small" color="#FF3B30" />
                ) : (
                  <Ionicons name="ban-outline" size={24} color="#FF3B30" />
                )}
                <Text style={[styles.actionText, styles.actionTextDanger]}>
                  Block User
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            </View>
          </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: '60%',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    minHeight: 60,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  contentContainer: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  userInfoSection: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  userName: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  lastActive: {
    fontSize: 14,
    color: '#999',
  },
  actionsSection: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 4,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
  },
  actionButtonDanger: {
    // Additional styles for danger actions
  },
  actionText: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    marginLeft: 12,
  },
  actionTextDanger: {
    color: '#FF3B30',
  },
});

