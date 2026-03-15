import { storage } from '@/utils/storage'

export interface UploadedFileResponse {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  path: string
  relativePath?: string
  directoryPath?: string
  url?: string
  sessionId: string
  swarmSessionId?: string
  userId?: string | null
  createdAt: string
  metadata?: string | null
}

export interface WorkspaceDirectoryEntry {
  path: string
  name: string
  type: 'file' | 'directory'
  mimeType?: string
  size?: number
}

export interface WorkspaceDirectoryResponse {
  directoryPath: string
  entries: WorkspaceDirectoryEntry[]
}

interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

function resolveFileUrl(uploaded: UploadedFileResponse) {
  if (uploaded.url) return uploaded.url
  if (uploaded.path.startsWith('http://') || uploaded.path.startsWith('https://')) return uploaded.path
  return `/api/files/${uploaded.id}`
}

function authorizedHeaders() {
  const token = storage.get<string>('access_token')
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

export const filesApi = {
  uploadFile: async (file: File, swarmSessionId?: string, relativePath?: string): Promise<UploadedFileResponse & { url: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    if (swarmSessionId) formData.append('swarmSessionId', swarmSessionId)
    if (relativePath) formData.append('relativePath', relativePath)

    const response = await fetch('/api/files', {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: authorizedHeaders(),
    })

    const payload = await response.json() as ApiEnvelope<UploadedFileResponse>
    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.error || '文件上传失败')
    }

    return {
      ...payload.data,
      url: resolveFileUrl(payload.data),
    }
  },

  async listFiles(swarmSessionId?: string): Promise<UploadedFileResponse[]> {
    const params = swarmSessionId ? `?swarmSessionId=${swarmSessionId}` : ''
    const response = await fetch(`/api/files${params}`, {
      credentials: 'include',
      headers: authorizedHeaders(),
    })
    const payload = await response.json() as ApiEnvelope<UploadedFileResponse[]>
    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.error || '获取文件列表失败')
    }
    return payload.data.map((f) => ({ ...f, url: resolveFileUrl(f) }))
  },

  async listDirectory(swarmSessionId: string, directoryPath: string = '', recursive = false): Promise<WorkspaceDirectoryResponse> {
    const searchParams = new URLSearchParams({ swarmSessionId })
    if (directoryPath) searchParams.set('directoryPath', directoryPath)
    if (recursive) searchParams.set('recursive', '1')
    const response = await fetch(`/api/files/tree?${searchParams.toString()}`, {
      credentials: 'include',
      headers: authorizedHeaders(),
    })
    const payload = await response.json() as ApiEnvelope<WorkspaceDirectoryResponse>
    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.error || '获取目录结构失败')
    }
    return payload.data
  },

  async deleteFile(fileId: string): Promise<void> {
    const response = await fetch(`/api/files/${fileId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: authorizedHeaders(),
    })
    if (!response.ok) {
      throw new Error('Failed to delete file')
    }
  },

  getPathDownloadUrl(swarmSessionId: string, relativePath: string, download = true): string {
    const params = new URLSearchParams({ swarmSessionId, path: relativePath })
    if (download) params.set('download', '1')
    return `/api/files/by-path?${params.toString()}`
  },

  async deleteFileByPath(swarmSessionId: string, relativePath: string): Promise<void> {
    const searchParams = new URLSearchParams({ swarmSessionId, path: relativePath })
    const response = await fetch(`/api/files/by-path?${searchParams.toString()}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: authorizedHeaders(),
    })
    if (!response.ok) {
      throw new Error('Failed to delete file')
    }
  },
}
