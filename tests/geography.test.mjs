import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync(new URL('../public/data/austin.json',import.meta.url)));
test('bundled geographic snapshot preserves real features and valid coordinates',()=>{
 assert.ok(data.roads.length>1000);assert.ok(data.buildings.length>1000);assert.ok(data.water.length>0);
 for(const type of ['roads','buildings','water'])for(const feature of data[type]){
  assert.ok(feature.coordinates.length>=2);
  for(const [lon,lat] of feature.coordinates){assert.ok(Number.isFinite(lon)&&lon>-99&&lon<-96);assert.ok(Number.isFinite(lat)&&lat>29&&lat<32);}
 }
});
test('ride corridor uses surveyed Congress Avenue vertices',()=>{
 const source=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 const raw=source.match(/let route=(\[.*?\])\.map/)[1];const route=JSON.parse(raw);
 const points=new Set(data.roads.filter(r=>r.name==='Congress Avenue').flatMap(r=>r.coordinates.map(p=>JSON.stringify(p))));
 assert.ok(route.length>10);for(const point of route)assert.ok(points.has(JSON.stringify(point)));
 for(let i=1;i<route.length;i++)assert.ok(route[i][1]>=route[i-1][1]);
});
