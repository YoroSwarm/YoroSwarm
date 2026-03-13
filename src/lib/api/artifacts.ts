import { api } from './client'

export interface ArtifactListItem {
  id: string
  title: string
  kind: string
  summary: string | null
  createdAt: string
  swarmSession: { id: string; name: string } | null
  ownerAgent: { id: string; name: string; role: string } | null
  sourceTask: { id: string; title: string; status: string } | null
  file: { id: string; name: string; mimeType: string; size: number; url: string } | null
  hasContent: boolean
}

export interface ArtifactDetail extends Omit<ArtifactListItem, 'hasContent'> {
  content: string | null
}

export const artifactsApi = {
  async list(params?: { swarmSessionId?: string; kind?: string }): Promise<ArtifactListItem[]> {
    const searchParams = new URLSearchParams()
    if (params?.swarmSessionId) searchParams.set('swarmSessionId', params.swarmSessionId)
    if (params?.kind) searchParams.set('kind', params.kind)
    const query = searchParams.toString()
    return api.get<ArtifactListItem[]>(`/artifacts${query ? `?${query}` : ''}`)
  },

  async get(artifactId: string): Promise<ArtifactDetail> {
    return api.get<ArtifactDetail>(`/artifacts/${artifactId}`)
  },

  async delete(artifactId: string): Promise<void> {
    await api.delete(`/artifacts/${artifactId}`)
  },
}
