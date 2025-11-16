// app/chat/[id].tsx
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
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

// ──────────────────────────────────────────────────────────────
// Mock data – replace with real API later
// ──────────────────────────────────────────────────────────────
const mockMessages = [
  { id: '1', text: 'Hey! How are you?', sender: 'other', time: Date.now() - 300_000 },
  { id: '2', text: 'I’m great! Working on a new app.', sender: 'me', time: Date.now() - 240_000 },
  { id: '3', text: 'React Native?', sender: 'other', time: Date.now() - 180_000 },
  { id: '4', text: 'Yes! Expo Router + TypeScript.', sender: 'me', time: Date.now() - 120_000 },
];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [messages, setMessages] = useState(mockMessages);
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // Scroll to bottom when new message arrives
  useEffect(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMsg = {
      id: Date.now().toString(),
      text: input.trim(),
      sender: 'me' as const,
      time: Date.now(),
    };
    setMessages((prev) => [newMsg, ...prev]);
    setInput('');
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const otherName = id === '1' ? 'Fast Friends' : 'Badminton Hangout';

  return (
    <SafeAreaView style={styles.container}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{otherName[0]}</Text>
        </View>
        <Text style={styles.name}>{otherName}</Text>
      </View>

      {/* ─── Messages ─── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          inverted
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => {
            const isMe = item.sender === 'me';
            return (
              <View
                style={[
                  styles.messageBubble,
                  isMe ? styles.bubbleMe : styles.bubbleOther,
                ]}
              >
                <Text style={[styles.messageText, isMe && styles.textMe]}>
                  {item.text}
                </Text>
                <Text style={[styles.time, isMe && styles.timeMe]}>
                  {formatTime(item.time)}
                </Text>
              </View>
            );
          }}
        />
      </KeyboardAvoidingView>

      {/* ─── Input ─── */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
        />
        <TouchableOpacity onPress={sendMessage} style={styles.sendBtn}>
          <Ionicons name="send" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────────────
// Styles – clean, modern, iPhone‑perfect
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },

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
  name: { fontSize: 18, fontWeight: '600' },

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
  messageText: { fontSize: 16, lineHeight: 20 },
  textMe: { color: '#fff' },
  time: { fontSize: 11, opacity: 0.7, marginTop: 4, alignSelf: 'flex-end' },
  timeMe: { color: '#fff' },

  // Input
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#f1f1f1',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    marginRight: 8,
  },
  sendBtn: { justifyContent: 'center' },
});