import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { appConfig } from "@/lib/config/app";

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
              <p className="text-muted-foreground">最后更新：2025年7月</p>
            </div>
          </div>

          {/* 条款内容 */}
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <section className="space-y-4">
              <h2 className="text-2xl font-bold">1. 服务概述</h2>
              <p>
                {appConfig.name}（以下简称&ldquo;本服务&rdquo;）是一个多 Agent AI 协作平台，采用 Lead Agent（主导 Agent）与 Teammate Agent（协作 Agent）的架构，为用户提供 AI Agent 集群的创建、编排、任务分配和协同工作能力。本服务允许用户通过自然语言与 AI Agent 团队交互，由 Agent 自主拆解任务、调用技能（Skill）并生成产出物。
              </p>
              <p>
                使用本服务即表示您已阅读、理解并同意遵守本服务条款。如果您不同意本条款的任何部分，请勿使用本服务。
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">2. 用户账户</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>2.1 注册本服务需要有效的访问码（Access Code），该访问码由服务部署管理员提供。</p>
                <p>2.2 用户应提供真实、准确的注册信息（用户名、邮箱），并及时更新任何变更。</p>
                <p>2.3 用户有责任保护其账户凭证的安全，对使用该账户进行的所有活动承担全部责任，包括但不限于 Agent 的创建与执行、Skill 的安装与调用、文件的上传与处理等。</p>
                <p>2.4 严禁与他人共享账户或允许他人使用您的账户。</p>
                <p>2.5 如发现任何未经授权使用您账户的情况，应立即通知服务管理员。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">3. LLM API 密钥与第三方服务</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>3.1 本服务要求用户自行提供大语言模型（LLM）的 API 密钥以驱动 Agent 的智能能力。用户可配置多个 API 密钥，并为 Lead Agent 和 Teammate Agent 分别设置调用优先级。</p>
                <p>3.2 用户提供的 API 密钥将存储在本服务的数据库中，在 API 响应中以脱敏形式展示（仅显示首尾各两位字符）。用户应确保所提供的 API 密钥来源合法，且有权使用。</p>
                <p>3.3 本服务支持自定义 Base URL 和自定义认证头（Custom Headers），以便用户连接代理服务或私有部署的 LLM 服务。用户有责任确保其连接的第三方服务的合规性和安全性。</p>
                <p>3.4 <strong>通过本服务发起的 LLM API 调用所产生的所有费用由用户自行承担。</strong>本服务不对 LLM API 调用的费用、配额限制或第三方服务的可用性负责。</p>
                <p>3.5 本服务在调用 LLM API 时会记录 Token 用量统计信息（输入/输出 Token 数、缓存命中等），用于向用户展示用量报告。这些统计数据不会发送至任何第三方。</p>
                <p>3.6 当配置了多个 API 密钥时，本服务实现自动降级机制——若优先级较高的密钥调用失败，将依次尝试下一个可用密钥。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">4. AI Agent 系统</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>4.1 本服务采用 Lead Agent / Teammate Agent 的分层架构：Lead Agent 负责接收用户指令、拆解任务和分配工作；Teammate Agent 负责执行具体任务并汇报结果。</p>
                <p>4.2 Agent 可被分类为多种角色（研究员、写作者、分析师、工程师、协调者、专家、通用工人等），不同角色对应不同的能力范围。</p>
                <p>4.3 Agent 在执行任务时具有一定程度的自主性，包括自主调用工具、执行命令和文件操作。每个 Agent 的单次执行循环最多进行 25 次迭代，单个会话内所有工具调用累计不超过 2000 次。</p>
                <p>4.4 <strong>Agent 的所有输出均由 AI 模型生成，可能包含不准确、不完整或过时的信息。用户应自行评估、验证和审核 Agent 的所有输出，不应将其作为专业建议的唯一依据。</strong></p>
                <p>4.5 用户不得指示 Agent 生成违法、有害、歧视、骚扰或侵权的内容。</p>
                <p>4.6 用户对通过其账户创建和运行的 Agent 的行为及其产出的所有内容承担全部责任。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">5. Skill 系统</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>5.1 本服务提供 Skill（技能）系统，Skill 是可分配给 Agent 的模块化能力扩展。每个 Skill 包含指令文档、可执行脚本和参考模板。</p>
                <p>5.2 本服务预置了多项 Skill（如 PDF 生成、Excel 处理、Word 文档创建、代码审查、网页搜索、Web 应用构建、结构化报告等），用户可从 Skill 注册表安装或卸载。</p>
                <p>5.3 用户可安装自定义 Skill。自定义 Skill 中的脚本将在服务器上执行，用户应确保其 Skill 内容安全合法，不包含恶意代码。</p>
                <p>5.4 Skill 执行过程中可能涉及调用外部程序（如 Playwright、Python、.NET 等运行时环境）。这些执行受服务器沙箱保护机制约束（详见第 6 条）。</p>
                <p>5.5 Lead Agent 可以在任务执行过程中动态为 Teammate Agent 分配 Skill，分配关系绑定到具体的工作会话。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">6. 工具执行与安全</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>6.1 Agent 在执行任务时可能需要调用工具（Tool），包括 Shell 命令执行、文件读写和网络请求等。具有潜在风险的操作（如安装软件包、删除文件、发起网络请求等）将触发工具审批流程，需由用户手动批准后方可执行。</p>
                <p>6.2 本服务实现了命令风险评估机制，会自动识别潜在危险命令（如 <code>rm -rf</code>、<code>curl</code>、<code>npm install</code> 等），并将其提交至审批队列而非直接执行。</p>
                <p>6.3 本服务在支持的操作系统上提供进程沙箱隔离：macOS 使用 Seatbelt（sandbox-exec），Linux 使用 Bubblewrap（bwrap）。在不支持沙箱的平台上，命令将在无额外隔离的环境中运行，用户应格外注意审批操作的安全性。</p>
                <p>6.4 工具审批具有过期机制。未在规定时间内处理的审批请求将自动过期失效。</p>
                <p>6.5 <strong>尽管本服务提供了多层安全防护，但无法保证完全杜绝 Agent 执行的所有潜在风险。用户应谨慎审批所有工具调用请求，并对批准执行的操作后果承担责任。</strong></p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">7. 文件上传与处理</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>7.1 本服务允许用户上传文件供 Agent 处理。单个文件大小上限为 100MB。</p>
                <p>7.2 上传的文件存储在服务器本地文件系统中，与用户账户和工作会话关联。</p>
                <p>7.3 本服务支持对文档进行文本提取（包括 Word、Excel、PDF 等格式），提取的内容可能被传递给 LLM 用于分析和处理。</p>
                <p>7.4 用户应确保上传的文件不包含恶意软件、不侵犯他人知识产权，且符合相关法律法规。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">8. AI 产出物与知识产权</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>8.1 通过本服务的 Agent 生成的所有产出物（包括但不限于文本、代码、文档、数据分析结果、图表等）的知识产权归用户所有。</p>
                <p>8.2 本服务平台的源代码、界面设计、功能架构和品牌标识等均归服务所有者所有，受知识产权法保护。</p>
                <p>8.3 用户授予本服务在提供服务所必需的范围内存储、传输和处理其内容的有限许可。该许可仅用于服务的正常运行，不涉及内容的所有权转让。</p>
                <p>8.4 AI 产出物可能引用、参考或衍生自公开信息或训练数据。本服务不对 AI 产出物的原创性、准确性或合规性做出保证。用户有责任在使用前验证产出物是否符合适用的知识产权法律。</p>
                <p>8.5 未经服务所有者事先书面同意，用户不得复制、修改、反编译或分发本服务的任何组成部分。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">9. 用户环境变量</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>9.1 本服务允许用户存储自定义环境变量，这些变量可在 Skill 脚本和 Agent 执行过程中使用。</p>
                <p>9.2 环境变量可能包含敏感信息（如 API 密钥、访问令牌等）。用户应了解这些变量将在 Agent 执行上下文中可用，并可能传递给 Skill 脚本。</p>
                <p>9.3 环境变量在 API 响应中以脱敏形式展示，但在实际执行时将以明文形式传入运行环境。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">10. 服务使用规范</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>10.1 用户不得将本服务用于任何非法或未经授权的目的。</p>
                <p>10.2 禁止通过本服务传输任何病毒、恶意代码或其他有害材料。</p>
                <p>10.3 用户不得干扰或破坏本服务的运行或其连接的任何网络基础设施。</p>
                <p>10.4 禁止尝试绕过本服务的安全机制，包括但不限于工具审批流程、沙箱隔离和命令风险评估。</p>
                <p>10.5 禁止利用 Agent 进行自动化攻击、垃圾信息生成、数据爬取或其他滥用行为。</p>
                <p>10.6 用户不得利用自定义 Skill 或环境变量执行危害服务器安全或其他用户权益的操作。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">11. 隐私保护</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>11.1 我们重视用户隐私，详细信息请参阅我们的 <Link href="/privacy" className="text-primary hover:underline">隐私政策</Link>。</p>
                <p>11.2 我们收集和使用用户数据仅用于提供和改进本服务。</p>
                <p>11.3 本服务不向任何第三方发送遥测数据或分析数据。所有用户数据均保留在服务部署的服务器上。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">12. 免责声明</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>12.1 本服务按&ldquo;现状&rdquo;和&ldquo;可用&rdquo;的基础提供，不提供任何明示或暗示的保证，包括但不限于适销性、特定用途适用性和非侵权的保证。</p>
                <p>12.2 我们不对服务中断、错误、数据丢失或安全漏洞承担责任。</p>
                <p>12.3 <strong>我们不对 AI Agent 的输出内容的准确性、完整性、合法性或适用性承担任何责任。</strong>Agent 的输出仅供参考，不构成专业建议。</p>
                <p>12.4 我们不对 Agent 调用工具或执行命令所导致的任何直接或间接后果承担责任，包括但不限于文件损坏、数据泄露或系统损害。</p>
                <p>12.5 我们不对因用户提供的 LLM API 密钥泄露、滥用或其关联的第三方 LLM 服务的任何问题承担责任。</p>
                <p>12.6 我们不对 Skill 脚本执行过程中产生的任何损害承担责任，特别是用户安装的自定义 Skill。</p>
                <p>12.7 在法律允许的最大范围内，我们对因使用本服务而产生的任何直接、间接、附带、特殊或惩罚性损害不承担责任。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">13. 服务终止</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>13.1 我们保留在以下情况下暂停或终止您访问本服务的权利：违反本条款、滥用服务资源、危害其他用户权益或其他我们认为必要的情形。</p>
                <p>13.2 您可以随时删除您的账户。账户删除后，您的所有数据（包括 Agent 配置、对话记录、文件、Skill 配置、LLM API 密钥和环境变量）将被永久删除。</p>
                <p>13.3 服务终止不免除您在使用服务期间的行为所应承担的责任。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">14. 条款变更</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>14.1 我们保留随时修改本服务条款的权利。</p>
                <p>14.2 修改后的条款将在本页面发布，并更新&ldquo;最后更新&rdquo;日期。</p>
                <p>14.3 对于重大变更，我们将通过系统通知的方式告知用户。</p>
                <p>14.4 修改后继续使用本服务即表示您接受修改后的条款。如不同意新条款，应停止使用本服务。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">15. 联系我们</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>如果您对本服务条款有任何疑问或建议，请通过以下方式联系我们：</p>
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
