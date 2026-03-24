import BaseApiService from './api';
import AuthService from './authService';

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  preferredLanguage?: 'auto' | 'en' | 'de';
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  photoUrl?: string;
  preferredLanguage?: 'auto' | 'en' | 'de';
}

class UserService {
  private static instance: UserService;

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  async getUser(uid: string): Promise<User> {
    const response = await BaseApiService.get<User>(`/users/${uid}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async updateUser(uid: string, request: UpdateUserRequest): Promise<User> {
    const response = await BaseApiService.patch<User>(`/users/${uid}`, request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async updateUserProfile(uid: string, profile: Partial<User>): Promise<User> {
    const request: UpdateUserRequest = {
      displayName: profile.displayName,
      photoUrl: profile.photoUrl,
    };

    const cleanedRequest: UpdateUserRequest = {};
    Object.entries(request).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        cleanedRequest[key as keyof UpdateUserRequest] = value;
      }
    });

    if (Object.keys(cleanedRequest).length === 0) {
      throw new Error('No valid fields to update');
    }

    return this.updateUser(uid, cleanedRequest);
  }

  async uploadProfilePicture(uid: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await BaseApiService.upload<{ url: string }>('/uploads/profile', formData);
      if (response.error) {
        throw new Error(response.error.message);
      }
      return response.data!.url;
    } catch (error) {
      console.warn('Profile upload endpoint not available, using fallback');
      
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          
          const compressed = this.compressImage(base64, 200, 200, 0.8);
          resolve(compressed);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
  }

  private compressImage(dataUrl: string, maxWidth: number, maxHeight: number, quality: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
    });
  }

  async getStatistics(uid: string): Promise<{
    chats: number;
    notes: number;
    files: number;
  }> {
    try {
      const [chatsResponse, notesResponse, filesResponse] = await Promise.allSettled([
        BaseApiService.get<{ items: any[] }>(`/chats?uid=${encodeURIComponent(uid)}`),
        BaseApiService.get<{ items: any[] }>(`/notes?uid=${encodeURIComponent(uid)}`),
        BaseApiService.get<{ items: any[] }>('/files'),
      ]);

      const chats = chatsResponse.status === 'fulfilled' && !chatsResponse.value.error
        ? chatsResponse.value.data?.items?.length || 0
        : 0;

      const notes = notesResponse.status === 'fulfilled' && !notesResponse.value.error
        ? notesResponse.value.data?.items?.length || 0
        : 0;

      const files = filesResponse.status === 'fulfilled' && !filesResponse.value.error
        ? filesResponse.value.data?.items?.length || 0
        : 0;

      return { chats, notes, files };
    } catch (error) {
      console.error('Failed to fetch user statistics:', error);
      return { chats: 0, notes: 0, files: 0 };
    }
  }

  async exportUserData(uid: string): Promise<Blob> {
    const [user, chatsList, notes, files, settings] = await Promise.all([
      this.getUser(uid),
      BaseApiService.get<{ items: any[] }>(`/chats?uid=${encodeURIComponent(uid)}`),
      BaseApiService.get<{ items: any[] }>(`/notes?uid=${encodeURIComponent(uid)}`),
      BaseApiService.get<{ items: any[] }>('/files'),
      BaseApiService.get<any>(`/users/${uid}/settings`),
    ]);

    // Fetch full chat details with messages for each chat
    const chatsWithMessages = await Promise.all(
      (chatsList.data?.items || []).map(async (chat: any) => {
        try {
          const fullChat = await BaseApiService.get<any>(`/chats/${chat.id}?uid=${encodeURIComponent(uid)}`);
          return fullChat.data || chat;
        } catch (error) {
          console.warn(`Failed to fetch messages for chat ${chat.id}:`, error);
          return chat;
        }
      })
    );

    // Try to fetch calendar events
    let calendarEvents = [];
    try {
      const eventsResponse = await BaseApiService.get<any>('/calendar/events');
      calendarEvents = eventsResponse.data?.items || [];
    } catch (error) {
      console.warn('Failed to fetch calendar events:', error);
    }

    // Try to fetch email analysis history
    let emailAnalysis = [];
    try {
      const analysisResponse = await BaseApiService.get<any>('/email/analysis/history');
      emailAnalysis = analysisResponse.data?.items || [];
    } catch (error) {
      console.warn('Failed to fetch email analysis:', error);
    }

    const exportData = {
      user: user,
      settings: settings.data || {},
      chats: chatsWithMessages,
      notes: notes.data?.items || [],
      files: files.data?.items || [],
      calendarEvents: calendarEvents,
      emailAnalysis: emailAnalysis,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };

    return new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  }

  async deleteAccount(uid: string): Promise<void> {
    try {
      const response = await BaseApiService.delete(`/users/${uid}`);
      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      console.warn('Account deletion endpoint not available');
      throw new Error('Account deletion is not currently available. Please contact support.');
    }
  }

  async changePassword(email: string): Promise<void> {
    try {
      const response = await BaseApiService.post('/auth/forgot-password', { email });
      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      console.error('Failed to send password reset:', error);
      throw new Error('Failed to send password reset email');
    }
  }
}

export default UserService.getInstance();
