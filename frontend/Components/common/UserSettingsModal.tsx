import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../Contexts/AuthContext';
import { api } from '../../utils/api';

interface UserSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  visible,
  onClose,
}) => {
  const { user, signOut, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  
  // Form states
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Profile info
  const [profileInfo, setProfileInfo] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    if (visible && user) {
      setDisplayName(user.displayName || '');
      setAvatarUrl(user.avatarUrl || '');
      setSelectedImage(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      loadProfileInfo();
    }
  }, [visible, user]);

  const pickImage = async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need access to your photos to set your avatar.');
      return;
    }

    // Launch image picker with base64 option
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true, // Get base64 directly from picker
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedImage(asset.uri);
      // Store base64 if available
      if (asset.base64) {
        // Determine image type from URI or default to jpeg
        let imageType = 'jpeg';
        const uriLower = asset.uri.toLowerCase();
        if (uriLower.includes('.png')) imageType = 'png';
        else if (uriLower.includes('.gif')) imageType = 'gif';
        else if (uriLower.includes('.webp')) imageType = 'webp';
        
        const base64DataUrl = `data:image/${imageType};base64,${asset.base64}`;
        setAvatarUrl(base64DataUrl);
        console.log('✅ Base64 data URL created, length:', base64DataUrl.length);
      } else {
        console.warn('⚠️ Base64 not available from image picker');
        Alert.alert('Warning', 'Could not get image data. Please try again.');
      }
    }
  };

  const loadProfileInfo = async () => {
    try {
      setLoadingProfile(true);
      const response = await api.getCurrentUser();
      setProfileInfo(response.user || response);
    } catch (error) {
      console.error('Failed to load profile info:', error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleUpdateDisplayName = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Display name cannot be empty');
      return;
    }

    if (displayName.trim() === user?.displayName) {
      Alert.alert('Info', 'Display name is the same');
      return;
    }

    try {
      setUpdating('displayName');
      const response = await api.updateProfile({ displayName: displayName.trim() });
      Alert.alert('Success', 'Display name updated successfully');
      // Refresh user data
      await refreshUser();
      onClose();
    } catch (error: any) {
      console.error('Update display name error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to update display name');
    } finally {
      setUpdating(null);
    }
  };

  const handleUpdateAvatar = async () => {
    if (!selectedImage) {
      Alert.alert('Error', 'Please select an image');
      return;
    }

    // Check if we have base64 data URL
    if (!avatarUrl || !avatarUrl.startsWith('data:image/')) {
      Alert.alert('Error', 'Image data not available. Please select the image again.');
      return;
    }

    try {
      setUpdating('avatar');
      console.log('📤 Updating avatar with data URL, length:', avatarUrl.length);
      
      const apiResponse = await api.updateProfile({ avatarUrl: avatarUrl });
      console.log('✅ Avatar update response:', apiResponse);
      Alert.alert('Success', 'Avatar updated successfully');
      await refreshUser();
      setSelectedImage(null);
      setAvatarUrl(''); // Clear after successful update
      onClose();
    } catch (error: any) {
      console.error('Update avatar error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to update avatar';
      Alert.alert('Error', errorMessage);
    } finally {
      setUpdating(null);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all password fields');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      Alert.alert('Error', 'New password must be different from current password');
      return;
    }

    try {
      setUpdating('password');
      await api.updatePassword(currentPassword, newPassword);
      Alert.alert('Success', 'Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Change password error:', error);
      console.error('Error response:', error.response?.data);
      
      // Handle validation errors (array format)
      if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        const validationErrors = error.response.data.errors.map((err: any) => err.msg || err.message).join('\n');
        Alert.alert('Validation Error', validationErrors);
      } else {
        // Handle other errors
        const errorMessage = error.response?.data?.error || error.message || 'Failed to change password';
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setUpdating(null);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            onClose();
          },
        },
      ]
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return 'N/A';
    }
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
          <View style={styles.safeArea}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Settings</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={true}
            >
              {/* Profile Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Profile</Text>
                
                {/* Avatar Display */}
                <View style={styles.avatarSection}>
                  <TouchableOpacity
                    style={styles.avatarContainer}
                    onPress={pickImage}
                    activeOpacity={0.7}
                  >
                    {selectedImage ? (
                      <Image
                        source={{ uri: selectedImage }}
                        style={styles.avatarImage}
                      />
                    ) : user?.avatarUrl && user.avatarUrl.startsWith('data:') ? (
                      <Image
                        source={{ uri: user.avatarUrl }}
                        style={styles.avatarImage}
                      />
                    ) : user?.avatarUrl ? (
                      <Image
                        source={{ uri: user.avatarUrl }}
                        style={styles.avatarImage}
                      />
                    ) : (
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {getInitials(user?.displayName || 'U')}
                        </Text>
                      </View>
                    )}
                    <View style={styles.avatarEditBadge}>
                      <Ionicons name="camera" size={20} color="#fff" />
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.avatarLabel}>Tap to change profile picture</Text>
                  {selectedImage && (
                    <TouchableOpacity
                      style={styles.updateAvatarButton}
                      onPress={handleUpdateAvatar}
                      disabled={updating === 'avatar'}
                    >
                      {updating === 'avatar' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark" size={16} color="#fff" />
                          <Text style={styles.updateAvatarButtonText}>Update Avatar</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {/* Display Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Display Name</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter display name"
                      value={displayName}
                      onChangeText={setDisplayName}
                      maxLength={50}
                      placeholderTextColor="#999"
                    />
                    <TouchableOpacity
                      style={[
                        styles.saveButton,
                        (updating === 'displayName' || !displayName.trim() || displayName.trim() === user?.displayName) &&
                          styles.saveButtonDisabled,
                      ]}
                      onPress={handleUpdateDisplayName}
                      disabled={
                        updating === 'displayName' ||
                        !displayName.trim() ||
                        displayName.trim() === user?.displayName
                      }
                    >
                      {updating === 'displayName' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="checkmark" size={20} color="#fff" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

              </View>

              {/* Account Information */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Account Information</Text>
                {loadingProfile ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#007AFF" />
                  </View>
                ) : (
                  <>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Email</Text>
                      <Text style={styles.infoValue}>{user?.email || 'N/A'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>User ID</Text>
                      <Text style={[styles.infoValue, styles.infoValueSmall]}>
                        {user?.id || 'N/A'}
                      </Text>
                    </View>
                    {profileInfo?.createdAt && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Member Since</Text>
                        <Text style={styles.infoValue}>
                          {formatDate(profileInfo.createdAt)}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>

              {/* Change Password */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Security</Text>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Current Password</Text>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>New Password</Text>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Enter new password (min 6 characters)"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm New Password</Text>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    placeholderTextColor="#999"
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.changePasswordButton,
                    (updating === 'password' ||
                      !currentPassword ||
                      !newPassword ||
                      !confirmPassword) &&
                      styles.changePasswordButtonDisabled,
                  ]}
                  onPress={handleChangePassword}
                  disabled={
                    updating === 'password' ||
                    !currentPassword ||
                    !newPassword ||
                    !confirmPassword
                  }
                >
                  {updating === 'password' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="lock-closed" size={20} color="#fff" />
                      <Text style={styles.changePasswordButtonText}>Change Password</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Logout */}
              <View style={styles.section}>
                <TouchableOpacity
                  style={styles.logoutButton}
                  onPress={handleLogout}
                >
                  <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
                  <Text style={styles.logoutButtonText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
    marginBottom: 16,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    marginBottom: 8,
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '600',
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  updateAvatarButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  updateAvatarButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
  },
  passwordInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  infoValueSmall: {
    fontSize: 12,
    color: '#999',
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  changePasswordButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  changePasswordButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  changePasswordButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});

