// app/group/[id].tsx
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../Contexts/AuthContext';
import { api } from '../../utils/api';
import { socketService } from '../../utils/socket';
import { GroupInfoModal } from '../../Components/common/GroupInfoModal';
import { ImageViewerModal } from '../../Components/common/ImageViewerModal';
import { Avatar } from '../../Components/common/Avatar';

interface Message {
  id: string;
  body: string;
  senderId: string;
  senderName?: string;
  createdAt: string;
  editedAt?: string;
  isDeleted?: boolean;
  attachment?: {
    id: string;
    type: string;
    mimeType: string;
    sizeBytes: number;
    storageUrl: string;
    width?: number;
    height?: number;
  };
}

interface GroupDetails {
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
    yourRole: string;
    members?: any[];
  };
  createdAt?: string;
  lastMessageAt?: string;
}

export default function GroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutRef = useRef<any>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (id) {
      loadGroupDetails();
      loadMessages();
      
      // Join the thread room for real-time updates
      socketService.joinThread(id);
      
      // Set up socket listeners
      setupSocketListeners();
      
      // Clean up on unmount
      return () => {
        socketService.leaveThread(id);
        cleanupSocketListeners();
      };
    }
  }, [id]);

  // Scroll to bottom whenever messages change (after initial load)
  useEffect(() => {
    if (!loading && messages.length > 0) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 300);
      });
    }
  }, [loading, messages.length]);

  const setupSocketListeners = () => {
    // Listen for new messages
    socketService.onNewMessage((message) => {
      if (message.threadId === id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) {
            return prev;
          }
          const enrichedMessage = {
            ...message,
            senderName: message.senderName || 'Unknown',
            attachment: message.attachment || null,
            isSystemMessage: message.isSystemMessage || false, // Preserve system message flag
          };
          return [enrichedMessage, ...prev];
        });
        
        requestAnimationFrame(() => {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 200);
        });
      }
    });

    socketService.onMessageEdited((data) => {
      if (data.threadId === id) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === data.messageId
              ? { ...msg, body: data.newBody, editedAt: data.editedAt }
              : msg
          )
        );
      }
    });

    socketService.onMessageDeleted((data) => {
      if (data.threadId === id) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === data.messageId ? { ...msg, isDeleted: true } : msg
          )
        );
      }
    });

    // Listen for member left events - backend sends this as new_message with isSystemMessage
    // So it's already handled in onNewMessage above

    // Listen for group updates (settings changes)
    socketService.onGroupUpdated((data) => {
      if (data.groupId === id) {
        // Reload group details to get updated settings
        loadGroupDetails();
      }
    });

    // Listen for typing indicators
    socketService.onUserTyping((data) => {
      // Only show typing indicator for other users, not yourself
      if (data.threadId === id && data.userId !== user?.id && data.displayName) {
        setTypingUsers((prev) => {
          if (!prev.includes(data.displayName)) {
            return [...prev, data.displayName];
          }
          return prev;
        });
      }
    });

    socketService.onUserStoppedTyping((data) => {
      // Only remove typing indicator for other users
      if (data.threadId === id && data.userId !== user?.id && data.displayName) {
        setTypingUsers((prev) => {
          return prev.filter((name) => name !== data.displayName);
        });
      }
    });
  };

  const cleanupSocketListeners = () => {
    // Stop typing indicator when leaving
    socketService.stopTyping(id);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    // Clear typing users
    setTypingUsers([]);
    
    socketService.off('new_message');
    socketService.off('message_edited');
    socketService.off('message_deleted');
    socketService.off('member_removed');
    socketService.off('user_typing');
    socketService.off('user_stopped_typing');
    socketService.off('group_updated');
  };

  const loadGroupDetails = async () => {
    try {
      const response = await api.getThreadDetails(id);
      const threadData = response.thread || response;
      setGroupDetails(threadData);
    } catch (error) {
      console.error('Failed to load group details:', error);
      Alert.alert('Error', 'Failed to load group details');
      router.back();
    }
  };

  const isAdmin = () => {
    return groupDetails?.group?.yourRole === 'ADMIN' || groupDetails?.group?.ownerId === user?.id;
  };

  const canSendMessages = () => {
    if (!groupDetails?.group) return false;
    // If only admins can send messages, check if user is admin
    if (groupDetails.group.onlyAdminsSendMessages) {
      return isAdmin();
    }
    // Otherwise, all members can send
    return true;
  };

  const canChangePicture = () => {
    if (!groupDetails?.group) return false;
    // If only admins can change picture, check if user is admin
    if (groupDetails.group.onlyAdminsChangePicture) {
      return isAdmin();
    }
    // Otherwise, all members can change
    return true;
  };

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await api.getMessages(id);
      let messages = response.messages || [];
      
      // Ensure messages are sorted: newest first (for inverted FlatList)
      messages = messages.sort((a: Message, b: Message) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeB - timeA; // Newest first
      });
      
      // Ensure all messages have attachment data if present
      messages = messages.map((msg: Message) => ({
        ...msg,
        attachment: msg.attachment || null,
      }));
      
      setMessages(messages);
      
      setTimeout(() => {
        if (flatListRef.current && messages.length > 0) {
          flatListRef.current.scrollToEnd({ animated: false });
        }
      }, 400);
    } catch (error) {
      console.error('Failed to load messages:', error);
      Alert.alert('Error', 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need access to your photos to send images.');
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handleInputChange = (text: string) => {
    if (!canSendMessages()) return; // Don't allow typing if can't send
    
    setInput(text);

    // Send typing indicator
    if (text.length > 0) {
      socketService.startTyping(id);
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Stop typing after 3 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        socketService.stopTyping(id);
      }, 3000);
    } else {
      socketService.stopTyping(id);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const sendMessage = async () => {
    if ((!input.trim() && !selectedImage) || sending) return;
    
    // Check if user can send messages
    if (!canSendMessages()) {
      Alert.alert('Permission Denied', 'Only admins can send messages in this group');
      return;
    }

    const messageText = input.trim();
    const imageToSend = selectedImage;
    setInput('');
    setSelectedImage(null);
    
    // Stop typing indicator
    socketService.stopTyping(id);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    try {
      setSending(true);
      
      // Convert image URI to File/Blob for FormData
      let imageFile: any = null;
      if (imageToSend) {
        const response = await fetch(imageToSend);
        const blob = await response.blob();
        const filename = imageToSend.split('/').pop() || 'image.jpg';
        imageFile = {
          uri: imageToSend,
          type: blob.type || 'image/jpeg',
          name: filename,
        } as any;
      }
      
      const response = await api.sendMessage(id, messageText, imageFile);
      
      console.log('📤 Group message sent, full response:', JSON.stringify(response, null, 2));
      
      // Backend returns { message: 'Message sent', data: { ... } }
      const messageData = response.data || response.message || response;
      
      // Ensure the message has the correct senderId
      const sentMessage = {
        id: messageData.id,
        threadId: messageData.threadId || id,
        senderId: messageData.senderId || user?.id,
        body: messageData.body,
        status: messageData.status,
        createdAt: messageData.createdAt,
        senderName: user?.displayName,
        attachment: messageData.attachment || null,
      };
      
      console.log('📤 Processed sent group message:', {
        id: sentMessage.id,
        hasAttachment: !!sentMessage.attachment,
        attachmentUrl: sentMessage.attachment?.storageUrl,
      });
      
      setMessages((prev) => {
        if (prev.some((m) => m.id === sentMessage.id)) {
          return prev;
        }
        return [sentMessage, ...prev];
      });
      
      requestAnimationFrame(() => {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      });
    } catch (error: any) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message');
      setInput(messageText);
      if (imageToSend) {
        setSelectedImage(imageToSend);
      }
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp: string) => {
    if (!timestamp) return '';
    
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return '';
      }
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      console.error('Error formatting time:', error);
      return '';
    }
  };

  const getGroupName = () => {
    if (!groupDetails) return 'Loading...';
    return groupDetails.group?.name || 'Group Chat';
  };

  const getGroupAvatar = () => {
    if (!groupDetails) return 'G';
    return groupDetails.group?.name?.[0]?.toUpperCase() || 'G';
  };

  const getGroupAvatarUrl = () => {
    if (!groupDetails) return null;
    return groupDetails.group?.pictureUrl || null;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Avatar letter="?" size={40} />
          <Text style={styles.name}>Loading...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerInfo}
          onPress={() => setShowGroupInfo(true)}
          activeOpacity={0.7}
        >
          <Avatar 
            letter={getGroupAvatar()} 
            avatarUrl={getGroupAvatarUrl()}
            size={40}
          />
          <View style={{ width: 12 }} />
          <Text style={styles.name} numberOfLines={1}>
            {getGroupName()}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Messages Container ─── */}
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.messagesWrapper}>
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubble-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>
              Start the conversation by sending a message
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            inverted
            keyExtractor={(item, index) => item.id || `message-${index}`}
            contentContainerStyle={styles.messageList}
            onLayout={() => {
              if (messages.length > 0 && !loading) {
                setTimeout(() => {
                  flatListRef.current?.scrollToEnd({ animated: false });
                }, 100);
              }
            }}
            onContentSizeChange={() => {
              if (!loading && messages.length > 0) {
                requestAnimationFrame(() => {
                  flatListRef.current?.scrollToEnd({ animated: false });
                });
              }
            }}
            renderItem={({ item }) => {
              if (item.isDeleted) {
                return (
                  <View style={styles.deletedBubble}>
                    <Text style={styles.deletedText}>
                      <Ionicons name="ban" size={12} /> This message was deleted
                    </Text>
                  </View>
                );
              }

              // Check if it's a system message (like "User left the group", "User added User", etc.)
              const isSystemMessage = item.isSystemMessage || 
                (item.body && (
                  item.body.includes('left the group') || 
                  (item.body.includes('removed') && item.body.includes('from the group')) ||
                  (item.body.includes('added') && item.body.includes('to the group')) ||
                  (item.body.includes('promoted') && item.body.includes('to admin')) ||
                  (item.body.includes('demoted') && item.body.includes('to member'))
                ));
              
              if (isSystemMessage) {
                return (
                  <View style={styles.systemMessageContainer}>
                    <Text style={styles.systemMessageText}>
                      <Ionicons name="exit-outline" size={14} color="#666" /> {item.body}
                    </Text>
                  </View>
                );
              }

              const isMe = item.senderId === user?.id;
              // const SOCKET_URL ='http://192.168.1.107:3000';

              // Construct image URL
              const imageUrl = item.attachment?.storageUrl 
                ? `http://192.168.1.107:3000${item.attachment.storageUrl}`
                : null;
              
              // Debug attachment
              if (item.attachment) {
                console.log('📷 Group message has attachment:', {
                  messageId: item.id,
                  storageUrl: item.attachment.storageUrl,
                  fullUrl: imageUrl,
                });
              }
              
              return (
                <TouchableOpacity
                  key={item.id || `msg-${item.createdAt}`}
                  style={[
                    styles.messageBubble,
                    isMe ? styles.bubbleMe : styles.bubbleOther,
                  ]}
                  onLongPress={() => {
                    if (isMe && !item.isDeleted && !item.isSystemMessage) {
                      Alert.alert(
                        'Message Options',
                        'What would you like to do?',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Unsend',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await api.unsendMessage(item.id);
                                // Message will be updated via socket event
                              } catch (error: any) {
                                console.error('Unsend error:', error);
                                Alert.alert('Error', error.response?.data?.error || 'Failed to unsend message');
                              }
                            },
                          },
                        ]
                      );
                    }
                  }}
                  activeOpacity={isMe ? 0.7 : 1}
                >
                  {!isMe && item.senderName && (
                    <Text style={styles.senderName}>{item.senderName}</Text>
                  )}
                  {imageUrl ? (
                    <TouchableOpacity
                      onPress={() => setViewingImage(imageUrl)}
                      activeOpacity={0.9}
                      style={styles.imageTouchable}
                    >
                      <Image
                        source={{ uri: imageUrl }}
                        style={styles.messageImage}
                        resizeMode="cover"
                        onError={(error) => {
                          console.error('❌ Image load error:', {
                            url: imageUrl,
                            error: error.nativeEvent?.error,
                            messageId: item.id,
                            attachment: item.attachment,
                          });
                        }}
                        onLoad={() => {
                          console.log('✅ Image loaded successfully:', imageUrl);
                        }}
                        onLoadStart={() => {
                          console.log('🔄 Loading image:', imageUrl);
                        }}
                      />
                    </TouchableOpacity>
                  ) : item.attachment ? (
                    <View style={styles.imageErrorContainer}>
                      <Ionicons name="image-outline" size={24} color="#999" />
                      <Text style={styles.imageErrorText}>Image unavailable</Text>
                      <Text style={[styles.imageErrorText, { fontSize: 10, marginTop: 4 }]}>
                        {item.attachment.storageUrl}
                      </Text>
                    </View>
                  ) : null}
                  {item.body && (
                    <Text style={[styles.messageText, isMe && styles.textMe]}>
                      {item.body}
                    </Text>
                  )}
                  <View style={styles.messageFooter}>
                    <Text style={[styles.time, isMe && styles.timeMe]}>
                      {formatTime(item.createdAt)}
                      {item.editedAt && ' (edited)'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
        </View>

        {/* ─── Typing Indicator ─── */}
        {typingUsers.length > 0 && (
          <View style={styles.typingContainer}>
            <Text style={styles.typingText}>
              {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </Text>
          </View>
        )}

        {/* ─── Input ─── */}
        {!canSendMessages() ? (
          <View style={styles.restrictedInputContainer}>
            <Ionicons name="lock-closed" size={20} color="#999" />
            <Text style={styles.restrictedText}>
              Only admins can send messages in this group
            </Text>
          </View>
        ) : (
          <View style={styles.inputContainer}>
          <TouchableOpacity
            onPress={pickImage}
            style={styles.attachButton}
            disabled={sending}
          >
            <Ionicons name="add" size={28} color="#007AFF" />
          </TouchableOpacity>
        {selectedImage && (
          <View style={styles.selectedImageContainer}>
            <Image source={{ uri: selectedImage }} style={styles.selectedImage} />
            <TouchableOpacity
              style={styles.removeImageButton}
              onPress={() => setSelectedImage(null)}
            >
              <Ionicons name="close-circle" size={20} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        )}
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={input}
          onChangeText={handleInputChange}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
          editable={!sending}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          onPress={sendMessage}
          style={styles.sendBtn}
          disabled={sending || (!input.trim() && !selectedImage)}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Ionicons
              name="send"
              size={24}
              color={(input.trim() || selectedImage) ? '#007AFF' : '#ccc'}
            />
          )}
        </TouchableOpacity>
      </View>
        )}
      </KeyboardAvoidingView>

      {/* Group Info Modal */}
      <GroupInfoModal
        visible={showGroupInfo}
        onClose={() => setShowGroupInfo(false)}
        threadId={id}
        onGroupUpdated={() => {
          loadGroupDetails();
          loadMessages();
        }}
      />

      {/* ─── Image Viewer Modal ─── */}
      <ImageViewerModal
        visible={!!viewingImage}
        imageUrl={viewingImage}
        onClose={() => setViewingImage(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5f7fa',
  },

  keyboardView: {
    flex: 1,
    flexDirection: 'column',
  },
  messagesWrapper: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
    minHeight: 64,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  backBtn: { marginRight: 12 },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  name: { 
    fontSize: 18, 
    fontWeight: '600',
    flex: 1,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty state
  emptyContainer: {
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

  // Messages
  messageList: { 
    padding: 12,
    paddingBottom: 8,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginVertical: 4,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e5ea',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  messageText: { fontSize: 16, lineHeight: 20 },
  textMe: { color: '#fff' },
  imageTouchable: {
    marginBottom: 8,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  imageErrorContainer: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageErrorText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  time: { fontSize: 11, opacity: 0.7, alignSelf: 'flex-end' },
  timeMe: { color: '#fff' },

  // System message (like "User left the group")
  systemMessageContainer: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
    maxWidth: '80%',
  },
  systemMessageText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // Typing indicator
  typingContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  typingText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },

  // Deleted message
  deletedBubble: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginVertical: 4,
  },
  deletedText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },

  // Input
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 5,
  },
  attachButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
    marginRight: 8,
    marginBottom: 2,
  },
  selectedImageContainer: {
    position: 'relative',
    marginRight: 8,
    marginBottom: 8,
  },
  selectedImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
    fontSize: 16,
    marginRight: 8,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    color: '#000',
  },
  sendBtn: { 
    justifyContent: 'center',
    alignItems: 'center',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F2F2F7',
    marginBottom: 2,
  },
  restrictedInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#F5F5F5',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  restrictedText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});