import { apiFetch, getBackendUrl } from '../lib/backend';
import AuthService from './authService';
import { ApiError } from '../utils/apiUtils';

export interface ApiRequestOptions extends RequestInit {
  skipAuth?: boolean;
  skipRefresh?: boolean;
  isBlob?: boolean;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  status: number;
}

class BaseApiService {
  private static instance: BaseApiService;
  private activeControllers: Set<AbortController> = new Set();

  static getInstance(): BaseApiService {
    if (!BaseApiService.instance) {
      BaseApiService.instance = new BaseApiService();
    }
    return BaseApiService.instance;
  }

  async request<T = any>(
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      skipAuth = false,
      skipRefresh = false,
      headers = {},
      isBlob = false,
      ...fetchOptions
    } = options;

    const externalSignal = fetchOptions.signal;
    const controller = externalSignal ? null : new AbortController();

    try {
      if (controller) {
        this.activeControllers.add(controller);
      }

      const url = this.buildUrl(path);
      const requestHeaders = new Headers(headers);

      // Add content-type if not present and we have a body (but not for FormData)
      if (fetchOptions.body && !requestHeaders.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
        requestHeaders.set('Content-Type', 'application/json');
      }

      // Add authentication header if not skipped
      if (!skipAuth) {
        const token = await AuthService.getValidToken();
        if (token) {
          requestHeaders.set('Authorization', `Bearer ${token}`);
        }
      }

      const response = await fetch(url, {
        ...fetchOptions,
        headers: requestHeaders,
        signal: externalSignal || controller?.signal,
      });

      // Handle 401 Unauthorized - try token refresh
      if (response.status === 401 && !skipAuth && !skipRefresh) {
        try {
          await AuthService.refreshTokenWithRetry();
          const newToken = await AuthService.getValidToken();
          if (newToken) {
            requestHeaders.set('Authorization', `Bearer ${newToken}`);
            const retryResponse = await fetch(url, {
              ...fetchOptions,
              headers: requestHeaders,
            });
            return this.handleResponse<T>(retryResponse);
          }
        } catch (refreshError) {
          console.warn('Token refresh failed:', refreshError);
          AuthService.clearStoredTokens();
          // Trigger re-authentication - this will be handled by the auth context
          window.dispatchEvent(new CustomEvent('auth:token-expired'));
        }
      }

      return this.handleResponse<T>(response, isBlob);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          status: 0,
          error: {
            code: 'request_cancelled',
            message: 'Request was cancelled',
          },
        };
      }

      if (error instanceof ApiError) {
        return {
          status: error.status,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        };
      }

      return {
        status: 0,
        error: {
          code: 'network_error',
          message: 'Network error occurred',
          details: error,
        },
      };
    } finally {
      if (controller) {
        this.activeControllers.delete(controller);
      }
    }
  }

  async get<T = any>(path: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T = any>(path: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T = any>(path: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T = any>(path: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = any>(path: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  async upload<T = any>(
    path: string,
    formData: FormData,
    options?: Omit<ApiRequestOptions, 'body' | 'headers'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: formData,
      // Don't set content-type header for FormData - browser sets it with boundary
    });
  }

  private buildUrl(path: string): string {
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      throw new Error('Backend URL not configured');
    }
    const baseUrl = backendUrl.replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    return `${baseUrl}/${cleanPath}`;
  }

  private async handleResponse<T>(response: Response, isBlob = false): Promise<ApiResponse<T>> {
    try {
      const contentType = response.headers.get('content-type');
      const isJson = contentType?.includes('application/json');

      let data: any;
      if (isBlob) {
        data = await response.blob();
      } else if (isJson && response.status !== 204) {
        data = await response.json();
      } else if (response.status === 204) {
        data = null;
      } else {
        data = await response.text();
      }

      if (response.ok) {
        return {
          status: response.status,
          data,
        };
      }

      // Handle API error responses
      const errorData = data || {
        code: `http_${response.status}`,
        message: response.statusText || `HTTP ${response.status}`,
      };

      return {
        status: response.status,
        error: {
          code: errorData.error || errorData.code || 'api_error',
          message: errorData.message || 'An error occurred',
          details: errorData,
        },
      };
    } catch (error) {
      return {
        status: response.status,
        error: {
          code: 'response_parsing_error',
          message: 'Failed to parse response',
          details: error,
        },
      };
    }
  }

  // Utility methods
  cancelPendingRequests(): void {
    for (const controller of this.activeControllers) {
      controller.abort();
    }
    this.activeControllers.clear();
  }

  isOnline(): boolean {
    return navigator.onLine;
  }

  async waitForConnection(): Promise<void> {
    if (this.isOnline()) {
      return;
    }

    return new Promise((resolve) => {
      const handleOnline = () => {
        window.removeEventListener('online', handleOnline);
        resolve();
      };
      window.addEventListener('online', handleOnline);
    });
  }
}

export default BaseApiService.getInstance();