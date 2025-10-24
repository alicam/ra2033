# Worker Architecture Guide
## Monolithic vs Modular Design for Cloudflare Workers

**Last Updated**: October 24, 2025  
**Status**: Architecture Guide & Reference

---

## Table of Contents

1. [Architecture Philosophy](#architecture-philosophy)
2. [Current ra2033 Architecture](#current-ra2033-architecture)
3. [Modular Architecture Vision](#modular-architecture-vision)
4. [Email Service Worker Specification](#email-service-worker-specification)
5. [Migration Strategy](#migration-strategy)
6. [Implementation Patterns](#implementation-patterns)
7. [Cost & Performance Analysis](#cost--performance-analysis)
8. [Decision Framework](#decision-framework)
9. [Best Practices](#best-practices)

---

## Architecture Philosophy

### The Monolith vs Microservices Spectrum

Cloudflare Workers architecture exists on a spectrum:

```
Monolithic ←─────────────────────────────→ Fully Modular
    ↓                      ↓                        ↓
Single Worker       Hybrid Workers         Many Workers
Simple              Balanced               Complex
Low Cost           Medium Cost            High Cost
Tight Coupling     Clean Interfaces       Loose Coupling
```

### Core Principle

**Start monolithic, extract strategically when clear benefits emerge.**

Don't extract services prematurely. Wait until:
- ✅ Code is reused across 2+ applications
- ✅ Independent scaling is needed
- ✅ Security isolation is required
- ✅ Team boundaries form around services
- ✅ Deployment independence provides value

---

## Current ra2033 Architecture

### Monolithic Worker Design

```
┌─────────────────────────────────────────────────────────┐
│                    ra2033-worker                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐  ┌─────────────────────────┐     │
│  │ Petition/        │  │ Newsletter Features     │     │
│  │ Signature Logic  │  │ (Future)                │     │
│  │                  │  │ • Subscriber management │     │
│  │ • Form handling  │  │ • Campaign sending      │     │
│  │ • 2FA verify     │  │ • Drip sequences        │     │
│  │ • Signature list │  │ • Analytics             │     │
│  └──────────────────┘  └─────────────────────────┘     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Shared Infrastructure                            │  │
│  │ • Hono routing                                   │  │
│  │ • Auth middleware (JWT)                          │  │
│  │ • Rate limiting (Durable Objects)                │  │
│  │ • Email sending (SES integration)                │  │
│  │ • SMS sending (SNS integration)                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
           │              │              │
           ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │    D1    │   │    R2    │   │ Durable  │
    │ Database │   │ Storage  │   │ Objects  │
    └──────────┘   └──────────┘   └──────────┘
```

### Current Components

**Frontend:**
- React SPA (Vite build)
- Admin dashboard
- Public petition form

**Backend (Worker):**
- Hono API framework
- Authentication (JWT + bcrypt)
- Rate limiting (Durable Objects)
- Signature management
- Verification (email + SMS via AWS)

**Data Layer:**
- D1 (SQLite) - Primary database
- R2 - File storage (future use)
- Durable Objects - Rate limiting, sessions

**External Services:**
- AWS SES - Email delivery
- AWS SNS - SMS delivery
- Geoscape API - Address validation

### Strengths of Current Design

✅ **Simplicity**: Single codebase, single deployment  
✅ **Performance**: No inter-service latency  
✅ **Cost-effective**: Minimal request overhead  
✅ **Easy debugging**: Unified logs and traces  
✅ **Rapid development**: No distributed systems complexity  

### Limitations

⚠️ **Not reusable**: Email/SMS logic coupled to ra2033  
⚠️ **Scaling**: All components scale together  
⚠️ **Credential scope**: AWS keys accessible to all code  
⚠️ **Deployment**: Changes to any component require full deploy  

---

## Modular Architecture Vision

### Hybrid Architecture (Recommended)

Extract reusable infrastructure while keeping business logic together.

```
┌────────────────────────┐
│   ra2033-worker        │
├────────────────────────┤
│ • Petition logic       │
│ • Newsletter campaigns │
│ • Admin UI             │
│ • Auth & routing       │
└────────────────────────┘
         │
         │ Service Binding
         ▼
┌────────────────────────┐
│ email-service-worker   │
├────────────────────────┤
│ • Transactional email  │
│ • Bulk campaign email  │
│ • SES integration      │
│ • SNS webhook handling │
│ • Quota management     │
│ • Reputation tracking  │
└────────────────────────┘
         │
         ▼
   ┌──────────┐
   │ AWS SES  │
   │ AWS SNS  │
   └──────────┘
```

### Architecture Comparison

| Aspect | Monolithic | Hybrid | Fully Modular |
|--------|-----------|--------|---------------|
| **Workers** | 1 | 2-3 | 5+ |
| **Deployment** | Single | 2-3 separate | Many separate |
| **Reusability** | None | Medium | High |
| **Complexity** | Low | Medium | High |
| **Cost/month** | $50 | $70-100 | $150+ |
| **Latency** | 0ms overhead | 5-20ms | 20-50ms |
| **Best For** | MVP, single app | Platform, 2-3 apps | Enterprise, many teams |

### Service Boundaries

**Keep in Main Worker:**
- Business logic (petitions, campaigns)
- Application-specific features
- Admin UI and frontend
- User-facing routes

**Extract to Services:**
- Infrastructure utilities (email, SMS)
- Cross-cutting concerns (logging, metrics)
- Shared resources (templates, media)
- External integrations (payment, analytics)

---

## Email Service Worker Specification

### Purpose

A dedicated Worker for all email operations, reusable across multiple applications.

### Responsibilities

1. **Send transactional emails**
   - Confirmations, password resets
   - One-to-one communications
   - Template rendering

2. **Send campaign emails**
   - Bulk email delivery
   - Batch processing
   - Throttling and quota management

3. **Handle SNS webhooks**
   - Bounce notifications
   - Complaint notifications
   - Delivery status updates

4. **Track email reputation**
   - Bounce rates
   - Complaint rates
   - Delivery statistics

5. **Manage SES quotas**
   - Daily sending limits
   - Rate limiting
   - Quota warnings

### API Design

#### POST `/send/transactional`

Send a single transactional email.

**Request:**
```json
{
  "to": "user@example.com",
  "subject": "Confirm your subscription",
  "html": "<html>...</html>",
  "text": "Plain text version...",
  "from": {
    "name": "Newsletter Team",
    "email": "newsletter@example.com"
  },
  "replyTo": "support@example.com",
  "template": "confirmation",
  "variables": {
    "name": "John Doe",
    "confirmUrl": "https://..."
  },
  "metadata": {
    "app": "ra2033",
    "type": "subscription_confirm",
    "userId": 123
  },
  "tags": ["transactional", "subscription"]
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "01234567890abcdef",
  "status": "sent",
  "quotaRemaining": 9950
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "daily_quota_exceeded",
  "message": "Daily sending quota of 10,000 emails exceeded",
  "quotaReset": 1706745600
}
```

#### POST `/send/batch`

Send multiple emails in a batch (for campaigns).

**Request:**
```json
{
  "batch": [
    {
      "to": "user1@example.com",
      "subject": "Monthly Newsletter",
      "html": "<html>...</html>",
      "metadata": { "campaignId": 123, "subscriberId": 456 }
    },
    {
      "to": "user2@example.com",
      "subject": "Monthly Newsletter",
      "html": "<html>...</html>",
      "metadata": { "campaignId": 123, "subscriberId": 457 }
    }
  ],
  "from": {
    "name": "Newsletter Team",
    "email": "newsletter@example.com"
  },
  "options": {
    "throttle": true,
    "maxPerSecond": 14
  }
}
```

**Response:**
```json
{
  "success": true,
  "sent": 2,
  "failed": 0,
  "results": [
    { "to": "user1@example.com", "messageId": "abc123", "status": "sent" },
    { "to": "user2@example.com", "messageId": "def456", "status": "sent" }
  ],
  "quotaRemaining": 9948
}
```

#### POST `/webhooks/sns/bounce`

Handle SES bounce notifications via SNS.

**SNS Payload:**
```json
{
  "Type": "Notification",
  "Message": {
    "notificationType": "Bounce",
    "bounce": {
      "bounceType": "Permanent",
      "bouncedRecipients": [
        {
          "emailAddress": "user@example.com",
          "status": "5.1.1",
          "diagnosticCode": "smtp; 550 user unknown"
        }
      ]
    },
    "mail": {
      "messageId": "01234567890abcdef",
      "timestamp": "2025-01-24T10:00:00.000Z"
    }
  }
}
```

**Processing:**
1. Verify SNS signature
2. Parse bounce notification
3. Update subscriber status in D1
4. Add to suppression list if permanent
5. Return 200 OK

#### POST `/webhooks/sns/complaint`

Handle SES complaint notifications.

**Processing:**
1. Verify SNS signature
2. Parse complaint notification
3. Update subscriber status to "complained"
4. Add to suppression list
5. Alert admins if complaint rate > threshold
6. Return 200 OK

#### GET `/status/quota`

Check current SES sending quota status.

**Response:**
```json
{
  "daily": {
    "limit": 10000,
    "sent": 4523,
    "remaining": 5477,
    "percentUsed": 45.23,
    "resetAt": 1706745600
  },
  "rateLimit": {
    "maxPerSecond": 14,
    "currentRate": 8.5
  }
}
```

#### GET `/status/reputation`

Check email sending reputation metrics.

**Response:**
```json
{
  "bounceRate": 1.2,
  "complaintRate": 0.05,
  "deliveryRate": 98.75,
  "period": "last_30_days",
  "status": "good",
  "warnings": []
}
```

### Authentication

**API Key Authentication:**
```http
POST /send/transactional
Authorization: Bearer sk_live_abc123def456
Content-Type: application/json
```

**Service Binding (Preferred):**
```typescript
// In ra2033-worker
const response = await env.EMAIL_SERVICE.fetch(
  'https://email-service/send/transactional',
  {
    method: 'POST',
    headers: {
      'X-Service-Token': env.EMAIL_SERVICE_TOKEN
    },
    body: JSON.stringify(emailParams)
  }
);
```

### Error Handling

**Error Codes:**
- `invalid_recipient` - Email address validation failed
- `suppression_list` - Email on bounce/complaint list
- `daily_quota_exceeded` - Daily sending limit reached
- `rate_limit_exceeded` - Per-second rate limit exceeded
- `ses_error` - AWS SES returned error
- `invalid_template` - Template not found or invalid
- `authentication_failed` - Invalid API key or token

**Retry Strategy:**
- Transient errors: 3 retries with exponential backoff
- Rate limiting: Queue for retry after throttle period
- Permanent failures: Immediate rejection, no retry

### Database Schema

**Email sends tracking:**
```sql
CREATE TABLE email_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  send_type TEXT NOT NULL, -- 'transactional' or 'campaign'
  status TEXT NOT NULL, -- 'sent', 'delivered', 'bounced', 'complained'
  app_name TEXT NOT NULL,
  metadata TEXT, -- JSON
  sent_at INTEGER NOT NULL,
  delivered_at INTEGER,
  bounced_at INTEGER,
  complained_at INTEGER,
  bounce_type TEXT,
  bounce_reason TEXT
);

CREATE INDEX idx_email_sends_message_id ON email_sends(message_id);
CREATE INDEX idx_email_sends_recipient ON email_sends(recipient);
CREATE INDEX idx_email_sends_app ON email_sends(app_name);
CREATE INDEX idx_email_sends_status ON email_sends(status);
```

**Suppression list:**
```sql
CREATE TABLE email_suppression (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  reason TEXT NOT NULL, -- 'bounce', 'complaint', 'manual'
  bounce_type TEXT, -- 'permanent', 'transient'
  added_at INTEGER NOT NULL,
  added_by TEXT -- app name or 'system'
);

CREATE UNIQUE INDEX idx_email_suppression_email ON email_suppression(email);
```

### Monitoring & Observability

**Metrics to Track:**
- Emails sent per minute/hour/day
- Success/failure rates
- Bounce rates by type
- Complaint rates
- Average send latency
- Queue depth
- Quota utilization

**Alerts:**
- Daily quota >90% used
- Bounce rate >5%
- Complaint rate >0.1%
- Send failures >10% in 5min
- SES API errors

---

## Migration Strategy

### Phase 1: Monolithic Implementation (Weeks 1-6)

**Goal**: Build newsletter features in ra2033-worker

**Tasks:**
- ✅ Implement in single Worker
- ✅ Use abstraction layer for email sending
- ✅ Plan for future extraction

**Code Structure:**
```typescript
// src/worker/services/email-service.ts
interface EmailService {
  sendTransactional(params: EmailParams): Promise<EmailResult>;
  sendBatch(batch: EmailParams[]): Promise<BatchResult>;
}

// Local implementation (Phase 1)
class LocalEmailService implements EmailService {
  constructor(private env: Env) {}
  
  async sendTransactional(params: EmailParams) {
    // Direct SES integration
    const sesClient = new SESClient({...});
    // ... send email
  }
}

// Usage in routes
app.post('/api/newsletter/subscribe', async (c) => {
  const emailService = new LocalEmailService(c.env);
  await emailService.sendTransactional({...});
});
```

**Benefits:**
- Fast development
- No service complexity
- Easy debugging

### Phase 2: Extract Email Service (Weeks 7-8)

**Goal**: Create email-service-worker and migrate

**Tasks:**

**Week 7: Build Email Service Worker**
1. Create new Worker project
2. Implement email service API
3. Add authentication
4. Test independently

**Week 8: Migrate ra2033**
1. Add service binding to wrangler.json
2. Implement RemoteEmailService
3. Feature flag for gradual rollout
4. Monitor and compare performance
5. Complete migration

**Code Changes:**
```typescript
// src/worker/services/email-service.ts

// Remote implementation (Phase 2)
class RemoteEmailService implements EmailService {
  constructor(private env: Env) {}
  
  async sendTransactional(params: EmailParams) {
    const response = await this.env.EMAIL_SERVICE.fetch(
      'https://email-service/send/transactional',
      {
        method: 'POST',
        headers: {
          'X-Service-Token': this.env.EMAIL_SERVICE_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      }
    );
    
    if (!response.ok) {
      throw new Error(`Email service error: ${response.status}`);
    }
    
    return response.json();
  }
}

// Factory with feature flag
function createEmailService(env: Env): EmailService {
  const useRemote = env.USE_EMAIL_SERVICE === 'true';
  return useRemote 
    ? new RemoteEmailService(env)
    : new LocalEmailService(env);
}
```

**wrangler.json changes:**
```json
{
  "services": [
    {
      "binding": "EMAIL_SERVICE",
      "service": "email-service-worker"
    }
  ],
  "vars": {
    "USE_EMAIL_SERVICE": "true"
  }
}
```

### Phase 3: Expand & Optimize (Weeks 9+)

**Goal**: Optimize and enable reuse

**Tasks:**
- Add template management
- Implement advanced throttling
- Build analytics dashboard
- Document API for other apps
- Add SDK/client libraries

---

## Implementation Patterns

### Service Interface Pattern

Always code against interfaces, not implementations.

```typescript
// Define interface
interface EmailService {
  sendTransactional(params: EmailParams): Promise<EmailResult>;
  sendBatch(batch: EmailParams[]): Promise<BatchResult>;
}

// Local implementation
class LocalEmailService implements EmailService { }

// Remote implementation
class RemoteEmailService implements EmailService { }

// Mock for testing
class MockEmailService implements EmailService { }
```

**Benefits:**
- Easy to swap implementations
- Testable with mocks
- Future-proof for service extraction

### Feature Flags for Migration

Use environment variables to control service usage.

```typescript
const config = {
  useEmailService: env.USE_EMAIL_SERVICE === 'true',
  useAnalyticsService: env.USE_ANALYTICS_SERVICE === 'true',
};

// Gradual rollout
if (config.useEmailService && Math.random() < 0.1) {
  // 10% of traffic to new service
  emailService = new RemoteEmailService(env);
} else {
  emailService = new LocalEmailService(env);
}
```

### Circuit Breaker Pattern

Protect against cascading failures.

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private readonly threshold = 5;
  private readonly timeout = 60000; // 1 minute
  
  async execute<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    // If circuit is open, use fallback
    if (this.isOpen()) {
      return fallback();
    }
    
    try {
      const result = await fn();
      this.reset();
      return result;
    } catch (error) {
      this.recordFailure();
      
      if (this.isOpen()) {
        return fallback();
      }
      
      throw error;
    }
  }
  
  private isOpen(): boolean {
    return this.failures >= this.threshold &&
           Date.now() - this.lastFailure < this.timeout;
  }
  
  private recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
  }
  
  private reset() {
    this.failures = 0;
  }
}

// Usage
const breaker = new CircuitBreaker();

const result = await breaker.execute(
  () => remoteEmailService.send(params),
  () => localEmailService.send(params) // Fallback to local
);
```

### Request Tracing

Track requests across service boundaries.

```typescript
// Generate trace ID
const traceId = crypto.randomUUID();

// Pass in headers
const response = await env.EMAIL_SERVICE.fetch(url, {
  headers: {
    'X-Trace-ID': traceId,
    'X-Request-ID': requestId
  }
});

// Log with trace ID
console.log({
  traceId,
  service: 'email-service',
  operation: 'send_transactional',
  duration: Date.now() - start
});
```

### Error Handling Strategy

```typescript
class ServiceError extends Error {
  constructor(
    message: string,
    public service: string,
    public statusCode: number,
    public retryable: boolean
  ) {
    super(message);
  }
}

async function callService(url: string, options: RequestInit) {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new ServiceError(
        await response.text(),
        'email-service',
        response.status,
        response.status >= 500 // Retry on 5xx
      );
    }
    
    return response.json();
  } catch (error) {
    if (error instanceof ServiceError && error.retryable) {
      // Implement retry logic
      return retryWithBackoff(() => callService(url, options));
    }
    throw error;
  }
}
```

---

## Cost & Performance Analysis

### Request Cost Breakdown

**Monolithic Architecture:**
```
User Request → ra2033-worker (1 request)
Cost: $0.50 per 1M requests
Monthly (10M requests): $5
```

**Hybrid Architecture:**
```
User Request → ra2033-worker (1 request)
              → email-service-worker (1 request)
Cost: $0.50 per 1M requests × 2 services
Monthly (10M requests × 2): $10
```

**Additional Overhead:**
- Service binding: ~$0.02 per 1M calls
- Durable Objects: ~$0.15 per 1M requests
- D1 reads: ~$0.25 per 1M reads

### Performance Comparison

**Monolithic:**
- Email send: 50-100ms (direct SES)
- No inter-service latency
- Simple call stack

**Hybrid:**
- Email send: 55-120ms (includes service call)
- Service binding: 5-20ms overhead
- Two-hop architecture

**Impact:**
- 10-20% latency increase
- Negligible for async operations (emails)
- Critical path: Keep synchronous operations in main Worker

### Scaling Characteristics

| Metric | Monolithic | Hybrid |
|--------|-----------|--------|
| **Requests/sec** | 10,000 | 10,000 (each) |
| **Scale limit** | Worker CPU limit | Per-service limits |
| **Bottlenecks** | Single Worker | Distributed |
| **Cost scaling** | Linear | Super-linear |

### Cost at Scale

**100k subscribers, 4 campaigns/month:**

| Architecture | Requests | Cost |
|--------------|----------|------|
| Monolithic | 400k | $0.20 |
| Hybrid | 800k | $0.40 |
| + D1 | 1.2M reads | $0.30 |
| + DOs | 400k | $0.06 |
| **Monthly Total** | | **$0.50-0.76** |

**Conclusion:** Cost difference is negligible at moderate scale.

---

## Decision Framework

### When to Extract a Service

Use this decision matrix:

#### ✅ Strong Signals to Extract

1. **Reuse across 2+ applications**
   - Example: Email service used by ra2033 + other apps
   
2. **Different scaling needs**
   - Example: Analytics needs high write throughput
   
3. **Security isolation required**
   - Example: Payment processing with PCI compliance
   
4. **Team boundaries**
   - Example: Different teams own different services
   
5. **Technology diversity**
   - Example: ML model needs Python Worker

#### ⚠️ Weak Signals (Wait)

1. **"It feels cleaner"**
   - Not a good reason alone
   
2. **"We might need it later"**
   - YAGNI - extract when needed
   
3. **"Microservices are best practice"**
   - Context matters, not dogma
   
4. **"The file is getting big"**
   - Refactor within Worker first

#### ❌ Anti-patterns (Don't Extract)

1. **Tightly coupled logic**
   - Business rules that change together
   
2. **High-frequency synchronous calls**
   - Chat protocols, real-time features
   
3. **Shared state requirements**
   - Things that need transactions
   
4. **Early-stage MVP**
   - Wait for product-market fit

### Decision Checklist

Before extracting a service, answer these:

- [ ] Will this code be used by 2+ applications?
- [ ] Does it have clearly defined boundaries?
- [ ] Can it operate independently?
- [ ] Is the API stable enough?
- [ ] Do we have monitoring/alerting?
- [ ] Is the team ready for distributed systems?
- [ ] Have we measured the performance impact?
- [ ] Is the additional cost justified?

If you answered **yes to 6+**, extraction is probably worth it.

### Good Candidates for Extraction

**Infrastructure Services:**
- ✅ Email sending (SES wrapper)
- ✅ SMS sending (SNS wrapper)
- ✅ File processing (image resize, PDF gen)
- ✅ Authentication (OAuth provider)
- ✅ Analytics/metrics aggregation

**Domain Services:**
- ✅ Payment processing
- ✅ Search indexing
- ✅ Recommendation engine
- ✅ Notification routing
- ✅ Audit logging

**Bad Candidates:**
- ❌ Business logic (petition, campaigns)
- ❌ UI/frontend serving
- ❌ Database CRUD operations
- ❌ Request routing
- ❌ Session management

---

## Best Practices

### 1. Start Simple, Extract Later

```typescript
// Phase 1: In main Worker
async function sendEmail(params) {
  // Direct implementation
}

// Phase 2: Abstract interface
interface EmailService {
  send(params): Promise<Result>;
}

// Phase 3: Extract service
class RemoteEmailService implements EmailService {
  // Service call
}
```

### 2. Design for Observability

```typescript
// Add tracing to all service calls
const span = tracer.startSpan('email-service.send');
try {
  const result = await emailService.send(params);
  span.setStatus({ code: SpanStatusCode.OK });
  return result;
} catch (error) {
  span.setStatus({ code: SpanStatusCode.ERROR });
  throw error;
} finally {
  span.end();
}
```

### 3. Implement Health Checks

```typescript
// In each service
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    version: '1.0.0',
    uptime: process.uptime(),
    dependencies: {
      database: await checkDatabase(),
      ses: await checkSES()
    }
  });
});
```

### 4. Version Your APIs

```typescript
// Support multiple versions
app.post('/v1/send', handleV1);
app.post('/v2/send', handleV2);

