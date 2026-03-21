'use client';

import Image from 'next/image';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';
import { formatMessageTime } from '@/lib/utils/date';
import { useThemeStore } from '@/stores/themeStore';
import { useLeadPreferencesStore } from '@/stores/leadPreferencesStore';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Check,
  CheckCheck,
  AlertCircle,
  Clock,
  FileText,
  Code,
  Copy,
  Check as CheckIcon,
  MoreHorizontal,
  CornerUpLeft,
  Download,
  Brain,
  Wrench,
  Paperclip,
  X,
  Loader2,
  EyeOff,
} from 'lucide-react';
import type { Message } from '@/types/chat';
import { FilePreviewDialog } from './FilePreviewDialog';

export interface ToolCallRecord {
  toolName: string;
  status: 'calling' | 'completed' | 'error';
  inputSummary?: string;
  resultSummary?: string;
  timestamp: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Format JSON string to readable key-value pairs
function formatJsonReadable(jsonStr: string | undefined): { key: string; value: string }[] | null {
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed !== 'object' || parsed === null) return null;
    
    return Object.entries(parsed).map(([key, value]) => {
      let displayValue: string;
      if (typeof value === 'string') {
        displayValue = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        displayValue = String(value);
      } else if (value === null) {
        displayValue = 'null';
      } else if (Array.isArray(value)) {
        displayValue = `[${value.length} 项]`;
      } else {
        displayValue = '{...}';
      }
      return { key, value: displayValue };
    });
  } catch {
    return null;
  }
}

// Tool-specific formatters
interface ToolInputDisplay {
  icon: string;
  title: string;
  fields: { label: string; value: string; truncate?: boolean }[];
}

