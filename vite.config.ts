import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { createFakeSubmitServer } from './server/dev/fakeSubmitServer'

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
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
})
