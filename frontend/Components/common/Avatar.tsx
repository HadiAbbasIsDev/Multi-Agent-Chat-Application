import { StyleSheet, Text, View } from 'react-native';

export const Avatar = ({ letter }: { letter: string }) => (
  <View style={styles.avatar}>
    <Text style={styles.letter}>{letter}</Text>
  </View>
);

const styles = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#0066ff', justifyContent: 'center', alignItems: 'center' },
  letter: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
});