# Hook Guidelines

> How hooks are used in this project.

---

## Overview

This project uses **custom React hooks** for data fetching and stateful logic. The project does NOT use React Query or SWR — hooks manage server state directly via Axios.

---

## Custom Hook Patterns

### Standard Hook Structure

```typescript
// src/hooks/use-agents.ts
'use client';

import { useState, useCallback, useEffect } from 'react';
import { agentsApi } from '@/lib/api/agents';
import type { Agent, AgentActivity, AgentMessage } from '@/types/agent';
import { storage } from '@/utils/storage';

// Data conversion function (not a hook)
const convertApiAgent = (apiAgent: ApiAgentResponse): Agent => {
  // Transform API response to app type
  return { ... };
};

interface UseAgentsOptions {
  autoLoad?: boolean;
  swarmSessionId?: string;
}

export function useAgents(options: UseAgentsOptions = {}) {
  const { autoLoad = true, swarmSessionId } = options;

  // State - separate variables per concern
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Callback for derived/computed values
  const resolveSwarmSessionId = useCallback(() => {
    const storedSessionId = storage.get<string>('current_swarm_session_id');
    return swarmSessionId || storedSessionId || undefined;
  }, [swarmSessionId]);

  // Async actions - useCallback wrapped
  const loadAgents = useCallback(async () => {
    const scopedSessionId = resolveSwarmSessionId();
    if (!scopedSessionId) {
      setAgents([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await agentsApi.getAgents({ swarmSessionId: scopedSessionId });
      setAgents(response.agents.map(convertApiAgent));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Agent 失败');
      throw err; // Also throw for caller
    } finally {
      setIsLoading(false);
    }
  }, [resolveSwarmSessionId]);

  // CRUD actions
  const createAgent = useCallback(async (agentData: CreateAgentInput) => {
    // ... create logic
    await loadAgents(); // Refresh after mutation
    return response;
  }, [loadAgents, resolveSwarmSessionId]);

  // Side effects - useEffect for subscriptions/triggers
  useEffect(() => {
    if (autoLoad) {
      loadAgents();
    }
  }, [autoLoad, loadAgents]);

  // Return all state and actions
  return {
    agents,
    activities,
    messages,
    selectedAgent,
    isLoading,
    error,
    setSelectedAgent,
    createAgent,
    updateAgent,
    deleteAgent,
    loadAgents,
  };
}
```

---

## Naming Conventions

| Pattern | Example | Notes |
|---------|---------|-------|
| Hook files | `use-agents.ts`, `use-tasks.ts` | kebab-case, `use` prefix |
| Hook function | `useAgents`, `useTasks` | PascalCase, `use` prefix |
| Options interface | `UseAgentsOptions` | PascalCase, `Options` suffix |
| State setters | `setAgents`, `setSelectedAgent` | `set` prefix |

---

## Data Fetching Pattern

Since this project does **NOT** use React Query/SWR, data fetching is handled directly in hooks:

### Fetch on Mount with Auto-Load

```typescript
interface UseTasksOptions {
  autoLoad?: boolean;
  teamId?: string;
}

export function useTasks(options: UseTasksOptions = {}) {
  const { autoLoad = true, teamId } = options;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!teamId) return;
    setIsLoading(true);
    try {
      const data = await tasksApi.getTasks({ teamId });
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (autoLoad) {
      loadTasks();
    }
  }, [autoLoad, loadTasks]);

  return { tasks, isLoading, error, loadTasks };
}
```

### Optimistic Updates

```typescript
const deleteAgent = useCallback(async (id: string) => {
  // Optimistic update
  setAgents((prev) => prev.filter((agent) => agent.id !== id));

  try {
    await agentsApi.deleteAgent(id);
  } catch (err) {
    // Rollback on error
    await loadAgents();
    setError(err instanceof Error ? err.message : '删除失败');
    throw err;
  }
}, [loadAgents]);
```

---

## When to Create a Hook

| Scenario | Create Hook? | Reason |
|----------|-------------|--------|
| Fetching data from API | Yes | Centralizes loading/error state |
| Complex local state logic | Yes | Encapsulates state machine |
| Using `useEffect` for subscriptions | Yes | Cleanup is easier in hook |
| Simple boolean toggle | Maybe | `useState` may suffice |
| Accessing global state | Via store | Use Zustand store, not context |
| One-time calculation | No | Use `useMemo` instead |

---

## Common Mistakes

### 1. Not Handling Loading/Error States

```typescript
// Bad - no loading state
const [data, setData] = useState<Data[]>([]);
useEffect(() => {
  fetchData().then(setData);
}, []);

// Good - loading and error states
const [data, setData] = useState<Data[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
useEffect(() => {
  setIsLoading(true);
  fetchData()
    .then(setData)
    .catch((err) => setError(err.message))
    .finally(() => setIsLoading(false));
}, []);
```

### 2. Missing Dependencies in useCallback

```typescript
// Bad - missing dependency
const loadAgents = useCallback(async () => {
  const sessionId = getSessionId(); // This might change!
  const data = await agentsApi.getAgents(sessionId);
  setAgents(data);
}, []); // Missing: sessionId

// Good - all dependencies declared
const loadAgents = useCallback(async () => {
  const sessionId = resolveSwarmSessionId();
  const data = await agentsApi.getAgents(sessionId);
  setAgents(data);
}, [resolveSwarmSessionId]);
```

### 3. Not Cleanup in useEffect

```typescript
// Bad - subscription leak
useEffect(() => {
  const ws = new WebSocket(url);
  ws.onmessage = handleMessage;
  // No return = no cleanup
}, []);

// Good - cleanup on unmount
useEffect(() => {
  const ws = new WebSocket(url);
  ws.onmessage = handleMessage;
  return () => ws.close();
}, []);
```

### 4. Creating New References in Dependency Array

```typescript
// Bad - new object every render
useEffect(() => {
  doSomething({ filter: 'active' });
}, [{ filter: 'active' }]); // New object each time!

// Good - stable reference
const options = useMemo(() => ({ filter: 'active' }), []);
useEffect(() => {
  doSomething(options);
}, [options]);
```

---

## API vs Hook Pattern

When data is only used by one component, consider inline fetching vs hook:

```typescript
// Simple case - inline might be fine
'use client';
export function AgentList({ teamId }: { teamId: string }) {
  const [agents, setAgents] = useState([]);
  useEffect(() => {
    agentsApi.getAgents(teamId).then(setAgents);
  }, [teamId]);
  // render...
}

// Complex case - use hook
'use client';
export function AgentList({ teamId }: { teamId: string }) {
  const { agents, isLoading, error } = useAgents({ teamId });
  // render...
}
```

**Use a hook when**:
- Multiple components need the same data
- Logic is complex (optimistic updates, pagination)
- You need to share state/actions across components
