import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
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

// 响应拦截器 - 统一错误处理
client.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    const apiError: ApiError = {
      code: 'UNKNOWN_ERROR',
      message: '发生未知错误',
    };

    if (error.response) {
      // 服务器返回错误响应
      const { status, data } = error.response;

      switch (status) {
        case 401:
          apiError.code = 'UNAUTHORIZED';
          apiError.message = data?.error || '登录已过期，请重新登录';
          // 只有非登录/注册请求才跳转
          const isAuthEndpoint = error.config?.url?.includes('/auth/login') ||
                                error.config?.url?.includes('/auth/register');
          if (!isAuthEndpoint && typeof window !== 'undefined') {
            // 清除token并跳转到登录页
            storage.remove('access_token');
            storage.remove('user');
            window.location.href = '/login';
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
      // 请求发出但没有收到响应
      apiError.code = 'NETWORK_ERROR';
      apiError.message = '网络连接失败，请检查网络设置';
    } else {
      // 请求配置出错
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
