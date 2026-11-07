import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { createFakeSubmitServer } from './server/dev/fakeSubmitServer'

/** 빌드한 커밋(H1): 기록 clientAppVersion에 들어간다. Vercel 커밋 변수 → git(고친 파일이 있으면 -dirty) → 빈 값(앱이 unknown으로 표시) */
function buildCommit(): string {
  const vercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (vercel) return vercel.slice(0, 12)
  try {
    const sha = execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const dirty = execSync('git status --porcelain --untracked-files=no', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() ? '-dirty' : ''
    return sha + dirty
  } catch {
    return ''
  }
}

/** 개발 서버에서만 /__fake-submit 가짜 수신점을 붙인다(운영 번들·preview에는 없음). */
function fakeSubmitPlugin(): Plugin {
  return {
    name: 'fake-submit-endpoint',
    apply: 'serve',
    configureServer(server) {
      const handle = createFakeSubmitServer(server.config.root)
      server.middlewares.use((req, res, next) => { handle(req, res).then((done) => { if (!done) next() }).catch(next) })
    },
  }
}

export default defineConfig({
  plugins: [react(), fakeSubmitPlugin()],
  base: './',
  define: { __APP_COMMIT__: JSON.stringify(buildCommit()) },
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
})
