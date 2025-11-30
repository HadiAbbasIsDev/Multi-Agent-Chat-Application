// app/chat/[id].tsx
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
import { UserProfileModal } from '../../Components/common/UserProfileModal';
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
  isRead?: boolean;
  isDelivered?: boolean;
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

interface ThreadDetails {
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
    ownerId: string;
    memberCount: number;
    pictureUrl?: string;
    maxMembers: number;
    yourRole: string;
    members?: any[];
  };
  createdAt?: string;
  lastMessageAt?: string;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [threadDetails, setThreadDetails] = useState<ThreadDetails | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (id) {
      loadThreadDetails();
      loadMessages();
      
      // Join the thread room for real-time updates
      socketService.joinThread(id);
      
      // Set up socket listeners
      setupSocketListeners();
      
      // Mark all messages as read when chat is opened
      const markAsRead = async () => {
        try {
          await api.markThreadAsRead(id);
        } catch (error) {
          console.error('Failed to mark messages as read:', error);
        }
      };
      markAsRead();
      
      // Clean up on unmount
      return () => {
        socketService.leaveThread(id);
        cleanupSocketListeners();
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
      };
    }
  }, [id]);

  // Scroll to bottom whenever messages change (after initial load)
  useEffect(() => {
    if (!loading && messages.length > 0) {
      // Use requestAnimationFrame to ensure DOM is ready
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
      console.log('📨 New message received via socket:', message);
      if (message.threadId === id) {
        setMessages((prev) => {
          // Check if message already exists (avoid duplicates from optimistic updates)
          if (prev.some(m => m.id === message.id)) {
            console.log('⚠️ Message already exists, skipping:', message.id);
            return prev;
          }
          
          // Mark as read if it's from the other person and we're viewing the chat
          if (message.senderId !== user?.id && threadDetails?.type === 'DIRECT') {
            // Auto-mark as read when viewing direct chat
            api.markMessageAsRead(message.id).catch(err => 
              console.error('Failed to mark message as read:', err)
            );
          }
          
          // Add senderName if missing - get from threadDetails or current user
          const enrichedMessage = {
            ...message,
            senderId: message.senderId,  // Ensure senderId is present
            senderName: message.senderName || 
              (message.senderId === user?.id 
                ? user?.displayName || 'You' 
                : threadDetails?.otherUser?.displayName || 
                  threadDetails?.group?.members?.find((m: any) => m.userId === message.senderId)?.displayName || 
                  'Unknown'),
            // Ensure attachment is included
            attachment: message.attachment || message.data?.attachment || null,
          };
          
          console.log('✅ Adding message to state:', {
            id: enrichedMessage.id,
            senderId: enrichedMessage.senderId,
            currentUserId: user?.id,
            isMe: enrichedMessage.senderId === user?.id
          });
          
          return [enrichedMessage, ...prev];
        });
        
        // Mark as read if it's from someone else
        if (message.senderId !== user?.id) {
          api.markMessageAsRead(message.id).catch(console.error);
        }
        
        // Scroll to newest message
        requestAnimationFrame(() => {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 200);
        });
      }
    });

    // Listen for message edits
    socketService.onMessageEdited((data) => {
      console.log('✏️ Message edited:', data);
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

    // Listen for message deletions
    socketService.onMessageDeleted((data) => {
      console.log('🗑️ Message deleted:', data);
      if (data.threadId === id) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === data.messageId
              ? { ...msg, isDeleted: true }
              : msg
          )
        );
      }
    });

    // Listen for read receipt updates
    socketService.onMessageRead((data) => {
      console.log('✅ Message read receipt received:', data);
      if (data.threadId === id) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === data.messageId ? { ...msg, isRead: true, isDelivered: true } : msg
          )
        );
      }
    });

    // Listen for typing indicators
    socketService.onUserTyping((data) => {
      // Only show typing indicator for other users, not yourself
      if (data.threadId === id && data.userId !== user?.id && data.displayName) {
        setTypingUsers((prev) => {
          // Check if this user is already in the list
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
    socketService.off('user_typing');
    socketService.off('user_stopped_typing');
    socketService.off('message_read');
  };

  const loadThreadDetails = async () => {
    try {
      const response = await api.getThreadDetails(id);
      console.log('✅ Thread details loaded:', response);
      
      // Handle both response.thread and direct response
      const threadData = response.thread || response;
      setThreadDetails(threadData);
    } catch (error) {
      console.error('Failed to load thread details:', error);
      Alert.alert('Error', 'Failed to load chat details');
      router.back();
    }
  };

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await api.getMessages(id);
      let messages = response.messages || [];
      
      // Ensure messages are sorted: newest first (for inverted FlatList)
      // Backend should return newest first, but let's ensure it
      messages = messages.sort((a: Message, b: Message) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeB - timeA; // Newest first
      });
      
      // Ensure all messages have attachment data and read receipt status
      messages = messages.map((msg: Message) => ({
        ...msg,
        attachment: msg.attachment || null,
        isRead: msg.isRead || false,
        isDelivered: msg.isDelivered || false,
      }));
      
      // Debug: Log messages with attachments
      const messagesWithAttachments = messages.filter((m: Message) => m.attachment);
      if (messagesWithAttachments.length > 0) {
        console.log('📷 Messages with attachments:', messagesWithAttachments.map((m: Message) => ({
          id: m.id,
          attachment: m.attachment,
          url: m.attachment?.storageUrl ? `http://192.168.0.111:3000${m.attachment.storageUrl}` : null,
        })));
      }
      
      console.log('📥 Loaded messages:', {
        count: messages.length,
        withAttachments: messagesWithAttachments.length,
        newest: messages[0]?.body?.substring(0, 30),
        oldest: messages[messages.length - 1]?.body?.substring(0, 30),
        newestTime: messages[0]?.createdAt,
        oldestTime: messages[messages.length - 1]?.createdAt
      });
      
      setMessages(messages);
      
      // Force scroll after messages are set
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

  const sendMessage = async () => {
    if ((!input.trim() && !selectedImage) || sending) return;

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
      
      console.log('📤 Message sent, full response:', JSON.stringify(response, null, 2));
      
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
      
      console.log('📤 Processed sent message:', {
        id: sentMessage.id,
        hasAttachment: !!sentMessage.attachment,
        attachmentUrl: sentMessage.attachment?.storageUrl,
      });
      
      // Add message optimistically (will be deduplicated by socket listener)
      setMessages((prev) => {
        // Check if message already exists
        if (prev.some(m => m.id === sentMessage.id)) {
          return prev;
        }
        return [sentMessage, ...prev];
      });
      
      // Scroll to bottom (newest message)
      requestAnimationFrame(() => {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      });
    } catch (error: any) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message');
      // Restore the input if sending failed
      setInput(messageText);
      if (imageToSend) {
        setSelectedImage(imageToSend);
      }
    } finally {
      setSending(false);
    }
  };

  const handleInputChange = (text: string) => {
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

  const getThreadName = () => {
    if (!threadDetails) return 'Loading...';
    
    if (threadDetails.type === 'GROUP' && threadDetails.group) {
      return threadDetails.group.name || 'Group Chat';
    }
    
    if (threadDetails.type === 'DIRECT' && threadDetails.otherUser) {
      return threadDetails.otherUser.displayName;
    }
    
    return 'Unknown User';
  };

  const getThreadAvatar = () => {
    if (!threadDetails) return '?';
    
    if (threadDetails.type === 'GROUP' && threadDetails.group) {
      return threadDetails.group.name?.[0]?.toUpperCase() || 'G';
    }
    
    if (threadDetails.type === 'DIRECT' && threadDetails.otherUser) {
      return threadDetails.otherUser.displayName?.[0]?.toUpperCase() || '?';
    }
    
    return '?';
  };

  const getThreadAvatarUrl = () => {
    if (!threadDetails) return null;
    
    if (threadDetails.type === 'GROUP' && threadDetails.group) {
      return threadDetails.group.pictureUrl || null;
    }
    
    if (threadDetails.type === 'DIRECT' && threadDetails.otherUser) {
      return threadDetails.otherUser.avatarUrl || null;
    }
    
    return null;
  };

  const getOtherUser = () => {
    if (!threadDetails) return null;
    if (threadDetails.type === 'DIRECT' && threadDetails.otherUser) {
      return {
        id: threadDetails.otherUser.id,
        displayName: threadDetails.otherUser.displayName,
        email: '', // We don't have email in threadDetails, but that's okay
        avatarUrl: threadDetails.otherUser.avatarUrl,
        lastActiveAt: threadDetails.otherUser.lastActiveAt,
      };
    }
    return null;
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
        <Avatar 
          letter={getThreadAvatar()} 
          avatarUrl={getThreadAvatarUrl()}
          size={40}
        />
        <View style={{ width: 12 }} />
        <TouchableOpacity
          style={styles.nameContainer}
          onPress={() => {
            if (threadDetails?.type === 'DIRECT') {
              setProfileModalVisible(true);
            }
          }}
          activeOpacity={threadDetails?.type === 'DIRECT' ? 0.7 : 1}
        >
          <Text style={styles.name} numberOfLines={1}>
            {getThreadName()}
          </Text>
          {threadDetails?.type === 'DIRECT' && (
            <Ionicons name="chevron-forward" size={16} color="#666" style={styles.chevron} />
          )}
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
              // Scroll to bottom when layout is ready
              if (messages.length > 0 && !loading) {
                setTimeout(() => {
                  flatListRef.current?.scrollToEnd({ animated: false });
                }, 100);
              }
            }}
            onContentSizeChange={() => {
              // Scroll to bottom when content size changes (new messages)
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

              const isMe = item.senderId === user?.id;
              
              // Debug logging
              if (!item.senderId) {
                console.warn('⚠️ Message missing senderId:', item);
              }
              
              // Construct image URL - use the same base URL as API
              const imageUrl = item.attachment?.storageUrl 
                ? `http://192.168.0.111:3000${item.attachment.storageUrl}`
                : null;
              
              // Debug attachment
              if (item.attachment) {
                console.log('📷 Message has attachment:', {
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
                    if (isMe && !item.isDeleted) {
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
                  {!isMe && threadDetails?.type === 'GROUP' && item.senderName && (
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
                    {isMe && (
                      <View style={styles.readReceipt}>
                        <Ionicons 
                          name="checkmark" 
                          size={16} 
                          color={item.isRead ? '#007AFF' : '#999'} 
                          style={styles.singleTick}
                        />
                        {item.isRead && (
                          <Ionicons 
                            name="checkmark" 
                            size={16} 
                            color="#007AFF" 
                            style={styles.doubleTick}
                          />
                        )}
                      </View>
                    )}
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
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
            editable={!sending}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            onPress={() => sendMessage()}
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
      </KeyboardAvoidingView>

      {/* ─── Profile Modal ─── */}
      {threadDetails?.type === 'DIRECT' && (
        <UserProfileModal
          visible={profileModalVisible}
          onClose={() => setProfileModalVisible(false)}
          user={getOtherUser()}
          threadId={id}
          onContactRemoved={() => {
            router.back();
          }}
        />
      )}

      {/* ─── Image Viewer Modal ─── */}
      <ImageViewerModal
        visible={!!viewingImage}
        imageUrl={viewingImage}
        onClose={() => setViewingImage(null)}
      />
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────────────
// Styles – clean, modern, iPhone‑perfect
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f2f2f7',
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
    borderColor: '#ddd',
    minHeight: 64,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  backBtn: { marginRight: 12 },
  nameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: { 
    fontSize: 18, 
    fontWeight: '600', 
    flex: 1,
    marginRight: 4,
  },
  chevron: {
    marginLeft: 4,
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
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#e5e5ea',
    borderBottomLeftRadius: 4,
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
  readReceipt: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  singleTick: {
    marginLeft: -2,
  },
  doubleTick: {
    marginLeft: -8,
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

  // Input
  // inputContainer: {
  //   flexDirection: 'row',
  //   paddingHorizontal: 12,
  //   paddingVertical: 10,
  //   backgroundColor

  // Input
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    width: '100%',
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
    backgroundColor: '#f1f1f1',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    marginRight: 8,
    minHeight: 40,
    maxHeight: 100,
  },
  sendBtn: { 
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
    marginBottom: 2,
  },
});