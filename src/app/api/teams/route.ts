import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'

type TeamConfigInput = {
  autoProvision?: boolean
  sessionGoal?: string
  workspaceMode?: 'general_office' | 'research' | 'writing' | 'analysis' | 'coding'
  roster?: Array<{
    name: string
    role: string
    description?: string
    capabilities?: string[]
  }>
}

function buildDefaultRoster(teamName: string, sessionGoal?: string) {
  const goalLine = sessionGoal ? `当前主目标：${sessionGoal}` : `当前主目标：推进 ${teamName} 的多 agent 协作工作流。`

  return [
    {
      name: 'Team Lead',
      role: 'team_lead',
      description: `负责创建团队、拆解任务、协调上下文与资源，并根据进度动态增减队员。${goalLine}`,
      capabilities: ['planning', 'delegation', 'coordination', 'quality_control'],
    },
    {
      name: 'Researcher',
      role: 'research_specialist',
      description: '负责信息搜集、竞品调研、事实核验与来源整理。',
      capabilities: ['research', 'fact_checking', 'summarization', 'source_mapping'],
    },
    {
      name: 'Documenter',
      role: 'document_specialist',
      description: '负责文档、汇报、PPT 大纲、表格方案与结构化表达。',
      capabilities: ['writing', 'presentation', 'spreadsheet_planning', 'documentation'],
    },
    {
      name: 'Analyst',
      role: 'analysis_specialist',
      description: '负责拆解问题、梳理依赖、识别风险并形成可执行建议。',
      capabilities: ['analysis', 'brainstorming', 'risk_review', 'task_breakdown'],
    },
    {
      name: 'Builder',
      role: 'engineering_specialist',
      description: '负责代码实现、多文件处理、自动化脚本与技术验证。',
      capabilities: ['coding', 'automation', 'file_processing', 'implementation'],
    },
  ]
}

// GET - List all teams
export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    try {
      verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const teams = await prisma.team.findMany({
      include: {
        agents: {
          include: {
            tasks: true,
          },
        },
        tasks: true,
        workflows: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(teams)
  } catch (error) {
    console.error('List teams error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// POST - Create a new team
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    let payload
    try {
      payload = verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const body = await request.json()
    const { name, description, config } = body as {
      name?: string
      description?: string
      config?: TeamConfigInput
    }

    if (!name) {
      return errorResponse('Team name is required', 400)
    }

    const teamConfig = config || {}
    const shouldProvisionRoster = teamConfig.autoProvision !== false
    const roster = shouldProvisionRoster
      ? (teamConfig.roster && teamConfig.roster.length > 0
        ? teamConfig.roster
        : buildDefaultRoster(name, teamConfig.sessionGoal))
      : []

    const team = await prisma.team.create({
      data: {
        name,
        description,
        createdBy: payload.userId,
        config: JSON.stringify({
          autoProvision: shouldProvisionRoster,
          workspaceMode: teamConfig.workspaceMode || 'general_office',
          sessionGoal: teamConfig.sessionGoal || '',
          rosterStrategy: shouldProvisionRoster ? 'lead_bootstrap' : 'manual',
        }),
        agents: roster.length > 0
          ? {
              create: roster.map((member, index) => ({
                name: member.name,
                role: member.role,
                description: member.description,
                capabilities: JSON.stringify(member.capabilities || []),
                config: JSON.stringify({
                  provisionedBy: 'team_bootstrap',
                  isLead: index === 0,
                }),
              })),
            }
          : undefined,
      },
      include: {
        agents: {
          include: {
            tasks: true,
          },
        },
        tasks: true,
        workflows: true,
      },
    })

    return successResponse(team, 'Team created successfully')
  } catch (error) {
    console.error('Create team error:', error)
    return errorResponse('Internal server error', 500)
  }
}
