// Rate Limiter Durable Object for protecting against abuse
export class RateLimiter {
  private state: DurableObjectState;
  
  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    
    if (!key) {
      return new Response('Missing key', { status: 400 });
    }

    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 5; // 5 requests per minute

    // Get existing data
    const data = await this.state.storage.get<{
      count: number;
      resetTime: number;
    }>(key);

    if (!data || now > data.resetTime) {
      // New window
      await this.state.storage.put(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return new Response(JSON.stringify({ allowed: true, remaining: maxRequests - 1 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (data.count >= maxRequests) {
      return new Response(JSON.stringify({ allowed: false, remaining: 0 }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Increment count
    await this.state.storage.put(key, {
      count: data.count + 1,
      resetTime: data.resetTime,
    });

    return new Response(JSON.stringify({ allowed: true, remaining: maxRequests - data.count - 1 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
