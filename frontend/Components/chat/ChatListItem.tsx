import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from '../common/Avatar';

export const ChatListItem = ({ chat, onPress }: { chat: any; onPress: () => void }) => (
  <TouchableOpacity onPress={onPress} style={styles.container}>
    <View style={styles.avatarContainer}>
      <Avatar letter={chat.avatar} avatarUrl={chat.avatarUrl} />
      {chat.unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
          </Text>
        </View>
      )}
    </View>
    <View style={styles.content}>
      <View style={styles.nameRow}>
        <Text style={[styles.name, chat.unreadCount > 0 && styles.nameUnread]}>
          {chat.name}
        </Text>
      </View>
      <Text style={[styles.message, chat.unreadCount > 0 && styles.messageUnread]} numberOfLines={1}>
        {chat.lastMessage}
      </Text>
    </View>
    <View style={styles.rightSection}>
      <Text style={styles.time}>{chat.time}</Text>
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { 
    flexDirection: 'row', 
    padding: 12, 
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  avatarContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  content: { 
    flex: 1, 
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: { 
    fontWeight: '600', 
    fontSize: 16,
    color: '#000',
  },
  nameUnread: {
    fontWeight: '700',
  },
  message: { 
    color: '#666', 
    fontSize: 14,
  },
  messageUnread: {
    color: '#000',
    fontWeight: '500',
  },
  rightSection: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minWidth: 60,
  },
  time: { 
    fontSize: 12, 
    color: '#999',
    marginBottom: 4,
  },
});