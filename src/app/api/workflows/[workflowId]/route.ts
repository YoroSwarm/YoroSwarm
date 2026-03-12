import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { serializeWorkflow } from '@/app/api/workflows/_utils'

type RouteContext = {
  params: Promise<{ workflowId: string }>
}

async function getWorkflow(workflowId: string) {
  return prisma.workflow.findUnique({ where: { id: workflowId } })
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { workflowId } = await context.params
    const workflow = await getWorkflow(workflowId)

    if (!workflow) return notFoundResponse('Workflow not found')

    return successResponse(serializeWorkflow(workflow))
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get workflow error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { workflowId } = await context.params
    const existing = await getWorkflow(workflowId)

    if (!existing) return notFoundResponse('Workflow not found')

    const body = await request.json()
    const workflow = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        ...(typeof body.name === 'string' ? { name: body.name } : {}),
        ...(typeof body.description === 'string' || body.description === null
          ? { description: body.description }
          : {}),
        ...(body.definition && typeof body.definition === 'object'
          ? { definition: JSON.stringify(body.definition) }
          : {}),
      },
    })

    return successResponse(serializeWorkflow(workflow), 'Workflow updated successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Update workflow error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { workflowId } = await context.params
    const existing = await getWorkflow(workflowId)

    if (!existing) return notFoundResponse('Workflow not found')

    await prisma.workflow.delete({ where: { id: workflowId } })

    return successResponse({ deleted: true }, 'Workflow deleted successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Delete workflow error:', error)
    return errorResponse('Internal server error', 500)
  }
}

