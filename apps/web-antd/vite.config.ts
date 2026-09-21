import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      resolve: {
        // Workspace peer contexts must share router injection keys and stores.
        dedupe: ['vue', 'vue-router', 'pinia'],
      },
      server: {
        allowedHosts: ['rail.yuanmou.ltd'],
        proxy: {
          '/api': {
            changeOrigin: true,
            target: 'http://localhost:5320',
            ws: true,
          },
        },
      },
    },
  };
});
