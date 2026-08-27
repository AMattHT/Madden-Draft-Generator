import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preferredHeadshot } from '../NflverseCareerService';
import { isDeadPhoto } from '../../routes/media';

const NFL = 'https://static.www.nfl.com/image/private/f_auto,q_auto/league/belgna3tokxga0gjjmwk';

test('a retiree with an ESPN id gets the ESPN headshot (the NFL CDN serves him a placeholder)', () => {
  // Carson Palmer: last season 2017, espn_id 4459 — his NFL URL answers the generic silhouette.
  assert.equal(preferredHeadshot('4459', 2017, NFL), 'https://a.espncdn.com/i/headshots/nfl/players/full/4459.png');
});

test('a current player keeps the NFL headshot (still real, nicer crop)', () => {
  assert.equal(preferredHeadshot('3139477', 2026, NFL), NFL);
  assert.equal(preferredHeadshot('3139477', 2020, NFL), NFL, '2020+ NFL headshots sampled all real');
});

test('a retiree with no ESPN id keeps the NFL URL (the proxy 404s the placeholder, UI falls back to portrait)', () => {
  assert.equal(preferredHeadshot('', 2005, NFL), NFL);
  assert.equal(preferredHeadshot(undefined, 2005, null), null);
});

test('an unknown last season with an ESPN id prefers ESPN (safe: a missing ESPN photo 404s honestly)', () => {
  assert.equal(preferredHeadshot('4459', null, NFL), 'https://a.espncdn.com/i/headshots/nfl/players/full/4459.png');
});

test('a malformed espn id never builds a URL', () => {
  assert.equal(preferredHeadshot('4459abc', 2005, NFL), NFL);
});

test('isDeadPhoto only ever fires for NFL hosts, never for a real photo', () => {
  const realPhoto = Buffer.from('not the placeholder bytes');
  assert.equal(isDeadPhoto('static.www.nfl.com', realPhoto), false);
  // Non-NFL hosts are exempt regardless of content — the hash check must not run.
  assert.equal(isDeadPhoto('a.espncdn.com', realPhoto), false);
  assert.equal(isDeadPhoto('upload.wikimedia.org', realPhoto), false);
});
