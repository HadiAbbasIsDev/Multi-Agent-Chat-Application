import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../common/Avatar';

export const ChatHeader = ({ name }: { name: string }) => (
  <View style={styles.header}>
    <Avatar letter={name[0]} />
    <Text style={styles.name}>{name}</Text>
  </View>
);

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  name: { marginLeft: 12, fontWeight: '600', fontSize: 18 },
});