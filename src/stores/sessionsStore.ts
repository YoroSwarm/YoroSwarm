'use client';

import { create } from 'zustand';
import type { Session } from '@/types/chat';
import { swarmSessionsApi, type SwarmSessionResponse } from '@/lib/api/swarm-sessions';

function convertSession(session: SwarmSessionResponse): Session {
  const lead = session.agents.find((agent) => agent.id === session.lead_agent_id);

  return {
    id: session.id,
    title: session.title,
    description: session.goal,
    participants: session.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.id === session.lead_agent_id ? 'lead' : 'teammate',
      status: agent.status === 'offline' ? 'offline' : agent.status === 'busy' ? 'busy' : 'online',
    })),
    lastMessage: session.last_message
      ? {
          id: session.last_message.id,
          sessionId: session.id,
          type: session.last_message.message_type === 'file' ? 'file' : session.last_message.message_type === 'system' ? 'system' : 'text',
          content: session.last_message.content,
          sender: {
            id: session.last_message.sender_id || lead?.id || 'lead',
            type: session.last_message.sender_type === 'user' ? 'user' : 'agent',
            name: session.last_message.sender_type === 'user' ? '我' : lead?.name || 'Swarm',
          },
          status: 'received',
          createdAt: session.last_message.created_at,
        }
      : undefined,
    unreadCount: 0,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    status: session.status === 'archived' ? 'archived' : 'active',
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
  setSessions: (sessions: Session[] | ((prev: Session[]) => Session[])) => void;
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
    set((state) => ({
      sessions: [converted, ...state.sessions.filter((s) => s.id !== converted.id)],
    }));
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

  setSessions: (sessions) => {
    if (typeof sessions === 'function') {
      set((state) => ({ sessions: sessions(state.sessions) }));
    } else {
      set({ sessions });
    }
  },
}));
