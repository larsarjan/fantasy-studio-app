import { defineConfig } from 'vite'
import { execFileSync } from 'node:child_process'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [{
    name: 'release-identity',
    generateBundle() {
      const commit = process.env.STUDIO_RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid release commit')
      this.emitFile({ type: 'asset', fileName: 'release.json', source: JSON.stringify({ commit }) })
    },
  }],
})
