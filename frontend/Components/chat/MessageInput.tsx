import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

export const MessageInput = ({ onSend }: { onSend: (text: string) => void }) => {
  const [text, setText] = useState('');
  const send = () => text.trim() && (onSend(text), setText(''));
  return (
    <View style={styles.container}>
      <TextInput style={styles.input} placeholder="Type a message..." value={text} onChangeText={setText} />
      <TouchableOpacity onPress={send} style={styles.send}>
        <Ionicons name="send" size={24} color="#0066ff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', padding: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  send: { marginLeft: 8 },
});