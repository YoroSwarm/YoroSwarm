-- CreateTable
CREATE TABLE "user_skills" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "skill_name" TEXT NOT NULL,
    "skill_path" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'custom',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "installed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_skill_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agent_id" TEXT NOT NULL,
    "skill_name" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "swarm_session_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_skill_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_skill_assignments_swarm_session_id_fkey" FOREIGN KEY ("swarm_session_id") REFERENCES "swarm_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "user_skills_user_id_is_enabled_idx" ON "user_skills"("user_id", "is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "user_skills_user_id_skill_name_key" ON "user_skills"("user_id", "skill_name");

-- CreateIndex
CREATE INDEX "agent_skill_assignments_swarm_session_id_agent_id_idx" ON "agent_skill_assignments"("swarm_session_id", "agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_skill_assignments_agent_id_skill_name_key" ON "agent_skill_assignments"("agent_id", "skill_name");
