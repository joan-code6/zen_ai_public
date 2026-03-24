import { ApiResponse } from '@/services/api';

export class ApiError extends Error {
  public code: string;
  public status: number;
  public details?: any;

  constructor(error: { code: string; message: string; status: number; details?: any }) {
    super(error.message);
    this.name = 'ApiError';
    this.code = error.code;
    this.status = error.status;
    this.details = error.details;
  }

  static isApiError(error: any): error is ApiError {
    return error instanceof ApiError;
  }

  static fromResponse(status: number, data: any): ApiError {
    return new ApiError({
      code: data.error || `http_${status}`,
      message: data.message || `HTTP ${status}`,
      status,
      details: data,
    });
  }

  static fromNetworkError(error: any): ApiError {
    return new ApiError({
      code: 'network_error',
      message: error.message || 'Network error occurred',
      status: 0,
      details: error,
    });
  }
}

export function handleApiResponse<T>(response: ApiResponse<T>): T {
  if (response.error) {
    throw new ApiError({
      ...response.error,
      status: response.status,
    });
  }
  
  if (!response.data) {
    throw new ApiError({
      code: 'no_data',
      message: 'No data returned from API',
      status: 200,
    });
  }

  return response.data;
}

export function isSuccessResponse<T>(response: ApiResponse<T>): response is { data: T; status: number } {
  return response.status >= 200 && response.status < 300 && !!response.data;
}

export function isErrorResponse<T>(response: ApiResponse<T>): response is { error: { code: string; message: string; details?: any }; status: number } {
  return !!response.error;
}

export function getErrorMessage(error: unknown): string {
  if (ApiError.isApiError(error)) {
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'An unexpected error occurred';
}

export function getErrorCode(error: unknown): string {
  if (ApiError.isApiError(error)) {
    return error.code;
  }
  
  return 'unknown_error';
}

export function isNetworkError(error: unknown): boolean {
  return ApiError.isApiError(error) && error.code === 'network_error';
}

export function isAuthError(error: unknown): boolean {
  if (ApiError.isApiError(error)) {
    return error.status === 401 || error.status === 403;
  }
  
  return false;
}

export function isServerError(error: unknown): boolean {
  if (ApiError.isApiError(error)) {
    return error.status >= 500;
  }
  
  return false;
}

export function isClientError(error: unknown): boolean {
  if (ApiError.isApiError(error)) {
    return error.status >= 400 && error.status < 500;
  }
  
  return false;
}

export function shouldRetryError(error: unknown): boolean {
  return isNetworkError(error) || isServerError(error);
}

export function getRetryDelay(attempt: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s
  return Math.min(1000 * Math.pow(2, attempt), 16000);
}

export async function retryRequest<T>(
  requestFn: () => Promise<T>,
  maxAttempts: number = 3,
  delay?: number
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      
      if (!shouldRetryError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
      
      const retryDelay = delay || getRetryDelay(attempt);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  throw lastError;
}

export function createRequestConfig() {
  return {
    timeout: 30000, // 30 seconds
    retries: 3,
    retryDelay: 1000, // 1 second
  };
}

export function validateApiResponse(response: any): response is ApiResponse {
  return (
    typeof response === 'object' &&
    'status' in response &&
    typeof response.status === 'number'
  );
}

export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.toString();
  } catch {
    return url;
  }
}

export function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach(item => searchParams.append(key, item.toString()));
      } else {
        searchParams.append(key, value.toString());
      }
    }
  });
  
  return searchParams.toString();
}

export function parseApiError(error: any): ApiError {
  if (ApiError.isApiError(error)) {
    return error;
  }
  
  if (error?.response) {
    const { status, data } = error.response;
    return ApiError.fromResponse(status, data);
  }
  
  if (error?.request) {
    return ApiError.fromNetworkError(new Error('Network request failed'));
  }
  
  return ApiError.fromNetworkError(error);
}

// Error code to user-friendly message mapping
export const ERROR_MESSAGES: Record<string, string> = {
  // Authentication errors
  'invalid_token': 'Your session has expired. Please sign in again.',
  'token_expired': 'Your session has expired. Please sign in again.',
  'invalid_credentials': 'Invalid email or password.',
  'email_in_use': 'This email is already registered.',
  'weak_password': 'Password is too weak. Please choose a stronger password.',
  
  // Network errors
  'network_error': 'Network error. Please check your connection and try again.',
  'timeout_error': 'Request timed out. Please try again.',
  
  // Server errors
  'service_unavailable': 'Service is temporarily unavailable. Please try again later.',
  'rate_limit_exceeded': 'Too many requests. Please wait and try again.',
  
  // General errors
  'not_found': 'The requested resource was not found.',
  'forbidden': 'You do not have permission to perform this action.',
  'validation_error': 'Please check your input and try again.',
  
  // Default
  'unknown_error': 'An unexpected error occurred. Please try again.',
};

export function getUserFriendlyErrorMessage(error: unknown): string {
  const errorCode = getErrorCode(error);
  return ERROR_MESSAGES[errorCode] || ERROR_MESSAGES['unknown_error'];
}

export default {
  ApiError,
  handleApiResponse,
  isSuccessResponse,
  isErrorResponse,
  getErrorMessage,
  getErrorCode,
  isNetworkError,
  isAuthError,
  isServerError,
  isClientError,
  shouldRetryError,
  retryRequest,
  createRequestConfig,
  validateApiResponse,
  sanitizeUrl,
  buildQueryString,
  parseApiError,
  ERROR_MESSAGES,
  getUserFriendlyErrorMessage,
};