"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, ShieldCheck } from "lucide-react";
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
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

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
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-background to-muted p-4">
      <div className="w-full max-w-6xl grid md:grid-cols-2 gap-8 items-center">
        {/* 左侧 Logo 区域 */}
        <div className={`hidden md:flex flex-col justify-center items-center p-12 transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
          <Image src="/icon.svg" alt="Swarm" width={256} height={256} />
        </div>

        {/* 右侧表单区域 */}
        <div className={`w-full max-w-md mx-auto space-y-5 rounded-xl border bg-card p-6 shadow-lg transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {/* 移动端 Logo */}
          <div className="md:hidden text-center">
            <Image src="/icon.svg" alt="Swarm" width={64} height={64} className="mx-auto mb-4" />
            <h1 className="text-2xl font-bold">创建账户</h1>
            <p className="mt-2 text-muted-foreground">加入 Swarm Agent 集群系统</p>
          </div>

          {/* 桌面端标题 */}
          <div className="hidden md:block">
            <h2 className="text-2xl font-bold">创建账户</h2>
            <p className="text-muted-foreground mt-1">加入 Swarm Agent 集群系统</p>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="username" className="block text-sm font-medium mb-1">
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
                <label htmlFor="email" className="block text-sm font-medium mb-1">
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1">
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
                <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
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
            </div>

            <div>
              <label htmlFor="accessCode" className="block text-sm font-medium mb-1">
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
            </div>

            <div className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="rounded border-gray-300" required />
              <span className="text-muted-foreground">
                我同意 <Link href="/terms" className="text-primary hover:underline transition-all hover:text-primary/80">服务条款</Link> 和{" "}
                <Link href="/privacy" className="text-primary hover:underline transition-all hover:text-primary/80">隐私政策</Link>
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
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
            <Link href="/login" className="text-primary hover:underline transition-all hover:text-primary/80">
              立即登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
