import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits } from '../DraftClassBuilder';

test('a focus edit pins the mindset focus id; out-of-range values are ignored', () => {
  const prospects = [{ firstName: 'A', lastName: 'B' }, { firstName: 'C', lastName: 'D' }] as unknown as Parameters<typeof applyEdits>[0];
  applyEdits(prospects, { 1: { focus: '3' }, 2: { focus: '7' } } as unknown as Parameters<typeof applyEdits>[1], 'm27');
  assert.equal((prospects[0] as unknown as { focus?: number }).focus, 3);
  assert.equal((prospects[1] as unknown as { focus?: number }).focus, undefined);
});
