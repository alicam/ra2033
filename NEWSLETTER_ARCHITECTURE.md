# Newsletter System Architecture
## Sendy-Inspired Newsletter for Cloudflare Workers

**Last Updated**: October 24, 2025  
**Confidence Level**: 9/10  
**Status**: Architecture & Planning Phase

---

## Executive Summary

This document outlines the architecture for adding a newsletter feature to the ra2033 project, inspired by Sendy's functionality but built natively for Cloudflare Workers. The system will leverage AWS SES/SNS (already configured) and Cloudflare's Durable Objects with Alarms for campaign scheduling and drip sequences.

### Key Success Factors

✅ **High Compatibility**: Existing AWS SES/SNS integration can be reused  
✅ **Modern Architecture**: TypeScript + Hono + React (cleaner than PHP)  
✅ **Better Security**: Web Crypto API, PII hashing, JWT tokens  
✅ **Serverless Scale**: No PHP server maintenance  
✅ **Durable Objects**: Perfect for campaign scheduling and drip sequences  
✅ **Existing Patterns**: 2FA verification system translates to double opt-in

### Translation Confidence by Feature

| Feature | Confidence | Effort | Notes |
|---------|-----------|---------|-------|
| Subscribe/Unsubscribe | 95% | Low | Nearly identical to existing verification flow |
| Double Opt-in | 95% | Low | Already have verification infrastructure |
| List Management | 90% | Low | Straightforward DB operations in D1 |
| Custom Fields | 85% | Low | Simple schema adaptation (JSON vs delimited strings) |
| API Integration | 90% | Low | Hono makes RESTful APIs easy |
| Campaign Sending | 75% | Medium | Requires Queue + Durable Objects |
| Email Templates | 80% | Medium | R2 storage + rendering engine |
| Tracking (Opens/Clicks) | 70% | Medium | Pixel tracking + redirect URLs |
| Autoresponders/Drips | 85% | Medium | Durable Objects with Alarms (game changer) |
| Advanced Segmentation | 65% | High | D1 query optimization needed |

---

## System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         Public Interface                         │
├─────────────────────────────────────────────────────────────────┤
│  React Frontend  │  Public Subscribe Forms  │  Tracking URLs     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Cloudflare Workers                          │
├─────────────────────────────────────────────────────────────────┤
│  Hono API Routes  │  Rate Limiter DO  │  Auth Middleware        │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│  D1 Database │    │ Durable Objects  │    │  AWS SES/SNS │
├──────────────┤    ├──────────────────┤    ├──────────────┤
│ • Lists      │    │ • Campaign       │    │ • Email Send │
│ • Subscribers│    │   Scheduler DO   │    │ • SMS Send   │
│ • Campaigns  │    │ • Drip Campaign  │    │ • Bounce/    │
│ • Templates  │    │   DO (per user)  │    │   Complaint  │
│ • Events     │    │ • Email Tracker  │    │   Webhooks   │
│ • Tracking   │    │   DO             │    └──────────────┘
└──────────────┘    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Cloudflare Queue │
                    ├──────────────────┤
                    │ • Batch Sending  │
                    │ • Retry Logic    │
                    └──────────────────┘
```

### Data Flow Examples

#### Subscribe Flow (Double Opt-in)
```
1. User submits form → Worker validates
2. Worker → D1: Insert subscriber (confirmed=0)
3. Worker → SES: Send confirmation email
4. User clicks link → Worker validates token
5. Worker → D1: Update subscriber (confirmed=1)
6. Worker → DripCampaignDO: Start welcome sequence
```

#### Campaign Send Flow
```
1. Admin creates campaign → Worker validates
2. Worker → D1: Insert campaign record
3. Worker → CampaignSchedulerDO: Initialize with campaign ID
4. DO Alarm #1 → Fetch 1000 subscribers → Send via SES
5. DO → SES: Send batch, track results
6. DO → D1: Update send statistics
7. DO sets next alarm for next batch
8. Repeat until all subscribers processed
```

#### Drip Campaign Flow
```
1. User subscribes → Worker confirms
2. Worker → DripCampaignDO: Create instance per subscriber
3. DO stores campaign sequence in state
4. DO Alarm Day 0 → Send welcome email
5. DO sets alarm for Day 3
6. DO Alarm Day 3 → Send tips email
7. DO sets alarm for Day 7
8. DO Alarm Day 7 → Send offer email
9. Campaign complete
```

---

## Database Schema

### Core Tables

#### `newsletter_lists`
Manages email lists (campaigns can target multiple lists)

```sql
CREATE TABLE newsletter_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  reply_to TEXT,
  opt_in_type TEXT NOT NULL DEFAULT 'double', -- 'single' or 'double'
  confirmation_subject TEXT,
  confirmation_message TEXT,
  welcome_subject TEXT,
  welcome_message TEXT,
  goodbye_subject TEXT,
  goodbye_message TEXT,
  custom_fields TEXT, -- JSON array of field definitions
  unsubscribe_redirect TEXT,
  subscribe_redirect TEXT,
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_newsletter_lists_active ON newsletter_lists(active);
```

#### `newsletter_subscribers`
Subscriber data with PII hashing (consistent with ra2033 security model)

```sql
CREATE TABLE newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL,
  email_hash TEXT NOT NULL, -- SHA-256 hash for privacy
  email_encrypted TEXT NOT NULL, -- Encrypted for sending (Web Crypto API)
  name TEXT,
  custom_fields TEXT, -- JSON object of custom field values
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'unsubscribed', 'bounced', 'complained'
  confirmed INTEGER DEFAULT 0,
  confirmation_token TEXT,
  confirmation_expires INTEGER,
  ip_address TEXT,
  country_code TEXT,
  referrer TEXT,
  subscribed_at INTEGER,
  confirmed_at INTEGER,
  unsubscribed_at INTEGER,
  last_activity INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (list_id) REFERENCES newsletter_lists(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_newsletter_subscribers_email ON newsletter_subscribers(list_id, email_hash);
CREATE INDEX idx_newsletter_subscribers_status ON newsletter_subscribers(list_id, status);
CREATE INDEX idx_newsletter_subscribers_confirmed ON newsletter_subscribers(confirmed);
CREATE INDEX idx_newsletter_subscribers_token ON newsletter_subscribers(confirmation_token);
```

#### `newsletter_campaigns`
Campaign definitions

```sql
CREATE TABLE newsletter_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  reply_to TEXT,
  template_id INTEGER,
  html_content TEXT NOT NULL,
  text_content TEXT,
  track_opens INTEGER DEFAULT 1,
  track_clicks INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled'
  send_at INTEGER, -- Unix timestamp for scheduled sends
  started_at INTEGER,
  completed_at INTEGER,
  created_by INTEGER, -- admin user ID
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (template_id) REFERENCES newsletter_templates(id) ON DELETE SET NULL
);

