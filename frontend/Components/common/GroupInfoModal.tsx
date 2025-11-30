import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../Contexts/AuthContext';
import { api } from '../../utils/api';
import { UserSearchModal } from './UserSearchModal';
import { Avatar } from './Avatar';

interface GroupMember {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role: 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

interface GroupInfo {
  id: string;
  type: string;
  group?: {
    name: string;
    ownerId: string;
    memberCount: number;
    pictureUrl?: string;
    maxMembers: number;
    onlyAdminsChangePicture?: boolean;
    onlyAdminsSendMessages?: boolean;
    yourRole: 'ADMIN' | 'MEMBER';
    members: GroupMember[];
  };
}

interface GroupInfoModalProps {
  visible: boolean;
  onClose: () => void;
  threadId: string;
  onGroupUpdated?: () => void;
}

export const GroupInfoModal: React.FC<GroupInfoModalProps> = ({
  visible,
  onClose,
  threadId,
  onGroupUpdated,
}) => {
  const router = useRouter();
  const { user } = useAuth();
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    if (visible && threadId) {
      loadGroupInfo();
    }
  }, [visible, threadId]);

  const loadGroupInfo = async () => {
    try {
      setLoading(true);
      const response = await api.getThreadDetails(threadId);
      const threadData = response.thread || response;
      setGroupInfo(threadData);
      if (threadData.group) {
        setNewGroupName(threadData.group.name);
      }
    } catch (error) {
      console.error('Failed to load group info:', error);
      Alert.alert('Error', 'Failed to load group information');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const isOwner = () => {
    return groupInfo?.group?.ownerId === user?.id;
  };

  const isAdmin = () => {
    return groupInfo?.group?.yourRole === 'ADMIN' || isOwner();
  };

  const canChangePicture = () => {
    if (!groupInfo?.group) return false;
    // If only admins can change picture, check if user is admin
    if (groupInfo.group.onlyAdminsChangePicture) {
      return isAdmin();
    }
    // Otherwise, all members can change
    return true;
  };

  const canPromote = (member: GroupMember) => {
    return (
      isOwner() &&
      member.role === 'MEMBER' &&
      member.userId !== user?.id
    );
  };

  const canDemote = (member: GroupMember) => {
    return (
      isOwner() &&
      member.role === 'ADMIN' &&
      member.userId !== groupInfo?.group?.ownerId &&
      member.userId !== user?.id
    );
  };

  const canRemove = (member: GroupMember) => {
    return (
      isAdmin() &&
      member.userId !== groupInfo?.group?.ownerId &&
      member.userId !== user?.id
    );
  };

  const handlePromoteToAdmin = async (userId: string, displayName: string) => {
    Alert.alert(
      'Promote to Admin',
      `Are you sure you want to promote ${displayName} to admin?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Promote',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(userId);
              await api.promoteToAdmin(threadId, userId);
              Alert.alert('Success', `${displayName} has been promoted to admin`);
              loadGroupInfo();
              onGroupUpdated?.();
            } catch (error: any) {
              console.error('Promote error:', error);
              Alert.alert('Error', error.response?.data?.error || 'Failed to promote member');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleDemoteAdmin = async (userId: string, displayName: string) => {
    Alert.alert(
      'Demote Admin',
      `Are you sure you want to demote ${displayName} from admin to member?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Demote',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(userId);
              await api.demoteAdmin(threadId, userId);
              Alert.alert('Success', `${displayName} has been demoted to member`);
              loadGroupInfo();
              onGroupUpdated?.();
            } catch (error: any) {
              console.error('Demote error:', error);
              Alert.alert('Error', error.response?.data?.error || 'Failed to demote admin');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleRemoveMember = async (userId: string, displayName: string) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${displayName} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(userId);
              await api.removeGroupMember(threadId, userId);
              Alert.alert('Success', `${displayName} has been removed from the group`);
              loadGroupInfo();
              onGroupUpdated?.();
            } catch (error: any) {
              console.error('Remove error:', error);
              Alert.alert('Error', error.response?.data?.error || 'Failed to remove member');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleAddMember = async (userId: string) => {
    try {
      setActionLoading('add');
      await api.addGroupMember(threadId, userId);
      Alert.alert('Success', 'Member added to group');
      setShowAddMemberModal(false);
      loadGroupInfo();
      onGroupUpdated?.();
    } catch (error: any) {
      console.error('Add member error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to add member');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLeaveGroup = () => {
    if (isOwner()) {
      Alert.alert(
        'Cannot Leave Group',
        'As the group owner, you cannot leave the group. You can transfer ownership to another admin or delete the group instead.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group? You will no longer receive messages from this group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading('leave');
              await api.leaveGroup(threadId);
              Alert.alert('Success', 'You have left the group', [
                {
                  text: 'OK',
                  onPress: () => {
                    onClose();
                    router.back();
                  },
                },
              ]);
            } catch (error: any) {
              console.error('Leave error:', error);
              const errorMsg = error.response?.data?.error || 'Failed to leave group';
              Alert.alert('Error', errorMsg);
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleMuteNotifications = () => {
    Alert.alert('Mute Notifications', 'This feature is coming soon!');
  };

  const handleUpdateGroupName = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Error', 'Group name cannot be empty');
      return;
    }

    try {
      setActionLoading('update');
      await api.updateGroup(threadId, { name: newGroupName.trim() });
      Alert.alert('Success', 'Group name updated');
      setShowEditNameModal(false);
      loadGroupInfo();
      onGroupUpdated?.();
    } catch (error: any) {
      console.error('Update error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to update group name');
    } finally {
      setActionLoading(null);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadge = (member: GroupMember) => {
    if (member.userId === groupInfo?.group?.ownerId) {
      return { text: 'Owner', color: '#FF9500' };
    }
    if (member.role === 'ADMIN') {
      return { text: 'Admin', color: '#007AFF' };
    }
    return null;
  };

  if (loading) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (!groupInfo?.group) {
    return null;
  }

  const sortedMembers = [...(groupInfo.group.members || [])].sort((a, b) => {
    // Owner first, then admins, then members
    if (a.userId === groupInfo.group?.ownerId) return -1;
    if (b.userId === groupInfo.group?.ownerId) return 1;
    if (a.role === 'ADMIN' && b.role !== 'ADMIN') return -1;
    if (b.role === 'ADMIN' && a.role !== 'ADMIN') return 1;
    return 0;
  });

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.safeArea}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Group Info</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color="#000" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={true}
              >
                {/* Group Name Section */}
                <View style={styles.section}>
                  <View style={styles.groupNameRow}>
                    <TouchableOpacity
                      style={styles.avatarWrapper}
                      onPress={() => {
                        // Check if user can change picture
                        if (!canChangePicture()) {
                          Alert.alert('Permission Denied', 'Only admins can change the group picture');
                          return;
                        }
                        // TODO: Add image picker functionality here if needed
                        Alert.alert('Change Picture', 'Picture change feature coming soon');
                      }}
                      disabled={!canChangePicture()}
                    >
                      <Avatar 
                        letter={getInitials(groupInfo.group.name)} 
                        avatarUrl={groupInfo.group.pictureUrl}
                        size={60}
                      />
                      {canChangePicture() && (
                        <View style={styles.editPictureOverlay}>
                          <Ionicons name="camera" size={16} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                    <View style={styles.groupNameContainer}>
                      <Text style={styles.groupName}>{groupInfo.group.name}</Text>
                      <Text style={styles.memberCount}>
                        {groupInfo.group.memberCount} member
                        {groupInfo.group.memberCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    {isAdmin() && (
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => setShowEditNameModal(true)}
                      >
                        <Ionicons name="pencil" size={20} color="#007AFF" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Group Settings - Only Owner */}
                {isOwner() && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Group Settings</Text>
                    
                    {/* Only Admins Change Picture Toggle */}
                    <View style={styles.settingRow}>
                      <View style={styles.settingInfo}>
                        <Text style={styles.settingLabel}>Only Admins Change Picture</Text>
                        <Text style={styles.settingDescription}>
                          When enabled, only admins can change the group picture
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.toggle,
                          groupInfo.group.onlyAdminsChangePicture ? styles.toggleActive : styles.toggleInactive
                        ]}
                        onPress={async () => {
                          try {
                            setActionLoading('settings');
                            const newValue = !groupInfo.group?.onlyAdminsChangePicture;
                            await api.updateGroup(threadId, { onlyAdminsChangePicture: newValue });
                            setGroupInfo(prev => prev ? {
                              ...prev,
                              group: prev.group ? {
                                ...prev.group,
                                onlyAdminsChangePicture: newValue
                              } : prev.group
                            } : null);
                            onGroupUpdated?.();
                          } catch (error: any) {
                            Alert.alert('Error', error.response?.data?.error || 'Failed to update setting');
                          } finally {
                            setActionLoading(null);
                          }
                        }}
                        disabled={actionLoading === 'settings'}
                      >
                        <View style={[
                          styles.toggleThumb,
                          groupInfo.group.onlyAdminsChangePicture && styles.toggleThumbActive
                        ]} />
                      </TouchableOpacity>
                    </View>

                    {/* Only Admins Send Messages Toggle */}
                    <View style={styles.settingRow}>
                      <View style={styles.settingInfo}>
                        <Text style={styles.settingLabel}>Only Admins Send Messages</Text>
                        <Text style={styles.settingDescription}>
                          When enabled, only admins can send messages in this group
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.toggle,
                          groupInfo.group.onlyAdminsSendMessages ? styles.toggleActive : styles.toggleInactive
                        ]}
                        onPress={async () => {
                          try {
                            setActionLoading('settings');
                            const newValue = !groupInfo.group?.onlyAdminsSendMessages;
                            await api.updateGroup(threadId, { onlyAdminsSendMessages: newValue });
                            setGroupInfo(prev => prev ? {
                              ...prev,
                              group: prev.group ? {
                                ...prev.group,
                                onlyAdminsSendMessages: newValue
                              } : prev.group
                            } : null);
                            onGroupUpdated?.();
                          } catch (error: any) {
                            Alert.alert('Error', error.response?.data?.error || 'Failed to update setting');
                          } finally {
                            setActionLoading(null);
                          }
                        }}
                        disabled={actionLoading === 'settings'}
                      >
                        <View style={[
                          styles.toggleThumb,
                          groupInfo.group.onlyAdminsSendMessages && styles.toggleThumbActive
                        ]} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Admin Actions */}
                {isAdmin() && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Admin Actions</Text>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => setShowAddMemberModal(true)}
                      disabled={actionLoading === 'add'}
                    >
                      <Ionicons name="person-add" size={20} color="#007AFF" />
                      <Text style={styles.actionButtonText}>Add Member</Text>
                      {actionLoading === 'add' && (
                        <ActivityIndicator size="small" color="#007AFF" style={styles.loadingIcon} />
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* Members Section */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    Members ({sortedMembers.length})
                  </Text>
                  <FlatList
                    data={sortedMembers}
                    keyExtractor={(item) => item.userId}
                    scrollEnabled={false}
                    renderItem={({ item }) => {
                      const isCurrentUser = item.userId === user?.id;
                      const roleBadge = getRoleBadge(item);
                      const isLoading = actionLoading === item.userId;

                      return (
                        <View style={styles.memberItem}>
                          <View style={styles.memberAvatarWrapper}>
                            <Avatar 
                              letter={getInitials(item.displayName)} 
                              avatarUrl={item.avatarUrl}
                              size={44}
                            />
                          </View>
                          <View style={styles.memberInfo}>
                            <View style={styles.memberNameRow}>
                              <Text style={styles.memberName}>
                                {item.displayName}
                                {isCurrentUser && ' (You)'}
                              </Text>
                              {roleBadge && (
                                <View
                                  style={[
                                    styles.roleBadge,
                                    { backgroundColor: roleBadge.color },
                                  ]}
                                >
                                  <Text style={styles.roleBadgeText}>
                                    {roleBadge.text}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                          {!isCurrentUser && (
                            <View style={styles.memberActions}>
                              {canPromote(item) && (
                                <TouchableOpacity
                                  style={styles.memberActionButton}
                                  onPress={() =>
                                    handlePromoteToAdmin(item.userId, item.displayName)
                                  }
                                  disabled={isLoading}
                                >
                                  {isLoading ? (
                                    <ActivityIndicator size="small" color="#007AFF" />
                                  ) : (
                                    <Ionicons name="star" size={20} color="#007AFF" />
                                  )}
                                </TouchableOpacity>
                              )}
                              {canDemote(item) && (
                                <TouchableOpacity
                                  style={styles.memberActionButton}
                                  onPress={() =>
                                    handleDemoteAdmin(item.userId, item.displayName)
                                  }
                                  disabled={isLoading}
                                >
                                  {isLoading ? (
                                    <ActivityIndicator size="small" color="#FF9500" />
                                  ) : (
                                    <Ionicons name="star-outline" size={20} color="#FF9500" />
                                  )}
                                </TouchableOpacity>
                              )}
                              {canRemove(item) && (
                                <TouchableOpacity
                                  style={styles.memberActionButton}
                                  onPress={() =>
                                    handleRemoveMember(item.userId, item.displayName)
                                  }
                                  disabled={isLoading}
                                >
                                  {isLoading ? (
                                    <ActivityIndicator size="small" color="#FF3B30" />
                                  ) : (
                                    <Ionicons name="person-remove" size={20} color="#FF3B30" />
                                  )}
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    }}
                  />
                </View>

                {/* Member Actions */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Actions</Text>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.muteButton]}
                    onPress={handleMuteNotifications}
                  >
                    <Ionicons name="notifications-off" size={20} color="#666" />
                    <Text style={[styles.actionButtonText, styles.muteButtonText]}>
                      Mute Notifications
                    </Text>
                  </TouchableOpacity>
                  {!isOwner() && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.leaveButton]}
                      onPress={handleLeaveGroup}
                      disabled={actionLoading === 'leave'}
                    >
                      {actionLoading === 'leave' ? (
                        <ActivityIndicator size="small" color="#FF3B30" />
                      ) : (
                        <Ionicons name="exit" size={20} color="#FF3B30" />
                      )}
                      <Text style={[styles.actionButtonText, styles.leaveButtonText]}>
                        Leave Group
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Group Name Modal */}
      <Modal
        visible={showEditNameModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowEditNameModal(false)}
      >
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalContainer}>
            <Text style={styles.editModalTitle}>Edit Group Name</Text>
            <TextInput
              style={styles.editInput}
              placeholder="Group name"
              value={newGroupName}
              onChangeText={setNewGroupName}
              maxLength={100}
              autoFocus
            />
            <View style={styles.editModalButtons}>
              <TouchableOpacity
                style={[styles.editModalButton, styles.cancelButton]}
                onPress={() => {
                  setShowEditNameModal(false);
                  setNewGroupName(groupInfo?.group?.name || '');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editModalButton, styles.saveButton]}
                onPress={handleUpdateGroupName}
                disabled={actionLoading === 'update' || !newGroupName.trim()}
              >
                {actionLoading === 'update' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Member Modal */}
      <UserSearchModal
        visible={showAddMemberModal}
        onClose={() => setShowAddMemberModal(false)}
        onUserSelected={handleAddMember}
        excludeUserIds={sortedMembers.map((m) => m.userId)}
        mode="select"
      />
    </>
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
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#007AFF',
  },
  toggleInactive: {
    backgroundColor: '#E5E5EA',
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    transform: [{ translateX: 0 }],
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  groupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    marginRight: 12,
    position: 'relative',
  },
  editPictureOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  groupNameContainer: {
    flex: 1,
  },
  groupName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  memberCount: {
    fontSize: 14,
    color: '#666',
  },
  editButton: {
    padding: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    marginBottom: 8,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007AFF',
  },
  muteButton: {
    backgroundColor: '#f5f5f5',
  },
  muteButtonText: {
    color: '#666',
  },
  leaveButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  leaveButtonText: {
    color: '#FF3B30',
  },
  loadingIcon: {
    marginLeft: 'auto',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  memberAvatarWrapper: {
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  memberActions: {
    flexDirection: 'row',
    gap: 8,
  },
  memberActionButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '85%',
    maxWidth: 400,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  editInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  editModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  editModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

