import axios, { AxiosInstance, AxiosError } from 'axios';
import { storage } from './storage';

const API_URL = 'http://192.168.0.111:3000/api'; // Change to your backend IP

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 1000000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor - add token to all requests
    this.client.interceptors.request.use(
      async (config) => {
        const token = await storage.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle token expiry
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired or invalid - clear auth and redirect to login
          await storage.clearAll();
        }
        return Promise.reject(error);
      }
    );
  }

  // ==================== Auth Endpoints ====================
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    return response.data;
  }

  async register(email: string, password: string, displayName: string) {
    const response = await this.client.post('/auth/register', {
      email,
      password,
      displayName,
    });
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  // ==================== Users Endpoints ====================
  async searchUsers(query: string) {
    const response = await this.client.get(`/users/search?q=${encodeURIComponent(query)}`);
    return response.data;
  }

  async getUserById(userId: string) {
    const response = await this.client.get(`/users/${userId}`);
    return response.data;
  }

  async updateProfile(data: { displayName?: string; avatarUrl?: string }) {
    const response = await this.client.patch('/users/me', data);
    return response.data;
  }

  async updatePassword(currentPassword: string, newPassword: string) {
    const response = await this.client.patch('/auth/password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  }

  // ==================== Contact Requests Endpoints ====================
  async sendContactRequest(toUserId: string) {
    const response = await this.client.post('/contacts', { toUserId });
    return response.data;
  }

  async getPendingContactRequests() {
    const response = await this.client.get('/contacts/pending');
    return response.data;
  }

  async getSentContactRequests() {
    const response = await this.client.get('/contacts/sent');
    return response.data;
  }

  async cancelContactRequest(requestId: string) {
    const response = await this.client.delete(`/contacts/${requestId}`);
    return response.data;
  }

  async getContacts() {
    const response = await this.client.get('/users/me/contacts');
    return response.data;
  }

  async acceptContactRequest(requestId: string) {
    const response = await this.client.post(`/contacts/${requestId}/accept`);
    return response.data;
  }

  async rejectContactRequest(requestId: string) {
    const response = await this.client.post(`/contacts/${requestId}/reject`);
    return response.data;
  }

  async removeContact(userId: string) {
    const response = await this.client.delete(`/contacts/user/${userId}`);
    return response.data;
  }

  // ==================== Threads Endpoints ====================
  async createDirectThread(userId: string) {
    const response = await this.client.post('/threads/direct', { userId });
    return response.data;
  }

  async getThreads() {
    const response = await this.client.get('/threads');
    return response.data;
  }

  async getThreadDetails(threadId: string) {
    const response = await this.client.get(`/threads/${threadId}`);
    return response.data;
  }

  // ==================== Messages Endpoints ====================
  async getMessages(threadId: string, limit = 50, before?: string) {
    let url = `/messages/${threadId}?limit=${limit}`;
    if (before) {
      url += `&before=${before}`;
    }
    const response = await this.client.get(url);
    return response.data;
  }

  async sendMessage(threadId: string, body: string, image?: any) {
    const formData = new FormData();
    formData.append('body', body);
    if (image) {
      // React Native FormData format
      formData.append('image', {
        uri: image.uri,
        type: image.type || 'image/jpeg',
        name: image.name || 'image.jpg',
      } as any);
    }
    
    const response = await this.client.post(`/messages/${threadId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async editMessage(messageId: string, body: string) {
    const response = await this.client.patch(`/messages/${messageId}`, { body });
    return response.data;
  }

  async deleteMessage(messageId: string) {
    const response = await this.client.delete(`/messages/${messageId}`);
    return response.data;
  }

  async markMessageAsRead(messageId: string) {
    const response = await this.client.post(`/messages/${messageId}/read`);
    return response.data;
  }

  // ==================== Groups Endpoints ====================
  async createGroup(name: string, memberIds: string[], pictureUrl?: string) {
    const response = await this.client.post('/groups', { 
      name, 
      memberIds,
      pictureUrl 
    });
    return response.data;
  }

  async updateGroup(groupId: string, data: { name?: string; pictureUrl?: string }) {
    const response = await this.client.patch(`/groups/${groupId}`, data);
    return response.data;
  }

  async addGroupMember(groupId: string, userId: string) {
    const response = await this.client.post(`/groups/${groupId}/members`, { userId });
    return response.data;
  }

  async removeGroupMember(groupId: string, userId: string) {
    const response = await this.client.delete(`/groups/${groupId}/members/${userId}`);
    return response.data;
  }

  async promoteToAdmin(groupId: string, userId: string) {
    const response = await this.client.post(`/groups/${groupId}/members/${userId}/promote`);
    return response.data;
  }

  async demoteAdmin(groupId: string, userId: string) {
    const response = await this.client.post(`/groups/${groupId}/members/${userId}/demote`);
    return response.data;
  }

  async leaveGroup(groupId: string) {
    const response = await this.client.post(`/groups/${groupId}/leave`);
    return response.data;
  }

  // ==================== AI Search Endpoints ====================
  async submitAIQuery(prompt: string) {
    const response = await this.client.post('/ai/query', { prompt });
    return response.data;
  }

  async getAIQueryHistory(limit = 20) {
    const response = await this.client.get(`/ai/queries?limit=${limit}`);
    return response.data;
  }
}

export const api = new ApiClient();