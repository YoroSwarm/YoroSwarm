'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { storage } from '@/utils/storage';
import { appConfig } from '@/lib/config/app';

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  duration?: number;
}

interface ModalState {
  isOpen: boolean;
  type: string | null;
  data?: unknown;
}

interface UIState {
  // Sidebar state
  sidebarOpen: boolean;
  // Current page title
  pageTitle: string;
  // Notifications list
  notifications: Notification[];
  // Modal state
  modal: ModalState;
  // Loading state
  globalLoading: boolean;
  // Breadcrumbs
  breadcrumbs: Array<{ label: string; path?: string }>;
}

interface UIActions {
  // Sidebar actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  // Page title
  setPageTitle: (title: string) => void;
  // Notification actions
  addNotification: (notification: Omit<Notification, 'id'>) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  // Modal actions
  openModal: (type: string, data?: unknown) => void;
  closeModal: () => void;
  // Global loading
  setGlobalLoading: (loading: boolean) => void;
  // Breadcrumbs
  setBreadcrumbs: (breadcrumbs: Array<{ label: string; path?: string }>) => void;
}

type UIStore = UIState & UIActions;

const initialState: UIState = {
  sidebarOpen: true,
  pageTitle: '',
  notifications: [],
  modal: {
    isOpen: false,
    type: null,
  },
  globalLoading: false,
  breadcrumbs: [],
};

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Sidebar actions
      toggleSidebar: () => {
        set((state) => ({ sidebarOpen: !state.sidebarOpen }));
      },

      setSidebarOpen: (open) => {
        set({ sidebarOpen: open });
      },

  // Page title
  setPageTitle: (title) => {
    set({ pageTitle: title });
    // Update document title
    if (typeof document !== 'undefined') {
      document.title = title ? `${title} - ${appConfig.name}` : appConfig.name;
    }
  },

  // Notification actions
  addNotification: (notification) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification: Notification = {
      ...notification,
      id,
      duration: notification.duration ?? 5000,
    };

    set((state) => ({
      notifications: [...state.notifications, newNotification],
    }));

    // Auto remove
    const duration = newNotification.duration ?? 0;
    if (duration > 0) {
      setTimeout(() => {
        get().removeNotification(id);
      }, duration);
    }

    return id;
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearNotifications: () => {
    set({ notifications: [] });
  },

  // Modal actions
  openModal: (type, data) => {
    set({
      modal: {
        isOpen: true,
        type,
        data,
      },
    });
  },

  closeModal: () => {
    set({
      modal: {
        isOpen: false,
        type: null,
        data: undefined,
      },
    });
  },

  // Global loading
  setGlobalLoading: (loading) => {
    set({ globalLoading: loading });
  },

  // Breadcrumbs
  setBreadcrumbs: (breadcrumbs) => {
    set({ breadcrumbs });
  },
}),
    {
      name: 'swarm-ui-state',
      storage: {
        getItem: (name) => {
          const value = storage.get(name);
          return value ? { state: value } : null;
        },
        setItem: (name, value) => {
          storage.set(name, value.state);
        },
        removeItem: (name) => {
          storage.remove(name);
        },
      },
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);

// Convenience hooks
export const useSidebar = () => {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();
  return { sidebarOpen, toggleSidebar, setSidebarOpen };
};

export const useNotifications = () => {
  const { notifications, addNotification, removeNotification, clearNotifications } = useUIStore();
  return { notifications, addNotification, removeNotification, clearNotifications };
};

export const useModal = () => {
  const { modal, openModal, closeModal } = useUIStore();
  return { modal, openModal, closeModal };
};
