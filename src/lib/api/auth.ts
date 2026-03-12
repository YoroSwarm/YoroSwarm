import { api } from './client';
import type {
  LoginCredentials,
  RegisterCredentials,
  LoginResponse,
} from '@/types/auth';
import type { User } from '@/types/index';

// 后端返回的原始 Token 格式
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

interface UserResponse {
  user: User;
}

export const authApi = {
  // 登录
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const data = await api.post<TokenResponse>('/auth/login', {
      username: credentials.username,
      password: credentials.password,
    });
    return {
      user: data.user,
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      },
    };
  },

  // 注册 - 注册成功后自动登录
  register: async (credentials: RegisterCredentials & { accessCode: string }): Promise<LoginResponse> => {
    // 1. 注册新用户
    await api.post<User>('/auth/register', {
      username: credentials.username,
      email: credentials.email,
      password: credentials.password,
      access_code: credentials.accessCode,
    });
    // 2. 自动登录获取 token
    return authApi.login({
      username: credentials.username,
      password: credentials.password,
    });
  },

  // 登出
  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  // 获取当前用户信息
  getCurrentUser: async (): Promise<User> => {
    const data = await api.get<UserResponse>('/auth/me');
    return data.user;
  },

  // 刷新token
  refreshToken: async (): Promise<{ access_token: string; refresh_token: string; expires_in: number }> => {
    return api.post('/auth/refresh');
  },

  // 修改密码
  changePassword: async (oldPassword: string, newPassword: string): Promise<void> => {
    await api.post('/auth/change-password', { oldPassword, newPassword });
  },

  // 获取权限码信息
  getAccessCodeInfo: async (): Promise<{ code: string; generatedAt: string }> => {
    return api.get('/auth/access-code');
  },

  // 轮换权限码
  rotateAccessCode: async (): Promise<{ access_code: string; message: string }> => {
    return api.post('/auth/access-code');
  },
};
