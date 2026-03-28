import { NextRequest } from 'next/server';
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';
import { listPersonalMemories, createPersonalMemory, updatePersonalMemory, deletePersonalMemory, searchPersonalMemories, type MemoryType } from '@/lib/server/personal-memory';

export async function GET(request: NextRequest) {
  try {
    const payload = await requireTokenPayload();
    const { searchParams } = new URL(request.url);
    const memoryType = searchParams.get('memoryType') as MemoryType | null;
    const query = searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let memories;
    if (query) {
      memories = await searchPersonalMemories(payload.userId, query, {
        memoryType: memoryType || undefined,
        limit,
      });
    } else {
      memories = await listPersonalMemories(payload.userId, {
        memoryType: memoryType || undefined,
        limit,
        offset,
      });
    }

    return successResponse(memories);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }
    console.error('Get personal memories error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireTokenPayload();
    const body = await request.json();

    const { title, content, memoryType, tags, importance } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return errorResponse('Title is required', 400);
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('Content is required', 400);
    }
    if (!memoryType || !['PERSONAL', 'DREAM', 'EXPERIENCE', 'FACT', 'PREFERENCE'].includes(memoryType)) {
      return errorResponse('Invalid memoryType. Must be one of: PERSONAL, DREAM, EXPERIENCE, FACT, PREFERENCE', 400);
    }
    if (importance !== undefined && (typeof importance !== 'number' || importance < 1 || importance > 5)) {
      return errorResponse('Invalid importance. Must be a number between 1 and 5', 400);
    }

    const memory = await createPersonalMemory({
      userId: payload.userId,
      title: title.trim(),
      content: content.trim(),
      memoryType,
      tags: tags || [],
      importance: importance || 1,
    });

    return successResponse(memory);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }
    console.error('Create personal memory error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await requireTokenPayload();
    const body = await request.json();

    const { id, title, content, memoryType, tags, importance } = body;

    if (!id || typeof id !== 'string') {
      return errorResponse('Memory ID is required', 400);
    }
    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return errorResponse('Title cannot be empty', 400);
    }
    if (content !== undefined && (typeof content !== 'string' || content.trim().length === 0)) {
      return errorResponse('Content cannot be empty', 400);
    }
    if (memoryType !== undefined && !['PERSONAL', 'DREAM', 'EXPERIENCE', 'FACT', 'PREFERENCE'].includes(memoryType)) {
      return errorResponse('Invalid memoryType. Must be one of: PERSONAL, DREAM, EXPERIENCE, FACT, PREFERENCE', 400);
    }
    if (importance !== undefined && (typeof importance !== 'number' || importance < 1 || importance > 5)) {
      return errorResponse('Invalid importance. Must be a number between 1 and 5', 400);
    }

    const updated = await updatePersonalMemory(id, {
      title: title?.trim(),
      content: content?.trim(),
      memoryType,
      tags,
      importance,
    });

    if (!updated) {
      return errorResponse('Memory not found', 404);
    }

    // Verify ownership
    if (updated.userId !== payload.userId) {
      return errorResponse('Unauthorized', 403);
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }
    console.error('Update personal memory error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = await requireTokenPayload();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return errorResponse('Memory ID is required', 400);
    }

    // Get the memory first to verify ownership
    const { getPersonalMemory } = await import('@/lib/server/personal-memory');
    const memory = await getPersonalMemory(id);

    if (!memory) {
      return errorResponse('Memory not found', 404);
    }

    if (memory.userId !== payload.userId) {
      return errorResponse('Unauthorized', 403);
    }

    const deleted = await deletePersonalMemory(id);
    if (!deleted) {
      return errorResponse('Failed to delete memory', 500);
    }

    return successResponse({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }
    console.error('Delete personal memory error:', error);
    return errorResponse('Internal server error', 500);
  }
}
