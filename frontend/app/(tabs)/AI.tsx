import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../Contexts/AuthContext';
import { api } from '../../utils/api';

interface AIMessage {
  id: string;
  type: 'query' | 'response';
  text: string;
  timestamp: Date;
}

export default function AIChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // Check service availability on mount
    checkServiceAvailability();
    
    // Add welcome message
    setMessages([
      {
        id: 'welcome',
        type: 'response',
        text: "👋 Hi! I'm your AI assistant. Ask me anything about your conversations!\n\nExamples:\n• \"What did I discuss with John?\"\n• \"When did I mention the project deadline?\"\n• \"Who did I talk about cats with?\"",
        timestamp: new Date(),
      },
    ]);
  }, []);

  const checkServiceAvailability = async () => {
    // Don't check on mount - we'll check on first query attempt
    // This avoids unnecessary API calls and allows the service to start up
    // The banner will appear if the first query fails with 503
    setServiceAvailable(null); // null = unknown, will check on first query
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSendQuery = async () => {
    const queryText = input.trim();
    if (!queryText || loading || serviceAvailable === false) return;

    const queryMessage: AIMessage = {
      id: `query-${Date.now()}`,
      type: 'query',
      text: queryText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, queryMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await api.submitAIQuery(queryText);
      
      const responseMessage: AIMessage = {
        id: `response-${Date.now()}`,
        type: 'response',
        text: response.result?.answerText || 'No response received',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, responseMessage]);
      setServiceAvailable(true); // Service is working
    } catch (error: any) {
      console.error('AI query error:', error);
      
      // Check if service is unavailable
      if (error.response?.status === 503 || error.response?.data?.serviceUnavailable) {
        setServiceAvailable(false);
        const errorMessage: AIMessage = {
          id: `error-${Date.now()}`,
          type: 'response',
          text: 'AI service is currently unavailable. Please try again later.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } else {
        const errorMessage: AIMessage = {
          id: `error-${Date.now()}`,
          type: 'response',
          text: error.response?.data?.error || 'Failed to get response. Please try again.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: AIMessage }) => {
    const isQuery = item.type === 'query';
    
    return (
      <View style={styles.messageContainer}>
        <View
          style={[
            styles.messageBubble,
            isQuery ? styles.queryBubble : styles.responseBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isQuery ? styles.queryText : styles.responseText,
            ]}
          >
            {item.text}
          </Text>
          <Text
            style={[
              styles.timestamp,
              isQuery ? styles.queryTimestamp : styles.responseTimestamp,
            ]}
          >
            {item.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Ionicons name="sparkles" size={24} color="#007AFF" />
          <Text style={styles.headerTitle}>AI Assistant</Text>
        </View>
      </View>

      {/* Service Unavailable Banner */}
      {serviceAvailable === false && (
        <View style={styles.unavailableBanner}>
          <Ionicons name="warning" size={20} color="#FF9500" />
          <Text style={styles.unavailableText}>
            Service not available - Unable to send messages
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Messages */}
        <View style={styles.messagesWrapper}>
          {messages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Start asking questions!</Text>
              <Text style={styles.emptySubtext}>
                Ask me anything about your conversations
              </Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messageList}
              showsVerticalScrollIndicator={false}
            />
          )}

          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.loadingText}>Thinking...</Text>
            </View>
          )}
        </View>

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              serviceAvailable === false && styles.inputDisabled
            ]}
            placeholder={
              serviceAvailable === false
                ? "Service unavailable..."
                : "Ask me anything about your conversations..."
            }
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSendQuery}
            returnKeyType="send"
            editable={!loading && serviceAvailable !== false}
            multiline
            maxLength={500}
            placeholderTextColor="#999"
          />
          <TouchableOpacity
            onPress={handleSendQuery}
            style={[
              styles.sendBtn,
              (loading || !input.trim() || serviceAvailable === false) && styles.sendBtnDisabled
            ]}
            disabled={loading || !input.trim() || serviceAvailable === false}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Ionicons
                name="send"
                size={24}
                color={
                  serviceAvailable === false || !input.trim()
                    ? '#ccc'
                    : '#007AFF'
                }
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
  },
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
  messageList: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  messageContainer: {
    marginVertical: 6,
  },
  messageBubble: {
    maxWidth: '85%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  queryBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  responseBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e5ea',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  queryText: {
    color: '#fff',
  },
  responseText: {
    color: '#000',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 6,
    opacity: 0.7,
  },
  queryTimestamp: {
    color: '#fff',
    alignSelf: 'flex-end',
  },
  responseTimestamp: {
    color: '#666',
    alignSelf: 'flex-start',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f2f2f7',
    borderRadius: 20,
    marginRight: 8,
    color: '#000',
  },
  sendBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f2f2f7',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  unavailableBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3E0',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFE0B2',
    gap: 8,
  },
  unavailableText: {
    fontSize: 14,
    color: '#FF9500',
    fontWeight: '500',
  },
  inputDisabled: {
    backgroundColor: '#e5e5ea',
    opacity: 0.6,
  },
});
