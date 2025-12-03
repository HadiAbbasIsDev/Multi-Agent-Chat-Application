// Contexts/ChatContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { socketService } from '../utils/socket';
import { api } from '../utils/api';

// Types
export type ConnectionQuality = 'GOOD' | 'POOR' | 'DISCONNECTED';
export interface RetrievedMessage {
  id: string;
  senderName: string;
  body: string;
  threadId: string;
}

interface ChatContextProps {
  isOnline: boolean;
  connectionQuality: ConnectionQuality;
  latency: number;
  offlineMessages: RetrievedMessage[]; // <--- NEW: Store offline messages found
  clearOfflineNotification: () => void; // <--- NEW: Function to dismiss alert
  sendMessage: (threadId: string, body: string, file?: any) => Promise<any>;
}

const ChatContext = createContext<ChatContextProps>({
  isOnline: false,
  connectionQuality: 'DISCONNECTED',
  latency: 0,
  offlineMessages: [],
  clearOfflineNotification: () => {},
  sendMessage: async () => {},
});

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('DISCONNECTED');
  const [latency, setLatency] = useState(0);
  const [offlineMessages, setOfflineMessages] = useState<RetrievedMessage[]>([]);
  
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appState = useRef(AppState.currentState);

  // --- SYNC FUNCTION ---
  const syncOfflineMessages = async () => {
    try {
      console.log('🔄 Syncing offline messages...');
      const data = await api.getPendingMessages();
      
      if (data && data.messages && data.messages.length > 0) {
        console.log(`📥 Retrieved ${data.messages.length} messages from queue`);
        
        // Format them for the UI
        const retrieved = data.messages.map((msg: any) => ({
          id: msg.id,
          senderName: msg.senderName,
          body: msg.body,
          threadId: msg.threadId
        }));

        setOfflineMessages(retrieved);
        
        // OPTIONAL: Auto-hide after 5 seconds
        setTimeout(() => setOfflineMessages([]), 8000);
      }
    } catch (error) {
      console.log('Sync failed:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      await socketService.connect();
      startHeartbeat();
      // Try to sync immediately on load
      syncOfflineMessages(); 
    };
    init();

    // App State Listener
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('📱 App came to foreground - Syncing...');
        
        // 1. Reconnect Socket
        socketService.disconnect();
        setTimeout(async () => {
          await socketService.connect();
          startHeartbeat();
          
          // 2. FETCH MISSED MESSAGES
          await syncOfflineMessages();
        }, 500);
      }
      appState.current = nextAppState;
    });

    return () => {
      stopHeartbeat();
      socketService.disconnect();
      subscription.remove();
    };
  }, []);

  // ... (Keep existing startHeartbeat, stopHeartbeat, sendMessage code) ...
  // ... (Include startHeartbeat from previous response) ...

  const startHeartbeat = () => {
     if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
     pingIntervalRef.current = setInterval(() => {
        if (socketService.isConnected) {
            socketService.ping((ms) => {
                setLatency(ms);
                setIsOnline(true);
                setConnectionQuality(ms < 500 ? 'GOOD' : 'POOR');
            });
        } else {
            setIsOnline(false);
            setConnectionQuality('DISCONNECTED');
        }
     }, 10000);
  };

  const stopHeartbeat = () => {
     if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
  };

  // ... (Keep sendMessage code) ...
  const sendMessage = async (threadId: string, body: string, file?: any) => {
      // ... previous implementation ...
      // (Simplified for brevity, use the version from previous answer)
       if (connectionQuality === 'DISCONNECTED' && !socketService.isConnected) {
         throw new Error("You are offline.");
       }
       return await api.sendMessage(threadId, body, file);
  };

  return (
    <ChatContext.Provider value={{ 
      isOnline, 
      connectionQuality, 
      latency, 
      offlineMessages, // Export state
      clearOfflineNotification: () => setOfflineMessages([]), // Export clear function
      sendMessage 
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);