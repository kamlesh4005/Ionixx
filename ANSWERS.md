# Answers

## 1. Approach and Thought Process

The design follows a **bottom-up layered architecture** where each layer has a single responsibility and no layer imports from a layer above it:

- **Config** → centralized constants and env-var bindings; no magic numbers anywhere
- **Models** → pure TypeScript domain interfaces (`OrderRecord`, `OrderResponse`, `PortfolioItem`, etc.)
- **Errors** → typed application error class (`AppError`) with `statusCode`, `code`, and structured `details`
- **Utils** → framework-agnostic utilities: `logger` (Winston + AsyncLocalStorage), `marketHours`, `retryWithBackoff`, `idempotencyLock`, `sanitize`, `metrics`, `requestContext`
- **Repository** → in-memory store using `Map` for O(1) lookups by `orderId` and `idempotencyKey`
- **Validators** → Zod schemas that return *all* validation errors in a single response, not just the first
- **Service** → business logic: portfolio splitting, price resolution, idempotency check, execution time calculation
- **Controllers** → thin HTTP adapters — parse request, call service, format response
- **Middleware** → cross-cutting concerns applied uniformly: requestId (with AsyncLocalStorage), response time, rate limiting, timeout, error handling

This structure makes each concern independently testable and replaceable. No layer imports from a layer above it.

## 2. Assumptions Made

| Assumption | Rationale |
|---|---|
| **Default stock price = $100** | Configurable in `config/index.ts`; serves as a sensible fallback when no price is provided |
| **Market open = 09:30 UTC Mon–Fri** | Simplified model; real systems would integrate a holiday calendar API |
| **No public holidays** | The spec mentions weekday-only scheduling; a production system would use a NYSE/NASDAQ calendar API |
| **Rate limit per IP** | Standard approach; in production this would be per API key or authenticated user identity |
| **In-memory store is acceptable** | Explicitly required by the spec; data does not persist across restarts |
| **Price fetch is deterministic** | The simulated price fetch is wrapped in `retryWithBackoff` to demonstrate the retry pattern, even though it won't actually fail in this implementation |
| **CORS restrictive by default** | `CORS_ORIGIN` env var defaults to `false` (block all cross-origin). Set it to an origin in production |
| **Float tolerance for weight sum** | ±0.01 tolerance handles floating-point precision issues (e.g., `33.33 + 33.33 + 33.34 = 100.00000000000001`) |

## 3. Challenges Faced

1. **Idempotency lock design** — Correctly serializing concurrent requests for the same key without deadlocks required a `while`-loop pattern that awaits the existing lock promise before creating a new one, with guaranteed cleanup in a `finally` block.

2. **uuid ESM-only package** — `uuid` v13 ships as ESM-only and cannot be `require()`d by `ts-node-dev` or Jest in CJS mode. The fix was to drop the external dependency entirely and use Node 18's built-in `crypto.randomUUID()` — no compatibility issues, same UUID v4 output.

2. **Floating-point precision** — Weight-based allocation (e.g., 33.33% of $1000) produces imprecise floats. Using `toFixed()` with configurable precision and rounding allocated amounts to 2 decimal places handles this cleanly.

## 4. What Would Change for a Real Production Deployment

| Area | Current | Production |
|---|---|---|
| **Data store** | In-memory Map | PostgreSQL / DynamoDB with proper indices and transactions |
| **Idempotency** | In-memory Map | Redis with 24h TTL — avoids unbounded memory growth |
| **Rate limiting** | In-memory token bucket | Redis-backed sliding window, shared across all load-balanced instances |
| **Price service** | Simulated deterministic return | Real market data API (IEX, Polygon, Bloomberg) with circuit breaker |
| **Authentication** | None | JWT/OAuth2 with API key management |
| **Holiday calendar** | Weekday-only check | Market calendar API (NYSE/NASDAQ holidays) |
| **Deployment** | Single process | Containerized (Docker), orchestrated (K8s), behind a load balancer |
| **Observability** | Winston stdout + in-memory metrics | OpenTelemetry traces, Prometheus metrics, ELK/Datadog for logs |
| **Config** | Env vars with defaults | Env vars + secrets manager (Vault, AWS Parameter Store) for sensitive values |
| **CI/CD** | Manual | GitHub Actions: lint → test → build → Docker → deploy pipeline |
| **API documentation** | README.md | OpenAPI/Swagger spec with generated client SDKs |
| **Retry jitter** | None | Add random jitter to backoff delays to prevent thundering herd |
| **Circuit breaker** | None | Wrap external price service calls with a circuit breaker (e.g., `opossum`) |

## 5. How LLMs Were Used in Building the Solution

An LLM (Claude) was used as a pair programming assistant throughout the build:

- **Architecture planning** — Discussed the layered architecture, confirmed separation of concerns, validated middleware ordering, and justified decisions (e.g., why token bucket over sliding window; why not CQRS for 2 endpoints)
- **Code generation** — Generated initial implementations for all layers, reviewed for correctness, type safety, and spec adherence before accepting\
- **Test authoring** — Produced comprehensive unit and integration tests covering happy paths, edge cases, and all validation rules (58 tests across 5 suites)
- **Recovery from bad AI output** — A second AI session introduced 31 "improvements" that deleted critical files and created empty replacements. Used Claude to diagnose the damage, restore the project, and critically evaluate which suggestions were genuine improvements vs. over-engineering
- **Documentation** — Generated README.md and this ANSWERS.md, updated to reflect all changes

All generated code was reviewed for correctness, type safety, and adherence to the specification before being accepted.
