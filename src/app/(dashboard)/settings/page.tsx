"use client";

import { useState } from "react";
import { useThemeStore } from "@/stores";
import {
  User,
  Bell,
  Shield,
  Palette,
  Globe,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const { theme, setTheme } = useThemeStore();
  const [activeTab, setActiveTab] = useState("appearance");

  const tabs = [
    { id: "profile", label: "个人资料", icon: User },
    { id: "appearance", label: "外观", icon: Palette },
    { id: "notifications", label: "通知", icon: Bell },
    { id: "security", label: "安全", icon: Shield },
    { id: "language", label: "语言", icon: Globe },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold">设置</h1>
        <p className="text-muted-foreground mt-1">管理您的账户和系统偏好</p>
      </div>

      {/* 设置内容 */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* 左侧导航 */}
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

        {/* 右侧内容 */}
        <div className="flex-1">
          {activeTab === "appearance" && (
            <div className="space-y-6">
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
                      <Button
                        variant="outline"
                        onClick={() => setTheme("light")}
                        className={
                          theme === "light"
                            ? "border-primary bg-primary/10"
                            : ""
                        }
                      >
                        <Sun className="h-4 w-4" />
                        <span className="text-sm">浅色</span>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setTheme("dark")}
                        className={
                          theme === "dark"
                            ? "border-primary bg-primary/10"
                            : ""
                        }
                      >
                        <Moon className="h-4 w-4" />
                        <span className="text-sm">深色</span>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setTheme("system")}
                        className={
                          theme === "system"
                            ? "border-primary bg-primary/10"
                            : ""
                        }
                      >
                        <Monitor className="h-4 w-4" />
                        <span className="text-sm">系统</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">界面设置</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">紧凑模式</p>
                      <p className="text-sm text-muted-foreground">
                        减小界面元素间距
                      </p>
                    </div>
                    <Switch />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">动画效果</p>
                      <p className="text-sm text-muted-foreground">
                        启用界面过渡动画
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "profile" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">个人资料</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label>显示名称</Label>
                  <Input type="text" defaultValue="当前用户" />
                </div>
                <div className="space-y-1">
                  <Label>邮箱</Label>
                  <Input type="email" defaultValue="user@example.com" />
                </div>
                <div className="space-y-1">
                  <Label>个人简介</Label>
                  <Textarea
                    rows={3}
                    className="resize-none"
                    placeholder="写点什么..."
                  />
                </div>
                <div className="flex justify-end">
                  <Button>保存更改</Button>
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

          {activeTab === "security" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">修改密码</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <Label>当前密码</Label>
                    <Input type="password" />
                  </div>
                  <div className="space-y-1">
                    <Label>新密码</Label>
                    <Input type="password" />
                  </div>
                  <div className="space-y-1">
                    <Label>确认新密码</Label>
                    <Input type="password" />
                  </div>
                  <div className="flex justify-end">
                    <Button>更新密码</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">双因素认证</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">启用 2FA</p>
                      <p className="text-sm text-muted-foreground">
                        使用身份验证应用增强账户安全
                      </p>
                    </div>
                    <Switch />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "language" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">语言设置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label>界面语言</Label>
                  <Select defaultValue="zh-CN">
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh-CN">简体中文</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ja">日本語</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="space-y-1">
                  <Label>时区</Label>
                  <Select defaultValue="Asia/Shanghai">
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Shanghai">
                        Asia/Shanghai (GMT+8)
                      </SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">
                        America/New York
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
