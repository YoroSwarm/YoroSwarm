"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ShieldCheck, Zap } from "lucide-react";
import { useAuthStore } from "@/stores";

interface RegisterFormState {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  accessCode: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "注册失败";
}

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((state) => state.register);
  const [formData, setFormData] = useState<RegisterFormState>({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    accessCode: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const updateField = <K extends keyof RegisterFormState>(
    field: K,
    value: RegisterFormState[K]
  ) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.username.trim().length < 3) {
      setError("用户名至少需要 3 个字符");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if (!formData.accessCode.trim()) {
      setError("请输入邀请码");
      return;
    }

    setIsLoading(true);

    try {
      await register({
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        accessCode: formData.accessCode.trim(),
      });
      router.push("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-lg">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold">创建账户</h1>
          <p className="mt-2 text-muted-foreground">加入 Swarm Agent 集群系统</p>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium">
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={formData.username}
              onChange={(e) => updateField("username", e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="输入用户名"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => updateField("email", e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="输入邮箱地址"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => updateField("password", e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="输入密码"
              autoComplete="new-password"
              required
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1 block text-sm font-medium"
            >
              确认密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => updateField("confirmPassword", e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="再次输入密码"
              autoComplete="new-password"
              required
            />
          </div>

          <div>
            <label htmlFor="accessCode" className="mb-1 block text-sm font-medium">
              邀请码
            </label>
            <div className="relative">
              <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="accessCode"
                type="text"
                value={formData.accessCode}
                onChange={(e) => updateField("accessCode", e.target.value)}
                className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="输入管理员提供的邀请码"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              注册需要有效邀请码，提交后会自动登录。
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="rounded border-gray-300" required />
            <span className="text-muted-foreground">
              我同意 <Link href="#" className="text-primary hover:underline">服务条款</Link> 和{" "}
              <Link href="#" className="text-primary hover:underline">隐私政策</Link>
            </span>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                注册中...
              </>
            ) : (
              "创建账户"
            )}
          </button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          已有账户？{" "}
          <Link href="/login" className="text-primary hover:underline">
            立即登录
          </Link>
        </div>
      </div>
    </div>
  );
}
