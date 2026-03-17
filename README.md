# Order Splitter API

A production-grade Node.js + TypeScript REST API for a robo-advisor platform. Given a model portfolio and a total investment amount, it splits the amount across stocks by weight, calculates share quantities, and schedules execution based on market hours.

## Tech Stack

- **Runtime:** Node.js 18+ with TypeScript (strict mode)
- **Framework:** Express 5
- **Validation:** Zod
- **Logging:** Winston (structured, with AsyncLocalStorage context)
- **Testing:** Jest + Supertest
- **Linting:** ESLint + Prettier
- **Storage:** In-memory (non-persistent)

## Setup & Run

```bash
# Ensure Node 18+
nvm use 18

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Development (hot-reload)
npm run dev

# Build & run production
npm run build
npm start

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Lint
npm run lint

# Format
npm run format
```

## API Endpoints

All endpoints are versioned under `/api/v1/`.

### Health Check

```bash
curl http://localhost:3000/api/v1/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-03-18T09:30:00.000Z",
  "uptime": 42.3,
  "components": {
    "memoryStore": { "status": "ok" }
  }
}
```

### Split Order (POST)

```bash
curl -X POST http://localhost:3000/api/v1/orders/split \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
    "portfolio": [
      { "symbol": "AAPL", "weight": 60, "price": 150 },
      { "symbol": "TSLA", "weight": 40 }
    ],
    "amount": 10000,
    "orderType": "BUY"
  }'
```

**Response (201):**
```json
{
  "orderId": "uuid-v4",
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "orderType": "BUY",
  "totalAmount": 10000,
  "executionTime": "2025-03-18T09:30:00.000Z",
  "orders": [
    { "symbol": "AAPL", "amount": 6000, "price": 150, "quantity": 40.000 },
    { "symbol": "TSLA", "amount": 4000, "price": 100, "quantity": 40.000 }
  ],
  "meta": {
    "responseTimeMs": 2,
    "sharePrecision": 3
  }
}
```

Resending the same `idempotencyKey` returns HTTP 200 with header `X-Idempotent-Replayed: true`.

### List Orders (GET)

```bash
# Paginated
curl "http://localhost:3000/api/v1/orders?page=1&limit=10"

# Filtered
curl "http://localhost:3000/api/v1/orders?orderType=BUY&symbol=AAPL&from=2025-01-01&to=2025-12-31"
```

### Metrics

```bash
curl http://localhost:3000/api/v1/metrics
```

**Response:**
```json
{
  "totalOrdersCreated": 5,
  "totalErrors": 1,
  "idempotentReplays": 2,
  "rateLimitBreaches": 0
}
```

## Architecture

Clean layered architecture with strict separation of concerns. No layer imports from a layer above it.

```
src/
├── config/          # Centralized config — all env vars and constants in one place
├── errors/          # Typed error class (AppError)
├── models/          # Pure domain TypeScript interfaces
├── controllers/     # HTTP in/out only — no business logic
├── services/        # Business logic: splitting, idempotency, execution time
├── repositories/    # In-memory data store using Map for O(1) lookups
├── middleware/      # requestId, responseTime, rateLimit, timeout, errorHandler
├── validators/      # Zod schemas — returns ALL validation errors at once
├── utils/           # logger, marketHours, retryWithBackoff, idempotencyLock,
│                    # sanitize, metrics, requestContext (AsyncLocalStorage)
├── routes/v1/       # Versioned route definitions
├── shutdown.ts      # Graceful shutdown handler
├── app.ts           # Express app assembly
└── index.ts         # Server startup
```

## Configuration

All tunables live in `src/config/index.ts`. Environment variables override defaults:

| Config | Env Var | Default | Description |
|---|---|---|---|
| `port` | `PORT` | `3000` | HTTP server port |
| `apiVersion` | — | `v1` | API version prefix |
| `corsOrigin` | `CORS_ORIGIN` | `false` (block all) | Allowed CORS origin |
| `defaultStockPrice` | — | `100` | Fallback price when not provided |
| `sharePrecision` | — | `3` | Decimal places for share quantities |
| `marketOpenHourUTC` | — | `9` | Market open hour (UTC) |
| `marketOpenMinuteUTC` | — | `30` | Market open minute (UTC) |
| `requestTimeoutMs` | — | `5000` | Request timeout in ms |
| `rateLimit.windowMs` | — | `60000` | Rate limit window (1 minute) |
| `rateLimit.maxRequests` | — | `100` | Max requests per IP per window |
| `retry.maxRetries` | — | `3` | Retry attempts for transient failures |
| `retry.baseDelayMs` | — | `100` | Base delay for exponential backoff |
| `retry.factor` | — | `2` | Backoff multiplier |
| `gracefulShutdownTimeoutMs` | — | `10000` | Max wait for in-flight requests on shutdown |
| — | `LOG_LEVEL` | `info` | Winston log level |

## Key Engineering Features

### Idempotency

Every `POST /orders/split` requires a client-generated `idempotencyKey` (UUID v4). The server stores the key-to-response mapping in memory. If the same key is sent again:
- The exact same response is returned (not reprocessed)
- HTTP status is `200` (not `201`)
- Response includes header `X-Idempotent-Replayed: true`

A lock map (`Map<string, Promise<void>>`) prevents race conditions when concurrent requests share the same key — the second request waits for the first to complete, then returns the cached result.

### Graceful Shutdown

On `SIGTERM` or `SIGINT` (handled in `src/shutdown.ts`):
1. Stops accepting new connections
2. Waits up to 10 seconds for in-flight requests to complete
3. Logs "Server shut down gracefully" and exits with code 0
4. If the timeout elapses, exits with code 1

`unhandledRejection` and `uncaughtException` also trigger graceful shutdown.

### Rate Limiting

Token-bucket algorithm: 100 requests/minute per IP. Breaching the limit returns `429 RATE_LIMIT_EXCEEDED` with standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

### Request Timeout

Configurable middleware (default 5s). If processing exceeds the limit, responds with `503 REQUEST_TIMEOUT`.

### Structured Logging

Winston logger with `AsyncLocalStorage` — `requestId` is automatically injected into every log line within a request's context, including logs from deep within the service layer, without passing it as a parameter.

Every request logs: `timestamp`, `method`, `path`, `statusCode`, `responseTimeMs`, `requestId`.

### Metrics

In-memory counters exposed at `GET /api/v1/metrics`:
- `totalOrdersCreated` — incremented on every new order
- `idempotentReplays` — incremented on duplicate key hits
- `totalErrors` — incremented by the error handler
- `rateLimitBreaches` — incremented when 429 is returned

## Testing

```
tests/
├── unit/
│   ├── order.service.test.ts      # Splitting math, idempotency, pagination, all validation edge cases
│   ├── marketHours.test.ts        # All 7 days of the week
│   ├── retryWithBackoff.test.ts   # Success, retry-then-succeed, exhaustion
│   └── idempotencyLock.test.ts    # Serialization of same key, parallel different keys
└── integration/
    └── orders.api.test.ts         # Full HTTP tests: all endpoints, rate limiting,
                                   # idempotency replay, metrics counters, security headers
```

**58 tests** across 5 suites covering all edge cases, validation rules, and API behavior.

## Error Response Shape

All errors follow a consistent structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "portfolio", "message": "Portfolio weights must sum to 100 (got 80)" },
      { "field": "amount",    "message": "Amount must be a positive number" }
    ]
  }
}
```
