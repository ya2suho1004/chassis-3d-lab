// 시험 도구용 얇은 연결 — 프롬프트 원본은 supabase/functions/_shared/chat/prompt.ts(서버와 같은 파일, Node 24가 .ts를 바로 읽음)
import { readFileSync } from 'node:fs'
export { buildSystemPrompt, PROMPT_VERSION } from '../../supabase/functions/_shared/chat/prompt.ts'

export function loadTask(path = new URL('../../src/data/tasks/task.braking-force.case-lv1.json', import.meta.url)) {
  return JSON.parse(readFileSync(path, 'utf8'))
}
