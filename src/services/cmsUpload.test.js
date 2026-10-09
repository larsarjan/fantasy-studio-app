import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateNewsImage,MAX_NEWS_IMAGE_BYTES} from '../admin/newsImages.js'
test('Article upload supports JPG/JPEG, PNG and WebP',()=>{for(const [name,type,extension]of [['a.jpg','image/jpeg','jpg'],['a.JPEG','image/jpeg','jpg'],['a.png','image/png','png'],['a.webp','image/webp','webp']])assert.equal(validateNewsImage({name,type,size:1024}),extension)})
test('Article upload rejects scripts, mismatched extensions, empty and oversized files',()=>{for(const file of [{name:'a.svg',type:'image/svg+xml',size:100},{name:'a.html',type:'image/png',size:100},{name:'a.png',type:'text/html',size:100},{name:'a.jpg',type:'image/jpeg',size:0},{name:'a.webp',type:'image/webp',size:MAX_NEWS_IMAGE_BYTES+1}])assert.throws(()=>validateNewsImage(file));assert.equal(validateNewsImage({name:'a.png',type:'image/png',size:MAX_NEWS_IMAGE_BYTES}),'png')})
