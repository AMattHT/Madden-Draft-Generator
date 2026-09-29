import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import roster from '../../routes/roster';
import { RosterBuildService } from '../RosterBuildService';
import type { GeneratedRosterPlayer, RosterBuildDoc } from '../../types/roster';

test('preview and export API retain the chosen lens and reject unsupported modes', async t => {
  const app = express();
  app.use(express.json()); app.use('/api', roster);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/roster`;
  const post = (route: string, body: unknown) => fetch(`${url}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let received: RosterBuildDoc | undefined;
  t.mock.method(RosterBuildService, 'build', async (doc: RosterBuildDoc) => {
    received = doc;
    return { input: '', output: '', outputPath: '', moved: 0, cut: 0, edited: 0, added: 0, skipped: [] };
  });
  try {
    const key = '2003|NFL|troy|polamalu|16';
    const careerResponse = await post('preview-add', { key, mode: 'retro' });
    const rookieResponse = await post('preview-add', { key, mode: 'madden' });
    assert.equal(careerResponse.status, 200); assert.equal(rookieResponse.status, 200);
    const career = await careerResponse.json() as GeneratedRosterPlayer, rookie = await rookieResponse.json() as GeneratedRosterPlayer;
    assert.equal(career.position, 'SS'); assert.equal(rookie.position, 'SS');
    assert.notEqual(career.overall, rookie.overall);
    const legacy = await (await post('preview-add', { key })).json() as GeneratedRosterPlayer;
    assert.equal(legacy.overall, career.overall);
    const edits = { added: { jersey: 42, ratings: { speed: 90 } } };
    for (const mode of ['retro', 'madden']) {
      const response = await post('build', { baseId: 'test', name: 'test', mode, adds: [{ tempId: 'added', key, teamId: 1 }], edits });
      assert.equal(response.status, 200);
      assert.equal(received!.mode, mode);
      assert.deepEqual(received!.edits, edits);
    }
    assert.equal((await post('preview-add', { key, mode: 'unknown' })).status, 400);
    assert.equal((await post('build', { baseId: 'test', name: 'test', mode: 'unknown' })).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});
