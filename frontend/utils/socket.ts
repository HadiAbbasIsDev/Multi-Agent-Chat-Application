import { io, Socket } from 'socket.io-client';
import { storage } from './storage';

// const SOCKET_URL = 'http://192.168.0.107:3000'; // Change to your backend IP
const SOCKET_URL = 'http://192.168.1.31:3000';

class SocketService {
  private socket: Socket | null = null;
  public isConnected = false;

  async connect() {
    if (this.socket && this.isConnected) { 
      return;
    }

    const token = await storage.getToken();
    if (!token) {
      console.error('No auth token found');
      return;
    }

    this.socket = io(SOCKET_URL, {
      auth: {
        token,
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket connected:', this.socket?.id);
      this.isConnected = true;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
    });
  }

  disconnect() {
    if (this.socket) {
      console.log('Disconnecting socket...');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  // --- NEW: Latency Check for Connection Quality ---
  ping(callback: (latency: number) => void) {
    if (!this.socket || !this.isConnected) return;

    const start = Date.now();
    // Emit 'ping' to backend
    this.socket.emit('ping');
    
    // Listen for 'pong' response once
    this.socket.once('pong', () => {
      const latency = Date.now() - start;
      callback(latency);
    });
  }

  // --- UPDATED: Handle Message with Acknowledgement ---
  onNewMessage(callback: (message: any) => void) {
    if (this.socket) {
      // Backend emits: (data, ackCallback)
      this.socket.on('new_message', (data, ackCallback) => {
        // 1. Give message to frontend
        callback(data);
        
        // 2. Acknowledge receipt to backend immediately
        // This tells the queue to stop retrying this message
        if (typeof ackCallback === 'function') {
          console.log(`⚡ Acknowledging message ${data.id}`);
          ackCallback('received'); 
        }
      });
    }
  }

  // Join a thread to receive real-time updates
  joinThread(threadId: string) {
    if (this.socket) {
      console.log('Joining thread:', threadId);
      this.socket.emit('join_thread', { threadId });
    }
  }

  // Leave a thread
  leaveThread(threadId: string) {
    if (this.socket) {
      console.log('Leaving thread:', threadId);
      this.socket.emit('leave_thread', { threadId });
    }
  }

  // Listen for message edits
  onMessageEdited(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('message_edited', callback);
    }
  }

  // Listen for message deletions
  onMessageDeleted(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('message_deleted', callback);
    }
  }

  // Listen for message delivered status
  onMessageDelivered(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('message_delivered', callback);
    }
  }

  // Listen for message read status
  onMessageRead(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('message_read', callback);
    }
  }

  // Emit typing start
  startTyping(threadId: string) {
    if (this.socket) {
      this.socket.emit('typing_start', { threadId });
    }
  }

  // Emit typing stop
  stopTyping(threadId: string) {
    if (this.socket) {
      this.socket.emit('typing_stop', { threadId });
    }
  }

  // Listen for typing indicators
  onUserTyping(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('user_typing', callback);
    }
  }

  onUserStoppedTyping(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('user_stopped_typing', callback);
    }
  }

  // Listen for online/offline status
  onUserOnline(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('user_online', callback);
    }
  }

  onUserOffline(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('user_offline', callback);
    }
  }

  // Contact/Group events...
  onContactRequestReceived(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('contact_request_received', callback);
    }
  }

  onContactRequestAccepted(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('contact_request_accepted', callback);
    }
  }

  onAddedToGroup(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('added_to_group', callback);
    }
  }

  onMemberAdded(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('member_added', callback);
    }
  }

  onMemberRemoved(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('member_removed', callback);
    }
  }

  onGroupUpdated(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('group_updated', callback);
    }
  }

  removeAllListeners() {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }

  off(event: string) {
    if (this.socket) {
      this.socket.off(event);
    }
  }
}

export const socketService = new SocketService();