const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      secure: false,
      // Prepend /api back after it's stripped by the proxy
      pathRewrite: function (path, req) {
        return '/api' + path;
      },
      onProxyReq: (proxyReq, req, res) => {
        console.log('Proxying request:', req.method, req.path, '-> /api' + req.path);
      },
      onProxyRes: (proxyRes, req, res) => {
        console.log('Proxy response:', proxyRes.statusCode, req.path);
      },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
      }
    })
  );
};
