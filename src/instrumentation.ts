export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Phase 1: Recover stuck state (reset BUSY → IDLE, IN_PROGRESS → PENDING)
    const { recoverStuckState } = await import('@/lib/server/recovery')
    try {
      const result = await recoverStuckState()
      if (result.recoveredAgents > 0 || result.recoveredTasks > 0) {
        console.log('[Startup] Recovery completed:', result)
      }
    } catch (error) {
      console.error('[Startup] Recovery failed:', error)
    }

    // Phase 2: Register graceful shutdown handlers (SIGTERM/SIGINT)
    const { registerGracefulShutdown } = await import('@/lib/server/swarm-session-lifecycle')
    registerGracefulShutdown()

    // Phase 3: Auto-resume ACTIVE sessions (delayed to allow server to fully initialize)
    setTimeout(async () => {
      try {
        const { autoResumeActiveSessions } = await import('@/lib/server/swarm-session-lifecycle')
        const result = await autoResumeActiveSessions()
        if (result.resumedSessions > 0) {
          console.log(`[Startup] Auto-resumed ${result.resumedSessions} session(s)`)
        }
        if (result.errors.length > 0) {
          console.error('[Startup] Auto-resume errors:', result.errors)
        }
      } catch (error) {
        console.error('[Startup] Auto-resume failed:', error)
      }
    }, 3000) // 3s delay to let the server fully boot
  }
}
