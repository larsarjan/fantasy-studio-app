import {test} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<!doctype html><div></div>',{url:'https://fvt.test/'})
globalThis.window=dom.window;globalThis.document=dom.window.document
const {articleBodyHtml,encodeArticleBody,sanitizeArticleHtml,articleSlug,articleText,RICH_TEXT_PREFIX,safeLink}=await import('./articleContent.js')
test('Legacy plain articles preserve literal HTML and paragraphs',()=>{assert.equal(articleBodyHtml('Een <script>alert(1)</script> tekst\n\nTweede regel\nmet vervolg'),'<p>Een &lt;script&gt;alert(1)&lt;/script&gt; tekst</p><p>Tweede regel<br>met vervolg</p>')})
test('Rich article formatting survives while executable HTML and styling are removed',()=>{
 const raw='<h2>Kop</h2><p><strong>Vet</strong> <em>Cursief</em><a href="https://example.com">Link</a></p><ul><li>Een</li></ul><ol><li>Twee</li></ol><blockquote>Quote</blockquote><img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(1)">Onveilig</a><iframe></iframe><p style="background:url(javascript:alert(1))" id="app">Tekst</p>'
 const encoded=encodeArticleBody(raw),html=articleBodyHtml(encoded)
 assert(encoded.startsWith(RICH_TEXT_PREFIX));assert.match(html,/<h2>Kop<\/h2>/);assert.match(html,/<strong>Vet<\/strong>/);assert.match(html,/<em>Cursief<\/em>/);assert.match(html,/<blockquote>Quote<\/blockquote>/);assert.match(html,/<ul><li>Een/);assert.match(html,/href="https:\/\/example.com\//);assert.doesNotMatch(html,/onerror|onclick|javascript:|<script|<iframe|<img|style=|id=/)
})
test('Direct API rich-text injection cannot execute on public render',()=>{assert.doesNotMatch(articleBodyHtml(RICH_TEXT_PREFIX+'<svg onload=alert(1)></svg><a href="data:text/html,bad">x</a><h3>Geldig</h3>'),/svg|onload|data:/);assert.equal(articleText(RICH_TEXT_PREFIX+'<p>Leesbare tekst</p>'),'Leesbare tekst')})
test('Empty editor and oversized body cannot become opaque published markup',()=>{assert.equal(encodeArticleBody('<p><br></p>'),'');assert.throws(()=>encodeArticleBody('<p>'+'x'.repeat(80000)+'</p>'),/te lang/)})
test('Slug creation is deterministic, accent-safe and bounded',()=>{assert.equal(articleSlug('Cathline opnieuw belangrijk voor FC Utrecht'),'cathline-opnieuw-belangrijk-voor-fc-utrecht');assert.equal(articleSlug('Één café: Ajax & PSV!'),'een-cafe-ajax-psv');assert(articleSlug('Lange titel '.repeat(40)).length<=160);assert.match(articleSlug('⚽'),/^[a-z0-9-]+$/)})
test('Unsafe link schemes are rejected',()=>{for(const url of ['javascript:alert(1)','data:text/html,x','//example.com','  javAscript:alert(1)'])assert.equal(safeLink(url),null);assert.equal(safeLink('https://example.com'),'https://example.com/');assert.equal(sanitizeArticleHtml('<a href="//example.com">x</a>'),'<a>x</a>')})
