import { defineConfig } from 'vite';

// play.html?local (Play!, web/src/local.js) needs a cross-origin isolated page: same rule as server.py's isolate().
const isolate = {
  name: 'isolate',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (/[?&]local(=|&|$)/.test(req.url) || req.url.startsWith('/play/')) {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [isolate],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  build: { rollupOptions: { input: ['index.html', 'play.html'] } },
});
