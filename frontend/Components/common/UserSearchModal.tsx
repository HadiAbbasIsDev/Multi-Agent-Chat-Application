import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../../utils/api';

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

interface Contact {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  lastActiveAt?: string;
}

interface UserSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onRequestSent?: () => void;
  onUserSelected?: (userId: string) => void;
  excludeUserIds?: string[];
  mode?: 'contact' | 'select' | 'message';
}

export const UserSearchModal: React.FC<UserSearchModalProps> = ({
  visible,
  onClose,
  onRequestSent,
  onUserSelected,
  excludeUserIds = [],
  mode = 'contact',
}) => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [sentRequests, setSentRequests] = useState<Map<string, string>>(new Map()); // userId -> requestId

  // Load user's contacts and sent requests when modal opens
  useEffect(() => {
    if (visible) {
      loadContacts();
      if (mode === 'contact') {
        loadSentRequests();
      }
      // If mode is 'message', load contacts and show them in search results
      if (mode === 'message') {
        loadContactsForMessage();
      }
    }
  }, [visible, mode]);

  const loadContacts = async () => {
    try {
      setLoadingContacts(true);
      const response = await api.getContacts();
      setContacts(response.contacts || []);
    } catch (error: any) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoadingContacts(false);
    }
  };

  const loadSentRequests = async () => {
    try {
      const response = await api.getSentContactRequests();
      const requestsMap = new Map<string, string>();
      (response.requests || []).forEach((req: any) => {
        if (req.toUser?.id) {
          requestsMap.set(req.toUser.id, req.id);
        }
      });
      setSentRequests(requestsMap);
    } catch (error: any) {
      console.error('Failed to load sent requests:', error);
    }
  };

  const loadContactsForMessage = async () => {
    try {
      const response = await api.getContacts();
      // Set contacts as search results for message mode
      setSearchResults((response.contacts || []).map((contact: Contact) => ({
        id: contact.id,
        email: contact.email,
        displayName: contact.displayName,
        avatarUrl: contact.avatarUrl,
      })));
    } catch (error: any) {
      console.error('Failed to load contacts for message:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setLoading(true);
      const response = await api.searchUsers(searchQuery.trim());
      // Filter out excluded users
      const filtered = (response.users || []).filter(
        (user: User) => !excludeUserIds.includes(user.id)
      );
      setSearchResults(filtered);
    } catch (error: any) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Failed to search users');
    } finally {
      setLoading(false);
    }
  };

  const isContact = (userId: string): boolean => {
    return contacts.some((contact) => contact.id === userId);
  };

  const hasSentRequest = (userId: string): boolean => {
    return sentRequests.has(userId);
  };

  const getRequestId = (userId: string): string | undefined => {
    return sentRequests.get(userId);
  };

  const handleSendRequest = async (userId: string) => {
    try {
      setSendingRequest(userId);
      await api.sendContactRequest(userId);
      Alert.alert('Success', 'Contact request sent!');
      onRequestSent?.();
      // Reload sent requests to update the list
      await loadSentRequests();
      await loadContacts();
    } catch (error: any) {
      console.error('Send request error:', error);
      const errorMsg = error.response?.data?.error || 'Failed to send contact request';
      Alert.alert('Error', errorMsg);
    } finally {
      setSendingRequest(null);
    }
  };

  const handleCancelRequest = async (userId: string, requestId: string, userName: string) => {
    Alert.alert(
      'Cancel Request',
      `Do you want to cancel the contact request sent to ${userName}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setSendingRequest(userId);
              await api.cancelContactRequest(requestId);
              Alert.alert('Success', 'Contact request cancelled');
              // Reload sent requests to update the list
              await loadSentRequests();
              onRequestSent?.();
            } catch (error: any) {
              console.error('Cancel request error:', error);
              const errorMsg = error.response?.data?.error || 'Failed to cancel contact request';
              Alert.alert('Error', errorMsg);
            } finally {
              setSendingRequest(null);
            }
          },
        },
      ]
    );
  };

  const handleMessageUser = async (userId: string, userName: string) => {
    try {
      // Create or get existing direct thread
      const response = await api.createDirectThread(userId);
      const threadId = response.thread?.id || response.threadId;
      
      if (threadId) {
        onClose();
        router.push(`/chat/${threadId}`);
      } else {
        Alert.alert('Error', 'Failed to create conversation');
      }
    } catch (error: any) {
      console.error('Failed to create thread:', error);
      Alert.alert('Error', 'Failed to start conversation');
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    onClose();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {mode === 'select' ? 'Add Member' : mode === 'message' ? 'New Message' : 'Add Contact'}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          {mode !== 'message' && (
            <>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by email or name..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                  >
                    <Ionicons name="close-circle" size={20} color="#999" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleSearch}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.searchButtonText}>Search</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {mode === 'message' && (
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search contacts..."
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  // Filter contacts in real-time
                  if (text.trim()) {
                    const filtered = contacts.filter((contact) => {
                      const name = contact.displayName.toLowerCase();
                      const email = contact.email.toLowerCase();
                      const query = text.toLowerCase();
                      return name.includes(query) || email.includes(query);
                    });
                    setSearchResults(filtered.map((contact) => ({
                      id: contact.id,
                      email: contact.email,
                      displayName: contact.displayName,
                      avatarUrl: contact.avatarUrl,
                    })));
                  } else {
                    // Show all contacts when search is empty
                    loadContactsForMessage();
                  }
                }}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery('');
                    loadContactsForMessage();
                  }}
                >
                  <Ionicons name="close-circle" size={20} color="#999" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Results */}
          <View style={styles.resultsContainer}>
            {searchResults.length === 0 && !loading && searchQuery.length > 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="person-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No users found</Text>
                <Text style={styles.emptySubtext}>
                  {mode === 'message' ? 'No contacts match your search' : 'Try searching with a different email or name'}
                </Text>
              </View>
            )}

            {searchResults.length === 0 && !loading && searchQuery.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name={mode === 'message' ? 'people-outline' : 'search-outline'} size={48} color="#ccc" />
                <Text style={styles.emptyText}>
                  {mode === 'message' ? 'No contacts yet' : 'Search for users'}
                </Text>
                <Text style={styles.emptySubtext}>
                  {mode === 'message' ? 'Add contacts to start messaging' : 'Enter an email or name to find contacts'}
                </Text>
              </View>
            )}

            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const alreadyAdded = isContact(item.id);
                const requestSent = hasSentRequest(item.id);
                const requestId = getRequestId(item.id);
                
                return (
                  <View style={styles.userItem}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {getInitials(item.displayName)}
                      </Text>
                    </View>
                    <View style={styles.userInfo}>
                      <View style={styles.userNameRow}>
                        <Text style={styles.userName}>{item.displayName}</Text>
                        {alreadyAdded && (
                          <View style={styles.addedBadge}>
                            <Text style={styles.addedBadgeText}>Added</Text>
                          </View>
                        )}
                        {requestSent && !alreadyAdded && (
                          <View style={styles.requestSentBadge}>
                            <Text style={styles.requestSentBadgeText}>Request Sent</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.userEmail}>{item.email}</Text>
                    </View>
                    
                    {mode === 'select' ? (
                      <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => {
                          onUserSelected?.(item.id);
                        }}
                      >
                        <Ionicons name="add-circle" size={24} color="#007AFF" />
                      </TouchableOpacity>
                    ) : mode === 'message' ? (
                      // In message mode, all users shown are contacts, so show message button
                      <TouchableOpacity
                        style={styles.messageButton}
                        onPress={() => handleMessageUser(item.id, item.displayName)}
                      >
                        <Ionicons name="chatbubble" size={20} color="#fff" />
                        <Text style={styles.messageButtonText}>Message</Text>
                      </TouchableOpacity>
                    ) : alreadyAdded ? (
                      <TouchableOpacity
                        style={styles.messageButton}
                        onPress={() => handleMessageUser(item.id, item.displayName)}
                      >
                        <Ionicons name="chatbubble" size={20} color="#fff" />
                        <Text style={styles.messageButtonText}>Message</Text>
                      </TouchableOpacity>
                    ) : requestSent && requestId ? (
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => handleCancelRequest(item.id, requestId, item.displayName)}
                        disabled={sendingRequest === item.id}
                      >
                        {sendingRequest === item.id ? (
                          <ActivityIndicator size="small" color="#FF3B30" />
                        ) : (
                          <Ionicons name="close-circle" size={24} color="#FF3B30" />
                        )}
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => handleSendRequest(item.id)}
                        disabled={sendingRequest === item.id}
                      >
                        {sendingRequest === item.id ? (
                          <ActivityIndicator size="small" color="#007AFF" />
                        ) : (
                          <Ionicons name="person-add" size={24} color="#007AFF" />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
          </View>
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
    height: '85%',
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    marginHorizontal: 20,
    marginTop: 15,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  searchButton: {
    backgroundColor: '#007AFF',
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 10,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsContainer: {
    flex: 1,
    marginTop: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
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
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
  },
  addedBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  addedBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  requestSentBadge: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  requestSentBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  messageButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

