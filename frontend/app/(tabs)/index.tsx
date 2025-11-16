// app/(tabs)/index.tsx
import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { ChatListItem } from '../../Components/chat/ChatListItem';

const mockChats = [
  {
    id: '1',
    name: 'Alice',
    lastMessage: 'Hey, how are you?',
    time: '5 min ago',
    avatar: 'A',
  },
  {
    id: '2',
    name: 'Bob',
    lastMessage: 'See you tomorrow!',
    time: '2 hours ago',
    avatar: 'B',
  },
];

export default function Chats() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <FlatList
        data={mockChats}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatListItem
            chat={item}
            onPress={() => router.push(`/chat/${item.id}`)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
});