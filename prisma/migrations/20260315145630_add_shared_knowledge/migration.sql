-- CreateTable
CREATE TABLE "shared_knowledge_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT NOT NULL,
    "task_id" TEXT,
    "agent_id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "tags" TEXT,
    "confidence" REAL NOT NULL DEFAULT 1.0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shared_knowledge_entries_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "shared_knowledge_entries_swarm_session_id_entry_type_idx" ON "shared_knowledge_entries"("swarm_session_id", "entry_type");

-- CreateIndex
CREATE INDEX "shared_knowledge_entries_swarm_session_id_task_id_idx" ON "shared_knowledge_entries"("swarm_session_id", "task_id");
