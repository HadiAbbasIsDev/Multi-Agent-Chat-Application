import { useEffect, useRef } from 'react';
import { api } from './api';
import { ConnectionQuality } from './socket';

export const useHttpFallback = (
  connectionQuality: ConnectionQuality,
  onNewMessages: (messages: any[]) => void
) => {
  const lastPollTime = useRef<string>(new Date().toISOString());
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Start polling if connection is POOR or DISCONNECTED
    // (We try polling even if disconnected, as WebSocket might be blocked but HTTP works)
    if (connectionQuality !== 'GOOD') {
      startPolling();
    } else {
      stopPolling();
    }

    return () => stopPolling();
  }, [connectionQuality]);

  const startPolling = () => {
    if (pollingInterval.current) return;

    console.log('🔄 Starting HTTP Fallback Polling...');
    
    pollingInterval.current = setInterval(async () => {
      try {
        // Poll for messages since the last successful poll
        const data = await api.pollPendingMessages(lastPollTime.current);
        
        if (data.messages && data.messages.length > 0) {
          console.log(`📥 Polled ${data.messages.length} new messages`);
          onNewMessages(data.messages);
          // Update timestamp to now
          lastPollTime.current = new Date().toISOString();
        }
      } catch (error) {
        // Silent fail on polling errors - we are likely completely offline
        console.log('Polling attempt failed');
      }
    }, 5000); // Poll every 5 seconds
  };

  const stopPolling = () => {
    if (pollingInterval.current) {
      console.log('⏹️ Stopping HTTP Polling');
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  };
};