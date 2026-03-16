import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiError } from '@/types/index';
import { storage } from '@/utils/storage';

// API基础配置
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// 创建axios实例
const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  },
});

// 请求拦截器 - 注入认证头
client.interceptors.request.use(
  (config) => {
    const token = storage.get<string>('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// API响应包装格式
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Token refresh state — prevents concurrent refresh attempts
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh'];

function isAuthEndpoint(url?: string): boolean {
  return AUTH_ENDPOINTS.some(ep => url?.includes(ep));
}

function forceLogout() {
  storage.remove('access_token');
  storage.remove('refresh_token');
  storage.remove('user');
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

// 响应拦截器 - 统一错误处理 + 自动 token 刷新
client.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 401 auto-refresh: attempt token refresh before logging out
    if (
      error.response?.status === 401 &&
      !isAuthEndpoint(originalRequest?.url) &&
      !originalRequest?._retry
    ) {
      if (isRefreshing) {
        // Another refresh is in progress — queue this request
        return new Promise((resolve) => {
          addRefreshSubscriber((newToken: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            resolve(client(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post<ApiResponse<{
          access_token: string;
          refresh_token: string;
          expires_in: number;
        }>>(`${API_BASE_URL}/auth/refresh`, {}, {
          timeout: 10000,
          withCredentials: true,
        });

        if (response.data.success && response.data.data) {
          const { access_token, refresh_token } = response.data.data;
          storage.set('access_token', access_token);
          storage.set('refresh_token', refresh_token);

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${access_token}`;
          }

          onTokenRefreshed(access_token);
          return client(originalRequest);
        } else {
          forceLogout();
        }
      } catch {
        forceLogout();
      } finally {
        isRefreshing = false;
      }
    }

    // Standard error handling for non-401 or post-refresh failures
    const apiError: ApiError = {
      code: 'UNKNOWN_ERROR',
      message: '发生未知错误',
    };

    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401:
          apiError.code = 'UNAUTHORIZED';
          apiError.message = data?.error || '登录已过期，请重新登录';
          if (!isAuthEndpoint(originalRequest?.url) && typeof window !== 'undefined') {
            forceLogout();
          }
          break;
        case 403:
          apiError.code = 'FORBIDDEN';
          apiError.message = data?.error || '没有权限执行此操作';
          break;
        case 404:
          apiError.code = 'NOT_FOUND';
          apiError.message = data?.error || '请求的资源不存在';
          break;
        case 409:
          apiError.code = 'CONFLICT';
          apiError.message = data?.error || '资源冲突';
          break;
        case 422:
          apiError.code = 'VALIDATION_ERROR';
          apiError.message = data?.error || '请求参数验证失败';
          break;
        case 500:
          apiError.code = 'SERVER_ERROR';
          apiError.message = data?.error || '服务器内部错误';
          break;
        default:
          apiError.code = `HTTP_${status}`;
          apiError.message = data?.error || `请求失败 (${status})`;
      }
    } else if (error.request) {
      apiError.code = 'NETWORK_ERROR';
      apiError.message = '网络连接失败，请检查网络设置';
    } else {
      apiError.code = 'REQUEST_ERROR';
      apiError.message = error.message || '请求配置错误';
    }

    return Promise.reject(apiError);
  }
);

// 封装HTTP方法 - 返回 {success, data} 包装格式中的 data
export const api = {
  get: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await client.get<ApiResponse<T>>(url, config);
    if (!response.data.success) {
      throw new Error(response.data.error || '请求失败');
    }
    return response.data.data as T;
  },

  post: async <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await client.post<ApiResponse<T>>(url, data, config);
    if (!response.data.success) {
      throw new Error(response.data.error || '请求失败');
    }
    return response.data.data as T;
  },

  put: async <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await client.put<ApiResponse<T>>(url, data, config);
    if (!response.data.success) {
      throw new Error(response.data.error || '请求失败');
    }
    return response.data.data as T;
  },

  patch: async <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await client.patch<ApiResponse<T>>(url, data, config);
    if (!response.data.success) {
      throw new Error(response.data.error || '请求失败');
    }
    return response.data.data as T;
  },

  delete: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await client.delete<ApiResponse<T>>(url, config);
    if (!response.data.success) {
      throw new Error(response.data.error || '请求失败');
    }
    return response.data.data as T;
  },
};

export default client;
