import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { attachErrorHandling } from '../app';

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    }).on('error', reject);
  });
}

test('a rejected async route handler returns 500 JSON instead of killing the process', async () => {
  const app = express();
  app.get('/boom', async () => {
    throw new Error('export blew up');
  });
  attachErrorHandling(app);
  const server = await new Promise<http.Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  try {
    const port = (server.address() as { port: number }).port;
    const res = await get(port, '/boom');
    assert.equal(res.status, 500);
    assert.deepEqual(JSON.parse(res.body), { error: 'export blew up' });
    // still alive: a second request works
    const again = await get(port, '/boom');
    assert.equal(again.status, 500);
  } finally {
    server.close();
  }
});
