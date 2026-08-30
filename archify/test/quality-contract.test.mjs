import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QUALITY_CONTRACT,
  QUALITY_CONTRACT_DIGEST,
  assertExpectedQualityContract,
} from '../authoring/quality-contract.mjs';

test('quality contract has a stable content digest and fails closed on an unexpected digest', () => {
  assert.match(QUALITY_CONTRACT_DIGEST, /^[a-f0-9]{64}$/);
  assert.equal(QUALITY_CONTRACT_DIGEST, 'ae5511ff53e4a6b906f90c2ae45ce7823bb2283fa5c43c8153922792459cd329');
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
  assert.equal(QUALITY_CONTRACT.repairPolicy.maxFocusedAttemptsBeforeStructuralReflow, 6);
  assert.equal(QUALITY_CONTRACT.repairPolicy.maxStructuralReflows, 2);
  assert.equal(QUALITY_CONTRACT.repairPolicy.maxConsecutiveIdenticalAttempts, 5);
  assert.equal(QUALITY_CONTRACT.repairPolicy.maxTotalAttempts, 24);
});
