import assert from 'node:assert/strict'
import { normalizePosition } from './positionNormalization.js'

for (const alias of ['Doelman', 'keeper', 'goalkeeper', 'gk']) assert.equal(normalizePosition(alias), 'keeper')
for (const alias of ['Verdediger', 'defender', 'defence', 'defense']) assert.equal(normalizePosition(alias), 'verdediger')
for (const alias of ['Middenvelder', 'middenveld', 'midfielder', 'midfield']) assert.equal(normalizePosition(alias), 'middenvelder')
for (const alias of ['Spits', 'aanvaller', 'aanval', 'forward', 'attacker', 'striker']) assert.equal(normalizePosition(alias), 'aanvaller')
assert.equal(new Set(['Doelman','keeper','goalkeeper'].map(normalizePosition)).size, 1)
assert.equal(new Set(['Spits','aanvaller','forward'].map(normalizePosition)).size, 1)
console.log('Position normalization: 20 controles geslaagd.')
