-- CreateTable
CREATE TABLE "session_shares" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarm_session_id" TEXT NOT NULL,
    "share_token" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "snapshot_title" TEXT NOT NULL,
    "snapshot_messages" TEXT NOT NULL,
    "snapshot_activities" TEXT NOT NULL,
    "snapshot_file_ids" TEXT NOT NULL,
    "snapshot_files_path" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_shares_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "session_shares_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "session_shares_share_token_key" ON "session_shares"("share_token");

-- CreateIndex
CREATE INDEX "session_shares_swarm_session_id_idx" ON "session_shares"("swarm_session_id");
