"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Download,
  Trash2,
  ChevronRight,
  FileCode,
  Package,
} from "lucide-react";

interface SkillSummary {
  name: string;
  description: string;
  source: "registry" | "custom";
  hasScripts: boolean;
  isEnabled: boolean;
}

interface SkillDetail {
  name: string;
  description: string;
  license?: string;
  allowedTools?: string[];
  compatibility?: string | string[];
  metadata?: Record<string, unknown>;
  instructions: string;
  hasScripts: boolean;
  scriptFiles: string[];
}

export function SkillsManager() {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillDetail, setSkillDetail] = useState<SkillDetail | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedInstructions, setExpandedInstructions] = useState<Set<string>>(new Set());

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      const data = await res.json();
      if (data.success) {
        setSkills(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch skills:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleInstall = async (skillName: string) => {
    setActionLoading(skillName);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "install-from-registry",
          skillName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchSkills();
      }
    } catch (err) {
      console.error("Failed to install skill:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggle = async (skillName: string, enabled: boolean) => {
    setActionLoading(skillName);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle",
          skillName,
          enabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSkills((prev) =>
          prev.map((s) => (s.name === skillName ? { ...s, isEnabled: enabled } : s))
        );
      }
    } catch (err) {
      console.error("Failed to toggle skill:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstall = async (skillName: string) => {
    setActionLoading(skillName);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "uninstall",
          skillName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchSkills();
      }
    } catch (err) {
      console.error("Failed to uninstall skill:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExpand = async (skillName: string) => {
    if (expandedSkill === skillName) {
      setExpandedSkill(null);
      setSkillDetail(null);
      setExpandedInstructions(new Set());
      return;
    }

    setExpandedSkill(skillName);
    setExpandedInstructions(new Set());
    try {
      const res = await fetch(`/api/skills/${skillName}`);
      const data = await res.json();
      if (data.success) {
        setSkillDetail(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch skill detail:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        加载中...
      </div>
    );
  }

  const registrySkills = skills.filter((s) => s.source === "registry");
  const installedSkills = skills.filter((s) => s.isEnabled || s.source === "custom");
  const uninstalledRegistry = registrySkills.filter((s) => !s.isEnabled);

  return (
    <div className="space-y-6 overflow-hidden">
      {/* 已安装/启用的 Skills */}
      <div className="min-w-0">
        <h3 className="text-sm font-medium mb-3">已启用的 Skills</h3>
        {installedSkills.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            暂无已启用的 Skills。从下方的预置库中安装。
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {installedSkills.map((skill) => (
                <motion.div
                  key={skill.name}
                  layout
                  initial={{ opacity: 0, scale: 0.95, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, x: -30 }}
                  transition={{
                    layout: { type: 'spring', stiffness: 500, damping: 35 },
                    opacity: { duration: 0.2 },
                    scale: { duration: 0.2 },
                  }}
                  className="border rounded-lg overflow-hidden"
                >
                <div className="flex items-center justify-between p-3 gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                    <button
                      onClick={() => handleExpand(skill.name)}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <ChevronRight
                        className={`h-4 w-4 transition-transform duration-300 ease-in-out ${
                          expandedSkill === skill.name ? 'rotate-90' : ''
                        }`}
                      />
                    </button>
                    <Package className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0 overflow-hidden">
                      <p className="font-medium text-sm truncate">{skill.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {skill.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {skill.source === "registry" ? "预置" : "自定义"}
                    </span>
                    <Switch
                      checked={skill.isEnabled}
                      onCheckedChange={(checked) => handleToggle(skill.name, checked)}
                      disabled={actionLoading === skill.name}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleUninstall(skill.name)}
                      disabled={actionLoading === skill.name}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* 展开详情 */}
                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    expandedSkill === skill.name && skillDetail
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="border-t px-3 py-3 bg-muted/30">
                      {skillDetail?.license && (
                        <p className="text-xs text-muted-foreground mb-2">
                          许可证: {skillDetail.license}
                        </p>
                      )}
                      {skillDetail?.scriptFiles && skillDetail.scriptFiles.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-medium mb-1">脚本文件:</p>
                          {skillDetail.scriptFiles.map((f) => (
                            <div
                              key={f}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground overflow-hidden"
                            >
                              <FileCode className="h-3 w-3 shrink-0" />
                              <span className="truncate">{f}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {skillDetail && (
                        <div className="mt-2">
                          <button
                            onClick={() => {
                              const newSet = new Set(expandedInstructions);
                              if (newSet.has(skill.name)) {
                                newSet.delete(skill.name);
                              } else {
                                newSet.add(skill.name);
                              }
                              setExpandedInstructions(newSet);
                            }}
                            className="flex items-center gap-1 text-xs font-medium cursor-pointer hover:text-primary transition-colors"
                          >
                            <ChevronRight
                              className={`h-3 w-3 transition-transform duration-200 ${
                                expandedInstructions.has(skill.name) ? 'rotate-90' : ''
                              }`}
                            />
                            完整指令
                          </button>
                          <div
                            className={`grid transition-all duration-200 ease-in-out ${
                              expandedInstructions.has(skill.name)
                                ? 'grid-rows-[1fr] mt-2'
                                : 'grid-rows-[0fr]'
                            }`}
                          >
                            <div className="overflow-hidden">
                              <pre className="text-xs whitespace-pre-wrap wrap-break-word bg-muted p-2 rounded max-h-60 overflow-y-auto overflow-x-hidden">
                                {skillDetail.instructions}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 预置库 */}
      {uninstalledRegistry.length > 0 && (
        <>
          <Separator />
          <div className="min-w-0">
            <h3 className="text-sm font-medium mb-3">预置 Skills 库</h3>
            <div className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {uninstalledRegistry.map((skill) => (
                  <motion.div
                    key={skill.name}
                    layout
                    initial={{ opacity: 0, scale: 0.95, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, x: -30 }}
                    transition={{
                      layout: { type: 'spring', stiffness: 500, damping: 35 },
                      opacity: { duration: 0.2 },
                      scale: { duration: 0.2 },
                    }}
                    className="flex items-center justify-between border rounded-lg p-3 gap-2"
                  >
                  <div className="flex items-center gap-3 min-w-0 overflow-hidden">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 overflow-hidden">
                      <p className="font-medium text-sm truncate">{skill.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {skill.description}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleInstall(skill.name)}
                    disabled={actionLoading === skill.name}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    {actionLoading === skill.name ? "安装中..." : "安装"}
                  </Button>
                </motion.div>
              ))}
              </AnimatePresence>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
