import type { ToolDefinition } from '../llm/types'

export const leadTools: ToolDefinition[] = [
  {
    name: 'reply_to_user',
    description: '回复用户消息。当你准备好回应用户时使用此工具。这是你与用户沟通的唯一方式。',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: '回复给用户的消息内容',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'provision_teammate',
    description: '创建一个新的团队成员（Agent）。根据当前任务需要，创建具有特定角色和能力的队友。',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: '队友名称，应反映其角色（如 "研究员小明"、"文档编写者"）',
        },
        role: {
          type: 'string',
          description: '队友角色（如 researcher, writer, analyst, engineer, specialist）',
        },
        description: {
          type: 'string',
          description: '队友的职责描述',
        },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description: '队友具备的能力列表',
        },
      },
      required: ['name', 'role'],
    },
  },
  {
    name: 'decompose_task',
    description: '将工作拆解为多个子任务。每个任务会被添加到共享任务列表中。',
    input_schema: {
      type: 'object' as const,
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '任务标题' },
              description: { type: 'string', description: '任务的详细描述，越详细越好' },
              priority: { type: 'number', description: '优先级 1-4（1=低, 2=中, 3=高, 4=紧急）' },
              parentId: { type: 'string', description: '父任务ID（如有依赖关系）' },
            },
            required: ['title', 'description'],
          },
          description: '要创建的任务列表',
        },
      },
      required: ['tasks'],
    },
  },
  {
    name: 'assign_task',
    description: '将一个任务分配给一个队友。分配后队友会立即开始执行该任务。',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: {
          type: 'string',
          description: '要分配的任务ID',
        },
        teammate_id: {
          type: 'string',
          description: '要分配给的队友ID',
        },
      },
      required: ['task_id', 'teammate_id'],
    },
  },
  {
    name: 'send_message_to_teammate',
    description: '向队友发送内部消息，用于协调工作或提供额外指导。',
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
      },
      required: ['teammate_id', 'content'],
    },
  },
]
