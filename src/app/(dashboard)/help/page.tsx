'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Users,
  Zap,
  Settings,
  FileText,
  Shield,
  ChevronRight,
  ExternalLink,
  Search,
  BookOpen,
  Lightbulb,
  HelpCircle,
  Keyboard,
  Heart,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface HelpSection {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  items: { q: string; a: string }[];
}

const helpSections: HelpSection[] = [
  {
    id: 'getting-started',
    icon: Lightbulb,
    title: '快速开始',
    description: '了解 Swarm 的基本概念和使用方法',
    items: [
      {
        q: '什么是 Swarm？',
        a: 'Swarm 是一个多智能体协作平台。您发送一条消息后，Lead（主智能体）会自动分析您的需求，并在必要时将任务分配给多个 Teammate（协作智能体），它们并行工作后汇总结果返回给您。',
      },
      {
        q: '如何创建一个新会话？',
        a: '在左侧边栏点击「+」按钮即可创建新会话。您也可以直接在聊天输入框中输入首条消息，系统会自动创建会话。',
      },
      {
        q: 'Lead 和 Teammate 有什么区别？',
        a: 'Lead 是主智能体，直接与您对话并负责理解需求、规划任务。Teammate 是协作智能体，由 Lead 调度来处理具体子任务（如搜索、编程、分析等）。您只需与 Lead 对话，不必关心 Teammate 的调度细节。',
      },
    ],
  },
  {
    id: 'chat',
    icon: MessageSquare,
    title: '对话功能',
    description: '消息发送、文件上传和对话管理',
    items: [
      {
        q: '支持哪些消息类型？',
        a: '支持纯文本消息和文件附件。您可以上传文档（PDF、Word、Excel）、图片、代码文件等，智能体会自动解析并理解文件内容。',
      },
      {
        q: '消息中的「思考」气泡是什么？',
        a: '思考气泡展示了智能体的内部推理过程——它在规划如何回答您的问题。这些内容可以帮助您了解智能体的思路，但不属于正式回复。',
      },
      {
        q: '如何暂停或恢复会话？',
        a: '在左侧会话列表中，右键点击会话或点击「⋮」菜单，选择「暂停」即可暂停会话中的所有智能体活动。恢复操作同理。',
      },
      {
        q: '如何搜索历史会话？',
        a: '使用左侧边栏顶部的搜索框可按会话标题搜索。也可以使用快捷键 Ctrl/⌘ + K 打开全局搜索面板。',
      },
    ],
  },
  {
    id: 'agents',
    icon: Users,
    title: '智能体团队',
    description: '了解多智能体协作机制',
    items: [
      {
        q: '智能体如何协作？',
        a: 'Lead 接收您的消息后，会判断是否需要调用 Teammate。如果任务复杂，Lead 会将其拆分为多个子任务，分配给不同的 Teammate 并行处理。完成后 Lead 汇总结果，以统一的回复呈现给您。',
      },
      {
        q: '什么是工具审批？',
        a: '某些操作（如执行代码、访问外部服务）需要您的授权。当智能体请求使用这类工具时，聊天底部会出现审批卡片，您可以选择「允许」或「拒绝」。也可以设置自动审批规则。',
      },
      {
        q: '如何查看智能体的详细活动？',
        a: '点击聊天区右上角的面板按钮打开右侧面板，可以查看当前会话的智能体状态、活动日志和详细信息。',
      },
    ],
  },
  {
    id: 'skills',
    icon: Zap,
    title: 'Skill 技能',
    description: '扩展智能体的能力',
    items: [
      {
        q: '什么是 Skill？',
        a: 'Skill 是智能体的扩展能力模块。每个 Skill 为智能体提供特定的工具或知识（如网络搜索、代码执行、文件处理等）。您可以在设置中管理已安装的 Skill。',
      },
      {
        q: '如何安装新的 Skill？',
        a: '前往「偏好设置」→「Skill 管理」，浏览可用的 Skill 列表，点击「安装」即可。安装后的 Skill 会自动对所有会话生效。',
      },
    ],
  },
  {
    id: 'files',
    icon: FileText,
    title: '文件管理',
    description: '上传、浏览和管理文件',
    items: [
      {
        q: '上传的文件存储在哪里？',
        a: '文件存储在服务器本地。您可以在左侧导航的「文件」页面统一管理所有已上传的文件，也可以在会话的「文件」标签页查看该会话相关的文件。',
      },
      {
        q: '支持哪些文件格式？',
        a: '支持常见的文档格式（PDF、DOCX、XLSX）、图片格式（PNG、JPG、GIF、WebP）、代码文件、纯文本文件等。上传后智能体会自动提取和理解内容。',
      },
    ],
  },
  {
    id: 'settings',
    icon: Settings,
    title: '设置与配置',
    description: 'API 配置、外观和通知',
    items: [
      {
        q: '如何配置 LLM API？',
        a: '前往「偏好设置」→「LLM API 配置」，添加您的 API 密钥。目前仅兼容「Anthropic Messages」接口的提供商。配置完成后即可在会话中使用对应的模型。',
      },
      {
        q: '如何切换深色/浅色主题？',
        a: '点击页面右上角的主题切换按钮（太阳/月亮图标）即可切换。也可以在「偏好设置」中设置跟随系统主题。',
      },
      {
        q: '环境变量有什么用？',
        a: '环境变量允许您为智能体配置运行时参数（如 API 端点、自定义配置等），这些变量在 Skill 执行时可被引用。在「偏好设置」→「环境变量」中管理。',
      },
    ],
  },
  {
    id: 'security',
    icon: Shield,
    title: '安全与隐私',
    description: '数据安全和权限管理',
    items: [
      {
        q: '我的数据安全吗？',
        a: 'Swarm 是自托管平台，所有数据存储在您自己的服务器上。对话内容、文件和配置信息不会发送到除您配置的 LLM API 以外的任何第三方服务。',
      },
      {
        q: '工具审批机制如何保障安全？',
        a: '默认情况下，涉及副作用的工具操作（如执行代码、修改文件）需要您手动审批。您可以为信任的工具设置自动审批规则，在安全和效率之间取得平衡。',
      },
    ],
  },
];

