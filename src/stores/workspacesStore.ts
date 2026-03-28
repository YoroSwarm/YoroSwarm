'use client';

import { create } from 'zustand';
import { workspacesApi, type WorkspaceResponse } from '@/lib/api/workspaces';

interface WorkspacesState {
  workspaces: WorkspaceResponse[];
  currentWorkspaceId: string | null;
  isLoading: boolean;
  error: string | null;
  initializingWorkspaces: Set<string>;
  errorWorkspaces: Set<string>;
}

interface WorkspacesActions {
  loadWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<WorkspaceResponse>;
  updateWorkspace: (workspaceId: string, name?: string, description?: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  archiveWorkspace: (workspaceId: string) => Promise<void>;
  unarchiveWorkspace: (workspaceId: string) => Promise<void>;
  setCurrentWorkspace: (workspaceId: string | null) => void;
  setWorkspaceInitializing: (workspaceId: string, initializing: boolean) => void;
  setWorkspaceVenvError: (workspaceId: string, venvError: boolean) => void;
}

export const useWorkspacesStore = create<WorkspacesState & WorkspacesActions>((set, get) => ({
  workspaces: [],
  currentWorkspaceId: null,
  isLoading: false,
  error: null,
  initializingWorkspaces: new Set(),
  errorWorkspaces: new Set(),

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
    set((state) => {
      const newSet = new Set(state.initializingWorkspaces);
      newSet.add(created.id);
      return {
        workspaces: [created, ...state.workspaces],
        currentWorkspaceId: state.currentWorkspaceId || created.id,
        initializingWorkspaces: newSet,
      };
    });
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

  setWorkspaceInitializing: (workspaceId, initializing) => {
    set((state) => {
      const newSet = new Set(state.initializingWorkspaces);
      if (initializing) {
        newSet.add(workspaceId);
      } else {
        newSet.delete(workspaceId);
      }
      return {
        initializingWorkspaces: newSet,
        workspaces: state.workspaces.map((w) =>
          w.id === workspaceId ? { ...w, initializing } : w
        ),
      };
    });
  },

  setWorkspaceVenvError: (workspaceId, venvError) => {
    set((state) => {
      const newSet = new Set(state.errorWorkspaces);
      if (venvError) {
        newSet.add(workspaceId);
      } else {
        newSet.delete(workspaceId);
      }
      return {
        errorWorkspaces: newSet,
        workspaces: state.workspaces.map((w) =>
          w.id === workspaceId ? { ...w, venvError } : w
        ),
      };
    });
  },
}));
