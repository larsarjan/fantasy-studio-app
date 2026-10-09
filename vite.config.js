import { defineConfig } from 'vite'
import { execFileSync } from 'node:child_process'
import { GET as videoResponse } from './api/latest-video.js'
import { loadEnv } from 'vite'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [{
    name: 'public-video-dev',
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', process.cwd(), 'VITE_'))
      server.middlewares.use('/api/latest-video', async (request, response) => {
        try { const result = await videoResponse(new Request('http://localhost/api/latest-video', {headers:request.headers})); response.statusCode=result.status; result.headers.forEach((v,k)=>response.setHeader(k,v)); response.end(await result.text()) }
        catch { response.statusCode=503; response.end(JSON.stringify({error:'Video service unavailable'})) }
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
