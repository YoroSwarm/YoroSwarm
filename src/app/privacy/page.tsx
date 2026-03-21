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
              <p className="text-muted-foreground">最后更新：2025年7月</p>
            </div>
          </div>

          {/* 政策内容 */}
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <section className="space-y-4">
              <h2 className="text-2xl font-bold">1. 信息收集</h2>
              <p className="text-muted-foreground">
                本服务在提供功能的过程中会收集以下类型的信息：
              </p>

              <div className="space-y-3 text-muted-foreground">
                <div>
                  <p><strong>1.1 账户信息</strong></p>
                  <p className="ml-4">注册时收集用户名和邮箱地址。密码使用 bcrypt 算法进行哈希处理后存储，本服务不存储任何明文密码。</p>
                </div>

                <div>
                  <p><strong>1.2 LLM API 密钥</strong></p>
                  <p className="ml-4">用户提供的大语言模型 API 密钥存储在本服务数据库中，用于驱动 Agent 的智能能力。API 密钥在 API 响应和用户界面中以脱敏形式展示（仅显示首尾各两位字符）。此外还存储相关配置信息，包括自定义 Base URL、认证模式、自定义认证头、默认模型、上下文窗口大小、温度参数、调用优先级等。</p>
                </div>

                <div>
                  <p><strong>1.3 Agent 与会话数据</strong></p>
                  <p className="ml-4">本服务存储 Agent 的配置信息（名称、角色、类别、能力描述）、Agent 上下文条目（对话历史、思考过程、工具调用结果）、任务分配及依赖关系，以及用户与 Agent 之间的完整对话记录（外部对话和消息）。</p>
                </div>

                <div>
                  <p><strong>1.4 Skill 配置</strong></p>
                  <p className="ml-4">记录用户安装的 Skill 列表、来源（预置或自定义）、启用状态，以及 Agent 与 Skill 的分配关系。自定义 Skill 的脚本文件存储在服务器文件系统中。</p>
                </div>

                <div>
                  <p><strong>1.5 文件数据</strong></p>
                  <p className="ml-4">用户上传的文件存储在服务器本地文件系统中，同时记录文件元信息（文件名、原始文件名、MIME 类型、大小、上传时间等）。对于图片文件，可能生成不同尺寸的缩略图。</p>
                </div>

                <div>
                  <p><strong>1.6 LLM 用量统计</strong></p>
                  <p className="ml-4">本服务记录每次 LLM API 调用的 Token 用量信息，包括输入 Token 数、输出 Token 数、缓存创建 Token 数和缓存读取 Token 数，以及对应的模型名称、Agent 标识和请求类型。这些数据用于向用户展示用量报告。</p>
                </div>

                <div>
                  <p><strong>1.7 会话与登录信息</strong></p>
                  <p className="ml-4">用户登录时记录会话信息，包括会话标识、IP 地址、User-Agent（浏览器标识）、会话创建时间、过期时间和最后活跃时间。</p>
                </div>

                <div>
                  <p><strong>1.8 工具审批记录</strong></p>
                  <p className="ml-4">Agent 触发的工具审批请求会被记录，包括审批类型（Shell 命令执行、文件写入、网络请求）、请求参数、审批状态、执行结果和工作目录等。</p>
                </div>

                <div>
                  <p><strong>1.9 用户环境变量</strong></p>
                  <p className="ml-4">用户自定义存储的环境变量以 JSON 格式保存在数据库中。在 API 响应中以脱敏形式展示，但在 Agent 执行环境中以明文传入。</p>
                </div>

                <div>
                  <p><strong>1.10 用户偏好设置</strong></p>
                  <p className="ml-4">存储用户的界面偏好，包括主题设置、玻璃拟态效果开关、背景图片、Lead Agent 的昵称和头像、时区设置等。</p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">2. 信息使用</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>2.1 提供和维护本服务的核心功能，包括 Agent 编排、任务执行和 Skill 调度。</p>
                <p>2.2 使用用户提供的 LLM API 密钥向第三方 LLM 服务发起 API 调用，以驱动 Agent 的推理和生成能力。</p>
                <p>2.3 处理和管理用户的 Agent 团队，包括 Agent 创建、任务分配、状态监控和上下文管理。</p>
                <p>2.4 执行 Skill 脚本和工具调用，为 Agent 提供文件处理、代码生成、文档创建等扩展能力。</p>
                <p>2.5 统计 LLM Token 用量，向用户提供用量报告和监控信息。</p>
                <p>2.6 维护会话安全，检测和防止未经授权的访问。</p>
                <p>2.7 改进服务性能和用户体验。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">3. 第三方数据传输</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>3.1 <strong>LLM API 服务商</strong>：本服务使用用户提供的 API 密钥向第三方 LLM 服务（如 Anthropic）发送请求。发送的数据包括 Agent 的系统提示词、用户消息、对话历史和工具调用结果。<strong>这些数据直接传输至用户配置的 LLM 服务端点，受该服务商自身的隐私政策和数据处理协议约束。</strong>本服务不控制第三方 LLM 服务商对数据的处理方式。</p>
                <p>3.2 <strong>无遥测与分析</strong>：本服务不向任何第三方发送遥测数据、使用分析或用户行为追踪数据。所有使用统计数据仅保留在服务部署的服务器上。</p>
                <p>3.3 我们不会出售、出租或交易您的个人信息。</p>
                <p>3.4 <strong>法律要求</strong>：在法律要求或为保护本服务和用户的合法权益时，我们可能会披露相关信息。</p>
                <p>3.5 <strong>业务转让</strong>：如涉及合并、收购或资产出售，用户信息可能作为业务资产的一部分进行转让，届时将通知受影响的用户。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">4. 数据安全</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>4.1 用户密码使用 bcrypt 算法（12 轮盐值）进行哈希处理，本服务不存储也无法还原明文密码。</p>
                <p>4.2 采用 JWT（JSON Web Token）机制进行身份验证：访问令牌有效期 30 分钟，刷新令牌有效期 7 天。</p>
                <p>4.3 LLM API 密钥和用户环境变量在 API 响应中进行脱敏处理。</p>
                <p>4.4 Agent 执行的命令受沙箱机制保护（macOS: Seatbelt，Linux: Bubblewrap），高风险操作需经用户审批。</p>
                <p>4.5 命令风险评估系统自动识别潜在危险操作，阻止未经审批的危险命令执行。</p>
                <p>4.6 所有认证 Cookie 配置为 HttpOnly、SameSite: Strict，生产环境下仅通过 HTTPS 传输。</p>
                <p>4.7 WebSocket 连接采用基于订阅的消息传递，用户仅能接收其有权访问的会话和 Agent 的事件。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">5. Cookie 使用</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>5.1 本服务使用 HTTP-only Cookie 存储认证令牌（访问令牌和刷新令牌），用于维护用户登录状态。</p>
                <p>5.2 Cookie 配置为 SameSite: Strict，有效防止跨站请求伪造（CSRF）攻击。</p>
                <p>5.3 生产环境下，Cookie 设置 Secure 标志，确保仅通过 HTTPS 加密连接传输。</p>
                <p>5.4 本服务不使用追踪型 Cookie 或第三方 Cookie。所有 Cookie 仅用于维护用户认证状态。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">6. 用户权利</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>6.1 <strong>访问权</strong>：您可以查看和更新您的个人信息，包括用户名、邮箱、头像、Lead Agent 配置等。</p>
                <p>6.2 <strong>删除权</strong>：您可以删除账户，所有关联数据（包括 Agent 配置、对话记录、文件、LLM API 密钥、Skill 配置、环境变量等）将通过级联删除机制永久移除。</p>
                <p>6.3 <strong>更正权</strong>：您可以更正不准确的个人信息，修改密码和账户设置。</p>
                <p>6.4 <strong>控制权</strong>：您可以随时添加、修改、禁用或删除 LLM API 密钥配置；安装、启用、禁用或卸载 Skill；设置、修改或删除环境变量。</p>
                <p>6.5 <strong>查看权</strong>：您可以查看 LLM Token 用量统计、Agent 执行历史和工具审批记录。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">7. 数据保留</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>7.1 账户激活期间，我们保留您的所有关联数据以提供服务。</p>
                <p>7.2 删除账户后，所有个人数据和关联内容将通过数据库级联删除机制永久删除。上传的文件将从服务器文件系统中移除。</p>
                <p>7.3 登录会话有效期为 7 天，过期后会话数据将被清理。访问令牌有效期为 30 分钟。</p>
                <p>7.4 工具审批请求设有过期机制，超时未处理的请求将自动标记为过期。</p>
                <p>7.5 某些匿名化的统计数据（如 Token 用量聚合统计）可能在账户删除后保留，用于服务改进。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">8. 关于 AI 处理的特别说明</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>8.1 当 Agent 执行任务时，您的对话内容、上传的文件内容（经文本提取后）以及 Agent 的上下文信息会被传送至您配置的第三方 LLM 服务进行处理。</p>
                <p>8.2 传送至 LLM 服务的数据包括：Agent 系统提示词、用户消息、Skill 指令文档、工具调用结果、以及必要的对话历史。这些数据的处理受相应 LLM 服务商的条款和隐私政策约束。</p>
                <p>8.3 本服务记录每次 LLM 调用的 Token 用量，但不记录 LLM 的完整请求和响应原文。Agent 的输出内容以上下文条目的形式保存在本服务数据库中。</p>
                <p>8.4 如果您使用了自定义 Base URL 连接代理服务或私有 LLM，数据将发送至您指定的端点。您应确保了解并接受该端点服务方的数据处理政策。</p>
                <p>8.5 Skill 脚本在服务器上执行时，可能访问 Agent 的工作目录中的文件和用户配置的环境变量。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">9. 儿童隐私</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>9.1 本服务面向 16 岁以上用户。</p>
                <p>9.2 我们不会故意收集 16 岁以下儿童的信息。</p>
                <p>9.3 如发现收集了未满 16 岁用户的信息，我们将立即采取措施删除相关数据。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">10. 政策更新</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>10.1 我们可能会不时更新本隐私政策以反映服务变更或法律要求。</p>
                <p>10.2 对于重大变更，我们将通过系统通知的方式告知用户。</p>
                <p>10.3 更新后继续使用本服务即表示您接受更新后的隐私政策。如不同意，应停止使用本服务。</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">11. 联系我们</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>如有隐私相关问题或需行使您的数据权利，请通过以下方式联系我们：</p>
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
