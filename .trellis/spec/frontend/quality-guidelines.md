# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

This project follows these quality standards:
- TypeScript strict mode
- ESLint for code linting
- Tailwind CSS for styling (no inline styles)
- Functional components only
- Named exports

---

## Forbidden Patterns

### 1. Class Components

```typescript
// Bad - class component
class AgentList extends React.Component<Props, State> {
  render() {
    return <div>{this.props.agents}</div>;
  }
}

// Good - functional component
function AgentList({ agents }: Props) {
  return <div>{agents}</div>;
}
```

### 2. Inline Styles

```typescript
// Bad - inline styles
<div style={{ display: 'flex', padding: '16px' }}>

// Good - Tailwind classes
<div className="flex p-4">
```

### 3. Default Exports

```typescript
// Bad - default export
export default function ChatInput() { ... }

// Good - named export
export function ChatInput() { ... }
```

Exception: `page.tsx` files in Next.js App Router can use default exports.

### 4. `any` Type

```typescript
// Bad
function process(data: any) { ... }

// Good
function process(data: Agent) { ... }
```

### 5. Non-Type Imports for Types

```typescript
// Bad
import { Agent } from '@/types/agent';

// Good
import type { Agent } from '@/types/agent';
```

### 6. Direct State Mutation

```typescript
// Bad
const addItem = (item) => {
  items.push(item);
  setItems(items);
};

// Good
const addItem = (item) => {
  setItems((prev) => [...prev, item]);
};
```

### 7. Missing Error Boundaries

```typescript
// Bad - unhandled promise rejection
useEffect(() => {
  fetchData().then(setData);
}, []);

// Good - error handling
useEffect(() => {
  fetchData()
    .then(setData)
    .catch((err) => setError(err.message));
}, []);
```

### 8. Prop Drilling

```typescript
// Bad - passing through many levels
<App>
  <Layout user={user}>
    <Dashboard user={user}>
      <Panel user={user}>
        <Button user={user}> // Finally uses user
      </Panel>
    </Dashboard>
  </Layout>
</App>

// Good - Zustand store
const { user } = useAuthStore();
```

---

## Required Patterns

### 1. `'use client'` Directive

All client-side components must have the directive:

```typescript
'use client';

import { useState } from 'react';
// ...
```

### 2. Type Imports

Use `import type` for type-only imports:

```typescript
import type { Agent, AgentActivity } from '@/types/agent';
import type { User } from '@/types/index';
```

### 3. Error Handling

All async operations must have error handling:

```typescript
const loadAgents = useCallback(async () => {
  setIsLoading(true);
  setError(null);
  try {
    const response = await agentsApi.getAgents();
    setAgents(response.agents);
  } catch (err) {
    setError(err instanceof Error ? err.message : '加载失败');
    throw err; // Re-throw if caller needs to handle
  } finally {
    setIsLoading(false);
  }
}, []);
```

### 4. Loading States

All async operations should set loading states:

```typescript
const [isLoading, setIsLoading] = useState(false);

// Before async operation
setIsLoading(true);
// ... async work
// ... in finally
setIsLoading(false);
```

### 5. Optional Chaining and Nullish Coalescing

```typescript
// Good
const displayName = user?.displayName ?? 'Anonymous';
const city = address?.city ?? 'Unknown';

// Bad
const displayName = user.displayName ? user.displayName : 'Anonymous';
```

### 6. Stable References for Callbacks

Use `useCallback` for callbacks passed to child components:

```typescript
// Bad - new reference each render
<ChildComponent onClick={() => handleClick(id)} />

// Good - stable reference
const memoizedHandleClick = useCallback(() => {
  handleClick(id);
}, [id]);
<ChildComponent onClick={memoizedHandleClick} />
```

### 7. Proper Cleanup in useEffect

```typescript
// Good - cleanup
useEffect(() => {
  const subscription = subscribe(handleMessage);
  return () => subscription.unsubscribe();
}, []);

// Good - abort controller for fetch
useEffect(() => {
  const controller = new AbortController();
  fetch(url, { signal: controller.signal })
    .then(...)
    .catch(...);

  return () => controller.abort();
}, []);
```

---

## Testing Requirements

### Manual Testing Checklist

Before marking a feature complete, verify:

- [ ] Component renders without errors
- [ ] Loading states display correctly
- [ ] Error states display correctly
- [ ] Empty states display correctly
- [ ] User interactions work (clicks, inputs)
- [ ] Keyboard navigation works (if applicable)
- [ ] Responsive layout works on target breakpoints
- [ ] Dark mode works (if applicable)
- [ ] No console errors

### Lint Check

Run before committing:

```bash
npm run lint
```

---

## Code Review Checklist

### Component Quality

- [ ] Props are typed with explicit interface
- [ ] Default values provided in destructuring
- [ ] Loading and error states handled
- [ ] No inline styles
- [ ] Accessibility attributes present (aria-*, titles)
- [ ] Keyboard navigation works for interactive elements

### Hook Quality

- [ ] All async operations have try/catch/finally
- [ ] Loading states are set properly
- [ ] useCallback used for callbacks
- [ ] useEffect dependencies are correct
- [ ] Cleanup is performed (subscriptions, timers)

### Store Quality

- [ ] State is immutable (no direct mutation)
- [ ] Persist middleware has partialize defined
- [ ] SSR-safe storage implementation
- [ ] Actions handle errors and reset loading states

### Type Quality

- [ ] No `any` types
- [ ] `import type` used for type-only imports
- [ ] Optional properties marked with `?`
- [ ] Union types used for related constants
- [ ] Generic constraints defined where needed

---

## Accessibility Standards

### Required Attributes

| Element | Required |
|---------|----------|
| Images | `alt` text |
| Form inputs | `label` or `aria-label` |
| Buttons | `title` or aria text |
| Interactive divs | `role` and keyboard handlers |
| Modals | Focus trap, Escape to close |

### Keyboard Navigation

All interactive elements must be keyboard accessible:

```typescript
// Good - keyboard handler
<button
  onKeyDown={(e) => {
    if (e.key === 'Enter') handleClick();
    if (e.key === ' ') handleClick();
  }}
>
```

### Focus Management

```typescript
// Focus on mount
useEffect(() => {
  inputRef.current?.focus();
}, []);

// Focus after async action
const handleSubmit = async () => {
  await submit();
  inputRef.current?.focus();
};
```

---

## Performance Considerations

### Avoid Unnecessary Re-renders

```typescript
// Good - stable callback reference
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);

// Good - memoized component
const MemoizedList = memo(ListComponent);

// Good - useMemo for expensive calculations
const sortedItems = useMemo(() =>
  items.sort((a, b) => a.name.localeCompare(b.name)),
  [items]
);
```

### Lazy Loading

```typescript
// Good - dynamic import for heavy components
const HeavyChart = dynamic(() => import('@/components/HeavyChart'), {
  loading: () => <Skeleton />,
  ssr: false,
});
```

### Image Optimization

```typescript
// Next.js Image component
import Image from 'next/image';

<Image
  src="/avatar.png"
  alt="User avatar"
  width={40}
  height={40}
  className="rounded-full"
/>
```
