import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* 头部导航 */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            返回注册
          </Link>
        </div>
      </header>

      {/* 主内容 */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="space-y-8">
          {/* 标题 */}
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-linear-to-br from-primary to-secondary flex items-center justify-center">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">隐私政策</h1>
              <p className="text-muted-foreground">最后更新：2025年3月</p>
            </div>
          </div>

          {/* 政策内容 */}
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <section className="space-y-4">
              <h2 className="text-2xl font-bold">1. 信息收集</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>1.1 <strong>账户信息</strong>：注册时收集用户名、邮箱地址。</p>
                <p>1.2 <strong>登录信息</strong>：记录登录时间和会话信息以维护安全。</p>
                <p>1.3 <strong>用户配置</strong>：存储您的个人偏好设置（如主题、Agent 配置等）。</p>
                <p>1.4 <strong>使用数据</strong>：收集使用统计数据以改进服务。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">2. 信息使用</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>2.1 提供和维护本服务的核心功能。</p>
                <p>2.2 处理和管理您的 AI Agent。</p>
                <p>2.3 发送重要通知和安全警报。</p>
                <p>2.4 分析使用数据以改进服务性能。</p>
                <p>2.5 检测和防止欺诈、滥用和安全威胁。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">3. 信息共享</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>3.1 我们不会出售、出租或交易您的个人信息。</p>
                <p>3.2 <strong>服务提供商</strong>：与第三方服务提供商合作提供必要的基础设施服务，这些提供商仅能访问履行职责所需的信息。</p>
                <p>3.3 <strong>法律要求</strong>：在法律要求或保护我们的权利时，可能会披露信息。</p>
                <p>3.4 <strong>业务转让</strong>：如涉及合并、收购，您的信息可能会被转让。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">4. 数据安全</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>4.1 使用行业标准的加密技术保护数据传输。</p>
                <p>4.2 密码使用 bcrypt 哈希存储，不存储明文密码。</p>
                <p>4.3 实施 JWT 令牌机制进行身份验证。</p>
                <p>4.4 定期进行安全审计和更新。</p>
                <p>4.5 访问控制：仅授权人员可访问用户数据。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">5. Cookie 使用</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>5.1 使用 HTTP-only Cookie 存储认证令牌。</p>
                <p>5.2 Cookie 配置为 SameSite: Strict 以防止 CSRF 攻击。</p>
                <p>5.3 生产环境下 Cookie 仅通过 HTTPS 传输。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">6. 用户权利</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>6.1 <strong>访问权</strong>：您可以查看和更新您的个人信息。</p>
                <p>6.2 <strong>删除权</strong>：您可以请求删除账户和相关数据。</p>
                <p>6.3 <strong>更正权</strong>：您可以更正不准确的个人信息。</p>
                <p>6.4 <strong>导出权</strong>：您可以请求导出您的数据。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">7. 数据保留</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>7.1 账户激活期间，我们保留您的数据。</p>
                <p>7.2 删除账户后，个人数据将在 30 天内永久删除。</p>
                <p>7.3 某些匿名化数据可能会保留用于统计分析。</p>
                <p>7.4 会话数据在会话结束或过期后自动清除。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">8. 儿童隐私</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>8.1 本服务面向 16 岁以上用户。</p>
                <p>8.2 我们不会故意收集 16 岁以下儿童的信息。</p>
                <p>8.3 如发现收集了儿童信息，我们将立即删除。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">9. 政策更新</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>9.1 我们可能会不时更新本隐私政策。</p>
                <p>9.2 重大变更时，我们将通过邮件或系统通知告知您。</p>
                <p>9.3 继续使用服务即表示您接受更新后的政策。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">10. 联系我们</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>如有隐私相关问题或行使您的权利，请通过以下方式联系我们：</p>
                <p>· 邮箱：privacy@swarm.example.com</p>
                <p>· 或通过系统内的反馈功能联系我们</p>
              </div>
            </section>
          </div>

          {/* 返回注册按钮 */}
          <div className="pt-8 border-t">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              我已阅读并同意，返回注册
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
