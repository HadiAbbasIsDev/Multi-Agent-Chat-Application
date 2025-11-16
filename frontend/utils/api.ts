import axios, { AxiosInstance, AxiosError } from 'axios';
import { storage } from './storage';

const API_URL = 'http://192.168.1.12:3000/api'; // Change to your backend IP

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
          // You'll need to navigate to login here
          // For now, just reject
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    return response.data;
  }

  async register(email: string, password: string, displayName: string) {
    const response = await this.client.post('/auth/register', {
      email,
      password,
      display_name: displayName,
    });
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  async refreshToken() {
    const response = await this.client.post('/auth/refresh');
    return response.data;
  }

  // Threads endpoints
  async getThreads() {
    const response = await this.client.get('/threads');
    return response.data;
  }

  async createThread(participantIds: number[]) {
    const response = await this.client.post('/threads', { participant_ids: participantIds });
    return response.data;
  }

  // Messages endpoints
  async getMessages(threadId: number) {
    const response = await this.client.get(`/messages?threadId=${threadId}`);
    return response.data;
  }

  async sendMessage(threadId: number, body: string, attachments?: string[]) {
    const response = await this.client.post('/messages', {
      thread_id: threadId,
      body,
      attachments,
    });
    return response.data;
  }

  async editMessage(messageId: number, body: string) {
    const response = await this.client.put(`/messages/${messageId}`, { body });
    return response.data;
  }

  async deleteMessage(messageId: number) {
    const response = await this.client.delete(`/messages/${messageId}`);
    return response.data;
  }

  // Contacts endpoints
  async getContacts() {
    const response = await this.client.get('/contacts');
    return response.data;
  }

  async addContact(contactId: number) {
    const response = await this.client.post('/contacts', { contact_id: contactId });
    return response.data;
  }

  async removeContact(contactId: number) {
    const response = await this.client.delete(`/contacts/${contactId}`);
    return response.data;
  }

  // Groups endpoints
  async getGroups() {
    const response = await this.client.get('/groups');
    return response.data;
  }

  async createGroup(name: string, description?: string) {
    const response = await this.client.post('/groups', { name, description });
    return response.data;
  }

  async getGroupMessages(groupId: number) {
    const response = await this.client.get(`/groups/${groupId}/messages`);
    return response.data;
  }

  async sendGroupMessage(groupId: number, body: string) {
    const response = await this.client.post(`/groups/${groupId}/messages`, { body });
    return response.data;
  }

  // Users endpoints
  async searchUsers(query: string) {
    const response = await this.client.get(`/users/search?q=${query}`);
    return response.data;
  }

  async updateProfile(data: { display_name?: string; avatar_url?: string }) {
    const response = await this.client.put('/users/profile', data);
    return response.data;
  }
}

export const api = new ApiClient();