# Directory Structure

> How frontend code is organized in this project.

---

## Overview

This is a **Next.js 16 App Router** project with React 19. The frontend follows a **feature-based** directory organization within a standard Next.js structure.

---

## Directory Layout

```
src/
├── app/                        # Next.js App Router
│   ├── (dashboard)/            # Dashboard routes (with layout)
│   │   ├── chat/page.tsx
│   │   ├── agents/page.tsx
│   │   └── dashboard/page.tsx
│   ├── api/                    # API routes
│   │   ├── auth/
│   │   ├── agents/
│   │   ├── messages/
│   │   ├── tasks/
│   │   └── teams/
│   ├── layout.tsx
│   └── page.tsx
│
├── components/                 # React components
│   ├── ui/                     # shadcn/ui base components (Button, Input, Dialog...)
│   ├── chat/                   # Chat feature (ChatInput, MessageList, MessageItem...)
│   ├── layout/                 # Layout components (MainLayout, Sidebar, Header...)
│   ├── monitor/                # Monitoring/agent status components
│   ├── providers/              # Context providers (StoreProvider)
│   ├── session/                # Session management components
│   ├── settings/               # Settings panels
│   ├── tool-approval/          # Tool approval UI
│   └── websocket/              # WebSocket components
│
├── hooks/                      # Custom React hooks
│   ├── use-agents.ts
│   ├── use-tasks.ts
│   ├── use-api-agents.ts
│   └── index.ts                # Barrel export
│
├── stores/                     # Zustand stores
│   ├── authStore.ts
│   ├── sessionsStore.ts
│   ├── themeStore.ts
│   ├── uiStore.ts
│   └── index.ts                # Barrel export
│
├── lib/                        # Core library code
│   ├── api/                    # API clients (client.ts, agents.ts, tasks.ts...)
│   ├── auth/                   # Auth utilities (jwt.ts, session.ts)
│   ├── text/                   # Text processing (sanitize.ts)
│   ├── utils.ts                # cn() utility
│   └── utils/                  # Utils subdirectory (date.ts, storage.ts)
│
├── types/                      # TypeScript type definitions
│   ├── agent.ts
│   ├── auth.ts
│   ├── chat.ts
│   ├── websocket.ts
│   └── index.ts                # Barrel export
│
├── contexts/                   # React contexts (rarely used)
├── instrumentation.ts          # Next.js instrumentation
└── utils/                      # Legacy utils (storage.ts)
```

---

## Module Organization

### Feature-Based Organization

Components are organized by **feature/area**, not by component type:

```
components/
├── chat/           # All chat-related components together
│   ├── ChatInput.tsx
│   ├── MessageList.tsx
│   ├── MessageItem.tsx
│   └── index.ts
├── layout/         # Layout components
│   ├── MainLayout.tsx
│   ├── Sidebar.tsx
│   └── index.ts
```

**Why**: Makes it easier to find all related files when working on a feature.

### UI Components (components/ui/)

Base components from shadcn/ui live in `components/ui/`. These are:
- Generic, reusable across features
- Styled with Tailwind + CVA variants
- Examples: `Button`, `Input`, `Dialog`, `Badge`, `Card`, `Select`

---

## Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Component files | PascalCase | `ChatInput.tsx`, `MainLayout.tsx` |
| Hook files | camelCase with `use` prefix | `use-agents.ts`, `use-tasks.ts` |
| Store files | camelCase | `authStore.ts`, `sessionsStore.ts` |
| Type files | camelCase or kebab-case | `agent.ts`, `websocket.ts` |
| API files | camelCase | `client.ts`, `agents.ts` |
| Utility files | camelCase | `date.ts`, `storage.ts` |
| Index files | `index.ts` | `components/chat/index.ts` |

---

## Barrel Exports (index.ts)

Each module directory should have an `index.ts` for clean imports:

```typescript
// hooks/index.ts
export { useAgents } from './use-agents';
export { useTasks } from './use-tasks';
export { useTeamStats } from './use-team-stats';

// components/chat/index.ts
export { ChatInput } from './ChatInput';
export { MessageList } from './MessageList';
```

**Import style**:
```typescript
// Good - barrel import
import { useAgents } from '@/hooks';

// Bad - deep import
import { useAgents } from '@/hooks/use-agents';
```

---

## Examples

### Well-Organized Module

`src/components/chat/`:
- `ChatInput.tsx` - Main chat input with mentions, file attachments
- `MessageList.tsx` - Scrollable message list
- `MessageItem.tsx` - Individual message rendering
- `ThinkingIndicator.tsx` - AI thinking animation
- `index.ts` - Barrel exports

### API Module Structure

`src/lib/api/`:
- `client.ts` - Axios instance with interceptors, generic `api.get/post/put/delete/patch`
- `agents.ts` - `agentsApi` object with agent-specific methods
- `tasks.ts` - `tasksApi` object with task-specific methods
- `index.ts` - Barrel exports

---

## Common Mistakes

1. **Deep imports** - Use barrel exports instead of importing from deep paths
2. **Mixing features in components/ui** - Keep base UI components in `ui/`, feature components in their own folders
3. **Forgetting index.ts** - Each module directory should have a barrel export
