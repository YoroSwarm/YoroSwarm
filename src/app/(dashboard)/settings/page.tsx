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
              <div className="rounded-xl border bg-card p-6">
                <h2 className="text-lg font-semibold mb-4">主题设置</h2>
                <div className="space-y-4">
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
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          theme === "light"
                            ? "border-primary bg-primary/10"
                            : "hover:bg-accent"
                        }`}
                      >
                        <Sun className="h-4 w-4" />
                        <span className="text-sm">浅色</span>
                      </button>
                      <button
                        onClick={() => setTheme("dark")}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          theme === "dark"
                            ? "border-primary bg-primary/10"
                            : "hover:bg-accent"
                        }`}
                      >
                        <Moon className="h-4 w-4" />
                        <span className="text-sm">深色</span>
                      </button>
                      <button
                        onClick={() => setTheme("system")}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          theme === "system"
                            ? "border-primary bg-primary/10"
                            : "hover:bg-accent"
                        }`}
                      >
                        <Monitor className="h-4 w-4" />
                        <span className="text-sm">系统</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-card p-6">
                <h2 className="text-lg font-semibold mb-4">界面设置</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">紧凑模式</p>
                      <p className="text-sm text-muted-foreground">
                        减小界面元素间距
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">动画效果</p>
                      <p className="text-sm text-muted-foreground">
                        启用界面过渡动画
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        defaultChecked
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <div className="rounded-xl border bg-card p-6">
              <h2 className="text-lg font-semibold mb-4">个人资料</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    显示名称
                  </label>
                  <input
                    type="text"
                    defaultValue="当前用户"
                    className="w-full px-3 py-2 rounded-lg border bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    邮箱
                  </label>
                  <input
                    type="email"
                    defaultValue="user@example.com"
                    className="w-full px-3 py-2 rounded-lg border bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    个人简介
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border bg-background resize-none"
                    placeholder="写点什么..."
                  />
                </div>
                <div className="flex justify-end">
                  <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                    保存更改
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="rounded-xl border bg-card p-6">
              <h2 className="text-lg font-semibold mb-4">通知设置</h2>
              <div className="space-y-4">
                {[
                  { label: "任务完成通知", desc: "当任务完成时接收通知" },
                  { label: "Agent 消息", desc: "当 Agent 发送消息时通知" },
                  { label: "系统公告", desc: "接收系统更新和公告" },
                  { label: "邮件通知", desc: "通过邮件接收重要通知" },
                ].map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.desc}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        defaultChecked={index < 2}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              <div className="rounded-xl border bg-card p-6">
                <h2 className="text-lg font-semibold mb-4">修改密码</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      当前密码
                    </label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 rounded-lg border bg-background"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      新密码
                    </label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 rounded-lg border bg-background"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      确认新密码
                    </label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 rounded-lg border bg-background"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                      更新密码
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-card p-6">
                <h2 className="text-lg font-semibold mb-4">双因素认证</h2>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">启用 2FA</p>
                    <p className="text-sm text-muted-foreground">
                      使用身份验证应用增强账户安全
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === "language" && (
            <div className="rounded-xl border bg-card p-6">
              <h2 className="text-lg font-semibold mb-4">语言设置</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    界面语言
                  </label>
                  <select className="w-full px-3 py-2 rounded-lg border bg-background">
                    <option value="zh-CN">简体中文</option>
                    <option value="en">English</option>
                    <option value="ja">日本語</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    时区
                  </label>
                  <select className="w-full px-3 py-2 rounded-lg border bg-background">
                    <option value="Asia/Shanghai">Asia/Shanghai (GMT+8)</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New York</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
