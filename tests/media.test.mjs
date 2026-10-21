import test from 'node:test';
import assert from 'node:assert/strict';
import media from '../data/media.json' with {type:'json'};
import articles from '../src/data/articles.json' with {type:'json'};
import {renderPart} from '../shared/article-content.mjs';
import {renderMapLinks} from '../shared/media.mjs';
test('all existing guide maps resolve to copied images with source credits',()=>{
 const maps=articles.flatMap(a=>a.location?.maps??[]);
 assert.equal(maps.length,16);
 for(const map of maps){const html=renderMapLinks([[map.label,map.url]]);assert.match(html,/<img src="https:\/\/images.dcuo-wiki.com\//);assert.match(html,/>Source<\/a>/);}
 assert.equal(new Set(media.map(m=>m.sha256)).size,13);
});
test('edited map references use the same safe gallery renderer',()=>{
 const m=media[0];
 for(const reference of [m.sourcePage,m.original,m.preview]){
  const html=renderPart({kind:'links'},`<script> | ${reference}`);
  assert.match(html,/<figure>/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 }
 assert.doesNotMatch(renderMapLinks([['Unimported','https://example.com/map.png']]),/<img/);
 for(const url of ['javascript:alert(1)','https://user:pass@example.com/'])assert.throws(()=>renderMapLinks([['Bad',url]]));
});
