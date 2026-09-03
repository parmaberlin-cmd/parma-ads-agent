# Connection capability API integration

`connection-api.js` defines the protected read-only routes intended for the Parma backend:

- `GET /capabilities/connections`
- `GET /health/connections`
- `GET /capabilities/connections/:id/:capability`

All routes must be installed with the existing `requireApiKey` middleware. They expose no credentials and never grant mutation permission.

## Integration gate

The route module is intentionally kept separate from `server.js` until server integration is applied and regression-tested as one atomic change. This avoids partial runtime changes while the architecture PR remains draft and undeployed.

Expected integration:

```js
const { installConnectionRoutes } = require('./connection-api');
// after requireApiKey is defined, before the 404 handler:
installConnectionRoutes(app, requireApiKey);
```

No external provider write, campaign change, tracking change, budget change or deployment is implied by this module.