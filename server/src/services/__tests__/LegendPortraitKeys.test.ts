import test from 'node:test';
import assert from 'node:assert/strict';
import { LikenessService } from '../LikenessService';
import { firstNameVariants } from '../PlayerLookupService';

test('firstNameVariants runs both ways and starts with the name itself', () => {
  assert.deepEqual(firstNameVariants('Michael').slice(0, 2), ['michael', 'mike']);
  assert.ok(firstNameVariants('Mike').includes('michael'));
  assert.deepEqual(firstNameVariants('Zorn'), ['zorn']);
});

test('legend portraits reach the lookup name through nicknames and the alias table', () => {
  assert.equal(LikenessService.legendPortraitPid('Michael', 'Vick', 'm27'), 4515); // game: Mike Vick
  assert.equal(LikenessService.legendPortraitPid('Mike', 'Vick', 'm27'), 4515);
  assert.ok(LikenessService.legendPortraitPid('Eric', 'Dickerson', 'm27') > 0); // game: Erick
  assert.ok(LikenessService.legendPortraitPid('Napoleon', 'Kaufman', 'm27') > 0); // game: Napolean
  assert.ok(LikenessService.legendPortraitPid('Cameron', 'Wake', 'm27') > 0); // game: Cam
  assert.ok(LikenessService.legendPortraitPid('Rocket', 'Ismail', 'm27') > 0); // game: Raghib
  assert.equal(LikenessService.legendPortraitPid('Tom', 'Brady', 'm27'), 0); // M27 ships none
});
