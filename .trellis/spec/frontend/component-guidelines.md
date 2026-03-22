# Component Guidelines

> How components are built in this project.

---

## Overview

Components in this project follow a consistent pattern:
- Function component declarations (not arrow functions)
- TypeScript with typed props
- Tailwind CSS for styling
- CVA (class-variance-authority) for variant management
- `'use client'` directive for client-side components
- Named exports

---

## Component Structure

### Standard Component Pattern

```typescript
// src/components/chat/ChatInput.tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { MentionSuggestion } from '@/types/chat';

interface ChatInputProps {
  sessionId: string | null;
  disabled?: boolean;
  placeholder?: string;
  onSend?: (content: string, attachments?: File[]) => Promise<void> | void;
}

export function ChatInput({
  sessionId,
  disabled = false,
  placeholder = '输入消息...',
  onSend,
}: ChatInputProps) {
  // State
  const [content, setContent] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Refs for DOM access
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Callbacks for async/expensive operations
  const handleSend = useCallback(async () => {
    if (!content.trim() || disabled) return;
    await onSend?.(content.trim());
    setContent('');
  }, [content, disabled, onSend]);

  // ... rest of component
}
```

### Key Conventions

| Convention | Example | Why |
|------------|---------|-----|
| `'use client'` at top | `'use client';` | Next.js App Router client component |
| Function declaration | `function Button({ ... })` | Better hoisting, clearer than arrow |
| Named export | `export function Button(...)` | Consistent with barrel exports |
| Typed props interface | `interface ButtonProps { ... }` | Clear contract, IDE support |
| Default values in destructuring | `disabled = false` | Inline defaults |
| `cn()` for classes | `cn('text-primary', className)` | Merges Tailwind classes |

---

## Props Conventions

### Typed Props with TypeScript

```typescript
// Good - explicit interface
interface ButtonProps {
  variant?: 'default' | 'destructive' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
  className?: string;
  disabled?: boolean;
}

// Props type derived from HTML element + additional
interface ChatInputProps extends React.ComponentProps<'textarea'> {
  sessionId: string | null;
  onSend?: (content: string) => Promise<void>;
}
```

### Variant Props with CVA

```typescript
// src/components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'group/button inline-flex items-center justify-center rounded-lg font-medium transition-all',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-border hover:bg-secondary',
        ghost: 'hover:bg-secondary',
        link: 'underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
```

### Compound Components (Card Pattern)

```typescript
// src/components/ui/card.tsx
function Card({ className, size = 'default', ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card" data-size={size} className={cn('...', className)} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('...', className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <h3 data-slot="card-title" className={cn('...', className)} {...props} />;
}

// Export grouped
export { Card, CardHeader, CardTitle, CardContent, CardFooter };
```

---

## Styling Patterns

### Tailwind CSS Only

All styling uses Tailwind CSS classes. No inline styles except rare exceptions.

```typescript
// Good
<div className="flex items-center gap-2 p-4 rounded-lg bg-primary/10">

// Acceptable for dynamic values
<textarea style={{ minHeight: '24px' }} />

// Bad
<div style={{ display: 'flex', padding: '16px' }}>
```

### Data Attributes for Styling Targeting

```typescript
// Use data-slot for styling targeting
<div data-slot="button" data-variant="default" data-size="default">

// Group selectors
<button className="group/button">
  <span className="group-hover/button:opacity-80">
```

### Glass/Backdrop Effects

```typescript
// Using store state for conditional styling
const { glassEffect } = useLeadPreferencesStore();

// ...
<div className={cn(
  'rounded-2xl border bg-background shadow-sm',
  glassEffect && 'backdrop-blur'
)}>
```

---

## Accessibility

### Basic A11y Requirements

```typescript
// Form inputs need labels
<input aria-label="上传文件" />

// Buttons need titles
<button title="发送">Send</button>

// Disabled states
<input disabled className="disabled:opacity-50 disabled:cursor-not-allowed" />

// Focus visible
<button className="focus-visible:ring-2 focus-visible:ring-primary">
```

### Keyboard Navigation

```typescript
// Arrow keys for selection lists
const handleKeyDown = (e: React.KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
      return;
    case 'Enter':
      e.preventDefault();
      selectItem(items[selectedIndex]);
      return;
    case 'Escape':
      setIsOpen(false);
      return;
  }
};
```

---

## Common Mistakes

### 1. Missing `asChild` for Composition

```typescript
// Bad - duplicates DOM
<Button>
  <Link to="/dashboard">Go to Dashboard</Link>
</Button>

// Good - Slot pattern
function Button({ asChild = false, children, ...props }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp {...props}>{children}</Comp>;
}
// Usage
<Button asChild>
  <Link to="/dashboard">Go to Dashboard</Link>
</Button>
```

### 2. Not Resetting State on Clear Actions

```typescript
// Bad
const handleSend = async () => {
  await onSend(content);
  // Forgot to clear
};

// Good
const handleSend = async () => {
  await onSend(content);
  setContent('');
  if (textareaRef.current) {
    textareaRef.current.style.height = 'auto';
  }
};
```

### 3. Missing Ref Cleanup

```typescript
// Bad - potential memory leak
useEffect(() => {
  const timer = setInterval(doSomething, 1000);
  // No cleanup
}, []);

// Good
useEffect(() => {
  const timer = setInterval(doSomething, 1000);
  return () => clearInterval(timer);
}, []);
```

### 4. Not Using `useCallback` for Event Handlers Passed to Children

```typescript
// Bad - new reference each render
<ChildComponent onClick={() => handleClick(id)} />

// Good - stable reference
const memoizedHandleClick = useCallback(() => {
  handleClick(id);
}, [id]);

<ChildComponent onClick={memoizedHandleClick} />
```

---

## File Organization

Each component module should have:

```
components/chat/
├── ChatInput.tsx      # Main component
├── ChatInput.stories.tsx  # (future) Storybook stories
└── index.ts           # Barrel export
```
