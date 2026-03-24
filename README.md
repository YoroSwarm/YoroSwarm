# Swarm

Multi-Agent Collaboration Platform — A Team Lead interface for orchestrating multiple AI agents to accomplish complex tasks together.

## Overview

Swarm is a real-time multi-agent collaboration platform where you act as a **Team Lead** directing a team of AI agents. Unlike single-agent AI assistants, Swarm enables complex workflows where specialized agents (Researchers, Writers, Analysts, Engineers) work together under your guidance.

### Key Concepts

| Role | Description |
|------|-------------|
| **Team Lead (You)** | Human operator who directs, approves, and coordinates the team |
| **Lead Agent** | Your AI assistant that breaks down tasks and assigns work |
| **Worker Agents** | Specialized agents (Researcher, Writer, Analyst, Engineer, etc.) |

### Architecture

```
User (Team Lead)
    │
    ├── Lead Agent (AI Assistant)
    │       │
    │       ├── Researcher Agent
    │       ├── Writer Agent
    │       ├── Analyst Agent
    │       └── Engineer Agent
    │
    └── Real-time WebSocket Communication
```

## Features

### Multi-Agent Task Management
- Create, assign, and track tasks across agent team
- Task dependencies and priority system
- Subtask decomposition for complex goals

### Real-Time Collaboration
- WebSocket-based agent-to-agent messaging
- Internal threads for agent coordination
- Live task status updates

### Skills System
Extensible skill registry for specialized agent capabilities:

| Skill | Purpose |
|-------|---------|
| `xlsx-dev` | Excel spreadsheet operations |
| `pdf-dev` | PDF document processing |
| `docx-dev` | Word document manipulation |
| `pptx-generator` | PowerPoint generation |
| `code-review` | Code review workflows |
| `webapp-building` | Web application development |
| `fullstack-dev` | Full-stack development tasks |

### Tool Approval System
Dangerous operations require explicit approval:
- Shell command execution
- File system writes
- Network requests

### Session Management
- Create and archive collaboration sessions
- Share session snapshots with others
- Token usage tracking per session

### File Handling
- Upload and preview documents (Excel, Word, PDF, PowerPoint)
- File sharing between user and agents
- Thumbnail generation for images

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, Radix UI, Framer Motion |
| Backend | Node.js, WebSocket (ws), Prisma ORM |
| Database | SQLite (libSQL) |
| AI | Anthropic Claude API |

## Getting Started

### Prerequisites

- Node.js 18+
- npm / yarn / pnpm / bun

### Installation

```bash
# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local with your API keys

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

```env
# Database
DATABASE_URL="file:./dev.db"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-this-in-production"

# App Configuration
NEXT_PUBLIC_APP_NAME=Swarm
NEXT_PUBLIC_APP_VERSION=1.0.0
NEXT_PUBLIC_API_URL=/api

# File Upload
UPLOAD_DIR="./uploads"
MAX_UPLOAD_SIZE=104857600

# LLM API keys are configured per-user in the web UI (Settings → API Configuration)
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (dashboard)/        # Main application pages
│   │   ├── chat/          # Chat interface
│   │   ├── agents/        # Agent management
│   │   ├── dashboard/     # Dashboard & analytics
│   │   └── settings/      # User settings
│   ├── api/               # REST API routes
│   ├── login/             # Authentication
│   └── register/          # User registration
├── components/
│   ├── chat/              # Chat UI components
│   ├── session/           # Session management UI
│   ├── monitor/           # Agent monitoring
│   └── ui/                # Shadcn/ui components
├── hooks/                 # React custom hooks
├── lib/                   # Utilities and helpers
├── stores/                # Zustand state stores
└── types/                 # TypeScript type definitions

server.mjs                 # Custom Node.js server (HTTP + WebSocket)
prisma/
└── schema.prisma          # Database schema
skills/
├── _registry/             # Built-in skills
└── users/                 # User-installed skills
```

## Development

```bash
# Start development server
npm run dev

# Lint code
npm run lint

# Database migration
npm run db:migrate

# Build for production
npm run build
```

## Documentation

For detailed development guidelines, see:

- [Frontend Guidelines](./.trellis/spec/frontend/index.md)
- [Backend Guidelines](./.trellis/spec/backend/index.md)
- [Thinking Guides](./.trellis/spec/guides/index.md)

## License

Private project.