CREATE INDEX idx_newsletter_campaigns_status ON newsletter_campaigns(status);
CREATE INDEX idx_newsletter_campaigns_send_at ON newsletter_campaigns(send_at);
```

#### `newsletter_campaign_lists`
Many-to-many relationship between campaigns and lists

```sql
CREATE TABLE newsletter_campaign_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  list_id INTEGER NOT NULL,
  segment_criteria TEXT, -- JSON for segmentation rules
  FOREIGN KEY (campaign_id) REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES newsletter_lists(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_campaign_lists ON newsletter_campaign_lists(campaign_id, list_id);
```

#### `newsletter_sends`
Track individual email sends

```sql
CREATE TABLE newsletter_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  subscriber_id INTEGER NOT NULL,
  message_id TEXT, -- SES message ID
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'bounced', 'complained'
  sent_at INTEGER NOT NULL,
  opened_at INTEGER,
  clicked_at INTEGER,
  bounced_at INTEGER,
  complained_at INTEGER,
  unsubscribed_at INTEGER,
  error_message TEXT,
  FOREIGN KEY (campaign_id) REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES newsletter_subscribers(id) ON DELETE CASCADE
);

CREATE INDEX idx_newsletter_sends_campaign ON newsletter_sends(campaign_id);
CREATE INDEX idx_newsletter_sends_subscriber ON newsletter_sends(subscriber_id);
CREATE INDEX idx_newsletter_sends_message_id ON newsletter_sends(message_id);
CREATE INDEX idx_newsletter_sends_status ON newsletter_sends(status);
```

#### `newsletter_events`
Detailed event tracking (opens, clicks)

```sql
CREATE TABLE newsletter_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  send_id INTEGER NOT NULL,
  event_type TEXT NOT NULL, -- 'open', 'click', 'bounce', 'complaint', 'unsubscribe'
  event_data TEXT, -- JSON with event details (e.g., clicked URL)
  ip_address TEXT,
  user_agent TEXT,
  occurred_at INTEGER NOT NULL,
  FOREIGN KEY (send_id) REFERENCES newsletter_sends(id) ON DELETE CASCADE
);

CREATE INDEX idx_newsletter_events_send ON newsletter_events(send_id);
CREATE INDEX idx_newsletter_events_type ON newsletter_events(event_type);
CREATE INDEX idx_newsletter_events_occurred ON newsletter_events(occurred_at);
```

#### `newsletter_templates`
Reusable email templates

```sql
CREATE TABLE newsletter_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  html_content TEXT NOT NULL,
  text_content TEXT,
  thumbnail_url TEXT, -- R2 URL for preview
  category TEXT,
  is_system INTEGER DEFAULT 0, -- System templates can't be deleted
  created_by INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_newsletter_templates_category ON newsletter_templates(category);
```

#### `newsletter_drip_campaigns`
Autoresponder/drip sequence definitions

```sql
CREATE TABLE newsletter_drip_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL, -- 'subscribe', 'custom_date', 'tag_added'
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (list_id) REFERENCES newsletter_lists(id) ON DELETE CASCADE
);

