import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View, ActivityIndicator, Alert } from 'react-native';
import { useChat } from '../../Contexts/ChatContext';

export const MessageInput = ({ threadId }: { threadId: string }) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const { connectionQuality, sendMessage } = useChat();

  const isDisconnected = connectionQuality === 'DISCONNECTED';

  const handleSend = async () => {
    if (!text.trim() || sending) return;

    setSending(true);
    try {
      await sendMessage(threadId, text.trim());
      setText('');
    } catch (error: any) {
      Alert.alert('Send Failed', error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.container, isDisconnected && styles.containerDisabled]}>
      <TextInput 
        style={[styles.input, isDisconnected && styles.inputDisabled]} 
        placeholder={isDisconnected ? "You are offline..." : "Type a message..."} 
        value={text} 
        onChangeText={setText}
        editable={!isDisconnected && !sending}
        placeholderTextColor={isDisconnected ? '#999' : '#666'}
      />
      <TouchableOpacity 
        onPress={handleSend} 
        style={styles.send}
        disabled={isDisconnected || !text.trim() || sending}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#0066ff" />
        ) : (
          <Ionicons 
            name="send" 
            size={24} 
            color={isDisconnected || !text.trim() ? "#ccc" : "#0066ff"} 
          />
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', padding: 8, alignItems: 'center', backgroundColor: '#fff' },
  containerDisabled: { backgroundColor: '#f5f5f5' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff' },
  inputDisabled: { backgroundColor: '#e5e5ea', borderColor: '#e5e5ea' },
  send: { marginLeft: 8 },
});