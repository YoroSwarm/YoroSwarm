import type { ToolDefinition } from '../llm/types'

// Lead的workspace工具
export const leadWorkspaceTools: ToolDefinition[] = [
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
          description: '文件相对路径，例如 "reports/analysis.md"',
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
    name: 'shell_exec',
    description: '执行终端命令。此工具需要用户审批后才能执行。命令将在工作区目录中执行。适用于需要执行系统命令、运行脚本、操作文件等场景。执行前请向用户说明命令的用途和预期结果。',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: '要执行的命令（如 ls -la, npm install, git status 等）',
        },
        description: {
          type: 'string',
          description: '向用户说明该命令的用途和预期结果，帮助用户做出审批决定',
        },
        working_dir: {
          type: 'string',
          description: '可选。指定工作目录。默认为工作区根目录。可以使用相对路径或绝对路径。',
        },
        timeout: {
          type: 'number',
          description: '可选。超时时间（秒）。默认30秒，最长300秒（5分钟）。对于可能长时间运行的命令，请设置适当的超时时间。注意：超时时间从审批通过后开始计算。',
        },
      },
      required: ['command', 'description'],
    },
  },
]

export const leadTools: ToolDefinition[] = [
  ...leadWorkspaceTools,
  {
    name: 'reply_to_user',
    description: '回复用户消息。当你准备好回应用户时使用此工具。这是你与用户沟通的唯一方式。可以附带文件引用，让用户看到相关文件的下载链接。',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: '回复给用户的消息内容',
        },
        file_references: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file_id: { type: 'string', description: '文件 ID（从会话文件列表或队友汇报中获取）' },
              file_name: { type: 'string', description: '文件名（用于显示）' },
            },
            required: ['file_id', 'file_name'],
          },
          description: '可选。要附带给用户的文件引用列表。文件 ID 可从上下文中的「会话文件」部分获取。',
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
    description: '将工作拆解为多个子任务。每个任务会被添加到共享任务列表中。拆解时必须同时考虑并行性与逻辑关系：能并行的维度拆开，必须先做才能继续的步骤要通过 dependsOnTaskTitles / dependsOnTaskIds 明确声明前置任务。若是补充或深化已有工作，而不是第一次拆解，必须使用 dependsOnTaskTitles / dependsOnTaskIds 或 parentTitle / parentId 明确关联到现有任务，避免重复创建已完成维度。为避免非法外键，不要编造新的 parentId；只有在引用已存在任务ID时才传 parentId。若要表达同批次层级关系，可传 parentTitle。',
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
              parentTitle: { type: 'string', description: '同批次任务的父任务标题；优先使用此字段表达层级关系。若为补充/深化任务，应尽量填写。' },
              dependsOnTaskIds: { type: 'array', items: { type: 'string' }, description: '该任务显式依赖的已存在任务ID列表。凡是需要等待前一步完成的任务，都应填写这里，而不是仅靠描述文本暗示。' },
              dependsOnTaskTitles: { type: 'array', items: { type: 'string' }, description: '该任务显式依赖的任务标题列表；优先用于同批次任务依赖。凡是存在先后顺序、输入输出关系或审核后才能继续的任务，都应填写。' },
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
    description: '向队友发送内部消息，用于补充需求、纠偏、澄清、重排优先级，或发送 execution control 指令。teammate_id 必须使用上下文中展示的真实队友 ID，若只知道名字，也必须使用上下文里显示的精确名字。不要使用 41、81、teammate_0 这类编造引用。禁止发送仅用于“收到通知”“等待其他人”“继续待命”“礼貌致谢”的消息。',
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
          enum: ['coordination', 'question', 'clarification_request', 'urgent', 'pause_execution', 'resume_execution', 'cancel_execution', 'supersede_execution'],
          description: '消息类型。若要直接控制队友当前执行体，使用 pause_execution / resume_execution / cancel_execution / supersede_execution。',
        },
      },
      required: ['teammate_id', 'content'],
    },
  },
  {
    name: 'update_self_todo',
    description: '对 Lead 私有待办做单步操作。用于跟踪多阶段任务进度。一次调用只做一种操作：clear / add / insert / delete / update。clear=清空全部待办；add=追加一项到末尾；insert=插入到指定位置；delete=删除一项；update=仅允许更新已有项的 status，不能改 title/details/category/sourceRef。状态语义：pending=尚未开始，in_progress=进行中，completed=已全部交付。对于复杂多阶段任务（如包含分析、报告、讲稿、PPT等），应为每个阶段创建独立的 Todo 项，便于跟踪整体进度。',
    input_schema: {
      type: 'object' as const,
      properties: {
        operation: {
          type: 'string',
          enum: ['clear', 'add', 'insert', 'delete', 'update'],
          description: '本次待办操作类型。一次调用只允许一个操作。',
        },
        item: {
          type: 'object',
          description: 'add / insert 时使用的完整待办项。',
          properties: {
            id: { type: 'string', description: '待办项ID。新增项必须提供稳定ID。' },
            title: { type: 'string', description: '待办项标题' },
            details: { type: 'string', description: '补充说明或完成标准' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'dropped'], description: '当前状态。pending=尚未开始兑现，in_progress=已经启动但尚未完成，completed=该项承诺已全部兑现。不要提前标记 completed。' },
            category: { type: 'string', enum: ['user_request', 'deliverable', 'coordination', 'verification', 'other'], description: '待办类别' },
            sourceRef: { type: 'string', description: '来源引用，例如 external:messageId' },
          },
          required: ['id', 'title', 'status', 'category'],
        },
        item_id: {
          type: 'string',
          description: 'delete / update 时要操作的待办项ID。',
        },
        index: {
          type: 'number',
          description: 'insert 时插入位置（从 0 开始）。超界时会自动夹到合法范围。',
        },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'dropped'],
          description: 'update 时要设置的新状态。update 仅允许改状态。',
        },
        reason: {
          type: 'string',
          description: '本次更新原因，便于审计和恢复',
        },
      },
      required: ['operation'],
    },
  },
  {
    name: 'verify_result',
    description: '对队友提交的任务结果进行质量验证。可以创建专门的验证队友（Fact Checker）来交叉检验关键事实和结论。适用于高优先级任务或需要高可信度的输出。',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: {
          type: 'string',
          description: '需要验证的已完成任务ID',
        },
        verification_type: {
          type: 'string',
          enum: ['fact_check', 'cross_validate', 'quality_review'],
          description: '验证类型：fact_check=事实核查, cross_validate=交叉验证（创建新队友独立验证）, quality_review=质量评审',
        },
        focus_areas: {
          type: 'array',
          items: { type: 'string' },
          description: '需要重点验证的方面（如"数据准确性"、"逻辑一致性"、"来源可靠性"）',
        },
        instructions: {
          type: 'string',
          description: '给验证者的具体指示',
        },
      },
      required: ['task_id', 'verification_type'],
    },
  },
  {
    name: 'assign_skill_to_teammate',
    description: '为队友分配一个 Skill。分配后队友将获得该 Skill 的详细指令和脚本资源，通过现有工具（shell_exec、read_workspace_file 等）执行。使用前请查看上下文中的「可用 Skills」列表。',
    input_schema: {
      type: 'object' as const,
      properties: {
        teammate_id: {
          type: 'string',
          description: '队友 ID（从「当前团队成员」列表中获取）',
        },
        skill_name: {
          type: 'string',
          description: 'Skill 名称（从「可用 Skills」列表中选择）',
        },
      },
      required: ['teammate_id', 'skill_name'],
    },
  },
]
