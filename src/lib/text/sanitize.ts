const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g

export function stripAnsiControlCodes(input: string): string {
  return input.replace(ANSI_ESCAPE_PATTERN, '')
}
