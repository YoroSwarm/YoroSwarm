import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermsPage() {
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
              <FileText className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">服务条款</h1>
              <p className="text-muted-foreground">最后更新：2025年3月</p>
            </div>
          </div>

          {/* 条款内容 */}
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <section className="space-y-4">
              <h2 className="text-2xl font-bold">1. 服务概述</h2>
              <p>
                Swarm（以下简称"本服务"）是一个 AI Agent 集群管理和协作平台，为用户提供智能助手管理、任务分配和协作功能。使用本服务即表示您同意遵守本服务条款。
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">2. 用户账户</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>2.1 注册本服务需要有效的邀请码，邀请码由管理员发放。</p>
                <p>2.2 用户应提供真实、准确的注册信息，并及时更新任何变更。</p>
                <p>2.3 用户有责任保护其账户安全，对使用该账户的所有活动负责。</p>
                <p>2.4 禁止与他人共享账户或允许他人使用您的账户。</p>
                <p>2.5 如发现任何未经授权使用您账户的情况，应立即通知我们。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">3. 服务使用规范</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>3.1 用户不得将本服务用于任何非法或未经授权的目的。</p>
                <p>3.2 禁止通过本服务传输任何病毒、恶意代码或其他有害材料。</p>
                <p>3.3 用户不得干扰或破坏本服务的运行或连接到本服务的任何网络。</p>
                <p>3.4 禁止尝试未经授权访问本服务的任何部分或其他账户。</p>
                <p>3.5 用户应对通过其账户创建的 AI Agent 的行为和输出内容负责。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">4. AI Agent 使用</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>4.1 本服务提供 AI Agent 的创建、配置和管理功能。</p>
                <p>4.2 AI Agent 的输出由 AI 模型生成，用户应自行评估和使用这些输出。</p>
                <p>4.3 用户不得创建用于欺诈、骚扰、歧视或其他非法目的的 AI Agent。</p>
                <p>4.4 本服务不对 AI Agent 的输出承担任何责任。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">5. 知识产权</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>5.1 本服务的所有内容、功能和特性均归我们所有，受知识产权法保护。</p>
                <p>5.2 用户保留其通过本服务提交或创建的内容的所有权。</p>
                <p>5.3 用户授予我们使用、存储和传输其内容的权利，以提供本服务。</p>
                <p>5.4 未经我们事先书面同意，用户不得复制、修改或分发本服务的任何部分。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">6. 隐私保护</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>6.1 我们重视用户隐私，详细信息请参阅我们的 <Link href="/privacy" className="text-primary hover:underline">隐私政策</Link>。</p>
                <p>6.2 我们收集和使用用户数据仅用于提供和改进本服务。</p>
                <p>6.3 我们采取合理的安全措施保护用户数据。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">7. 服务终止</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>7.1 我们保留随时暂停或终止您访问本服务的权利，无需事先通知。</p>
                <p>7.2 终止原因包括但不限于违反本条款、滥用服务或其他不当行为。</p>
                <p>7.3 您可以随时删除账户，删除后您的数据将被永久删除。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">8. 免责声明</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>8.1 本服务按"现状"提供，不提供任何明示或暗示的保证。</p>
                <p>8.2 我们不对服务中断、错误或数据丢失承担责任。</p>
                <p>8.3 我们不对 AI Agent 的输出准确性或适用性承担责任。</p>
                <p>8.4 在法律允许的范围内，我们不对因使用本服务而产生的任何损害承担责任。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">9. 条款变更</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>9.1 我们保留随时修改本服务条款的权利。</p>
                <p>9.2 修改后的条款将在本页面发布，并标明最后更新日期。</p>
                <p>9.3 继续使用本服务即表示您接受修改后的条款。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">10. 联系我们</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>如果您对本服务条款有任何疑问，请通过以下方式联系我们：</p>
                <p>· 邮箱：support@swarm.example.com</p>
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
