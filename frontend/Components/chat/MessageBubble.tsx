import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const MessageBubble = ({ message }: { message: any }) => {
  const isMe = message.senderId === 'me'; // Adjusted to match likely ID from context
  
  // Render status icon
  const renderStatus = () => {
    if (!isMe) return null;

    if (message.deliveryStatus === 'PENDING') {
      return <Ionicons name="time-outline" size={14} color="#ddd" />;
    }
    if (message.deliveryStatus === 'SENT') {
      return <Ionicons name="checkmark" size={14} color="#ddd" />;
    }
    if (message.deliveryStatus === 'DELIVERED') {
      return <Ionicons name="checkmark-done" size={14} color="#ddd" />;
    }
    if (message.status === 'READ') { // Assuming 'read' status overrides delivery
      return <Ionicons name="checkmark-done" size={14} color="#4cd964" />; // Green/Blue for read
    }
    return null;
  };

  return (
    <View style={[styles.bubble, isMe ? styles.me : styles.other]}>
      <Text style={[styles.text, isMe && { color: '#fff' }]}>{message.body}</Text>
      <View style={styles.footer}>
        <Text style={[styles.time, isMe && { color: '#ddd' }]}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {isMe && <View style={styles.iconContainer}>{renderStatus()}</View>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: { maxWidth: '75%', padding: 10, borderRadius: 18, marginVertical: 4, marginHorizontal: 12 },
  me: { alignSelf: 'flex-end', backgroundColor: '#0066ff' },
  other: { alignSelf: 'flex-start', backgroundColor: '#e5e5ea' },
  text: { color: '#000' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 },
  time: { fontSize: 10 },
  iconContainer: { marginLeft: 4 },
});