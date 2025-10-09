import path from 'path';
import { defineConfig, type Plugin, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

function devTravelApiPlugin(handleTravelAction: (action: any, payload: any) => Promise<any>): Plugin {
  return {
    name: 'dev-travel-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/travel')) {
          next();
          return;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        let rawBody = '';
        req.on('data', (chunk) => {
          rawBody += chunk;
        });

        req.on('end', async () => {
          try {
            const parsedBody = rawBody ? JSON.parse(rawBody) : {};
            const { action, payload } = parsedBody;
            const result = await handleTravelAction(action, payload);
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result.body));
          } catch (error) {
            console.error('[vite][dev-api] 요청 처리 실패:', error);
            res.statusCode = error instanceof SyntaxError ? 400 : 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error:
                  error instanceof SyntaxError
                    ? '요청 본문이 올바른 JSON 형식이 아닙니다.'
                    : '로컬 개발 서버에서 요청을 처리하지 못했습니다.',
              })
            );
          }
        });

        req.on('error', (error) => {
          console.error('[vite][dev-api] 요청 수신 실패:', error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
          }
          res.end(
            JSON.stringify({
              error: '로컬 개발 서버에서 요청을 수신하지 못했습니다.',
            })
          );
        });
      });
    },
  };
}

export default defineConfig(async ({ mode }) => {
  const plugins: PluginOption[] = [react()];

  if (mode === 'development') {
    const { handleTravelAction } = await import('./server/travelService');
    plugins.push(devTravelApiPlugin(handleTravelAction));
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
