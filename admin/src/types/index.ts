export interface User {
  uid: string;
  email: string;
  displayName?: string;
  idToken: string;
}

export interface AdminUser {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  emailVerified: boolean;
  disabled: boolean;
  createdAt?: string;
  lastSignIn?: string;
  customClaims?: Record<string, any>;
  profile?: Record<string, any>;
}

export interface AdminUserListResponse {
  items: AdminUser[];
  total: number;
  offset: number;
  limit: number;
}

export interface UserStats {
  uid: string;
  chatCount: number;
  messageCount: number;
}

export interface Model {
  id: string;
  displayName: string;
  description: string;
  provider: 'openrouter' | 'hackclub';
  enabled: boolean;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Lab {
  id: string;
  displayName: string;
  description?: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Plan {
  id: string;
  displayName: string;
  description?: string;
  monthlyTokenLimit: number;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserPlanResponse {
  uid: string;
  planId: string;
  plan: Plan;
  usage: {
    period: string;
    tokenUsed: number;
    tokenLimit: number;
    tokenRemaining: number;
  };
}

export interface AdminConfig {
  availableModels: Model[];
  defaultModel: string;
  provider: 'openrouter' | 'hackclub';
  costPerMessage: number;
  availablePlans: Plan[];
  defaultPlanId: string;
  updatedAt: string;
}

export interface AdminStats {
  provider: string;
  defaultModel: string;
  chatCount: number;
  userCount: number;
  messageCount: number;
  costPerMessage: number;
  estimatedCost: number;
  configUpdatedAt: string;
  statsGeneratedAt: string;
}

export interface UserModelsResponse {
  uid: string;
  allowedModelIds: string[];
  availableModels: Model[];
}

export interface UserLabsResponse {
  uid: string;
  allowedLabIds: string[];
  availableLabs: Lab[];
}

export interface CreateModelRequest {
  id: string;
  displayName?: string;
  description?: string;
  provider?: 'openrouter' | 'hackclub';
  enabled?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdateModelRequest {
  displayName?: string;
  description?: string;
  provider?: 'openrouter' | 'hackclub';
  enabled?: boolean;
  metadata?: Record<string, any>;
}

export interface CreateLabRequest {
  id: string;
  displayName?: string;
  description?: string;
  enabled?: boolean;
}

export interface UpdateLabRequest {
  displayName?: string;
  description?: string;
  enabled?: boolean;
}

export interface CreatePlanRequest {
  id: string;
  displayName?: string;
  description?: string;
  monthlyTokenLimit?: number;
  enabled?: boolean;
}

export interface UpdatePlanRequest {
  displayName?: string;
  description?: string;
  monthlyTokenLimit?: number;
  enabled?: boolean;
}

export interface UpdateConfigRequest {
  defaultModel?: string;
  provider?: 'openrouter' | 'hackclub';
  costPerMessage?: number;
  defaultPlanId?: string;
}

export interface AdminSettings {
  envVars: Record<string, string>;
  readAt: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  displayName?: string;
}

