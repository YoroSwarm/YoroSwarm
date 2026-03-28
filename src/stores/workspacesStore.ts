'use client';

import { create } from 'zustand';
import { workspacesApi, type WorkspaceResponse } from '@/lib/api/workspaces';

interface WorkspacesState {
  workspaces: WorkspaceResponse[];
  currentWorkspaceId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface WorkspacesActions {
  loadWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<WorkspaceResponse>;
  updateWorkspace: (workspaceId: string, name?: string, description?: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  archiveWorkspace: (workspaceId: string) => Promise<void>;
  unarchiveWorkspace: (workspaceId: string) => Promise<void>;
  setCurrentWorkspace: (workspaceId: string | null) => void;
}

export const useWorkspacesStore = create<WorkspacesState & WorkspacesActions>((set, get) => ({
  workspaces: [],
  currentWorkspaceId: null,
  isLoading: false,
  error: null,

  loadWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await workspacesApi.listWorkspaces();
      set({ workspaces: response.items });

      // Auto-select first workspace if none selected
      if (!get().currentWorkspaceId && response.items.length > 0) {
        set({ currentWorkspaceId: response.items[0].id });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '加载工作空间失败' });
    } finally {
      set({ isLoading: false });
    }
  },

  createWorkspace: async (name, description) => {
    const created = await workspacesApi.createWorkspace({ name, description });
    set((state) => ({
      workspaces: [...state.workspaces, created],
      currentWorkspaceId: state.currentWorkspaceId || created.id,
    }));
    return created;
  },

  updateWorkspace: async (workspaceId, name, description) => {
    const updated = await workspacesApi.updateWorkspace(workspaceId, { name, description });
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === workspaceId ? updated : w)),
    }));
  },

  deleteWorkspace: async (workspaceId) => {
    await workspacesApi.deleteWorkspace(workspaceId);
    set((state) => {
      const workspaces = state.workspaces.filter((w) => w.id !== workspaceId);
      const currentWorkspaceId =
        state.currentWorkspaceId === workspaceId
          ? workspaces[0]?.id ?? null
          : state.currentWorkspaceId;
      return { workspaces, currentWorkspaceId };
    });
  },

  archiveWorkspace: async (workspaceId) => {
    const updated = await workspacesApi.archiveWorkspace(workspaceId);
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === workspaceId ? updated : w)),
    }));
  },

  unarchiveWorkspace: async (workspaceId) => {
    const updated = await workspacesApi.unarchiveWorkspace(workspaceId);
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === workspaceId ? updated : w)),
    }));
  },

  setCurrentWorkspace: (workspaceId) => {
    set({ currentWorkspaceId: workspaceId });
  },
}));
