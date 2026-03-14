import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Ohne Custom Domain: base = '/DEIN-REPO-NAME/'
  // Mit Custom Domain: base = '/'
  // Dein Repo heißt Sticky-Syndicate_V2.0 → base so lassen wenn du Custom Domain hast
  // Wenn KEIN custom domain: ändere auf '/Sticky-Syndicate_V2.0/'
  base: '/',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 2000000,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      }
    }
  }
})
