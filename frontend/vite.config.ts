import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // React·라우터·쿼리는 따로 묶어 앱 코드가 바뀌어도 캐시를 쓴다 (용어 위키·도면 보기는 React.lazy 로 분리)
        manualChunks: (id) => (/node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler|@tanstack)[\/]/.test(id) ? 'vendor' : undefined),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
