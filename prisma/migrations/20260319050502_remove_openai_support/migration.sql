/*
  Warnings:

  - You are about to drop the column `openai_api_mode` on the `llm_api_configs` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_llm_api_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "default_model" TEXT NOT NULL,
    "max_context_tokens" INTEGER NOT NULL DEFAULT 128000,
    "max_output_tokens" INTEGER NOT NULL DEFAULT 4096,
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "auth_mode" TEXT NOT NULL DEFAULT 'BEARER_TOKEN',
    "custom_headers" TEXT,
    "lead_priority" INTEGER NOT NULL DEFAULT 999,
    "teammate_priority" INTEGER NOT NULL DEFAULT 999,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "llm_api_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_llm_api_configs" ("api_key", "auth_mode", "base_url", "created_at", "custom_headers", "default_model", "id", "is_enabled", "last_used_at", "lead_priority", "max_context_tokens", "max_output_tokens", "name", "provider", "teammate_priority", "temperature", "updated_at", "user_id") SELECT "api_key", "auth_mode", "base_url", "created_at", "custom_headers", "default_model", "id", "is_enabled", "last_used_at", "lead_priority", "max_context_tokens", "max_output_tokens", "name", "provider", "teammate_priority", "temperature", "updated_at", "user_id" FROM "llm_api_configs";
DROP TABLE "llm_api_configs";
ALTER TABLE "new_llm_api_configs" RENAME TO "llm_api_configs";
CREATE INDEX "llm_api_configs_user_id_lead_priority_idx" ON "llm_api_configs"("user_id", "lead_priority");
CREATE INDEX "llm_api_configs_user_id_teammate_priority_idx" ON "llm_api_configs"("user_id", "teammate_priority");
CREATE INDEX "llm_api_configs_user_id_is_enabled_idx" ON "llm_api_configs"("user_id", "is_enabled");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
