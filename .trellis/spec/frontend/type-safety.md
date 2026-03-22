# Type Safety

> Type safety patterns in this project.

---

## Overview

This project uses **TypeScript** with strict typing throughout. The codebase follows these conventions:
- `import type` for type-only imports
- Explicit type annotations for function signatures
- Union types for related constants
- Interfaces for object shapes
- Type inference where clear

---

## Type Organization

### Directory Structure

```
src/types/
├── index.ts         # Barrel export, shared types
├── agent.ts         # Agent-related types
├── auth.ts          # Auth-related types
├── chat.ts          # Chat/message types
└── websocket.ts     # WebSocket event types
```

### Type Export Pattern

```typescript
// src/types/agent.ts

// Union types for constants
export type AgentStatus = 'online' | 'offline' | 'busy' | 'idle' | 'error';
export type AgentType = 'leader' | 'worker' | 'specialist' | 'coordinator';

// Interfaces for object shapes
export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  currentTask?: string;
  load: number;
  description?: string;
  createdAt: string;
  lastActiveAt: string;
}

// Event/action types
export interface AgentActivity {
  id: string;
  agentId: string;
  type: 'message' | 'task_started' | 'task_completed';
  timestamp: string;
  payload?: Record<string, unknown>;
}
```

### Barrel Export

```typescript
// src/types/index.ts
export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Re-export from submodules
export * from './agent';
export * from './chat';
export * from './websocket';
```

---

## Import Style

### Type-Only Imports

Always use `import type` for types that are only used as type annotations:

```typescript
// Good - type-only imports
import type { Agent, AgentActivity } from '@/types/agent';
import type { User, AuthState } from '@/types/index';
import type { LoginCredentials, RegisterCredentials } from '@/types/auth';

// Bad - regular import for types only
import { Agent, AgentActivity } from '@/types/agent';
```

### When to Use Regular Import

Only use regular imports when you need both the type AND a runtime value:

```typescript
// Good - need the enum at runtime
import { AgentStatus } from '@/types/agent';
const statusMap: Record<AgentStatus, string> = { ... };
```

### Inline Type Imports

For inline types, use `import type`:

```typescript
// Good
function createAgent(agent: type { name: string }): type { id: string } {
  return { id: Math.random().toString() };
}

// Better - explicit interface
interface CreateAgentInput { name: string }
interface CreateAgentOutput { id: string }

function createAgent(agent: CreateAgentInput): CreateAgentOutput {
  return { id: Math.random().toString() };
}
```

---

## API Response Types

### Standard API Response Wrapper

```typescript
// src/types/index.ts
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}
```

### API Client Type Usage

```typescript
// src/lib/api/client.ts
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Generic methods typed
export const api = {
  get: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await client.get<ApiResponse<T>>(url, config);
    if (!response.data.success) {
      throw new Error(response.data.error || '请求失败');
    }
    return response.data.data as T;
  },
  // ...
};
```

### API Module Request/Response Types

```typescript
// src/lib/api/agents.ts
export interface CreateAgentRequest {
  name: string;
  agent_type: AgentType;
  description?: string;
  expertise?: string[];
  swarmSessionId?: string;
}

export interface CreateAgentResponse {
  agent: Agent;
  message: string;
}

export interface GetAgentsResponse {
  agents: Agent[];
  total: number;
}

export const agentsApi = {
  createAgent: async (data: CreateAgentRequest): Promise<CreateAgentResponse> => {
    return api.post<CreateAgentResponse>('/agents', data);
  },
  // ...
};
```

---

## Component Prop Types

### Typed Props Interface

```typescript
// Good - explicit interface
interface ButtonProps {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

// Props with HTML element types
interface ChatInputProps extends React.ComponentProps<'textarea'> {
  sessionId: string | null;
  onSend?: (content: string, attachments?: File[]) => Promise<void> | void;
}
```

### Variant Props with CVA

```typescript
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva('...', {
  variants: {
    variant: {
      default: '...',
      destructive: '...',
    },
    size: {
      default: '...',
      sm: '...',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };
```

---

## Type Guards and Narrowing

### Runtime Type Checking

```typescript
// Type guard for API response
function isAgent(obj: unknown): obj is Agent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj &&
    'type' in obj
  );
}

// Usage
const data = await agentsApi.getAgent(id);
if (isAgent(data)) {
  // TypeScript knows data is Agent here
}
```

### Discriminated Unions

```typescript
// For state that can be one of several shapes
type FetchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

// Usage
function renderState<T>(state: FetchState<T>) {
  switch (state.status) {
    case 'idle':
      return <Empty />;
    case 'loading':
      return <Spinner />;
    case 'success':
      return <Data data={state.data} />; // data is T here
    case 'error':
      return <Error message={state.error} />;
  }
}
```

---

## Forbidden Patterns

### 1. Using `any`

```typescript
// Bad
function processData(data: any) {
  return data.id; // No type safety!
}

// Good
function processData(data: Agent) {
  return data.id; // Fully typed
}
```

### 2. Type Assertions Without Verification

```typescript
// Bad - assumes correct shape
const agent = response.data as Agent;

// Good - type guard or narrow first
const agent = response.data;
if (!isAgent(agent)) throw new Error('Invalid agent data');
```

### 3. Missing Null Checks

```typescript
// Bad - assumes user exists
const name = authState.user.displayName; // Could crash if user is null

// Good - optional chaining
const name = authState.user?.displayName ?? 'Anonymous';
```

### 4. Function Return Types Too Broad

```typescript
// Bad - returns any
function getConfig(): any {
  return JSON.parse(configString);
}

// Good - explicit return type
function getConfig(): Record<string, unknown> {
  return JSON.parse(configString);
}
```

---

## Common Patterns

### Omit/Fick Utility Types

```typescript
// Create type without some fields
type CreateAgentInput = Omit<Agent, 'id' | 'createdAt' | 'lastActiveAt'>;

// Partial type for updates
type UpdateAgentInput = Partial<Pick<Agent, 'name' | 'description'>>;
```

### Generic Constraints

```typescript
// Generic function with constraint
function getById<T extends { id: string }>(
  items: T[],
  id: string
): T | undefined {
  return items.find((item) => item.id === id);
}

// Usage
const agent = getById(agents, '123'); // Returns Agent | undefined
```

### Template Literal Types

```typescript
// For event names
type AgentEvent = `agent:${AgentStatus}` | `agent:${AgentAction}`;
```

---

## File Naming for Types

| Pattern | Example | Use Case |
|---------|---------|----------|
| Singular noun | `agent.ts`, `user.ts` | Single concept types |
| Feature group | `websocket.ts`, `auth.ts` | Related types for a feature |
| Index barrel | `index.ts` | Re-exports |
