import React, { createContext, useState, useContext, useEffect } from 'react';
import { api } from '../utils/api';
import { storage } from '../utils/storage';
import { socketService } from '../utils/socket';

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  restoreToken: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    restoreToken();
  }, []);

  const restoreToken = async () => {
    try {
      setIsLoading(true);
      console.log('🔄 Restoring token...');
      
      const savedToken = await storage.getToken();
      const savedUser = await storage.getUser();

      if (savedToken && savedUser) {
        console.log('✅ Found saved credentials');
        setToken(savedToken);
        setUser(savedUser);
        
        // Verify token is still valid
        try {
          const currentUser = await api.getCurrentUser();
          console.log('✅ Token is valid, user verified');
          setUser(currentUser.user || currentUser);
          
          // Connect to Socket.IO
          await socketService.connect();
        } catch (error) {
          console.warn('⚠️ Token invalid, clearing storage');
          await storage.clearAll();
          setToken(null);
          setUser(null);
        }
      } else {
        console.log('ℹ️ No saved credentials found');
      }
    } catch (error) {
      console.error('❌ Error restoring token:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      console.log('🔐 Signing in:', email);
      const response = await api.login(email, password);
      
      console.log('📦 Login response:', response);
      
      // Handle the response structure from your backend
      const userData: User = {
        id: response.user.id,
        email: response.user.email,
        displayName: response.user.displayName,
        avatarUrl: response.user.avatarUrl,
      };
      
      // Save to secure storage
      await storage.saveToken(response.token);
      await storage.saveUser(userData);
      
      console.log('💾 Saved token and user data');
      
      // Update state
      setToken(response.token);
      setUser(userData);
      
      // Connect to Socket.IO
      await socketService.connect();
      
      console.log('✅ Sign in complete!');
    } catch (error: any) {
      console.error('❌ Login error:', error);
      
      // Provide user-friendly error messages
      if (error.response?.status === 401) {
        throw new Error('Invalid email or password');
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error('Login failed. Please try again.');
      }
    }
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    try {
      console.log('📝 Signing up:', email);
      const response = await api.register(email, password, displayName);
      
      console.log('📦 Signup response:', response);
      
      // Handle the response structure
      const userData: User = {
        id: response.user.id,
        email: response.user.email,
        displayName: response.user.displayName,
        avatarUrl: response.user.avatarUrl,
      };
      
      // Save to secure storage
      await storage.saveToken(response.token);
      await storage.saveUser(userData);
      
      console.log('💾 Saved token and user data');
      
      // Update state
      setToken(response.token);
      setUser(userData);
      
      // Connect to Socket.IO
      await socketService.connect();
      
      console.log('✅ Sign up complete!');
    } catch (error: any) {
      console.error('❌ Signup error:', error);
      
      if (error.response?.status === 400) {
        throw new Error(error.response.data?.error || 'Invalid registration data');
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error('Signup failed. Please try again.');
      }
    }
  };

  const signOut = async () => {
    try {
      console.log('👋 Signing out...');
      
      // Disconnect Socket.IO
      socketService.disconnect();
      
      await storage.clearAll();
      setToken(null);
      setUser(null);
      console.log('✅ Signed out successfully');
    } catch (error) {
      console.error('❌ Signout error:', error);
    }
  };

  const refreshUser = async () => {
    try {
      const currentUser = await api.getCurrentUser();
      const userData: User = {
        id: currentUser.user?.id || currentUser.id,
        email: currentUser.user?.email || currentUser.email,
        displayName: currentUser.user?.displayName || currentUser.displayName,
        avatarUrl: currentUser.user?.avatarUrl || currentUser.avatarUrl,
      };
      setUser(userData);
      await storage.saveUser(userData);
    } catch (error) {
      console.error('❌ Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token && !!user,
        signIn,
        signUp,
        signOut,
        restoreToken,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};