import test from 'node:test'
import assert from 'node:assert/strict'
import {parsePriceCsv,boundedEntry} from './lib/priceArchive.mjs'
import {Readable} from 'node:stream'
test('CSV handles quoted commas, escaped quotes, empty fields, CRLF and BOM',()=>{const rows=parsePriceCsv('\uFEFF"timestamp","id","speler","transfers_out","prijs"\r\n"2026-09-09T02:30:00+01:00","1","A ""B"", C","0","4,9"\r\n');assert.equal(rows[0].speler,'A "B", C');assert.equal(rows[0].prijs,'4,9');assert.throws(()=>parsePriceCsv('timestamp,transfers_out\n"open,1'));assert.throws(()=>parsePriceCsv('timestamp,transfers_out\na,1,2'))})
test('archive entry size is enforced against actual expanded output',async()=>{await assert.rejects(boundedEntry({uncompressedSize:1,stream:()=>Readable.from([Buffer.alloc(50)])},10));assert.equal(await boundedEntry({uncompressedSize:5,stream:()=>Readable.from([Buffer.from('hello')])},10),'hello')})
