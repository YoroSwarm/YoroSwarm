"use client";

import { useState, useRef } from "react";
import { Camera, Save, Eye, EyeOff } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/stores";
import { authApi } from "@/lib/api/auth";

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload
    setUploadingAvatar(true);
    try {
      const updatedUser = await authApi.uploadAvatar(file);
      updateUser(updatedUser);
      setProfileMsg({ type: "success", text: "头像已更新" });
    } catch {
      setProfileMsg({ type: "error", text: "头像上传失败" });
      setAvatarPreview(null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setProfileMsg(null);
    try {
      const updatedUser = await authApi.updateProfile({ displayName: displayName || undefined });
      updateUser(updatedUser);
      setProfileMsg({ type: "success", text: "资料已保存" });
    } catch {
      setProfileMsg({ type: "error", text: "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "两次输入的新密码不一致" });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ type: "error", text: "密码至少需要 8 个字符" });
      return;
    }

    setChangingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPasswordMsg({ type: "success", text: "密码已更新" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "密码修改失败";
      setPasswordMsg({ type: "error", text: msg });
    } finally {
      setChangingPassword(false);
    }
  };

  const avatarSrc = avatarPreview || user?.avatar;
  const initials = (user?.displayName || user?.username || "U").slice(0, 1).toUpperCase();

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">个人资料</h1>
        <p className="text-muted-foreground mt-1">管理您的头像、昵称和密码</p>
      </div>

      {/* Avatar + Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Avatar className="h-20 w-20 border-2 border-border">
                {avatarSrc ? (
                  <AvatarImage src={avatarSrc} alt={user?.username} />
                ) : null}
                <AvatarFallback className="bg-secondary text-secondary-foreground text-2xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <Camera className="w-5 h-5 text-white" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div>
              <p className="font-medium">{user?.displayName || user?.username}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-primary mt-1 hover:underline"
              >
                {uploadingAvatar ? "上传中..." : "更换头像"}
              </button>
            </div>
          </div>

          <Separator />

          {/* Display name */}
          <div className="space-y-2">
            <Label htmlFor="displayName">显示名称</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={user?.username || "输入显示名称"}
            />
            <p className="text-xs text-muted-foreground">
              留空将使用用户名 &ldquo;{user?.username}&rdquo; 作为显示名称
            </p>
          </div>

          {profileMsg && (
            <p className={`text-sm ${profileMsg.type === "success" ? "text-green-600" : "text-destructive"}`}>
              {profileMsg.text}
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "保存中..." : "保存更改"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">修改密码</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">当前密码</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showPasswords ? "text" : "password"}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">新密码</Label>
            <Input
              id="newPassword"
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">确认新密码</Label>
            <Input
              id="confirmPassword"
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            密码至少 8 个字符，需包含大小写字母和数字
          </p>

          {passwordMsg && (
            <p className={`text-sm ${passwordMsg.type === "success" ? "text-green-600" : "text-destructive"}`}>
              {passwordMsg.text}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            >
              {changingPassword ? "更新中..." : "更新密码"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
