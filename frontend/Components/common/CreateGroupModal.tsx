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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../../utils/api';

interface Contact {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  lastActiveAt?: string;
}

interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onGroupCreated?: () => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  visible,
  onClose,
  onGroupCreated,
}) => {
  const router = useRouter();
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (visible) {
      loadContacts();
      // Reset state when modal opens
      setGroupName('');
      setSearchQuery('');
      setSelectedMembers([]);
      setSearchResults([]);
    }
  }, [visible]);

  const loadContacts = async () => {
    try {
      setLoadingContacts(true);
      const response = await api.getContacts();
      setContacts(response.contacts || []);
    } catch (error) {
      console.error('Failed to load contacts:', error);
      Alert.alert('Error', 'Failed to load contacts');
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const response = await api.searchUsers(searchQuery.trim());
      // Filter out already selected members and current user
      const filtered = (response.users || []).filter(
        (user: Contact) => !selectedMembers.includes(user.id)
      );
      setSearchResults(filtered);
    } catch (error: any) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Failed to search users');
    } finally {
      setSearching(false);
    }
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const isSelected = (userId: string) => selectedMembers.includes(userId);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    if (selectedMembers.length === 0) {
      Alert.alert('Error', 'Please add at least one member to the group');
      return;
    }

    try {
      setCreating(true);
      const response = await api.createGroup(groupName.trim(), selectedMembers);
      
      Alert.alert('Success', 'Group created successfully!', [
        {
          text: 'OK',
          onPress: () => {
            onClose();
            onGroupCreated?.();
            // Navigate to the new group chat
            if (response.thread?.id || response.group?.threadId) {
              const threadId = response.thread?.id || response.group?.threadId;
              router.push(`/group/${threadId}`);
            }
          },
        },
      ]);
    } catch (error: any) {
      console.error('Create group error:', error);
      const errorMsg = error.response?.data?.error || 'Failed to create group';
      Alert.alert('Error', errorMsg);
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setGroupName('');
    setSearchQuery('');
    setSelectedMembers([]);
    setSearchResults([]);
    onClose();
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
          <View style={styles.safeArea}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Create Group</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={true}
            >
              {/* Group Name Input */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Group Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter group name..."
                  value={groupName}
                  onChangeText={setGroupName}
                  maxLength={100}
                  placeholderTextColor="#999"
                />
              </View>

              {/* Selected Members */}
              {selectedMembers.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    Selected Members ({selectedMembers.length})
                  </Text>
                  <View style={styles.selectedContainer}>
                    {selectedMembers.map((memberId) => {
                      const member =
                        contacts.find((c) => c.id === memberId) ||
                        searchResults.find((c) => c.id === memberId);
                      if (!member) return null;

                      return (
                        <TouchableOpacity
                          key={memberId}
                          style={styles.selectedMember}
                          onPress={() => toggleMember(memberId)}
                        >
                          <View style={styles.selectedAvatar}>
                            <Text style={styles.selectedAvatarText}>
                              {getInitials(member.displayName)}
                            </Text>
                          </View>
                          <Text style={styles.selectedName} numberOfLines={1}>
                            {member.displayName}
                          </Text>
                          <Ionicons
                            name="close-circle"
                            size={20}
                            color="#FF3B30"
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Search Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Add Members</Text>
                <View style={styles.searchContainer}>
                  <Ionicons
                    name="search"
                    size={20}
                    color="#999"
                    style={styles.searchIcon}
                  />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by email or name..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={handleSearch}
                    returnKeyType="search"
                    autoCapitalize="none"
                    placeholderTextColor="#999"
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
                  disabled={searching || !searchQuery.trim()}
                >
                  {searching ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.searchButtonText}>Search</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Your Contacts */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Your Contacts</Text>
                {loadingContacts ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#007AFF" />
                  </View>
                ) : contacts.length === 0 ? (
                  <Text style={styles.emptyText}>No contacts yet</Text>
                ) : (
                  <View style={styles.contactsList}>
                    {contacts
                      .filter((contact) => !selectedMembers.includes(contact.id))
                      .map((contact) => (
                        <TouchableOpacity
                          key={contact.id}
                          style={styles.contactItem}
                          onPress={() => toggleMember(contact.id)}
                        >
                          <View style={styles.contactAvatar}>
                            <Text style={styles.contactAvatarText}>
                              {getInitials(contact.displayName)}
                            </Text>
                          </View>
                          <View style={styles.contactInfo}>
                            <Text style={styles.contactName}>
                              {contact.displayName}
                            </Text>
                            <Text style={styles.contactEmail}>
                              {contact.email}
                            </Text>
                          </View>
                          {isSelected(contact.id) ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={24}
                              color="#007AFF"
                            />
                          ) : (
                            <Ionicons
                              name="add-circle-outline"
                              size={24}
                              color="#999"
                            />
                          )}
                        </TouchableOpacity>
                      ))}
                  </View>
                )}
              </View>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Search Results</Text>
                  <View style={styles.contactsList}>
                    {searchResults.map((user) => (
                      <TouchableOpacity
                        key={user.id}
                        style={styles.contactItem}
                        onPress={() => toggleMember(user.id)}
                      >
                        <View style={styles.contactAvatar}>
                          <Text style={styles.contactAvatarText}>
                            {getInitials(user.displayName)}
                          </Text>
                        </View>
                        <View style={styles.contactInfo}>
                          <Text style={styles.contactName}>
                            {user.displayName}
                          </Text>
                          <Text style={styles.contactEmail}>{user.email}</Text>
                        </View>
                        {isSelected(user.id) ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={24}
                            color="#007AFF"
                          />
                        ) : (
                          <Ionicons
                            name="add-circle-outline"
                            size={24}
                            color="#999"
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Create Button */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={[
                  styles.createButton,
                  (!groupName.trim() ||
                    selectedMembers.length === 0 ||
                    creating) &&
                    styles.createButtonDisabled,
                ]}
                onPress={handleCreateGroup}
                disabled={
                  !groupName.trim() ||
                  selectedMembers.length === 0 ||
                  creating
                }
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="people" size={20} color="#fff" />
                    <Text style={styles.createButtonText}>
                      Create Group ({selectedMembers.length})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
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
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedMember: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    maxWidth: '48%',
  },
  selectedAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  selectedAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  selectedName: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
    marginRight: 6,
    flex: 1,
  },
  contactsList: {
    gap: 8,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    marginBottom: 2,
  },
  contactEmail: {
    fontSize: 14,
    color: '#666',
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  createButton: {
    backgroundColor: '#007AFF',
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

