import { io, Socket } from 'socket.io-client';
import { storage } from './storage';

// const SOCKET_URL = 'http://192.168.0.111:3000'; // Change to your backend IP

const SOCKET_URL ='http://192.168.0.111:3000';
class SocketService {
  private socket: Socket | null = null;
  private isConnected = false;

  async connect() {
    if (this.socket && this.isConnected) { 
      console.log('Socket already connected');
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

    this.socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
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

  // Listen for new messages
  onNewMessage(callback: (message: any) => void) {
    if (this.socket) {
      this.socket.on('new_message', callback);
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

  // Listen for contact requests
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

  // Listen for group events
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

  // onMessageRead(callback: (data: any) => void) {
  //   if (this.socket) {
  //     this.socket.on('message_read', callback);
  //   }
  // }

  // Remove all listeners
  removeAllListeners() {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }

  // Remove specific listener
  off(event: string) {
    if (this.socket) {
      this.socket.off(event);
    }
  }

  // Get connection status
  getConnectionStatus() {
    return this.isConnected;
  }
}

export const socketService = new SocketService();



