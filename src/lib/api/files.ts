import { storage } from '@/utils/storage';

export interface UploadedFileResponse {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  url?: string;
  sessionId: string;
  swarmSessionId?: string;
  userId?: string | null;
  createdAt: string;
  metadata?: string | null;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function resolveFileUrl(uploaded: UploadedFileResponse) {
  if (uploaded.url) {
    return uploaded.url;
  }

  if (uploaded.path.startsWith('http://') || uploaded.path.startsWith('https://')) {
    return uploaded.path;
  }

  return `/api/files/${uploaded.id}`;
}

export const filesApi = {
  uploadFile: async (file: File, swarmSessionId?: string): Promise<UploadedFileResponse & { url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (swarmSessionId) {
      formData.append('swarmSessionId', swarmSessionId);
    }

    const token = storage.get<string>('access_token');
    const response = await fetch('/api/files', {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    const payload = await response.json() as ApiEnvelope<UploadedFileResponse>;
    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.error || '文件上传失败');
    }

    return {
      ...payload.data,
      url: resolveFileUrl(payload.data),
    };
  },
};
