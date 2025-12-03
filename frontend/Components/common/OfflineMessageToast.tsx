// Components/common/OfflineMessageToast.tsx
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChat } from '../../Contexts/ChatContext';

export const OfflineMessageToast = () => {
  const { offlineMessages, clearOfflineNotification } = useChat();
  const slideAnim = React.useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (offlineMessages.length > 0) {
      // Slide Down
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Slide Up (Hide)
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [offlineMessages]);

  if (offlineMessages.length === 0) return null;

  const count = offlineMessages.length;
  // Get unique senders
  const senders = Array.from(new Set(offlineMessages.map(m => m.senderName)));
  const senderText = senders.length > 1 
    ? `${senders[0]} and ${senders.length - 1} others` 
    : senders[0];

  return (
    <Animated.View style={[styles.toast, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.iconContainer}>
        <Ionicons name="cloud-download" size={24} color="#fff" />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>You're back online!</Text>
        <Text style={styles.subtitle}>
          Retrieved {count} missed message{count > 1 ? 's' : ''} from {senderText}.
        </Text>
      </View>
      <TouchableOpacity onPress={clearOfflineNotification}>
        <Ionicons name="close" size={20} color="#fff" style={{ opacity: 0.8 }} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 50, // Adjust based on your header height/safe area
    left: 20,
    right: 20,
    backgroundColor: '#34C759', // Success Green
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 9999, // Ensure it sits on top
  },
  iconContainer: {
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  subtitle: {
    color: '#fff',
    fontSize: 12,
  },
});