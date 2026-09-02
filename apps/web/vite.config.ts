import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // The application and editor stay below the default 500 kB budget. The
    // only larger chunk is the intentionally on-demand MathJax font data.
    chunkSizeWarningLimit: 1_000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'mathjax-font',
              test: /@mathjax[\\/]mathjax-newcm-font/,
            },
          ],
        },
      },
    },
  },
})
