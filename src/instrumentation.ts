export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { recoverStuckState } = await import('@/lib/server/recovery')
    try {
      const result = await recoverStuckState()
      if (result.recoveredAgents > 0 || result.recoveredTasks > 0) {
        console.log('[Startup] Recovery completed:', result)
      }
    } catch (error) {
      console.error('[Startup] Recovery failed:', error)
    }
  }
}
