'use client';

import { create } from 'zustand';
import type { Session, Agent } from '@/types/chat';
import { swarmSessionsApi, type SwarmSessionResponse } from '@/lib/api/swarm-sessions';
import { appConfig } from '@/lib/config/app';

function normalizeParticipantName(name: string | null | undefined, fallbackRole: string): string {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (normalizedName) return normalizedName;

  const normalizedRole = typeof fallbackRole === 'string' ? fallbackRole.trim() : '';
  if (normalizedRole) return normalizedRole;

  return 'Unknown';
}

function dedupeParticipants(participants: Agent[]): Agent[] {
  const deduped = new Map<string, Agent>();

  for (const participant of participants) {
    if (!participant?.id) continue;
    deduped.set(participant.id, participant);
  }

  return Array.from(deduped.values());
}

function convertSession(session: SwarmSessionResponse): Session {
  const lead = session.agents.find((agent) => agent.id === session.lead_agent_id);

  return {
    id: session.id,
    title: session.title,
    description: session.goal,
    participants: dedupeParticipants(session.agents.map((agent) => ({
      id: agent.id,
      name: normalizeParticipantName(agent.name, agent.role),
      role: agent.id === session.lead_agent_id ? 'lead' : 'teammate',
      status: agent.status === 'offline' ? 'offline' : agent.status === 'busy' ? 'busy' : 'online',
    }))),
    lastMessage: session.last_message
      ? {
          id: session.last_message.id,
          sessionId: session.id,
          type: session.last_message.message_type === 'file' ? 'file' : session.last_message.message_type === 'system' ? 'system' : 'text',
          content: session.last_message.content,
          sender: {
            id: session.last_message.sender_id || lead?.id || 'lead',
            type: session.last_message.sender_type === 'user' ? 'user' : 'agent',
            name: session.last_message.sender_type === 'user' ? '我' : lead?.name || appConfig.name,
          },
          status: 'received',
          createdAt: session.last_message.created_at,
        }
      : undefined,
    unreadCount: 0,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    status: session.status === 'archived' ? 'archived' : ['PAUSED', 'paused'].includes(session.status) ? 'paused' : 'active',
    isPinned: !!session.pinned_at,
  };
}

