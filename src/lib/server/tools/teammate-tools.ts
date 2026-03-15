import type { ToolDefinition } from '../llm/types'

export const teammateTools: ToolDefinition[] = [
  {
    name: 'list_workspace_files',
    description: '列出当前会话工作区中的文件和目录。可按目录查看，也可递归列出整个工作区。',
    input_schema: {
      type: 'object' as const,
      properties: {
        directory_path: {
          type: 'string',
          description: '要查看的目录，相对工作区根目录；留空表示根目录',
        },
        recursive: {
          type: 'boolean',
          description: '是否递归列出子目录中的全部文件',
        },
      },
      required: [],
    },
  },
  {
    name: 'read_workspace_file',
    description: '读取当前会话工作区中的文件内容，使用相对路径而不是文件ID。',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: '文件相对路径，例如 "reports/emma-analysis.md"',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_workspace_directory',
    description: '在当前会话工作区中创建真实目录。目录将直接创建在文件系统中，后续可供文件写入和 shell 使用。',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: '要创建的目录相对路径，例如 "reports/week1"',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_workspace_file',
    description: '在当前会话工作区中新建文件；如目录不存在会自动创建。若文件已存在则报错。',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: '新文件的相对路径，例如 "notes/outline.md"',
        },
        content: {
          type: 'string',
          description: '文件完整内容',
        },
        mime_type: {
          type: 'string',
          description: 'MIME 类型；不传则根据扩展名推断',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'replace_workspace_file',
    description: '替换当前会话工作区中已有文件的内容。目标文件必须已存在。',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: '要替换的文件相对路径',
        },
        content: {
          type: 'string',
          description: '新的完整文件内容',
        },
        mime_type: {
          type: 'string',
          description: 'MIME 类型；不传则沿用现有类型或根据扩展名推断',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'report_task_completion',
    description: '向 Lead 汇报任务完成情况。只有在任务目标已经真正达成时才能调用；未调用该工具，系统会视为任务仍未完成。',
    input_schema: {
      type: 'object' as const,
      properties: {
        report: {
          type: 'string',
          description: '任务完成的详细报告，包括交付结果、关键发现、验证结论或后续使用说明',
        },
        result_summary: {
          type: 'string',
          description: '简短的结果摘要（一到两句话），便于 Lead 快速判断是否可以进入下一阶段',
        },
      },
      required: ['report'],
    },
  },
  {
    name: 'send_message_to_lead',
    description: '向 Lead 发送消息，仅在遇到阻碍、需要澄清或需要额外资源时使用。不要用于普通的进度汇报。',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: '消息内容',
        },
        message_type: {
          type: 'string',
          enum: ['blocking_issue', 'clarification_request', 'resource_request', 'critical_update'],
          description: '消息类型：blocking_issue=遇到阻碍无法继续, clarification_request=需要澄清, resource_request=需要额外资源, critical_update=重要更新',
        },
      },
      required: ['content', 'message_type'],
    },
  },
  {
    name: 'send_message_to_teammate',
    description: '向特定队友发送直接消息，用于协作、同步信息、讨论相关任务，或发送 execution control 指令。',
    input_schema: {
      type: 'object' as const,
      properties: {
        teammate_id: {
          type: 'string',
          description: '接收消息的队友ID',
        },
        content: {
          type: 'string',
          description: '消息内容',
        },
        message_type: {
          type: 'string',
          enum: ['coordination', 'info_share', 'question', 'response', 'pause_execution', 'resume_execution', 'cancel_execution', 'supersede_execution'],
          description: '消息类型：coordination=协调工作, info_share=分享信息, question=提问, response=回复，也可发送 execution control 指令',
        },
      },
      required: ['teammate_id', 'content', 'message_type'],
    },
  },
  {
    name: 'broadcast_to_team',
    description: '向所有团队成员广播消息，用于分享重要信息、发现或资源。',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: '广播消息内容',
        },
        message_type: {
          type: 'string',
          enum: ['info', 'discovery', 'resource', 'warning'],
          description: '消息类型：info=信息分享, discovery=重要发现, resource=共享资源, warning=警告',
        },
      },
      required: ['content', 'message_type'],
    },
  },
  {
    name: 'get_team_roster',
    description: '获取当前团队成员列表，查看所有队友的信息和状态。',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
]
