import axios, { AxiosInstance } from 'axios';
import type {
  User,
  Model,
  Lab,
  Plan,
  AdminConfig,
  AdminStats,
  CreateModelRequest,
  UpdateModelRequest,
  CreateLabRequest,
  UpdateLabRequest,
  CreatePlanRequest,
  UpdatePlanRequest,
  UpdateConfigRequest,
  AdminUser,
  AdminUserListResponse,
  UserModelsResponse,
  UserLabsResponse,
  UserPlanResponse,
  UserStats,
  AdminSettings,
  CreateUserRequest,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add interceptor to include auth token
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('idToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  // Auth endpoints
  async login(email: string, password: string): Promise<User> {
    const response = await this.client.post('/auth/login', { email, password });
    return response.data;
  }

  async refreshToken(refreshToken: string): Promise<{ idToken: string }> {
    const response = await this.client.post('/auth/refresh-token', { refreshToken });
    return response.data;
  }

  // Admin config endpoints
  async getConfig(): Promise<AdminConfig> {
    const response = await this.client.get('/admin/config');
    return response.data;
  }

  async updateConfig(data: UpdateConfigRequest): Promise<AdminConfig> {
    const response = await this.client.patch('/admin/config', data);
    return response.data;
  }

  // Admin model endpoints
  async getModels(): Promise<{ items: Model[] }> {
    const response = await this.client.get('/admin/models');
    return response.data;
  }

  async getProviderModels(): Promise<{ items: any[] }> {
    const response = await this.client.get('/admin/models/provider');
    return response.data;
  }

  async createModel(data: CreateModelRequest): Promise<Model> {
    const response = await this.client.post('/admin/models', data);
    return response.data;
  }

  async updateModel(modelId: string, data: UpdateModelRequest): Promise<Model> {
    const response = await this.client.patch(`/admin/models/${modelId}`, data);
    return response.data;
  }

  async deleteModel(modelId: string): Promise<void> {
    await this.client.delete(`/admin/models/${modelId}`);
  }

  // Admin lab endpoints
  async getLabs(): Promise<{ items: Lab[] }> {
    const response = await this.client.get('/admin/labs');
    return response.data;
  }

  async createLab(data: CreateLabRequest): Promise<Lab> {
    const response = await this.client.post('/admin/labs', data);
    return response.data;
  }

  async updateLab(labId: string, data: UpdateLabRequest): Promise<Lab> {
    const response = await this.client.patch(`/admin/labs/${labId}`, data);
    return response.data;
  }

  async deleteLab(labId: string): Promise<void> {
    await this.client.delete(`/admin/labs/${labId}`);
  }

  // Admin plan endpoints
  async getPlans(): Promise<{ items: Plan[] }> {
    const response = await this.client.get('/admin/plans');
    return response.data;
  }

  async createPlan(data: CreatePlanRequest): Promise<Plan> {
    const response = await this.client.post('/admin/plans', data);
    return response.data;
  }

  async updatePlan(planId: string, data: UpdatePlanRequest): Promise<Plan> {
    const response = await this.client.patch(`/admin/plans/${planId}`, data);
    return response.data;
  }

  async deletePlan(planId: string): Promise<void> {
    await this.client.delete(`/admin/plans/${planId}`);
  }

  // Admin stats endpoint
  async getStats(): Promise<AdminStats> {
    const response = await this.client.get('/admin/stats');
    return response.data;
  }

  // ====== User Management Endpoints ======

  async listUsers(limit: number = 100, offset: number = 0): Promise<AdminUserListResponse> {
    const response = await this.client.get('/admin/users', {
      params: { limit, offset },
    });
    return response.data;
  }

  async createUser(data: CreateUserRequest): Promise<AdminUser> {
    const response = await this.client.post('/admin/users', data);
    return response.data;
  }

  async getUser(uid: string): Promise<AdminUser> {
    const response = await this.client.get(`/admin/users/${uid}`);
    return response.data;
  }

  async resetUserPassword(uid: string, temporaryPassword?: string): Promise<any> {
    const response = await this.client.post(`/admin/users/${uid}/reset-password`, {
      temporaryPassword,
    });
    return response.data;
  }

  async disableUser(uid: string, disabled: boolean): Promise<any> {
    const response = await this.client.patch(`/admin/users/${uid}/disable`, { disabled });
    return response.data;
  }

  async deleteUser(uid: string): Promise<void> {
    await this.client.delete(`/admin/users/${uid}`);
  }

  async getUserModels(uid: string): Promise<UserModelsResponse> {
    const response = await this.client.get(`/admin/users/${uid}/models`);
    return response.data;
  }

  async setUserModels(uid: string, modelIds: string[]): Promise<UserModelsResponse> {
    const response = await this.client.put(`/admin/users/${uid}/models`, {
      modelIds,
    });
    return response.data;
  }

  async getUserLabs(uid: string): Promise<UserLabsResponse> {
    const response = await this.client.get(`/admin/users/${uid}/labs`);
    return response.data;
  }

  async setUserLabs(uid: string, labIds: string[]): Promise<UserLabsResponse> {
    const response = await this.client.put(`/admin/users/${uid}/labs`, {
      labIds,
    });
    return response.data;
  }

  async getUserPlan(uid: string): Promise<UserPlanResponse> {
    const response = await this.client.get(`/admin/users/${uid}/plan`);
    return response.data;
  }

  async setUserPlan(uid: string, planId: string): Promise<UserPlanResponse> {
    const response = await this.client.patch(`/admin/users/${uid}/plan`, { planId });
    return response.data;
  }

  async getUserStats(uid: string): Promise<UserStats> {
    const response = await this.client.get(`/admin/users/${uid}/stats`);
    return response.data;
  }

  // ====== Settings Endpoints ======

  async getSettings(): Promise<AdminSettings> {
    const response = await this.client.get('/admin/settings');
    return response.data;
  }

  async updateSettings(updates: Record<string, string>): Promise<AdminSettings> {
    const response = await this.client.patch('/admin/settings', updates);
    return response.data;
  }

  // ====== System Endpoints ======

  async restartBackend(): Promise<{ message: string; service: string }> {
    const response = await this.client.post('/admin/restart');
    return response.data;
  }
}

export const apiClient = new ApiClient();

