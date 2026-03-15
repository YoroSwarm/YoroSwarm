-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashed_password" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_superuser" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "last_login" DATETIME
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "swarm_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "mode" TEXT NOT NULL DEFAULT 'general_office',
    "lead_agent_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "archived_at" DATETIME,
    CONSTRAINT "swarm_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "swarm_sessions_lead_agent_id_fkey" FOREIGN KEY ("lead_agent_id") REFERENCES "agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "swarm_session_id" TEXT NOT NULL,
    "user_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,
    CONSTRAINT "files_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "files_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "file_thumbnails" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_id" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    CONSTRAINT "file_thumbnails_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'WORKER',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "capabilities" TEXT,
    "config" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "agents_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_context_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "entry_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "sequence" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_context_entries_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_context_entries_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "team_lead_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "assignee_id" TEXT,
    "creator_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "result_summary" TEXT,
    "error_summary" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "due_date" DATETIME,
    CONSTRAINT "team_lead_tasks_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "team_lead_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "team_lead_tasks_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "team_lead_tasks_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "team_lead_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "depends_on_task_id" TEXT NOT NULL,
    "dependency_type" TEXT NOT NULL DEFAULT 'blocks',
    CONSTRAINT "task_dependencies_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "team_lead_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_dependencies_depends_on_task_id_fkey" FOREIGN KEY ("depends_on_task_id") REFERENCES "team_lead_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "internal_threads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT NOT NULL,
    "thread_type" TEXT NOT NULL,
    "subject" TEXT,
    "related_task_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "internal_threads_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "internal_threads_related_task_id_fkey" FOREIGN KEY ("related_task_id") REFERENCES "team_lead_tasks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "internal_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender_agent_id" TEXT NOT NULL,
    "recipient_agent_id" TEXT,
    "message_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" DATETIME,
    CONSTRAINT "internal_messages_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "internal_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "internal_threads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "internal_messages_sender_agent_id_fkey" FOREIGN KEY ("sender_agent_id") REFERENCES "agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "internal_messages_recipient_agent_id_fkey" FOREIGN KEY ("recipient_agent_id") REFERENCES "agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "external_conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "lead_agent_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "external_conversations_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "external_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "external_conversations_lead_agent_id_fkey" FOREIGN KEY ("lead_agent_id") REFERENCES "agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "external_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversation_id" TEXT NOT NULL,
    "swarm_session_id" TEXT NOT NULL,
    "sender_type" TEXT NOT NULL,
    "sender_id" TEXT,
    "content" TEXT NOT NULL,
    "message_type" TEXT NOT NULL DEFAULT 'text',
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "external_conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "external_messages_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shared_tasks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "assignee_id" TEXT,
    "creator_id" TEXT NOT NULL,
    "parent_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "due_date" DATETIME,
    CONSTRAINT "shared_tasks_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "shared_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_key" ON "sessions"("refresh_token");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_id_key" ON "sessions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "swarm_sessions_lead_agent_id_key" ON "swarm_sessions"("lead_agent_id");

-- CreateIndex
CREATE INDEX "agents_swarm_session_id_idx" ON "agents"("swarm_session_id");

-- CreateIndex
CREATE INDEX "agent_context_entries_swarm_session_id_agent_id_created_at_idx" ON "agent_context_entries"("swarm_session_id", "agent_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_context_entries_agent_id_sequence_key" ON "agent_context_entries"("agent_id", "sequence");

-- CreateIndex
CREATE INDEX "team_lead_tasks_swarm_session_id_status_idx" ON "team_lead_tasks"("swarm_session_id", "status");

-- CreateIndex
CREATE INDEX "task_dependencies_swarm_session_id_task_id_idx" ON "task_dependencies"("swarm_session_id", "task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_task_id_depends_on_task_id_key" ON "task_dependencies"("task_id", "depends_on_task_id");

-- CreateIndex
CREATE INDEX "internal_threads_swarm_session_id_created_at_idx" ON "internal_threads"("swarm_session_id", "created_at");

-- CreateIndex
CREATE INDEX "internal_messages_swarm_session_id_thread_id_created_at_idx" ON "internal_messages"("swarm_session_id", "thread_id", "created_at");

-- CreateIndex
CREATE INDEX "external_conversations_swarm_session_id_user_id_idx" ON "external_conversations"("swarm_session_id", "user_id");

-- CreateIndex
CREATE INDEX "external_messages_swarm_session_id_conversation_id_created_at_idx" ON "external_messages"("swarm_session_id", "conversation_id", "created_at");
