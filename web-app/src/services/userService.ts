import BaseApiService from './api';

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  photoUrl?: string;
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

    // Remove undefined values
    Object.keys(request).forEach(key => {
      if (request[key as keyof UpdateUserRequest] === undefined) {
        delete request[key as keyof UpdateUserRequest];
      }
    });

    return this.updateUser(uid, request);
  }

  async uploadProfilePicture(uid: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('uid', uid);

    const response = await BaseApiService.upload<{ url: string }>('/users/profile-picture', formData);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!.url;
  }
}

export default UserService.getInstance();