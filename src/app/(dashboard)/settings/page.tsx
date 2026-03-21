"use client";

import { useState, useEffect, useRef } from "react";
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
  Puzzle,
  Terminal,
  Globe,
  Camera,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { LlmApiConfigList } from "@/components/settings/LlmApiConfigList";
import { SkillsManager } from "@/components/settings/SkillsManager";
import { EnvVarsManager } from "@/components/settings/EnvVarsManager";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

export default function SettingsPage() {
  const { theme, setTheme } = useThemeStore();
  const {
    isCustomized,
    lastUpdated,
    isLoading,
    timezone,
    leadNickname,
    leadAvatarUrl,
    loadPreferences,
    savePreferences,
    setAgentsMd,
    setSoulMd,
    setTimezone,
    setLeadNickname,
    setLeadAvatarUrl,
    resetToDefaults,
    getDisplayAgentsMd,
    getDisplaySoulMd,
  } = useLeadPreferencesStore();
  const [activeTab, setActiveTab] = useState("appearance");
  const leadAvatarInputRef = useRef<HTMLInputElement>(null);

  // 确认对话框
  const { confirm, Dialog: ConfirmDialogComponent } = useConfirmDialog();

  // 加载配置
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleLeadAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) return;

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const res = await fetch('/api/lead/avatar', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.success) {
        setLeadAvatarUrl(json.data.leadAvatarUrl);
      }
    } catch (error) {
      console.error('Failed to upload lead avatar:', error);
    }
    // Reset input
    if (leadAvatarInputRef.current) leadAvatarInputRef.current.value = '';
  };

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
    { id: "general", label: "通用", icon: Globe },
    { id: "notifications", label: "通知", icon: Bell },
    { id: "llm-api", label: "LLM API", icon: Key },
    { id: "skills", label: "Skills", icon: Puzzle },
    { id: "env-vars", label: "环境变量", icon: Terminal },
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

      <div className="flex flex-col lg:flex-row gap-6 min-w-0">
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

        <div className="flex-1 min-w-0">
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

          {activeTab === "general" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">通用设置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-medium">时区</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    Agent 系统提示中显示的时间将使用此时区。留空则使用服务器本地时区。
                  </p>
                  <div className="flex items-center gap-3">
                    <select
                      value={timezone || ""}
                      onChange={(e) => {
                        setTimezone(e.target.value || null);
                      }}
                      className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">服务器默认</option>
                      <optgroup label="亚洲">
                        <option value="Asia/Shanghai">Asia/Shanghai (中国标准时间)</option>
                        <option value="Asia/Tokyo">Asia/Tokyo (日本标准时间)</option>
                        <option value="Asia/Seoul">Asia/Seoul (韩国标准时间)</option>
                        <option value="Asia/Singapore">Asia/Singapore (新加坡)</option>
                        <option value="Asia/Hong_Kong">Asia/Hong_Kong (香港)</option>
                        <option value="Asia/Taipei">Asia/Taipei (台北)</option>
                        <option value="Asia/Kolkata">Asia/Kolkata (印度)</option>
                        <option value="Asia/Dubai">Asia/Dubai (迪拜)</option>
                      </optgroup>
                      <optgroup label="美洲">
                        <option value="America/New_York">America/New_York (美东)</option>
                        <option value="America/Chicago">America/Chicago (美中)</option>
                        <option value="America/Denver">America/Denver (美山)</option>
                        <option value="America/Los_Angeles">America/Los_Angeles (美西)</option>
                        <option value="America/Sao_Paulo">America/Sao_Paulo (巴西)</option>
                      </optgroup>
                      <optgroup label="欧洲">
                        <option value="Europe/London">Europe/London (伦敦)</option>
                        <option value="Europe/Paris">Europe/Paris (巴黎)</option>
                        <option value="Europe/Berlin">Europe/Berlin (柏林)</option>
                        <option value="Europe/Moscow">Europe/Moscow (莫斯科)</option>
                      </optgroup>
                      <optgroup label="大洋洲">
                        <option value="Australia/Sydney">Australia/Sydney (悉尼)</option>
                        <option value="Pacific/Auckland">Pacific/Auckland (新西兰)</option>
                      </optgroup>
                      <optgroup label="其他">
                        <option value="UTC">UTC (协调世界时)</option>
                      </optgroup>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await savePreferences();
                        } catch (error) {
                          console.error("Failed to save timezone:", error);
                        }
                      }}
                      disabled={isLoading}
                    >
                      {isLoading ? "保存中..." : "保存"}
                    </Button>
                  </div>
                  {timezone && (
                    <p className="text-xs text-muted-foreground mt-2">
                      当前选择: {timezone} — 示例: {new Date().toLocaleString('zh-CN', { timeZone: timezone, hour12: false })}
                    </p>
                  )}
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

          {activeTab === "skills" && (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Skills 管理</CardTitle>
                <p className="text-sm text-muted-foreground">
                  安装和管理 Agent Skills。Lead 可以将已启用的 Skills 分配给 Teammate，为其提供额外的工作流指令和脚本工具。
                </p>
              </CardHeader>
              <CardContent>
                <SkillsManager />
              </CardContent>
            </Card>
          )}

          {activeTab === "env-vars" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">环境变量</CardTitle>
                <p className="text-sm text-muted-foreground">
                  配置环境变量，在 Teammate 执行 shell_exec 时自动注入。适用于 API 密钥、配置参数等。
                </p>
              </CardHeader>
              <CardContent>
                <EnvVarsManager />
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
                {/* Lead 昵称和头像 */}
                <div className="flex items-start gap-6">
                  {/* Avatar upload */}
                  <div className="shrink-0">
                    <label className="text-sm font-medium block mb-2">头像</label>
                    <div 
                      className="relative h-16 w-16 rounded-full overflow-hidden border-2 border-border shadow-sm cursor-pointer group"
                      onClick={() => leadAvatarInputRef.current?.click()}
                    >
                      {leadAvatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={leadAvatarUrl} alt="Lead Avatar" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                          {leadNickname ? leadNickname.charAt(0).toUpperCase() : 'L'}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="h-5 w-5 text-white" />
                      </div>
                    </div>
                    <input
                      ref={leadAvatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLeadAvatarUpload}
                    />
                  </div>
                  {/* Nickname */}
                  <div className="flex-1">
                    <label className="text-sm font-medium">
                      显示昵称
                      <span className="text-muted-foreground font-normal ml-2">
                        - 前端消息中的 Lead 名称
                      </span>
                    </label>
                    <Input
                      value={leadNickname || ''}
                      onChange={(e) => setLeadNickname(e.target.value || null)}
                      placeholder="Team Lead"
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">留空则使用默认名称「Team Lead」</p>
                  </div>
                </div>

                <Separator />

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
