// app/chat/[id].tsx
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../Contexts/AuthContext';
import { api } from '../../utils/api';
import { socketService } from '../../utils/socket';

interface Message {
  id: string;
  body: string;
  senderId: string;
  senderName?: string;
  createdAt: string;
  editedAt?: string;
  isDeleted?: boolean;
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
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }, 200);
    }
  }, [loading]);

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
          
          // Add senderName if missing - get from threadDetails or current user
          const enrichedMessage = {
            ...message,
            senderId: message.senderId,  // Ensure senderId is present
            senderName: message.senderName || 
              (message.senderId === user?.id 
                ? user.displayName 
                : threadDetails?.otherUser?.displayName || 
                  threadDetails?.group?.members?.find((m: any) => m.userId === message.senderId)?.displayName || 
                  'Unknown'),
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
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, 100);
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

    // Listen for typing indicators
    socketService.onUserTyping((data) => {
      if (data.threadId === id && data.userId !== user?.id) {
        setTypingUsers((prev) => {
          if (!prev.includes(data.displayName)) {
            return [...prev, data.displayName];
          }
          return prev;
        });
      }
    });

    socketService.onUserStoppedTyping((data) => {
      if (data.threadId === id) {
        setTypingUsers((prev) => prev.filter((name) => name !== data.displayName));
      }
    });
  };

  const cleanupSocketListeners = () => {
    socketService.off('new_message');
    socketService.off('message_edited');
    socketService.off('message_deleted');
    socketService.off('user_typing');
    socketService.off('user_stopped_typing');
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
      const messages = response.messages || [];
      
      console.log('📥 Loaded messages:', {
        count: messages.length,
        firstMessage: messages[0]?.body,
        lastMessage: messages[messages.length - 1]?.body
      });
      
      setMessages(messages);
    } catch (error) {
      console.error('Failed to load messages:', error);
      Alert.alert('Error', 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const messageText = input.trim();
    setInput('');
    
    // Stop typing indicator
    socketService.stopTyping(id);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    try {
      setSending(true);
      const response = await api.sendMessage(id, messageText);
      
      console.log('📤 Message sent, response:', response);
      
      // Ensure the message has the correct senderId
      const sentMessage = {
        ...response.message,
        senderId: response.message.senderId || user?.id,
        senderName: response.message.senderName || user?.displayName,
      };
      
      // Add message optimistically (will be deduplicated by socket listener)
      setMessages((prev) => {
        // Check if message already exists
        if (prev.some(m => m.id === sentMessage.id)) {
          return prev;
        }
        return [sentMessage, ...prev];
      });
      
      // Scroll to top (which is the latest message since inverted)
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (error: any) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message');
      // Restore the input if sending failed
      setInput(messageText);
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>?</Text>
          </View>
          <Text style={styles.name}>Loading...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getThreadAvatar()}</Text>
        </View>
        <Text style={styles.name}>{getThreadName()}</Text>
      </View>

      {/* ─── Messages ─── */}
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
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
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
            }}
            onContentSizeChange={() => {
              // Scroll to bottom when content size changes (new messages)
              if (!loading) {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
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
              
              return (
                <View
                  key={item.id || `msg-${item.createdAt}`}
                  style={[
                    styles.messageBubble,
                    isMe ? styles.bubbleMe : styles.bubbleOther,
                  ]}
                >
                  {!isMe && threadDetails?.type === 'GROUP' && item.senderName && (
                    <Text style={styles.senderName}>{item.senderName}</Text>
                  )}
                  <Text style={[styles.messageText, isMe && styles.textMe]}>
                    {item.body}
                  </Text>
                  <View style={styles.messageFooter}>
                    <Text style={[styles.time, isMe && styles.timeMe]}>
                      {formatTime(item.createdAt)}
                      {item.editedAt && ' (edited)'}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </KeyboardAvoidingView>

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
          disabled={sending || !input.trim()}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Ionicons
              name="send"
              size={24}
              color={input.trim() ? '#007AFF' : '#ccc'}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
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
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  backBtn: { marginRight: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  name: { fontSize: 18, fontWeight: '600', flex: 1 },

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
  messageList: { padding: 12 },
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
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  time: { fontSize: 11, opacity: 0.7, alignSelf: 'flex-end' },
  timeMe: { color: '#fff' },

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
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom:20,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    alignItems: 'flex-end',
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