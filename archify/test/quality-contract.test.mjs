import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QUALITY_CONTRACT,
  QUALITY_CONTRACT_DIGEST,
  assertExpectedQualityContract,
} from '../authoring/quality-contract.mjs';

test('quality contract has a stable content digest and fails closed on an unexpected digest', () => {
  assert.match(QUALITY_CONTRACT_DIGEST, /^[a-f0-9]{64}$/);
  assert.equal(QUALITY_CONTRACT_DIGEST, 'f5391c39332fb6ad6a0e7683742f347a27c39985ec9473a086d1b414e699ce01');
  assert.equal(assertExpectedQualityContract(QUALITY_CONTRACT_DIGEST), QUALITY_CONTRACT_DIGEST);
  assert.throws(
    () => assertExpectedQualityContract('0'.repeat(64)),
    /quality contract mismatch/i,
  );
  assert.throws(
    () => assertExpectedQualityContract('not-a-digest'),
    /valid SHA-256/i,
  );
  assert.equal(QUALITY_CONTRACT.guards.overflowHidingAllowed, false);
});
