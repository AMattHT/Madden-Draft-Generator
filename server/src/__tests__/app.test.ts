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

function post(port: number, path: string, body: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: out }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

test('POST /api/roster/build validates its body', async () => {
  const { default: roster } = await import('../routes/roster');
  const app = express();
  app.use(express.json());
  app.use('/api', roster);
  attachErrorHandling(app);
  const server = await new Promise<http.Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  try {
    const port = (server.address() as { port: number }).port;
    const res = await post(port, '/api/roster/build', { name: 'x' });
    assert.equal(res.status, 400);
    assert.match(JSON.parse(res.body).error, /baseName or baseId/);
  } finally {
    server.close();
  }
});
