import { defineNitroConfig } from 'nitropack/config';

export default defineNitroConfig({
  compatibilityDate: '2026-08-04',
  errorHandler: '~/error',
  routeRules: {
    '/api/**': {
      cors: true,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers':
          'Accept, Authorization, Content-Type, X-Request-ID',
        'Access-Control-Allow-Methods':
          'GET,HEAD,OPTIONS,PUT,PATCH,POST,DELETE',
        'Access-Control-Expose-Headers': 'X-Request-ID',
      },
    },
  },
});
