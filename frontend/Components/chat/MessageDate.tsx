// components/chat/MessageDate.tsx
import { StyleSheet, Text, View } from 'react-native';

export const MessageDate = ({ time }: { time: number }) => {
  const date = new Date(time);
  const today = new Date();
  let label = '';

  if (date.toDateString() === today.toDateString()) {
    label = 'Today';
  } else if (date.toDateString() === new Date(today.setDate(today.getDate() - 1)).toDateString()) {
    label = 'Yesterday';
  } else {
    label = date.toLocaleDateString();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginVertical: 12 },
  text: { fontSize: 12, color: '#999', backgroundColor: '#f0f0f0', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
});