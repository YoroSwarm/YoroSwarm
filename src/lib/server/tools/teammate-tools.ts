import type { ToolDefinition } from '../llm/types'

export const teammateTools: ToolDefinition[] = [
  {
    name: 'write_artifact',
    description: '创建或写入一个工件（文档、代码、分析报告等）。工件会保存在系统中供团队和用户使用。',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: '工件标题',
        },
        content: {
          type: 'string',
          description: '工件的完整内容',
        },
        kind: {
          type: 'string',
          enum: ['document', 'code', 'analysis', 'report', 'spreadsheet', 'outline', 'other'],
          description: '工件类型',
        },
        summary: {
          type: 'string',
          description: '工件的简短摘要',
        },
      },
      required: ['title', 'content', 'kind'],
    },
  },
  {
    name: 'write_file',
    description: '创建一个文件并保存到系统中，用户可以下载。适用于创建代码文件、文档、报告等。',
    input_schema: {
      type: 'object' as const,
      properties: {
        filename: {
          type: 'string',
          description: '文件名（包含扩展名），如 "report.md", "analysis.py", "data.csv"',
        },
        content: {
          type: 'string',
          description: '文件的完整内容',
        },
        mime_type: {
          type: 'string',
          description: '文件MIME类型，如 "text/markdown", "text/plain", "application/json"。如不指定将根据扩展名自动推断。',
        },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'read_file',
    description: '读取一个已上传的文件内容。通过文件ID获取文件信息。',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_id: {
          type: 'string',
          description: '要读取的文件ID',
        },
      },
      required: ['file_id'],
    },
  },
  {
    name: 'report_task_completion',
    description: '向 Lead 汇报任务完成情况。必须在任务完成时调用此工具。',
    input_schema: {
      type: 'object' as const,
      properties: {
        report: {
          type: 'string',
          description: '任务完成的详细报告，包括结果摘要和关键发现',
        },
        result_summary: {
          type: 'string',
          description: '简短的结果摘要（一到两句话）',
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
    description: '向特定队友发送直接消息，用于协作、同步信息或讨论相关任务。',
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
          enum: ['coordination', 'info_share', 'question', 'response'],
          description: '消息类型：coordination=协调工作, info_share=分享信息, question=提问, response=回复',
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
