import { describe, it, expect } from 'vitest';
import { GET, POST } from './route';

describe('/api/sessions', () => {
  it('GET returns the seeded store + warnings', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.store.WATER.length).toBeGreaterThan(0);
    expect(Array.isArray(body.warnings)).toBe(true);
  });

  it('POST rejects a malformed body with 400', async () => {
    const res = await POST(new Request('http://x/api/sessions', {
      method: 'POST', body: JSON.stringify({}), headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(400);
  });
});
