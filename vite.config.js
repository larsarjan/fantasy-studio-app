import { defineConfig } from 'vite'
import { execFileSync } from 'node:child_process'
import { latestVideo } from './src/public/video.js'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [{
    name: 'public-video-dev',
    configureServer(server) {
      server.middlewares.use('/api/latest-video', async (_request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(await latestVideo()))
      })
    },
  }, {
    name: 'release-identity',
    generateBundle() {
      const commit = process.env.STUDIO_RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid release commit')
      this.emitFile({ type: 'asset', fileName: 'release.json', source: JSON.stringify({ commit }) })
    },
  }],
})
