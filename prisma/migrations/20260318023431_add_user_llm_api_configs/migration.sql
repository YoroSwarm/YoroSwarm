-- AlterTable
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
ALTER TABLE "users" ADD COLUMN "display_name" TEXT;
ALTER TABLE "users" ADD COLUMN "lead_agents_md" TEXT;
ALTER TABLE "users" ADD COLUMN "lead_soul_md" TEXT;

-- CreateTable
CREATE TABLE "llm_api_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "base_url" TEXT,
    "default_model" TEXT NOT NULL,
    "max_context_tokens" INTEGER NOT NULL DEFAULT 128000,
    "max_output_tokens" INTEGER NOT NULL DEFAULT 4096,
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "llm_api_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_llm_usage_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT,
    "agent_id" TEXT,
    "user_id" TEXT,
    "llm_api_config_id" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "request_kind" TEXT NOT NULL DEFAULT 'general',
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_creation_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "llm_usage_events_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "llm_usage_events_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "llm_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "llm_usage_events_llm_api_config_id_fkey" FOREIGN KEY ("llm_api_config_id") REFERENCES "llm_api_configs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_llm_usage_events" ("agent_id", "cache_creation_tokens", "cache_read_tokens", "created_at", "id", "input_tokens", "model", "output_tokens", "provider", "request_kind", "swarm_session_id") SELECT "agent_id", "cache_creation_tokens", "cache_read_tokens", "created_at", "id", "input_tokens", "model", "output_tokens", "provider", "request_kind", "swarm_session_id" FROM "llm_usage_events";
DROP TABLE "llm_usage_events";
ALTER TABLE "new_llm_usage_events" RENAME TO "llm_usage_events";
CREATE INDEX "llm_usage_events_swarm_session_id_created_at_idx" ON "llm_usage_events"("swarm_session_id", "created_at");
CREATE INDEX "llm_usage_events_swarm_session_id_agent_id_created_at_idx" ON "llm_usage_events"("swarm_session_id", "agent_id", "created_at");
CREATE INDEX "llm_usage_events_user_id_created_at_idx" ON "llm_usage_events"("user_id", "created_at");
CREATE INDEX "llm_usage_events_llm_api_config_id_created_at_idx" ON "llm_usage_events"("llm_api_config_id", "created_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "llm_api_configs_user_id_priority_idx" ON "llm_api_configs"("user_id", "priority");

-- CreateIndex
CREATE INDEX "llm_api_configs_user_id_is_enabled_idx" ON "llm_api_configs"("user_id", "is_enabled");
