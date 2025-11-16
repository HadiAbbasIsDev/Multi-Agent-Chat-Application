import { StyleSheet, Text, View } from 'react-native';

export const MessageBubble = ({ message }: { message: any }) => {
  const isMe = message.sender === 'me';
  return (
    <View style={[styles.bubble, isMe ? styles.me : styles.other]}>
      <Text style={[styles.text, isMe && { color: '#fff' }]}>{message.text}</Text>
      <Text style={[styles.time, isMe && { color: '#ddd' }]}>
        {new Date(message.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: { maxWidth: '75%', padding: 10, borderRadius: 18, marginVertical: 4, marginHorizontal: 12 },
  me: { alignSelf: 'flex-end', backgroundColor: '#0066ff' },
  other: { alignSelf: 'flex-start', backgroundColor: '#e5e5ea' },
  text: { color: '#000' },
  time: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
});