function formatToolInput(toolName: string, inputJson: string | undefined): ToolInputDisplay | null {
  if (!inputJson) return null;
  try {
    const input = JSON.parse(inputJson);
    switch (toolName) {
      case 'reply_to_user':
        return {
          icon: '💬',
          title: '回复用户',
          fields: [{ label: '内容', value: input.content, truncate: true }],
        };
      case 'provision_teammate':
        return {
          icon: '👤',
          title: '创建队友',
          fields: [
            { label: '名称', value: input.name },
            { label: '角色', value: input.role },
            ...(input.description ? [{ label: '描述', value: input.description, truncate: true }] : []),
            ...(input.capabilities?.length ? [{ label: '能力', value: input.capabilities.join(', ') }] : []),
          ],
        };
      case 'decompose_task':
        const taskCount = input.tasks?.length || 0;
        const taskFields: { label: string; value: string; truncate?: boolean }[] = [{ label: '任务数', value: `${taskCount} 个子任务` }];
        // Add each task title as a separate field for better visibility
        if (input.tasks && Array.isArray(input.tasks)) {
          input.tasks.forEach((task: { title?: string; description?: string }, index: number) => {
            taskFields.push({
              label: `${index + 1}.`,
              value: task.title || '未命名任务',
              truncate: true,
            });
          });
        }
        return {
          icon: '📋',
          title: '分解任务',
          fields: taskFields,
        };
      case 'assign_task':
        return {
          icon: '📤',
          title: '分配任务',
          fields: [
            { label: '任务', value: input.task_id },
            { label: '分配给', value: input.teammate_id },
          ],
        };
      case 'send_message_to_teammate':
        return {
          icon: '✉️',
          title: '发送消息',
          fields: [
            { label: '接收者', value: input.teammate_id },
            { label: '内容', value: input.content, truncate: true },
          ],
        };
      case 'list_workspace_files':
        return {
          icon: '📂',
          title: '列出工作区',
          fields: [
            { label: '目录', value: input.directory_path || '/' },
            { label: '递归', value: input.recursive ? '是' : '否' },
          ],
        };
      case 'create_workspace_directory':
        return {
          icon: '📁',
          title: '新建目录',
          fields: [{ label: '路径', value: input.path }],
        };
      case 'create_workspace_file':
        return {
          icon: '📄',
          title: '新建文件',
          fields: [
            { label: '路径', value: input.path },
            ...(input.mime_type ? [{ label: '类型', value: input.mime_type }] : []),
          ],
        };
      case 'replace_workspace_file':
        return {
          icon: '📝',
          title: '替换文件',
          fields: [
            { label: '路径', value: input.path },
            ...(input.mime_type ? [{ label: '类型', value: input.mime_type }] : []),
          ],
        };
      case 'replace_in_file': {
        const repls = Array.isArray(input.replacements) ? input.replacements : [];
        const previewFields: { label: string; value: string; truncate?: boolean }[] = [
          { label: '路径', value: input.path },
          { label: '替换数', value: `${repls.length} 处` },
        ];
        for (let i = 0; i < Math.min(repls.length, 3); i++) {
          const r = repls[i] as Record<string, unknown>;
          const oldStr = String(r.old_str || '').slice(0, 40);
          const newStr = String(r.new_str || '').slice(0, 40);
          previewFields.push({ label: `#${i + 1}`, value: `${oldStr || '(开头插入)'} → ${newStr || '(删除)'}`, truncate: true });
        }
        if (repls.length > 3) {
          previewFields.push({ label: '...', value: `还有 ${repls.length - 3} 处替换` });
        }
        return { icon: '✏️', title: '文件内替换', fields: previewFields };
      }
      case 'read_workspace_file':
        return {
          icon: '📖',
          title: '读取文件',
          fields: [{ label: '路径', value: input.path }],
        };
      case 'report_task_completion':
        return {
          icon: '✅',
          title: '报告完成',
          fields: [
            ...(input.result_summary ? [{ label: '摘要', value: input.result_summary }] : []),
            ...(input.report ? [{ label: '报告', value: input.report, truncate: true }] : []),
          ],
        };
      case 'send_message_to_lead':
        return {
          icon: '📨',
          title: '消息 Lead',
          fields: [
            { label: '类型', value: input.message_type },
            { label: '内容', value: input.content, truncate: true },
          ],
        };
      case 'update_self_todo': {
        const action = input.action || input.operation as string || 'unknown';
        const actionLabels: Record<string, string> = {
          add: '添加', insert: '插入', delete: '删除', update: '更新', clear: '清空',
        };
        const fields: { label: string; value: string; truncate?: boolean }[] = [
          { label: '操作', value: actionLabels[action] || action },
        ];
        if (input.item && typeof input.item === 'object') {
          const item = input.item as Record<string, unknown>;
          if (item.title) fields.push({ label: '标题', value: String(item.title), truncate: true });
          if (item.status) fields.push({ label: '状态', value: String(item.status) });
          if (item.category) fields.push({ label: '分类', value: String(item.category) });
        } else if (input.item) {
          fields.push({ label: '内容', value: String(input.item), truncate: true });
        }
        if (input.item_id) fields.push({ label: 'ID', value: String(input.item_id) });
        if (input.index !== undefined) fields.push({ label: '位置', value: `#${Number(input.index) + 1}` });
        if (input.new_item) fields.push({ label: '新内容', value: String(input.new_item), truncate: true });
        if (input.status) fields.push({ label: '新状态', value: String(input.status) });
        return { icon: '📝', title: '更新待办', fields };
      }
      case 'verify_result':
        return {
          icon: '🔍',
          title: '验证结果',
          fields: [
            { label: '任务', value: input.task_id as string },
            { label: '方式', value: input.verification_type === 'cross_validate' ? '交叉验证' : (input.verification_type as string || '验证') },
            ...(input.focus_areas?.length ? [{ label: '重点', value: (input.focus_areas as string[]).join(', '), truncate: true }] : []),
          ],
        };
      case 'save_progress':
        return {
          icon: '💾',
          title: '保存进度',
          fields: [
            ...(input.summary ? [{ label: '摘要', value: input.summary as string, truncate: true }] : []),
          ],
        };
      case 'resume_work':
        return {
          icon: '▶️',
          title: '恢复工作',
          fields: [
            ...(input.snapshot_id ? [{ label: '快照', value: input.snapshot_id as string }] : []),
          ],
        };
      case 'broadcast_to_team':
        return {
          icon: '📢',
          title: '团队广播',
          fields: [
            { label: '内容', value: input.content as string, truncate: true },
          ],
        };
      case 'get_team_roster':
        return {
          icon: '👥',
          title: '获取团队',
          fields: [],
        };
      case 'assign_skill_to_teammate':
        return {
          icon: '🧩',
          title: '分配技能',
          fields: [
            { label: '队友', value: input.teammate_id as string },
            { label: '技能', value: input.skill_name as string },
          ],
        };
      case 'shell_exec':
        return {
          icon: '⚡',
          title: '执行命令',
          fields: [
            { label: '命令', value: input.command as string, truncate: false },
            { label: '说明', value: input.description as string, truncate: true },
            ...(input.working_dir ? [{ label: '目录', value: input.working_dir as string, truncate: true }] : []),
            ...(input.timeout ? [{ label: '超时', value: `${input.timeout}秒` }] : []),
          ],
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// Get readable tool name for badge display
function getToolDisplayName(toolName: string | undefined): string {
  if (!toolName) return '工具';
  const nameMap: Record<string, string> = {
    'reply_to_user': '回复用户',
    'provision_teammate': '创建队友',
    'decompose_task': '分解任务',
    'assign_task': '分配任务',
    'send_message_to_teammate': '发送消息',
    'send_message_to_lead': '消息 Lead',
    'list_workspace_files': '列出工作区',
    'create_workspace_directory': '新建目录',
    'create_workspace_file': '新建文件',
    'replace_workspace_file': '替换文件',
    'replace_in_file': '文件内替换',
    'shell_exec': '执行命令',
    'read_workspace_file': '读取文件',
    'report_task_completion': '报告完成',
    'update_self_todo': '更新待办',
    'verify_result': '验证结果',
    'save_progress': '保存进度',
    'resume_work': '恢复工作',
    'broadcast_to_team': '团队广播',
    'get_team_roster': '获取团队',
    'assign_skill_to_teammate': '分配技能',
  };
  return nameMap[toolName] || toolName;
}

interface ToolOutputField {
  label: string;
  value: string;
  isLong?: boolean;
}

interface ToolOutputDisplay {
  type: 'text' | 'code' | 'list' | 'error' | 'success' | 'fields';
  content: string;
  items?: string[];
  fields?: ToolOutputField[];
  language?: string;
}

function formatToolOutput(toolName: string, output: string | undefined): ToolOutputDisplay | null {
  if (!output) return null;
  
  // Check if it's an error
  if (output.includes('失败') || output.includes('error') || output.includes('Error')) {
    return { type: 'error', content: output };
  }
  
  // Try to parse as JSON for structured formatting
  let parsedOutput: Record<string, unknown> | null = null;
  try {
    parsedOutput = JSON.parse(output);
  } catch {
    parsedOutput = null;
  }
  
  // Check if it's a success confirmation (for text output)
  if (!parsedOutput && (output.includes('成功') || output.includes('已创建') || output.includes('已完成'))) {
    return { type: 'success', content: output };
  }
  
  // Tool-specific formatting
  switch (toolName) {
    case 'provision_teammate':
      if (parsedOutput) {
        const fields: ToolOutputField[] = [
          { label: 'ID', value: String(parsedOutput.teammate_id || parsedOutput.id || '-') },
          { label: '名称', value: String(parsedOutput.name || '-') },
          { label: '角色', value: String(parsedOutput.role || '-') },
          { label: '状态', value: String(parsedOutput.status || '-') },
        ];
        return { type: 'fields', content: output, fields };
      }
      return { type: 'success', content: output };
      
    case 'decompose_task':
      if (parsedOutput && Array.isArray(parsedOutput.tasks)) {
        return { 
          type: 'list', 
          content: output,
          items: parsedOutput.tasks.map((t: { title?: string }) => t.title || '未命名任务')
        };
      }
      return { type: 'text', content: output };
      
    case 'assign_task':
      if (parsedOutput) {
        const fields: ToolOutputField[] = [
          { label: '任务', value: String(parsedOutput.taskId || parsedOutput.task_id || '-') },
          { label: '分配给', value: String(parsedOutput.assignee || parsedOutput.assigneeId || parsedOutput.assignee_id || '-') },
          { label: '状态', value: String(parsedOutput.status || '已分配') },
        ];
        return { type: 'fields', content: output, fields };
      }
      return { type: 'success', content: output };
      
    case 'create_workspace_directory':
      if (parsedOutput) {
        const fields: ToolOutputField[] = [
          { label: '路径', value: String(parsedOutput.path || '-') },
          { label: '类型', value: 'directory' },
        ];
        return { type: 'fields', content: output, fields };
      }
      return { type: 'success', content: output };

    case 'create_workspace_file':
    case 'replace_workspace_file':
      if (parsedOutput) {
        const fields: ToolOutputField[] = [
          { label: '文件ID', value: String(parsedOutput.file_id || parsedOutput.id || '-') },
          { label: '路径', value: String(parsedOutput.path || '-') },
          { label: '大小', value: String(parsedOutput.size ? `${parsedOutput.size} 字节` : '-') },
          { label: '操作', value: String(parsedOutput.operation || '-') },
        ];
        return { type: 'fields', content: output, fields };
      }
      return { type: 'success', content: output };

    case 'list_workspace_files':
      if (parsedOutput && Array.isArray(parsedOutput.entries)) {
        return {
          type: 'list',
          content: output,
          items: parsedOutput.entries.map((entry: { path?: string; type?: string }) => `${entry.type === 'directory' ? '📁' : '📄'} ${entry.path || '-'}`),
        };
      }
      return { type: 'text', content: output };

    case 'read_workspace_file':
      return { type: 'code', content: output, language: 'text' };
      
    case 'reply_to_user':
    case 'send_message_to_teammate':
    case 'send_message_to_lead':
      return { type: 'text', content: output };

    case 'assign_skill_to_teammate':
      if (parsedOutput) {
        const fields: ToolOutputField[] = [
          { label: '队友', value: String(parsedOutput.teammate_id || parsedOutput.agentId || '-') },
          { label: '技能', value: String(parsedOutput.skill_name || parsedOutput.skillName || '-') },
          { label: '状态', value: String(parsedOutput.status || '已分配') },
        ];
        return { type: 'fields', content: output, fields };
      }
      return { type: 'success', content: output };
      
    case 'report_task_completion':
      return { type: 'success', content: output };
      
    default:
      // For unknown tools, try to format JSON as fields
      if (parsedOutput && typeof parsedOutput === 'object') {
        const fields: ToolOutputField[] = Object.entries(parsedOutput).map(([key, value]) => ({
          label: key,
          value: typeof value === 'string' ? value : JSON.stringify(value),
          isLong: typeof value === 'string' && value.length > 50,
        }));
        return { type: 'fields', content: output, fields };
      }
      return { type: 'text', content: output };
  }
}

interface MessageItemProps {
  message: Message;
  showAvatar: boolean;
  isConsecutive: boolean;
  showTime?: boolean;
  isLead?: boolean;
}

export function MessageItem({
  message,
  showAvatar,
  isConsecutive,
  showTime = true,
  isLead = true,
}: MessageItemProps) {
  const { resolvedTheme } = useThemeStore();
  const { leadNickname, leadAvatarUrl } = useLeadPreferencesStore();
  const isUser = message.sender.type === 'user';
  const isSystem = message.sender.type === 'system';
  const isAgent = message.sender.type === 'agent';

  // Use custom Lead display name/avatar if configured
  const displayName = (isAgent && isLead && leadNickname) ? leadNickname : message.sender.name;
  const displayAvatar = (isAgent && isLead && leadAvatarUrl) ? leadAvatarUrl : message.sender.avatar;
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const [previewFile, setPreviewFile] = useState<{
    url: string;
    name: string;
    mimeType?: string;
    size?: number;
  } | null>(null);
  const primaryAttachment = message.attachments?.[0];
  const attachmentUrl = primaryAttachment?.url || message.content;

  // Activity type messages (thinking, tool_call, tool_result)
  const activityType = message.metadata?.activityType;
  const isActivityMessage = activityType === 'thinking' || activityType === 'tool_call' || activityType === 'tool_result';

  // For tool_call activity, get tool call data
  const toolCalls = message.toolCalls && message.toolCalls.length > 0 ? message.toolCalls : undefined;

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderStatus = () => {
    switch (message.status) {
      case 'sending':
        return <Clock className="h-3 w-3 text-muted-foreground animate-pulse" />;
      case 'sent':
        return <Check className="h-3 w-3 text-muted-foreground" />;
      case 'received':
        return <CheckCheck className="h-3 w-3 text-primary" />;
      case 'error':
        return <AlertCircle className="h-3 w-3 text-destructive" />;
      default:
        return null;
    }
  };

  const renderContent = () => {
    switch (message.type) {
      case 'code':
        return (
          <div className="relative group/code">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/80 rounded-t-lg border-b border-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Code className="h-3.5 w-3.5" />
                <span className="capitalize">
                  {message.metadata?.codeLanguage || 'code'}
                </span>
              </div>
              <button
                onClick={() => handleCopy(message.content)}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent active:bg-accent/80 transition-colors"
              >
                {copied ? (
                  <>
                    <CheckIcon className="h-3 w-3" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    复制
                  </>
                )}
              </button>
            </div>
            <div className="overflow-x-auto">
              <SyntaxHighlighter
                language={message.metadata?.codeLanguage || 'typescript'}
                style={resolvedTheme === 'dark' ? vscDarkPlus : vs}
                customStyle={{
                  margin: 0,
                  borderRadius: '0 0 0.5rem 0.5rem',
                  fontSize: '0.875rem',
                }}
              >
                {message.content}
              </SyntaxHighlighter>
            </div>
          </div>
        );

      case 'image':
        return (
          <div className="relative group/image">
            <Image
              src={attachmentUrl}
              alt="图片消息"
              width={800}
              height={600}
              className="max-w-full max-h-80 rounded-lg object-contain cursor-pointer hover:opacity-95 transition-opacity"
              onClick={() => setPreviewFile({
                url: attachmentUrl,
                name: primaryAttachment?.name || '图片',
                mimeType: primaryAttachment?.mimeType || 'image/png',
                size: primaryAttachment?.size,
              })}
            />
          </div>
        );

      case 'file': {
        const fileUrl = primaryAttachment?.url || message.metadata?.url;
        const fileName = primaryAttachment?.name || message.metadata?.fileName || '文件';
        const fileSize = primaryAttachment?.size || message.metadata?.size;
        const fileMimeType = (primaryAttachment?.mimeType as string) || (message.metadata?.mimeType as string) || '';
        const isImageFile = fileMimeType.startsWith('image/');

        if (isImageFile && fileUrl) {
          return (
            <div className="relative group/image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl as string}
                alt={fileName as string}
                className="max-w-full max-h-80 rounded-lg object-contain cursor-pointer hover:opacity-95 transition-opacity"
                onClick={() => setPreviewFile({
                  url: fileUrl as string,
                  name: fileName as string,
                  mimeType: fileMimeType,
                  size: fileSize as number | undefined,
                })}
              />
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{fileName as string}</span>
                {fileSize && <span>({formatFileSize(fileSize as number)})</span>}
              </div>
            </div>
          );
        }

        return (
          <div
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg max-w-sm cursor-pointer transition-colors",
              isUser ? "bg-primary/20 hover:bg-primary/30" : "bg-muted hover:bg-accent"
            )}
            onClick={() => fileUrl && setPreviewFile({
              url: fileUrl as string,
              name: fileName as string,
              mimeType: fileMimeType,
              size: fileSize as number | undefined,
            })}
          >
            <div className={cn("flex h-10 w-10 items-center justify-center rounded", isUser ? "bg-primary/20" : "bg-primary/10")}>
              <FileText className={cn("h-5 w-5", isUser ? "text-primary-foreground" : "text-primary")} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium truncate", isUser ? "text-primary-foreground" : "text-foreground")}>{fileName as string}</p>
              <p className={cn("text-xs", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {fileSize ? formatFileSize(fileSize as number) : '点击预览'}
              </p>
            </div>
            {fileUrl && (
              <a
                href={`${fileUrl}?download=1`}
                download={fileName as string}
                className={cn("p-2 rounded transition-colors", isUser ? "hover:bg-primary-foreground/20 active:bg-primary-foreground/30 text-primary-foreground" : "hover:bg-accent active:bg-accent/80")}
                title="下载文件"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="h-4 w-4" />
              </a>
            )}
          </div>
        );
      }

      case 'system':
        return (
          <div className="flex items-center justify-center py-2">
            <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
              {message.content}
            </span>
          </div>
        );

      default:
        // Compact badge-style rendering for activity type messages
        if (isActivityMessage) {
          return null; // Activity messages are rendered as badges outside renderContent
        }

        return (
          <div className="text-sm leading-relaxed max-w-full overflow-hidden wrap-break-wordword">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ _node, inline, className, children, ...props }: { _node?: unknown; inline?: boolean; className?: string; children?: React.ReactNode }) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <div className="overflow-x-auto rounded-lg my-2 border border-border/50 shadow-sm">
                      <SyntaxHighlighter
                        style={resolvedTheme === 'dark' ? vscDarkPlus : vs}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          fontSize: '0.875rem',
                        }}
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    </div>
                  ) : (
                    <code className={cn("bg-muted px-1 py-0.5 rounded font-mono text-xs", className)} {...props}>
                      {children}
                    </code>
                  );
                },
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.attachments.map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => setPreviewFile({
                      url: att.url,
                      name: att.name,
                      mimeType: att.mimeType,
                      size: att.size,
                    })}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer",
                      isUser
                        ? "bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground"
                        : "bg-muted hover:bg-accent text-foreground"
                    )}
                    title={`预览 ${att.name}`}
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate max-w-37.5">{att.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
    }
  };

  if (isSystem) {
    return (
      <div className="flex items-center justify-center py-2 animate-fade-in">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  // Compact badge-style rendering for activity messages (thinking, tool_call, tool_result)
  if (isActivityMessage) {
    const isThinking = activityType === 'thinking';
    const isToolCall = activityType === 'tool_call';
    const hasResult = message.metadata?.hasResult;
    const isError = message.metadata?.isError;
    const tc = toolCalls?.[0];

    const hasExpandableContent = (isThinking && message.content) || (isToolCall && tc && (tc.inputSummary || tc.resultSummary));

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/60 bg-muted/30 px-2 py-0.5 rounded-lg border border-border/30 shadow-sm hover:bg-muted/60 hover:text-muted-foreground hover:border-border/50 active:bg-muted/80 transition-all cursor-pointer"
          >
            <span className="font-medium text-foreground/60 hover:text-foreground transition-colors">{displayName}</span>

            {isThinking ? (
              <span className="inline-flex items-center gap-1 text-purple-600/60">
                <Brain className="h-3 w-3" />
              </span>
            ) : isToolCall ? (
              <span className={cn(
                "inline-flex items-center gap-1 opacity-60",
                hasResult
                  ? isError ? "text-red-600" : "text-green-600"
                  : "text-amber-600"
              )}>
                {hasResult ? (
                  isError ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                <Wrench className="h-3 w-3" />
                <span>{getToolDisplayName(tc?.toolName)}</span>
              </span>
            ) : null}
          </button>
        </PopoverTrigger>

        {hasExpandableContent && (
          <PopoverContent align="start" side="bottom" className="w-auto max-w-md p-0">
            {/* Model provider badge */}
            {message.metadata?.model && (
              <div className="px-2.5 pt-2 pb-0">
                <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground/70">
                  {message.metadata.model}
                </span>
              </div>
            )}

            {isThinking && (
              <div className="p-2.5 text-xs text-muted-foreground max-h-48 overflow-y-auto">
                <div className="pl-2 border-l-2 border-purple-500/30 italic">
                  {message.content}
                </div>
              </div>
            )}

            {isToolCall && tc && (
              <div className="p-2.5 text-xs space-y-2.5 max-h-64 overflow-y-auto">
                {tc.inputSummary && (
                  <div>
                    {(() => {
                      const toolDisplay = formatToolInput(tc.toolName, tc.inputSummary);
                      if (toolDisplay) {
                        return (
                          <>
                            <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-medium uppercase tracking-wider">
                              <span>{toolDisplay.icon}</span>
                              <span>{toolDisplay.title}</span>
                            </div>
                            <div className="mt-1.5 space-y-1">
                              {toolDisplay.fields.map(({ label, value, truncate }) => (
                                <div key={label} className="flex gap-2 items-start">
                                  <span className="text-muted-foreground/50 shrink-0 min-w-12">{label}</span>
                                  <span className={cn("text-foreground", truncate && "truncate max-w-50")}>{typeof value === 'object' ? JSON.stringify(value) : value}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      }
                      const formatted = formatJsonReadable(tc.inputSummary);
                      if (formatted) {
                        return (
                          <>
                            <span className="text-amber-600 font-medium text-[10px] uppercase tracking-wider">输入</span>
                            <div className="mt-1 space-y-0.5">
                              {formatted.map(({ key, value }) => (
                                <div key={key} className="flex gap-2">
                                  <span className="text-muted-foreground/60 shrink-0">{key}:</span>
                                  <span className="text-foreground truncate">{value}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      }
                      return <div className="text-muted-foreground">{tc.inputSummary}</div>;
                    })()}
                  </div>
                )}
                {tc.resultSummary && (
                  <div className={cn("border-t border-border/30 pt-2", !tc.inputSummary && "border-t-0 pt-0")}>
                    {(() => {
                      const outputDisplay = formatToolOutput(tc.toolName, tc.resultSummary);
                      if (outputDisplay) {
                        const colorClass = outputDisplay.type === 'error' 
                          ? 'text-red-600' 
                          : outputDisplay.type === 'success' 
                            ? 'text-green-600' 
                            : isError ? 'text-red-600' : 'text-green-600';
                        
                        return (
                          <>
                            <span className={cn("font-medium text-[10px] uppercase tracking-wider", colorClass)}>
                              {outputDisplay.type === 'error' ? '❌ 错误' : outputDisplay.type === 'success' ? '✅ 成功' : '📤 输出'}
                            </span>
                            {outputDisplay.type === 'list' && outputDisplay.items ? (
                              <ul className="mt-1.5 space-y-0.5">
                                {outputDisplay.items.map((item, i) => (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <span className="text-muted-foreground/50">•</span>
                                    <span className="text-muted-foreground">{item}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : outputDisplay.type === 'fields' && outputDisplay.fields ? (
                              <div className="mt-1.5 space-y-1">
                                {outputDisplay.fields.map(({ label, value, isLong }) => (
                                  <div key={label} className="flex gap-2 items-start">
                                    <span className="text-muted-foreground/50 shrink-0 min-w-12">{label}</span>
                                    <span className={cn("text-foreground", isLong && "wrap-break-word")}>{value}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className={cn(
                                "mt-1.5 wrap-break-word",
                                outputDisplay.type === 'code' && "bg-background/50 rounded px-2 py-1.5 font-mono text-[10px] whitespace-pre-wrap"
                              )}>
                                {outputDisplay.content}
                              </div>
                            )}
                          </>
                        );
                      }
                      return (
                        <>
                          <span className={cn("font-medium text-[10px] uppercase tracking-wider", isError ? "text-red-600" : "text-green-600")}>
                            {isError ? '❌ 错误' : '✅ 输出'}
                          </span>
                          <div className="text-muted-foreground mt-1.5 wrap-break-word">{typeof tc.resultSummary === 'object' ? JSON.stringify(tc.resultSummary) : tc.resultSummary}</div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </PopoverContent>
        )}
      </Popover>
    );
  }

  // Hide non-Lead agent messages (internal messages)
  if (isAgent && !isLead && !isSystem) {
    return null;
  }

  return (
    <>
    <div
      className={cn(
        'group flex gap-3 animate-slide-up',
        isUser ? 'flex-row-reverse' : 'flex-row',
        isConsecutive && 'mt-1'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {showAvatar ? (
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground'
          )}
        >
          {displayAvatar ? (
            <Image
              src={displayAvatar}
              alt={displayName}
              width={32}
              height={32}
              className="h-full w-full rounded-full object-cover"
            />
          ) : isUser ? (
            displayName.charAt(0).toUpperCase()
          ) : (
            <Image
              src="/icon.svg"
              alt="Swarm"
              width={20}
              height={20}
              className="opacity-70"
            />
          )}
        </div>
      ) : (
        <div className="w-8 shrink-0" />
      )}

      <div
        className={cn(
          'flex max-w-[85%] md:max-w-[70%] flex-col',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {showAvatar && !isUser && (
          <span className="mb-1 text-xs text-muted-foreground flex items-center gap-1.5">
            {isAgent && isLead && leadNickname ? leadNickname : 'Swarm'}
            {isAgent && !isLead && (
              <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground/70">
                Teammate
              </span>
            )}
            {message.metadata?.model && (
              <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground/70">
                {message.metadata.model}
              </span>
            )}
          </span>
        )}

        <div
          className={cn(
            'relative px-4 py-2.5 border shadow-sm',
            isUser
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-foreground border-border',
            message.type === 'code' && 'p-0 overflow-hidden bg-muted border-border',
            message.type === 'image' && 'p-1 bg-card border-border',
            message.type === 'file' && 'p-2',
          )}
          style={{
            borderRadius: "12px",
          }}
        >
          <div>
            {renderContent()}
          </div>
        </div>

        {(showTime || isUser) && (
          <div
            className={cn(
              'mt-1 flex items-center gap-1.5 text-xs text-muted-foreground',
              isUser ? 'flex-row-reverse' : 'flex-row'
            )}
          >
            {showTime && <span>{formatMessageTime(message.createdAt)}</span>}
            {isUser && renderStatus()}
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex items-center gap-1 opacity-0 transition-opacity',
          showActions && 'opacity-100'
        )}
      >
        <button
          className="p-1.5 rounded-full hover:bg-accent active:bg-accent/80 transition-colors"
          title="回复"
        >
          <CornerUpLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          className="p-1.5 rounded-full hover:bg-accent active:bg-accent/80 transition-colors"
          title="更多"
        >
          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
    {previewFile && (
      <FilePreviewDialog
        open={!!previewFile}
        onOpenChange={(open) => { if (!open) setPreviewFile(null); }}
        fileUrl={previewFile.url}
        fileName={previewFile.name}
        mimeType={previewFile.mimeType}
        fileSize={previewFile.size}
      />
    )}
    </>
  );
}
