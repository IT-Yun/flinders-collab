const monitor = require('../utils/monitor');

/**
 * Express middleware that records every request to the server monitor.
 * Intercepts res.json to capture error response bodies for user-friendly error tracking.
 */
function monitorMiddleware(req, res, next) {
  const start = Date.now();

  // Intercept res.json to capture error response body
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    res._responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    monitor.recordRequest(req, res, duration);
  });

  next();
}

module.exports = monitorMiddleware;
