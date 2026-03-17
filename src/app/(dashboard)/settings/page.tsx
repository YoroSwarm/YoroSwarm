"use client";

import { useState } from "react";
import { useThemeStore } from "@/stores";
import {
  Bell,
  Palette,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const { theme, setTheme } = useThemeStore();
  const [activeTab, setActiveTab] = useState("appearance");

  const tabs = [
    { id: "appearance", label: "外观", icon: Palette },
    { id: "notifications", label: "通知", icon: Bell },
  ];

  return (
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
                    : "text-muted-foreground hover:bg-accent"
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
                          : "border-border text-muted-foreground hover:bg-accent"
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
                          : "border-border text-muted-foreground hover:bg-accent"
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
                          : "border-border text-muted-foreground hover:bg-accent"
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
        </div>
      </div>
    </div>
  );
}
