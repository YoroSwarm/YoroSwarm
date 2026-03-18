-- CreateTable
CREATE TABLE "tool_approvals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tool_name" TEXT NOT NULL,
    "input_params" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "working_dir" TEXT,
    "result" TEXT,
    "error" TEXT,
    "executed_at" DATETIME,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tool_approvals_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "tool_approvals_swarm_session_id_status_idx" ON "tool_approvals"("swarm_session_id", "status");

-- CreateIndex
CREATE INDEX "tool_approvals_swarm_session_id_created_at_idx" ON "tool_approvals"("swarm_session_id", "created_at");

-- CreateIndex
CREATE INDEX "tool_approvals_status_expires_at_idx" ON "tool_approvals"("status", "expires_at");
