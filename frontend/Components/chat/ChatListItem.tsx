import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from '../common/Avatar';

export const ChatListItem = ({ chat, onPress }: { chat: any; onPress: () => void }) => (
  <TouchableOpacity onPress={onPress} style={styles.container}>
    <Avatar letter={chat.avatar} avatarUrl={chat.avatarUrl} />
    <View style={styles.content}>
      <Text style={styles.name}>{chat.name}</Text>
      <Text style={styles.message} numberOfLines={1}>{chat.lastMessage}</Text>
    </View>
    <Text style={styles.time}>{chat.time}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  content: { flex: 1, marginLeft: 12 },
  name: { fontWeight: '600', fontSize: 16 },
  message: { color: '#666', fontSize: 14 },
  time: { fontSize: 12, color: '#999' },
});