CREATE INDEX idx_newsletter_drip_campaigns_list ON newsletter_drip_campaigns(list_id);
CREATE INDEX idx_newsletter_drip_campaigns_active ON newsletter_drip_campaigns(active);
```

#### `newsletter_drip_emails`
Individual emails in a drip sequence

```sql
CREATE TABLE newsletter_drip_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drip_campaign_id INTEGER NOT NULL,
  sequence_order INTEGER NOT NULL,
  delay_days INTEGER NOT NULL, -- Days after previous email (0 for first)
  delay_hours INTEGER DEFAULT 0, -- Additional hours for finer control
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  from_name TEXT,
  from_email TEXT,
  reply_to TEXT,
  track_opens INTEGER DEFAULT 1,
  track_clicks INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (drip_campaign_id) REFERENCES newsletter_drip_campaigns(id) ON DELETE CASCADE
);

CREATE INDEX idx_newsletter_drip_emails_campaign ON newsletter_drip_emails(drip_campaign_id);
CREATE INDEX idx_newsletter_drip_emails_order ON newsletter_drip_emails(sequence_order);
```

#### `newsletter_drip_subscriptions`
Track which subscribers are in which drip campaigns

```sql
CREATE TABLE newsletter_drip_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drip_campaign_id INTEGER NOT NULL,
  subscriber_id INTEGER NOT NULL,
  current_step INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'completed', 'cancelled'
  do_instance_id TEXT NOT NULL, -- Durable Object ID managing this subscription
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  next_send_at INTEGER, -- When next email is scheduled
  FOREIGN KEY (drip_campaign_id) REFERENCES newsletter_drip_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES newsletter_subscribers(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_drip_subs_unique ON newsletter_drip_subscriptions(drip_campaign_id, subscriber_id);
CREATE INDEX idx_drip_subs_status ON newsletter_drip_subscriptions(status);
CREATE INDEX idx_drip_subs_next_send ON newsletter_drip_subscriptions(next_send_at);
CREATE INDEX idx_drip_subs_do_id ON newsletter_drip_subscriptions(do_instance_id);
```

#### `suppression_list` (extends existing or creates new)
Block specific emails or domains

```sql
CREATE TABLE IF NOT EXISTS newsletter_suppression (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- 'email' or 'domain'
  value TEXT NOT NULL, -- email address or domain
  reason TEXT, -- 'bounced', 'complained', 'manual', 'unsubscribed'
  added_by INTEGER, -- admin user ID
  added_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_newsletter_suppression_value ON newsletter_suppression(type, value);
CREATE INDEX idx_newsletter_suppression_type ON newsletter_suppression(type);
```

### Migration Strategy

**Option 1: Separate Newsletter System**
- Keep `public_signatures` table as-is
- Add all new newsletter tables
- Add optional linking: `newsletter_subscribers.signature_id` (nullable FK)

**Option 2: Unified System**
- Convert `public_signatures` → `newsletter_subscribers`
- Add `signature_data` JSON field to preserve petition-specific data
- Unified management of all contacts

**Recommendation**: Start with Option 1 (separate) for cleaner architecture, merge later if needed.

---

## Durable Objects Architecture

### 1. CampaignSchedulerDO
Manages batch sending of campaigns

```typescript
// src/worker/campaign-scheduler-do.ts
export class CampaignSchedulerDO {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/start') {
      return this.startCampaign(request);
    } else if (url.pathname === '/pause') {
      return this.pauseCampaign();
    } else if (url.pathname === '/resume') {
      return this.resumeCampaign();
    } else if (url.pathname === '/status') {
      return this.getStatus();
    }
    
    return new Response('Not found', { status: 404 });
  }

  async startCampaign(request: Request) {
    const { campaignId } = await request.json();
    
    // Initialize campaign state
    await this.state.storage.put({
      campaignId,
      status: 'sending',
      currentBatch: 0,
      totalSent: 0,
      totalFailed: 0,
      startedAt: Date.now()
    });
    
    // Schedule first batch immediately
    await this.state.storage.setAlarm(Date.now() + 1000);
    
    return Response.json({ success: true });
  }

  async alarm() {
    const state = await this.state.storage.get('campaignId');
    if (!state) return;
    
    const { campaignId, currentBatch, status } = state;
    
    if (status !== 'sending') return;
    
    // Fetch next batch of subscribers
    const BATCH_SIZE = 100;
    const offset = currentBatch * BATCH_SIZE;
    
    const db = this.env.DB;
    const subscribers = await db.prepare(`
      SELECT s.id, s.email_encrypted, s.name
      FROM newsletter_subscribers s
      JOIN newsletter_campaign_lists cl ON cl.list_id = s.list_id
      WHERE cl.campaign_id = ?
        AND s.status = 'active'
        AND s.confirmed = 1
        AND s.id NOT IN (
          SELECT subscriber_id 
          FROM newsletter_sends 
          WHERE campaign_id = ?
        )
      LIMIT ? OFFSET ?
    `).bind(campaignId, campaignId, BATCH_SIZE, offset).all();
    
    if (subscribers.results.length === 0) {
      // Campaign complete
      await this.completeCampaign();
      return;
    }
    
    // Send emails via SES
    const results = await this.sendBatch(campaignId, subscribers.results);
    
    // Update statistics
    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    await this.state.storage.put({
      ...state,
      currentBatch: currentBatch + 1,
      totalSent: state.totalSent + sent,
      totalFailed: state.totalFailed + failed
    });
    
    // Schedule next batch (1 minute delay to respect SES rate limits)
    await this.state.storage.setAlarm(Date.now() + 60 * 1000);
  }

  async sendBatch(campaignId: number, subscribers: any[]) {
    const campaign = await this.env.DB.prepare(
      'SELECT * FROM newsletter_campaigns WHERE id = ?'
    ).bind(campaignId).first();
    
    const results = [];
    
    for (const subscriber of subscribers) {
      try {
        // Decrypt email
        const email = await this.decryptEmail(subscriber.email_encrypted);
        
        // Generate tracking pixel and links
        const html = await this.injectTracking(
          campaign.html_content,
          campaignId,
          subscriber.id
        );
        
        // Send via SES
        const messageId = await this.sendViaSES({
          to: email,
          subject: campaign.subject,
          html,
          from: `${campaign.from_name} <${campaign.from_email}>`,
          replyTo: campaign.reply_to
        });
        
        // Record send
        await this.env.DB.prepare(`
          INSERT INTO newsletter_sends 
          (campaign_id, subscriber_id, message_id, status, sent_at)
          VALUES (?, ?, ?, 'sent', ?)
        `).bind(campaignId, subscriber.id, messageId, Date.now()).run();
        
        results.push({ success: true, subscriberId: subscriber.id });
      } catch (error) {
        results.push({ 
          success: false, 
          subscriberId: subscriber.id, 
          error: error.message 
        });
        
        // Record failure
        await this.env.DB.prepare(`
          INSERT INTO newsletter_sends 
          (campaign_id, subscriber_id, status, sent_at, error_message)
          VALUES (?, ?, 'failed', ?, ?)
        `).bind(
          campaignId, 
          subscriber.id, 
          Date.now(), 
          error.message
        ).run();
      }
    }
    
    return results;
  }

  async sendViaSES(params: EmailParams) {
    // Use AWS SDK v3 to send via SES
    // (Similar to your existing email sending code)
    const sesClient = new SESClient({
      region: this.env.AWS_REGION,
      credentials: {
        accessKeyId: this.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: this.env.AWS_SECRET_ACCESS_KEY
      }
    });
    
    const command = new SendEmailCommand({
      Source: params.from,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: params.subject },
        Body: { Html: { Data: params.html } }
      },
      ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined
    });
    
    const response = await sesClient.send(command);
    return response.MessageId;
  }

  async pauseCampaign() {
    const state = await this.state.storage.get('campaignId');
    await this.state.storage.put({ ...state, status: 'paused' });
    await this.state.storage.deleteAlarm();
    return Response.json({ success: true });
  }

  async resumeCampaign() {
    const state = await this.state.storage.get('campaignId');
    await this.state.storage.put({ ...state, status: 'sending' });
    await this.state.storage.setAlarm(Date.now() + 1000);
    return Response.json({ success: true });
  }

  async completeCampaign() {
    const state = await this.state.storage.get('campaignId');
    
    // Update campaign status in DB
    await this.env.DB.prepare(`
      UPDATE newsletter_campaigns 
      SET status = 'sent', completed_at = ?
      WHERE id = ?
    `).bind(Date.now(), state.campaignId).run();
    
    await this.state.storage.put({ ...state, status: 'completed' });
  }

  async getStatus() {
    const state = await this.state.storage.get('campaignId');
    return Response.json(state || { error: 'No campaign active' });
  }
}
```

### 2. DripCampaignDO
Per-subscriber drip sequence management

```typescript
// src/worker/drip-campaign-do.ts
export class DripCampaignDO {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/start') {
      return this.startDrip(request);
    } else if (url.pathname === '/pause') {
      return this.pauseDrip();
    } else if (url.pathname === '/cancel') {
      return this.cancelDrip();
    }
    
    return new Response('Not found', { status: 404 });
  }

  async startDrip(request: Request) {
    const { dripCampaignId, subscriberId } = await request.json();
    
    // Load drip campaign emails
    const emails = await this.env.DB.prepare(`
      SELECT * FROM newsletter_drip_emails
      WHERE drip_campaign_id = ? AND active = 1
      ORDER BY sequence_order ASC
    `).bind(dripCampaignId).all();
    
    // Store in DO state
    await this.state.storage.put({
      dripCampaignId,
      subscriberId,
      emails: emails.results,
      currentStep: 0,
      status: 'active',
      startedAt: Date.now()
    });
    
    // Record in DB
    await this.env.DB.prepare(`
      INSERT INTO newsletter_drip_subscriptions
      (drip_campaign_id, subscriber_id, current_step, status, 
       do_instance_id, started_at, next_send_at)
      VALUES (?, ?, 0, 'active', ?, ?, ?)
    `).bind(
      dripCampaignId,
      subscriberId,
      this.state.id.toString(),
      Date.now(),
      Date.now() + 1000 // Send first email immediately
    ).run();
    
    // Schedule first email
    await this.state.storage.setAlarm(Date.now() + 1000);
    
    return Response.json({ success: true });
  }

  async alarm() {
    const state = await this.state.storage.get('dripCampaignId');
    if (!state || state.status !== 'active') return;
    
    const { dripCampaignId, subscriberId, emails, currentStep } = state;
    
    if (currentStep >= emails.length) {
      await this.completeDrip();
      return;
    }
    
    // Get current email
    const email = emails[currentStep];
    
    // Get subscriber details
    const subscriber = await this.env.DB.prepare(`
      SELECT email_encrypted, name FROM newsletter_subscribers WHERE id = ?
    `).bind(subscriberId).first();
    
    // Send email
    try {
      const recipientEmail = await this.decryptEmail(subscriber.email_encrypted);
      
      await this.sendViaSES({
        to: recipientEmail,
        subject: email.subject,
        html: email.html_content,
        from: `${email.from_name} <${email.from_email}>`,
        replyTo: email.reply_to
      });
      
      // Move to next step
      const nextStep = currentStep + 1;
      
      if (nextStep < emails.length) {
        const nextEmail = emails[nextStep];
        const delayMs = (nextEmail.delay_days * 24 * 60 * 60 * 1000) + 
                       (nextEmail.delay_hours * 60 * 60 * 1000);
        const nextSendAt = Date.now() + delayMs;
        
        // Update state
        await this.state.storage.put({
          ...state,
          currentStep: nextStep
        });
        
        // Update DB
        await this.env.DB.prepare(`
          UPDATE newsletter_drip_subscriptions
          SET current_step = ?, next_send_at = ?
          WHERE drip_campaign_id = ? AND subscriber_id = ?
        `).bind(nextStep, nextSendAt, dripCampaignId, subscriberId).run();
        
        // Schedule next email
        await this.state.storage.setAlarm(nextSendAt);
      } else {
        // Campaign complete
        await this.completeDrip();
      }
    } catch (error) {
      console.error('Failed to send drip email:', error);
      // Could implement retry logic here
    }
  }

  async completeDrip() {
    const state = await this.state.storage.get('dripCampaignId');
    
    await this.env.DB.prepare(`
      UPDATE newsletter_drip_subscriptions
      SET status = 'completed', completed_at = ?
      WHERE drip_campaign_id = ? AND subscriber_id = ?
    `).bind(Date.now(), state.dripCampaignId, state.subscriberId).run();
    
    await this.state.storage.put({ ...state, status: 'completed' });
  }

  async pauseDrip() {
    const state = await this.state.storage.get('dripCampaignId');
    await this.state.storage.put({ ...state, status: 'paused' });
    await this.state.storage.deleteAlarm();
    
    await this.env.DB.prepare(`
      UPDATE newsletter_drip_subscriptions
      SET status = 'paused'
      WHERE drip_campaign_id = ? AND subscriber_id = ?
    `).bind(state.dripCampaignId, state.subscriberId).run();
    
    return Response.json({ success: true });
  }

  async cancelDrip() {
    const state = await this.state.storage.get('dripCampaignId');
    await this.state.storage.put({ ...state, status: 'cancelled' });
    await this.state.storage.deleteAlarm();
    
    await this.env.DB.prepare(`
      UPDATE newsletter_drip_subscriptions
      SET status = 'cancelled'
      WHERE drip_campaign_id = ? AND subscriber_id = ?
    `).bind(state.dripCampaignId, state.subscriberId).run();
    
    return Response.json({ success: true });
  }
}
```

### 3. EmailTrackerDO
Coordinates tracking pixel requests and click redirects

```typescript
// src/worker/email-tracker-do.ts
export class EmailTrackerDO {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/open') {
      return this.trackOpen(request);
    } else if (url.pathname === '/click') {
      return this.trackClick(request);
    }
    
    return new Response('Not found', { status: 404 });
  }

  async trackOpen(request: Request) {
    const url = new URL(request.url);
    const sendId = url.searchParams.get('s');
    
    if (!sendId) {
      return new Response(transparent1x1Pixel, {
        headers: { 'Content-Type': 'image/gif' }
      });
    }
    
    // Check if already tracked (prevent double-counting)
    const existing = await this.env.DB.prepare(`
      SELECT id FROM newsletter_events
      WHERE send_id = ? AND event_type = 'open'
      LIMIT 1
    `).bind(sendId).first();
    
    if (!existing) {
      // Record open event
      await this.env.DB.prepare(`
        INSERT INTO newsletter_events
        (send_id, event_type, ip_address, user_agent, occurred_at)
        VALUES (?, 'open', ?, ?, ?)
      `).bind(
        sendId,
        request.headers.get('CF-Connecting-IP'),
        request.headers.get('User-Agent'),
        Date.now()
      ).run();
      
      // Update send record
      await this.env.DB.prepare(`
        UPDATE newsletter_sends
        SET opened_at = ?
        WHERE id = ? AND opened_at IS NULL
      `).bind(Date.now(), sendId).run();
    }
    
    // Return 1x1 transparent GIF
    return new Response(transparent1x1Pixel, {
      headers: { 
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  async trackClick(request: Request) {
    const url = new URL(request.url);
    const sendId = url.searchParams.get('s');
    const targetUrl = url.searchParams.get('url');
    
    if (!sendId || !targetUrl) {
      return new Response('Invalid parameters', { status: 400 });
    }
    
    // Record click event
    await this.env.DB.prepare(`
      INSERT INTO newsletter_events
      (send_id, event_type, event_data, ip_address, user_agent, occurred_at)
      VALUES (?, 'click', ?, ?, ?, ?)
    `).bind(
      sendId,
      JSON.stringify({ url: targetUrl }),
      request.headers.get('CF-Connecting-IP'),
      request.headers.get('User-Agent'),
      Date.now()
    ).run();
    
    // Update send record (first click only)
    await this.env.DB.prepare(`
      UPDATE newsletter_sends
      SET clicked_at = ?
      WHERE id = ? AND clicked_at IS NULL
    `).bind(Date.now(), sendId).run();
    
    // Redirect to target URL
    return Response.redirect(decodeURIComponent(targetUrl), 302);
  }
}

const transparent1x1Pixel = atob(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
);
```

---

## API Endpoints

### Subscriber Management

#### POST `/api/newsletter/subscribe`
Subscribe to a newsletter list

```typescript
// Request
{
  "email": "user@example.com",
  "name": "John Doe",
  "listId": 1,
  "customFields": {
    "company": "Acme Corp",
    "role": "Developer"
  },
  "gdprConsent": true
}

// Response (success)
{
  "success": true,
  "message": "Confirmation email sent",
  "requiresConfirmation": true
}

// Response (already subscribed)
{
  "success": false,
  "error": "Already subscribed"
}
```

#### GET `/api/newsletter/confirm/:token`
Confirm subscription

```typescript
// Response
{
  "success": true,
  "message": "Subscription confirmed"
}
```

#### POST `/api/newsletter/unsubscribe`
Unsubscribe from list

```typescript
// Request
{
  "email": "user@example.com",
  "listId": 1,
  "token": "encrypted_token" // From unsubscribe link
}

// Response
{
  "success": true,
  "message": "Unsubscribed successfully"
}
```

### Campaign Management

#### POST `/api/newsletter/campaigns`
Create campaign (requires authentication)

```typescript
// Request
{
  "name": "Monthly Newsletter - January 2025",
  "subject": "Your January Update",
  "fromName": "Newsletter Team",
  "fromEmail": "newsletter@example.com",
  "htmlContent": "<html>...</html>",
  "textContent": "Plain text version...",
  "listIds": [1, 2],
  "trackOpens": true,
  "trackClicks": true,
  "sendAt": 1706745600 // Optional: schedule for future
}

// Response
{
  "success": true,
  "campaignId": 123,
  "status": "draft" // or "scheduled" if sendAt provided
}
```

#### GET `/api/newsletter/campaigns/:id`
Get campaign details

```typescript
// Response
{
  "id": 123,
  "name": "Monthly Newsletter - January 2025",
  "subject": "Your January Update",
  "status": "sent",
  "stats": {
    "sent": 10000,
    "opened": 4500,
    "clicked": 890,
    "bounced": 45,
    "unsubscribed": 12
  },
  "createdAt": 1706745600,
  "sentAt": 1706831000
}
```

#### POST `/api/newsletter/campaigns/:id/send`
Start sending campaign

```typescript
// Response
{
  "success": true,
  "message": "Campaign sending started",
  "doInstanceId": "campaign-123"
}
```

### Webhook Endpoints (for AWS SNS)

#### POST `/webhooks/ses/bounce`
Handle SES bounce notifications

#### POST `/webhooks/ses/complaint`
Handle SES complaint notifications

---

## Implementation Roadmap

### Phase 1: Core Subscriber Management (2-3 weeks)

**Week 1: Database & Backend**
- [ ] Create database migration with all newsletter tables
- [ ] Implement subscriber CRUD operations
- [ ] Build subscribe/unsubscribe API endpoints
- [ ] Add double opt-in confirmation flow
- [ ] Implement email/phone hashing for privacy
- [ ] Set up SES integration for transactional emails

**Week 2: Admin UI**
- [ ] Create list management interface
- [ ] Build subscriber management dashboard
- [ ] Add subscriber import (CSV)
- [ ] Implement custom fields UI
- [ ] Add suppression list management

**Week 3: Testing & Polish**
- [ ] Unit tests for subscriber operations
- [ ] Integration tests for opt-in flow
- [ ] Security audit (PII handling, rate limiting)
- [ ] Documentation updates

**Deliverables:**
- Functional subscribe/unsubscribe system
- Admin dashboard for subscriber management
- Double opt-in working with SES

---

### Phase 2: Campaign Sending (2-3 weeks)

**Week 4: Campaign Infrastructure**
- [ ] Create campaign CRUD operations
- [ ] Build email template system (store in R2)
- [ ] Implement template variables/personalization
- [ ] Set up tracking pixel generation
- [ ] Build click tracking redirect system

**Week 5: Durable Objects Implementation**
- [ ] Create CampaignSchedulerDO
- [ ] Implement batch sending with alarms
- [ ] Add pause/resume functionality
- [ ] Build campaign statistics aggregation
- [ ] Implement EmailTrackerDO for opens/clicks

**Week 6: Admin Campaign UI**
- [ ] Campaign creation interface
- [ ] Template builder/editor (WYSIWYG)
- [ ] Campaign scheduling UI
- [ ] Real-time sending progress dashboard
- [ ] Campaign statistics/reports

**Deliverables:**
- Working campaign sending system
- Batch processing via Durable Objects
- Open/click tracking functional
- Admin campaign management UI

---

### Phase 3: Advanced Features (3-4 weeks)

**Week 7-8: Drip Campaigns**
- [ ] Create drip campaign CRUD operations
- [ ] Implement DripCampaignDO
- [ ] Build drip email sequence editor
- [ ] Add trigger system (on subscribe, date-based)
- [ ] Implement per-subscriber DO instances
- [ ] Test multi-day sequences

**Week 9: Segmentation & Targeting**
- [ ] Design segment criteria JSON schema
- [ ] Implement segment query builder
- [ ] Add segment preview functionality
- [ ] Build segment-based campaign targeting
- [ ] Create saved segments feature

**Week 10: Polish & Performance**
- [ ] Optimize D1 queries with proper indexes
- [ ] Implement caching strategies
- [ ] Add comprehensive error handling
- [ ] Build detailed analytics dashboard
- [ ] Performance testing & tuning

**Deliverables:**
- Functional drip campaign system
- Subscriber segmentation
- Advanced analytics
- Production-ready performance

---

### Phase 4: Production Readiness (1 week)

**Week 11: Final Steps**
- [ ] Security audit
- [ ] Load testing (simulate 100k+ subscribers)
- [ ] SES sending quota management
- [ ] Bounce/complaint webhook handlers
- [ ] Comprehensive documentation
- [ ] Admin user guide
- [ ] API documentation
- [ ] Deployment automation

---

## Security & Privacy

### PII Protection

**Email Encryption**
```typescript
// Encrypt before storing
import { subtle } from 'crypto';

async function encryptEmail(email: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function decryptEmail(encrypted: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
```

**Email Hashing (for deduplication)**
```typescript
async function hashEmail(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

### API Key Authentication

```typescript
// Middleware for API endpoints
async function authenticateApiKey(request: Request, env: Env) {
  const apiKey = request.headers.get('X-API-Key');
  
  if (!apiKey) {
    return new Response('Missing API key', { status: 401 });
  }
  
  // Verify against admin_users table
  const admin = await env.DB.prepare(
    'SELECT id FROM admin_users WHERE api_key = ?'
  ).bind(apiKey).first();
  
  if (!admin) {
    return new Response('Invalid API key', { status: 401 });
  }
  
  return admin;
}
```

### Rate Limiting

Use existing `RateLimiterDO` for:
- Subscribe requests: 5 per hour per IP
- API requests: 1000 per hour per API key
- Unsubscribe: No limit (compliance)

### GDPR Compliance

- **Consent tracking**: Store `gdprConsent` flag
- **Double opt-in**: Required by default
- **Easy unsubscribe**: One-click unsubscribe links
- **Data export**: Provide subscriber data export API
- **Right to deletion**: Implement hard delete (not soft delete)
- **Privacy policy links**: Include in all emails

---

## Deployment Guide

### 1. Update wrangler.json

```json
{
  "name": "ra2033",
  "main": "src/worker/index.ts",
  "compatibility_date": "2024-01-01",
  "vars": {
    "AWS_REGION": "ap-southeast-2",
    "SES_FROM_EMAIL": "newsletter@example.com"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ra2033-db",
      "database_id": "your-database-id"
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "name": "RATE_LIMITER",
        "class_name": "RateLimiter",
        "script_name": "ra2033"
      },
      {
        "name": "CAMPAIGN_SCHEDULER",
        "class_name": "CampaignSchedulerDO",
        "script_name": "ra2033"
      },
      {
        "name": "DRIP_CAMPAIGN",
        "class_name": "DripCampaignDO",
        "script_name": "ra2033"
      },
      {
        "name": "EMAIL_TRACKER",
        "class_name": "EmailTrackerDO",
        "script_name": "ra2033"
      }
    ]
  }
}
```

### 2. Run Database Migrations

```bash
# Create newsletter schema migration file
touch newsletter-schema.sql

# Apply to local dev
npx wrangler d1 execute ra2033-db --local --file=newsletter-schema.sql

# Apply to production
npx wrangler d1 execute ra2033-db --remote --file=newsletter-schema.sql
```

### 3. Set Environment Secrets

```bash
# AWS credentials (if not already set)
npx wrangler secret put AWS_ACCESS_KEY_ID
npx wrangler secret put AWS_SECRET_ACCESS_KEY

# Email encryption key (generate new key)
npx wrangler secret put EMAIL_ENCRYPTION_KEY
```

### 4. Deploy

```bash
npm run deploy
```

### 5. Verify Deployment

```bash
# Test subscribe endpoint
curl -X POST https://your-worker.workers.dev/api/newsletter/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User",
    "listId": 1,
    "gdprConsent": true
  }'

# Check Durable Objects are working
curl https://your-worker.workers.dev/api/newsletter/campaigns/1/status
```

---

## Testing Strategy

### Unit Tests

```typescript
// Example test for subscribe function
describe('Newsletter Subscribe', () => {
  it('should hash email correctly', async () => {
    const email = 'test@example.com';
    const hash = await hashEmail(email);
    expect(hash).toHaveLength(64); // SHA-256 = 64 hex chars
  });
  
  it('should prevent duplicate subscriptions', async () => {
    // Test logic here
  });
  
  it('should send confirmation email for double opt-in', async () => {
    // Test logic here
  });
});
```

### Integration Tests

```typescript
// Test complete subscribe flow
describe('Subscribe Flow', () => {
  it('should complete double opt-in', async () => {
    // 1. Subscribe
    const response = await fetch('/api/newsletter/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        listId: 1
      })
    });
    
    // 2. Get confirmation token from database
    const subscriber = await db.query(
      'SELECT confirmation_token FROM newsletter_subscribers WHERE email_hash = ?'
    );
    
    // 3. Confirm
    const confirmResponse = await fetch(
      `/api/newsletter/confirm/${subscriber.confirmation_token}`
    );
    
    expect(confirmResponse.status).toBe(200);
    
    // 4. Verify confirmed in database
    const confirmed = await db.query(
      'SELECT confirmed FROM newsletter_subscribers WHERE email_hash = ?'
    );
    expect(confirmed.confirmed).toBe(1);
  });
});
```

### Load Testing

```bash
# Use k6 for load testing
k6 run loadtest.js

# Test campaign sending with 100k subscribers
k6 run campaign-load-test.js
```

---

## Cost Estimates

### Cloudflare Workers (Newsletter-specific)

| Resource | Monthly Estimate | Notes |
|----------|------------------|-------|
| D1 Database | $5 - $25 | Based on reads/writes |
| Durable Objects | $10 - $50 | Per DO instance + requests |
| Workers Requests | $5 - $25 | 10M requests = $5 |
| R2 Storage | $1 - $5 | Template storage |
| **Total Cloudflare** | **$21 - $105/mo** | Scales with usage |

### AWS Costs (Email/SMS)

| Resource | Monthly Estimate | Notes |
|----------|------------------|-------|
| SES Sending | $10 - $100 | $0.10 per 1000 emails |
| SNS SMS | N/A | Not using for newsletter |
| **Total AWS** | **$10 - $100/mo** | Depends on sends |

### Total Monthly Cost: $31 - $205

**For 100k subscribers:**
- 4 campaigns/month = 400k emails
- SES cost: $40
- CF Workers: ~$50
- **Total: ~$90/month**

**Comparison to Sendy:**
- Sendy: $69 one-time + hosting + AWS fees
- This solution: Serverless, no hosting cost

---

## Next Steps

### Immediate Actions

1. **Review this architecture** with your team
2. **Decide on scope**: Start with Phase 1 or full implementation?
3. **Set up development environment**:
   - Create newsletter D1 database
   - Configure Durable Objects bindings
   - Set up local testing

4. **Prioritize features**: Which are must-haves vs nice-to-haves?

### Questions to Consider

1. **List management**: Will you need multiple lists or just one main list?
2. **Custom fields**: What subscriber data do you need to collect?
3. **Segmentation**: How complex should targeting be?
4. **Templates**: WYSIWYG editor or HTML templates?
5. **Integration**: Link to existing `public_signatures` table?

### Ready to Start?

When you're ready to begin implementation, we should:

1. Create the database migration file (`newsletter-schema.sql`)
2. Set up the first Durable Object (`CampaignSchedulerDO`)
3. Build the subscribe API endpoint
4. Create basic admin UI for list management

---

## Appendix

### Useful Resources

- [Cloudflare Durable Objects Docs](https://developers.cloudflare.com/durable-objects/)
- [Durable Objects Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [AWS SES Developer Guide](https://docs.aws.amazon.com/ses/)
- [Sendy Documentation](https://sendy.co/get-started) (for feature reference)
- [GDPR Compliance for Email Marketing](https://gdpr.eu/email-marketing/)

### Related Files in This Project

- `README.md` - Main project documentation
- `AUTHENTICATION.md` - Auth system details
- `schema.sql` - Current database schema
- `src/worker/index.ts` - Main Worker entry point
- `src/worker/rate-limiter.ts` - Rate limiting DO example

---

**Document Version**: 1.0  
**Last Updated**: October 24, 2025  
**Status**: Architecture Complete - Ready for Implementation

To begin implementation, toggle to Act Mode and let's start with Phase 1!