interface SessionsState {
  sessions: Session[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;
}

interface SessionsActions {
  loadSessions: () => Promise<void>;
  createSession: (input?: { title?: string; goal?: string; description?: string }) => Promise<Session>;
  deleteSession: (sessionId: string) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  unarchiveSession: (sessionId: string) => Promise<void>;
  pauseSession: (sessionId: string) => Promise<void>;
  resumeSession: (sessionId: string) => Promise<void>;
  pinSession: (sessionId: string) => Promise<void>;
  unpinSession: (sessionId: string) => Promise<void>;
  setSessions: (sessions: Session[] | ((prev: Session[]) => Session[])) => void;
  updateSessionParticipant: (sessionId: string, agent: { id: string; name: string; role?: string; status?: string }) => void;
  setSessionInitializing: (sessionId: string, initializing: boolean) => void;
  setSessionVenvError: (sessionId: string, venvError: boolean) => void;
  refreshAllSessionsInitStatus: () => Promise<void>;
}

export const useSessionsStore = create<SessionsState & SessionsActions>((set) => ({
  sessions: [],
  isLoading: false,
  error: null,
  totalCount: 0,

  loadSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await swarmSessionsApi.listSessions();
      const converted = response.items.map(convertSession);
      set({ sessions: converted, totalCount: response.total });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '加载会话失败' });
    } finally {
      set({ isLoading: false });
    }
  },

  createSession: async (input) => {
    const created = await swarmSessionsApi.createSession({
      title: input?.title,
      goal: input?.goal,
      description: input?.description,
      mode: 'general_office',
    });
    const converted = convertSession(created);
    set((state) => {
      const rest = state.sessions.filter((s) => s.id !== converted.id);
      const pinnedIdx = rest.findLastIndex((s) => s.isPinned);
      const insertAt = pinnedIdx + 1;
      return {
        sessions: [...rest.slice(0, insertAt), converted, ...rest.slice(insertAt)],
      };
    });
    return converted;
  },

  deleteSession: async (sessionId: string) => {
    await swarmSessionsApi.deleteSession(sessionId);
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
    }));
  },

  archiveSession: async (sessionId: string) => {
    const updated = await swarmSessionsApi.updateSession(sessionId, { status: 'archived' });
    const converted = convertSession(updated);
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? converted : s)),
    }));
  },

  unarchiveSession: async (sessionId: string) => {
    const updated = await swarmSessionsApi.updateSession(sessionId, { status: 'active' });
    const converted = convertSession(updated);
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? converted : s)),
    }));
  },

  pauseSession: async (sessionId: string) => {
    await swarmSessionsApi.pauseSession(sessionId);
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              status: 'paused' as const,
              participants: s.participants.map((p) => ({ ...p, status: 'offline' as const })),
            }
          : s
      ),
    }));
  },

  resumeSession: async (sessionId: string) => {
    await swarmSessionsApi.resumeSession(sessionId);
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              status: 'active' as const,
              participants: s.participants.map((p) => ({ ...p, status: 'idle' as const })),
            }
          : s
      ),
    }));
  },

  pinSession: async (sessionId: string) => {
    const updated = await swarmSessionsApi.updateSession(sessionId, { isPinned: true });
    const converted = convertSession(updated);
    set((state) => ({
      sessions: [converted, ...state.sessions.filter((s) => s.id !== sessionId)],
    }));
  },

  unpinSession: async (sessionId: string) => {
    const updated = await swarmSessionsApi.updateSession(sessionId, { isPinned: false });
    const converted = convertSession(updated);
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? converted : s)),
    }));
  },

  setSessions: (sessions) => {
    if (typeof sessions === 'function') {
      set((state) => ({ sessions: sessions(state.sessions) }));
    } else {
      set({ sessions });
    }
  },

  updateSessionParticipant: (sessionId, agent) => {
    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== sessionId) return session;

        const normalizedId = typeof agent.id === 'string' ? agent.id.trim() : '';
        if (!normalizedId) {
          return session;
        }

        const existingIndex = session.participants.findIndex((p) => p.id === normalizedId);
        const normalizedStatus = agent.status === 'offline' ? 'offline' : agent.status === 'busy' ? 'busy' : 'online';
        const normalizedName = normalizeParticipantName(agent.name, agent.role || 'teammate');

        if (existingIndex >= 0) {
          // Update existing participant — preserve role if not provided
          const updatedParticipants = [...session.participants];
          updatedParticipants[existingIndex] = {
            ...updatedParticipants[existingIndex],
            name: normalizedName || updatedParticipants[existingIndex].name,
            role: updatedParticipants[existingIndex].role,
            status: normalizedStatus as Agent['status'],
          };
          return { ...session, participants: dedupeParticipants(updatedParticipants) };
        } else {
          // Add new participant
          return {
            ...session,
            participants: dedupeParticipants([
              ...session.participants.filter((participant) => participant.id !== normalizedId),
              {
                id: normalizedId,
                name: normalizedName,
                role: (agent.role as Agent['role']) || 'teammate',
                status: normalizedStatus as Agent['status'],
              },
            ]),
          };
        }
      }),
    }));
  },

  setSessionInitializing: (sessionId, initializing) => {
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId ? { ...session, initializing } : session
      ),
    }));
  },

  setSessionVenvError: (sessionId, venvError) => {
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId ? { ...session, venvError } : session
      ),
    }));
  },

  refreshAllSessionsInitStatus: async () => {
    const state = useSessionsStore.getState();
    const sessionIds = state.sessions.map((s) => s.id);

    // 并行获取所有会话的初始化状态
    await Promise.all(
      sessionIds.map(async (sessionId) => {
        try {
          const status = await swarmSessionsApi.getSessionStatus(sessionId);
          if (status.venvReady && status.workspaceReady) {
            useSessionsStore.getState().setSessionInitializing(sessionId, false);
            useSessionsStore.getState().setSessionVenvError(sessionId, false);
          } else if (status.venvStatus === 'error') {
            useSessionsStore.getState().setSessionInitializing(sessionId, false);
            useSessionsStore.getState().setSessionVenvError(sessionId, true);
          } else {
            useSessionsStore.getState().setSessionInitializing(sessionId, true);
            useSessionsStore.getState().setSessionVenvError(sessionId, false);
          }
        } catch {
          // 忽略单个会话的错误
        }
      })
    );
  },
}));
