import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../common/Avatar';
import { useChat } from '../../Contexts/ChatContext';

interface ChatHeaderProps {
  name: string;
  avatarUrl?: string | null;
}

export const ChatHeader = ({ name, avatarUrl }: ChatHeaderProps) => {
  const { connectionQuality } = useChat();

  let statusText = '';
  let statusColor = 'transparent';

  if (connectionQuality === 'POOR') {
    statusText = 'Weak Connection...';
    statusColor = '#FF9500'; // Orange
  } else if (connectionQuality === 'DISCONNECTED') {
    statusText = 'Waiting for connection...';
    statusColor = '#FF3B30'; // Red
  }

  return (
    <View style={styles.header}>
      <Avatar letter={name[0] || '?'} avatarUrl={avatarUrl} />
      <View style={styles.textContainer}>
        <Text style={styles.name}>{name}</Text>
        {statusText ? (
          <Text style={[styles.status, { color: statusColor }]}>{statusText}</Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: '#fff' },
  textContainer: { marginLeft: 12, justifyContent: 'center' },
  name: { fontWeight: '600', fontSize: 18 },
  status: { fontSize: 12, marginTop: 2 },
});