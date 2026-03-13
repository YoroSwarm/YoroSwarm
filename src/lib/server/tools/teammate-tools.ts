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
    description: '向 Lead 发送消息，用于汇报进展、请求澄清、或请求额外资源。',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: '消息内容',
        },
        message_type: {
          type: 'string',
          enum: ['progress_update', 'question', 'resource_request', 'issue_report'],
          description: '消息类型',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'update_task_progress',
    description: '更新当前任务的执行进度。',
    input_schema: {
      type: 'object' as const,
      properties: {
        progress_description: {
          type: 'string',
          description: '当前进度描述',
        },
      },
      required: ['progress_description'],
    },
  },
]
