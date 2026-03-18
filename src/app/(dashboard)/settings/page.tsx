"use client";

import { useState, useEffect } from "react";
import { useThemeStore, useLeadPreferencesStore } from "@/stores";
import {
  Bell,
  Palette,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
  Users,
  Key,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LlmApiConfigList } from "@/components/settings/LlmApiConfigList";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

export default function SettingsPage() {
  const { theme, setTheme } = useThemeStore();
  const {
    isCustomized,
    lastUpdated,
    isLoading,
    loadPreferences,
    savePreferences,
    setAgentsMd,
    setSoulMd,
    resetToDefaults,
    getDisplayAgentsMd,
    getDisplaySoulMd,
  } = useLeadPreferencesStore();
  const [activeTab, setActiveTab] = useState("appearance");

  // 确认对话框
  const { confirm, Dialog: ConfirmDialogComponent } = useConfirmDialog();

  // 加载配置
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleSave = async () => {
    try {
      await savePreferences();
    } catch (error) {
      console.error("Failed to save preferences:", error);
    }
  };

  const handleResetToDefaults = async () => {
    const confirmed = await confirm({
      title: "恢复默认配置",
      description: "确定要恢复默认配置吗？所有自定义内容将丢失。",
      confirmLabel: "确认恢复",
      cancelLabel: "取消",
      variant: "destructive",
    });
    if (confirmed) {
      resetToDefaults();
      await savePreferences();
    }
  };

  const tabs = [
    { id: "appearance", label: "外观", icon: Palette },
    { id: "notifications", label: "通知", icon: Bell },
    { id: "llm-api", label: "LLM API", icon: Key },
    { id: "lead-config", label: "Lead 配置", icon: Users },
  ];

  return (
    <>
      <ConfirmDialogComponent />
      <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">设置</h1>
        <p className="text-muted-foreground mt-1">管理您的系统偏好</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 shrink-0">
          <div className="rounded-xl border bg-card p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent/30"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="flex-1 text-left">{tab.label}</span>
                <ChevronRight className="h-4 w-4 opacity-50" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1">
          {activeTab === "appearance" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">主题设置</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">主题模式</p>
                    <p className="text-sm text-muted-foreground">
                      选择您喜欢的界面主题
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTheme("light")}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        theme === "light"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent/30"
                      }`}
                    >
                      <Sun className="h-4 w-4" />
                      浅色
                    </button>
                    <button
                      onClick={() => setTheme("dark")}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        theme === "dark"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent/30"
                      }`}
                    >
                      <Moon className="h-4 w-4" />
                      深色
                    </button>
                    <button
                      onClick={() => setTheme("system")}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        theme === "system"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent/30"
                      }`}
                    >
                      <Monitor className="h-4 w-4" />
                      系统
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "notifications" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">通知设置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "任务完成通知", desc: "当任务完成时接收通知" },
                  { label: "Agent 消息", desc: "当 Agent 发送消息时通知" },
                  { label: "系统公告", desc: "接收系统更新和公告" },
                  { label: "邮件通知", desc: "通过邮件接收重要通知" },
                ].map((item, index, arr) => (
                  <div key={index}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{item.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.desc}
                        </p>
                      </div>
                      <Switch defaultChecked={index < 2} />
                    </div>
                    {index < arr.length - 1 && <Separator className="mt-4" />}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {activeTab === "llm-api" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">LLM API 配置</CardTitle>
              </CardHeader>
              <CardContent>
                <LlmApiConfigList />
              </CardContent>
            </Card>
          )}

          {activeTab === "lead-config" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Team Lead 配置</CardTitle>
                  <div className="flex items-center gap-2">
                    {isCustomized && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleSave}
                        disabled={isLoading}
                      >
                        {isLoading ? "保存中..." : "保存"}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetToDefaults}
                      disabled={isLoading}
                    >
                      恢复默认
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  自定义 Team Lead 的行为方式和团队配置
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* AGENTS.md 编辑器 */}
                <div>
                  <label className="text-sm font-medium">
                    AGENTS.md
                    <span className="text-muted-foreground font-normal ml-2">
                      - 团队成员配置指南
                    </span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    决定 Lead 如何组织团队、分配任务、协调工作
                  </p>
                  <Textarea
                    value={getDisplayAgentsMd()}
                    onChange={(e) => setAgentsMd(e.target.value)}
                    className="min-h-50 font-mono text-sm"
                    rows={12}
                  />
                </div>

                <Separator />

                {/* SOUL.md 编辑器 */}
                <div>
                  <label className="text-sm font-medium">
                    SOUL.md
                    <span className="text-muted-foreground font-normal ml-2">
                      - Team Lead 性格特征
                    </span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    决定 Lead 的沟通风格、价值观、工作方式
                  </p>
                  <Textarea
                    value={getDisplaySoulMd()}
                    onChange={(e) => setSoulMd(e.target.value)}
                    className="min-h-50 font-mono text-sm"
                    rows={12}
                  />
                </div>

                <Separator />

                {/* 状态提示 */}
                <div className="text-sm text-muted-foreground">
                  {isCustomized ? (
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      已自定义
                      {lastUpdated && (
                        <span>(最后更新: {new Date(lastUpdated).toLocaleString()})</span>
                      )}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-gray-400" />
                      使用默认配置
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
