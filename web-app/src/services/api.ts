import { apiFetch, getBackendUrl } from '../lib/backend';
import AuthService from './authService';

export interface ApiRequestOptions extends RequestInit {
  skipAuth?: boolean;
  skipRefresh?: boolean;
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

export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: any;
}

class BaseApiService {
  private static instance: BaseApiService;
  private abortController: AbortController | null = null;

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
      ...fetchOptions
    } = options;

    let controller: AbortController;
    if (fetchOptions.signal) {
      controller = new AbortController();
      fetchOptions.signal = controller.signal;
    }

    try {
      // Cancel previous request if needed
      if (this.abortController && !skipRefresh) {
        this.abortController.abort();
      }
      if (!skipRefresh) {
        this.abortController = controller || new AbortController();
      }

      const url = this.buildUrl(path);
      const requestHeaders = new Headers(headers);

      // Add content-type if not present and we have a body
      if (fetchOptions.body && !requestHeaders.has('Content-Type')) {
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
        signal: this.abortController?.signal,
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

      return this.handleResponse<T>(response);
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
      if (this.abortController === controller) {
        this.abortController = null;
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

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    try {
      const contentType = response.headers.get('content-type');
      const isJson = contentType?.includes('application/json');

      let data: any;
      if (isJson && response.status !== 204) {
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
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
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