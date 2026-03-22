# State Management

> How state is managed in this project.

---

## Overview

This project uses **Zustand** for global state management. Local component state uses React's `useState`. Server state is managed in custom hooks (NOT React Query/SWR).

---

## State Categories

| Category | Solution | Examples |
|----------|----------|----------|
| **Server state** | Custom hooks + Axios | `useAgents`, `useTasks` |
| **Global UI state** | Zustand stores | `useUIStore`, `useThemeStore` |
| **Persisted user data** | Zustand + persist | `useAuthStore`, `usePreferencesStore` |
| **Local component state** | `useState`/`useReducer` | `const [count, setCount] = useState(0)` |
| **Derived state** | `useMemo` | `const filteredItems = useMemo(() => items.filter(...), [items])` |
| **URL state** | `nuqs` or `useSearchParams` | `/dashboard?tab=agents` |

---

## Zustand Store Pattern

### Standard Store Structure

```typescript
// src/stores/authStore.ts
'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthState, User } from '@/types/index';
import { authApi } from '@/lib/api/auth';
import { storage } from '@/lib/utils/storage';

// 1. Define state interface
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// 2. Define actions interface
interface AuthActions {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  checkAuth: () => Promise<boolean>;
}

// 3. Combine state + actions type
type AuthStore = AuthState & AuthActions;

// 4. Initial state
const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
};

// 5. Create store with persist middleware
export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      login: async (credentials) => {
        set({ isLoading: true });
        try {
          const response = await authApi.login(credentials);
          const { user, tokens } = response;

          storage.set('access_token', tokens.accessToken);
          storage.set('refresh_token', tokens.refreshToken);

          set({
            user,
            token: tokens.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          storage.remove('access_token');
          storage.remove('refresh_token');
          set({ ...initialState });
        }
      },

      checkAuth: async () => {
        const token = storage.get<string>('access_token');
        if (!token) return false;

        set({ isLoading: true });
        try {
          const user = await authApi.getCurrentUser();
          set({ user, token, isAuthenticated: true, isLoading: false });
          return true;
        } catch {
          storage.remove('access_token');
          storage.remove('refresh_token');
          set({ ...initialState });
          return false;
        }
      },
    }),
    {
      name: 'swarm-auth-storage',
      partialize: (state) => ({ user: state.user }), // Only persist user
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? localStorage
          : {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            }
      ),
      skipHydration: true, // Important for Next.js SSR
    }
  )
);
```

---

## Persisting State with Zustand

### SSR-Safe Persistence

```typescript
// Next.js requires SSR-safe storage
storage: createJSONStorage(() =>
  typeof window !== 'undefined'
    ? localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }
),
skipHydration: true, // Let component handle hydration
```

### Hydration Helper Hook

```typescript
// authStore.ts
export const useAuthHydration = () => {
  const { checkAuth } = useAuthStore();
  const hydrate = async () => {
    await checkAuth();
  };
  return { hydrate };
};

// Usage in root layout
const { hydrate } = useAuthHydration();
useEffect(() => { hydrate(); }, [hydrate]);
```

---

## UI Store Pattern

For global UI state (sidebar, modals, notifications):

```typescript
// src/stores/uiStore.ts
'use client';

import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  notifications: Notification[];
  modalOpen: boolean;
  modalContent: React.ReactNode;
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  dismissNotification: (id: string) => void;
}

type UIStore = UIState & UIActions;

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  notifications: [],
  modalOpen: false,
  modalContent: null,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  showNotification: (notification) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { ...notification, id: Math.random().toString(36).substr(2, 9) },
      ].slice(-5), // Keep last 5
    })),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));

// Convenience hooks
export const useSidebar = () => {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();
  return { sidebarOpen, toggleSidebar, setSidebarOpen };
};

export const useNotifications = () => {
  const { notifications, showNotification, dismissNotification } = useUIStore();
  return { notifications, showNotification, dismissNotification };
};
```

---

## When to Use Global State

| Use Global State | Use Local State |
|------------------|-----------------|
| Auth status | Form input values |
| User preferences (theme, layout) | Toggle visibility of a single modal |
| Sidebar open/closed | Loading state for one component |
| Toast notifications queue | Component-specific error messages |
| WebSocket connection status | Animation states |

**Rule of thumb**: If multiple unrelated components need the same state → global store. If only one component (and its children) need it → local state.

---

## Forbidden Patterns

### 1. Context for Global State

```typescript
// Bad - Context for simple global state
const AuthContext = createContext<AuthState>(null);

// Good - Zustand store
export const useAuthStore = create<AuthStore>(...);
```

### 2. Prop Drilling

```typescript
// Bad - passing through many levels
<App>
  <Layout sidebarOpen={sidebarOpen}>
    <Dashboard sidebarOpen={sidebarOpen}>
      <Panel sidebarOpen={sidebarOpen}>
        <Button /> // Finally uses sidebarOpen
      </Panel>
    </Dashboard>
  </Layout>
</App>

// Good - Zustand store
const { sidebarOpen } = useUIStore();
```

### 3. Storing Everything in State

```typescript
// Bad - computed values in state
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(`${firstName} ${lastName}`); // Derived!
}, [firstName, lastName]);

// Good - useMemo
const fullName = useMemo(() => `${firstName} ${lastName}`, [firstName, lastName]);
```

---

## Common Mistakes

### 1. Not Using `partialize` in Persist

```typescript
// Bad - persists entire store including sensitive data
{
  name: 'auth-storage',
  // No partialize - saves everything including tokens!
}

// Good - only persist what's needed
{
  name: 'auth-storage',
  partialize: (state) => ({ user: state.user }), // Only user info
}
```

### 2. Mutating State Directly

```typescript
// Bad - mutation
const addItem = (item) => {
  items.push(item); // Mutates!
  setItems(items);
};

// Good - immutable update
const addItem = (item) => {
  setItems((prev) => [...prev, item]);
};
```

### 3. Missing Error Handling in Async Actions

```typescript
// Bad - swallows errors
login: async (credentials) => {
  set({ isLoading: true });
  const response = await authApi.login(credentials);
  set({ user: response.user, isLoading: false });
  // If above throws, isLoading stays true!
},

// Good - try/catch/finally
login: async (credentials) => {
  set({ isLoading: true });
  try {
    const response = await authApi.login(credentials);
    set({ user: response.user });
  } catch (error) {
    throw error; // Re-throw for caller
  } finally {
    set({ isLoading: false }); // Always reset
  }
},
```

### 4. Not Cleaning Up on Logout

```typescript
// Bad - partial cleanup
logout: async () => {
  await authApi.logout();
  set({ user: null }); // Forgot to reset token and isAuthenticated!
},

// Good - complete reset
logout: async () => {
  try {
    await authApi.logout();
  } finally {
    storage.clear();
    set({ ...initialState });
  }
},
```
