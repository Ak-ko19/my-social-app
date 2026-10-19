// Day 68: starts Swagger UI on GET /docs (routes/docsRoutes.js) with the
// spec from GET /openapi.json. "Try it out" sends real requests to this
// server: use Authorize with a token from POST /login.
window.SwaggerUIBundle({
  url: '/openapi.json',
  dom_id: '#docs',
  deepLinking: true,
  docExpansion: 'none',
  filter: true,
  persistAuthorization: false
});
