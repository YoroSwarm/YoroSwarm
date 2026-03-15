-- CreateTable
CREATE TABLE "lead_self_todos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT NOT NULL,
    "lead_agent_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "category" TEXT NOT NULL DEFAULT 'other',
    "source_ref" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    CONSTRAINT "lead_self_todos_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lead_self_todos_lead_agent_id_fkey" FOREIGN KEY ("lead_agent_id") REFERENCES "agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "llm_usage_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "request_kind" TEXT NOT NULL DEFAULT 'general',
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_creation_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "llm_usage_events_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "llm_usage_events_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "lead_self_todos_swarm_session_id_lead_agent_id_status_idx" ON "lead_self_todos"("swarm_session_id", "lead_agent_id", "status");
CREATE INDEX "lead_self_todos_swarm_session_id_sort_order_idx" ON "lead_self_todos"("swarm_session_id", "sort_order");
CREATE INDEX "llm_usage_events_swarm_session_id_created_at_idx" ON "llm_usage_events"("swarm_session_id", "created_at");
CREATE INDEX "llm_usage_events_swarm_session_id_agent_id_created_at_idx" ON "llm_usage_events"("swarm_session_id", "agent_id", "created_at");
