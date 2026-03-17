import prisma from '@/lib/db';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';

export async function GET() {
  try {
    const payload = await requireTokenPayload();

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const events = await prisma.llmUsageEvent.findMany({
      where: {
        userId: payload.userId,
        createdAt: { gte: since },
      },
      select: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheCreationTokens: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const buckets = new Map<string, { input: number; output: number; cache: number; total: number }>();

    for (let i = 23; i >= 0; i--) {
      const d = new Date(Date.now() - i * 60 * 60 * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}`;
      buckets.set(key, { input: 0, output: 0, cache: 0, total: 0 });
    }

    let totalInput = 0, totalOutput = 0, totalCache = 0;

    for (const event of events) {
      const d = event.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (bucket) {
        const input = Math.max(0, event.inputTokens);
        const output = Math.max(0, event.outputTokens);
        const cache = Math.max(0, event.cacheReadTokens + event.cacheCreationTokens);
        bucket.input += input;
        bucket.output += output;
        bucket.cache += cache;
        bucket.total += input + output + cache;
        totalInput += input;
        totalOutput += output;
        totalCache += cache;
      }
    }

    const total = totalInput + totalOutput + totalCache;
    const cacheRate = (totalInput + totalCache) > 0
      ? totalCache / (totalInput + totalCache)
      : 0;

    const hourly = Array.from(buckets.entries()).map(([hour, data]) => ({
      hour: hour.split('T')[1] + ':00',
      ...data,
    }));

    return successResponse({
      hourly,
      totals: {
        input: totalInput,
        output: totalOutput,
        cache: totalCache,
        total,
        cache_hit_rate: Math.max(0, Math.min(1, cacheRate)),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }
    console.error('Usage hourly error:', error);
    return errorResponse('Internal server error', 500);
  }
}