const shortcuts = [
  { keys: ['⌘/Ctrl', 'K'], desc: '全局搜索' },
  { keys: ['Enter'], desc: '发送消息' },
  { keys: ['Shift', 'Enter'], desc: '消息内换行' },
];

const openSourceDeps = [
  { name: 'Next.js', href: 'https://nextjs.org', license: 'MIT', desc: 'React 全栈框架' },
  { name: 'React', href: 'https://react.dev', license: 'MIT', desc: 'UI 构建库' },
  { name: 'Prisma', href: 'https://prisma.io', license: 'Apache-2.0', desc: '数据库 ORM' },
  { name: 'Anthropic SDK', href: 'https://github.com/anthropics/anthropic-sdk-typescript', license: 'MIT', desc: 'Anthropic API 客户端' },
  { name: 'Tailwind CSS', href: 'https://tailwindcss.com', license: 'MIT', desc: '原子化 CSS 框架' },
  { name: 'shadcn/ui', href: 'https://ui.shadcn.com', license: 'MIT', desc: 'UI 组件库' },
  { name: 'Radix UI', href: 'https://radix-ui.com', license: 'MIT', desc: '无障碍基础组件' },
  { name: 'Framer Motion', href: 'https://motion.dev', license: 'MIT', desc: '动画引擎' },
  { name: 'Zustand', href: 'https://zustand-demo.pmnd.rs', license: 'MIT', desc: '轻量状态管理' },
  { name: 'Lucide', href: 'https://lucide.dev', license: 'ISC', desc: '图标库' },
  { name: 'Recharts', href: 'https://recharts.org', license: 'MIT', desc: '图表组件' },
  { name: 'libSQL', href: 'https://github.com/tursodatabase/libsql', license: 'MIT', desc: 'SQLite 分支数据库' },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>('getting-started');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return helpSections;
    const q = searchQuery.toLowerCase();
    return helpSections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [searchQuery]);

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-6 max-w-4xl mx-auto">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-primary" />
          帮助文档
        </h1>
        <p className="text-muted-foreground mt-1">
          了解 Swarm 的功能和使用方法
        </p>
      </div>

      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="搜索帮助内容..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* 快捷键速查 */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Keyboard className="w-4 h-4" />
          快捷键
        </h3>
        <div className="flex flex-wrap gap-4">
          {shortcuts.map((s) => (
            <div key={s.desc} className="flex items-center gap-2 text-sm">
              <div className="flex gap-1">
                {s.keys.map((key) => (
                  <kbd
                    key={key}
                    className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded border border-border"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
              <span className="text-muted-foreground">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 帮助内容 */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredSections.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center py-12 text-muted-foreground"
            >
              <HelpCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>未找到相关内容</p>
              <p className="text-xs mt-1">试试其他关键词</p>
            </motion.div>
          )}

          {filteredSections.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedSection === section.id || searchQuery.trim() !== '';

            return (
              <motion.div
                key={section.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedSection(isExpanded && !searchQuery ? null : section.id)
                  }
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-sm">{section.title}</h2>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>
                  <motion.div
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </motion.div>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden border-t border-border"
                    >
                      {section.items.map((item, idx) => {
                        const itemKey = `${section.id}-${idx}`;
                        const isItemExpanded = expandedItem === itemKey || searchQuery.trim() !== '';

                        return (
                          <div key={idx} className="border-b border-border last:border-b-0">
                            <button
                              onClick={() =>
                                setExpandedItem(isItemExpanded && !searchQuery ? null : itemKey)
                              }
                              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
                            >
                              <motion.div
                                animate={{ rotate: isItemExpanded ? 90 : 0 }}
                                transition={{ duration: 0.15 }}
                              >
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              </motion.div>
                              <span className="text-sm font-medium">{item.q}</span>
                            </button>
                            <AnimatePresence initial={false}>
                              {isItemExpanded && (
                                <motion.div
                                  key="answer"
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 pb-3 pl-10">
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                      {item.a}
                                    </p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* 开源致谢 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="p-4 flex items-center gap-2">
          <Heart className="w-4 h-4 text-rose-500" />
          <h2 className="font-semibold text-sm">开源致谢</h2>
        </div>
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground mb-3">
            Swarm 的构建离不开以下优秀的开源项目：
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {openSourceDeps.map((dep) => (
              <a
                key={dep.name}
                href={dep.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-0.5 p-2 rounded-md hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium group-hover:text-primary transition-colors">{dep.name}</span>
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                </div>
                <span className="text-xs text-muted-foreground">{dep.desc}</span>
                <span className="text-[10px] text-muted-foreground/60">{dep.license}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* 许可证 */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-2">许可证</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Swarm 以 MIT 许可证发布。您可以自由使用、修改和分发本软件，但需保留原始版权声明和许可证副本。
          本软件按「原样」提供，不附带任何明示或暗示的保证。详见项目根目录下的 LICENSE 文件。
        </p>
      </div>

      {/* 底部链接 */}
      <div className="text-center text-xs text-muted-foreground py-4">
        <p>
          找不到答案？请查看{' '}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            项目仓库
            <ExternalLink className="w-3 h-3" />
          </a>
          {' '}或联系管理员。
        </p>
      </div>
    </div>
  );
}