// Or use headers
const version = c.req.header('API-Version') || 'v1';
```

### 5. Document Service Contracts

Use OpenAPI/Swagger for API documentation:

```yaml
openapi: 3.0.0
info:
  title: Email Service API
  version: 1.0.0
paths:
  /send/transactional:
    post:
      summary: Send transactional email
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/EmailRequest'
```

### 6. Test Service Integrations

```typescript
describe('Email Service Integration', () => {
  it('should send email via service', async () => {
    const mockService = new MockEmailService();
    const result = await mockService.send({
      to: 'test@example.com',
      subject: 'Test'
    });
    
    expect(result.success).toBe(true);
  });
  
  it('should fallback on service failure', async () => {
    const circuit = new CircuitBreaker();
    // Simulate failures...
    expect(circuit.isOpen()).toBe(true);
  });
});
```

### 7. Monitor Service Dependencies

Track service-to-service latency and error rates:

```typescript
const metrics = {
  emailService: {
    calls: 0,
    errors: 0,
    totalLatency: 0,
    avgLatency: 0
  }
};

function recordServiceCall(service, latency, error) {
  metrics[service].calls++;
  if (error) metrics[service].errors++;
  metrics[service].totalLatency += latency;
  metrics[service].avgLatency = 
    metrics[service].totalLatency / metrics[service].calls;
}
```

---

## Appendix: Example Configurations

### Monolithic wrangler.json

```json
{
  "name": "ra2033",
  "main": "src/worker/index.ts",
  "compatibility_date": "2024-01-01",
  "vars": {
    "AWS_REGION": "ap-southeast-2",
    "SES_FROM_EMAIL": "noreply@example.com"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ra2033-db",
      "database_id": "xxx"
    }
  ]
}
```

### Hybrid wrangler.json

```json
{
  "name": "ra2033",
  "main": "src/worker/index.ts",
  "compatibility_date": "2024-01-01",
  "services": [
    {
      "binding": "EMAIL_SERVICE",
      "service": "email-service-worker",
      "environment": "production"
    }
  ],
  "vars": {
    "USE_EMAIL_SERVICE": "true"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ra2033-db",
      "database_id": "xxx"
    }
  ]
}
```

### Email Service wrangler.json

```json
{
  "name": "email-service-worker",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "email-service-db",
      "database_id": "yyy"
    }
  ]
}
```

---

## Summary & Recommendations

### For ra2033 Newsletter Project

**Immediate Action (Phase 1):**
- ✅ Build newsletter features in monolithic ra2033-worker
- ✅ Use abstraction layer (EmailService interface)
- ✅ Keep it simple for MVP

**Future Consideration (Phase 2):**
- ⏱️ Extract email-service-worker when:
  - Building 2nd application
  - Need better AWS credential isolation
  - Want reusable email infrastructure

**Architecture Decision:**
- Start monolithic
- Design with interfaces for future extraction
- Extract when clear benefits emerge (not before)

### Key Takeaways

1. **Monolithic is not bad** - It's the right starting point
2. **Abstraction enables migration** - Interface pattern is crucial
3. **Extract strategically** - Wait for real needs, not hypothetical ones
4. **Cost difference is minimal** - $20/month is worth clean architecture
5. **Hybrid is the sweet spot** - Balance simplicity with reusability

### Related Documentation

- `NEWSLETTER_ARCHITECTURE.md` - Newsletter system design
- `AUTHENTICATION.md` - Auth system details
- `README.md` - Project overview

---

**Document Version**: 1.0  
**Last Updated**: October 24, 2025  
**Status**: Complete - Ready for Reference
