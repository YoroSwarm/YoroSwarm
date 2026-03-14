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
    description: '创建一个新的团队成员（Agent）。根据当前任务需要，创建具有特定角色和能力的队友。面对可并行的多方面工作时，应创建多个合适队友分担，而不是默认只用一个队友串行完成全部维度。',
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
    description: '将工作拆解为多个子任务。每个任务会被添加到共享任务列表中。面对主题/人物/叙事/背景等天然可并行维度时，应拆成多个并行任务。优先使用 dependsOnTaskTitles / dependsOnTaskIds 明确依赖关系；不要依赖系统猜测。为避免非法外键，不要编造新的 parentId；只有在引用已存在任务ID时才传 parentId。若要表达同批次层级关系，可传 parentTitle。',
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
              parentId: { type: 'string', description: '仅当父任务已经存在于数据库时才填写其真实任务ID' },
              parentTitle: { type: 'string', description: '同批次任务的父任务标题；优先使用此字段表达层级关系' },
              dependsOnTaskIds: { type: 'array', items: { type: 'string' }, description: '该任务显式依赖的已存在任务ID列表' },
              dependsOnTaskTitles: { type: 'array', items: { type: 'string' }, description: '该任务显式依赖的任务标题列表；优先用于同批次任务依赖' },
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
    description: '将一个任务分配给一个队友。teammate_id 必须使用上下文中展示的真实队友 ID，不要编造序号、别名或占位符。分配后任务会进入调度系统，若队友忙碌则进入队列。',
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
    description: '向队友发送内部消息，用于协调工作或提供额外指导。teammate_id 必须使用上下文中展示的真实队友 ID，若只知道名字，也必须使用上下文里显示的精确名字。不要使用 41、81、teammate_0 这类编造引用。所有任务完成后，不要发送仅用于礼貌确认或收尾致谢的消息。',
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
