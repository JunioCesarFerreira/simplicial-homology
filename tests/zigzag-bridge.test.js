'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../extra-zigzag/zigzag-bridge-lab.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);

// A minimal DOM for executing initialization and rendering, not a browser layout test.
function lab() {
  const nodes = new Map();
  function element() {
    return {children: [], dataset: {}, value: '', innerHTML: '', textContent: '', listeners: {},
      classList: {add() {}, toggle() {}, remove() {}},
      setAttribute(key, value) { this[key] = value; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      addEventListener(name, callback) { this.listeners[name] = callback; }, click() {}};
  }
  const get = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const canvases = [0, 1, 2].map(i => {
    const svg = get(`svg[data-index="${i}"]`); svg.dataset.index = String(i); return svg;
  });
  const cards = [0, 1, 2].map(i => {
    const card = element(); card.dataset.complexPanel = String(i); return card;
  });
  const errors = [];
  const context = vm.createContext({
    console: {error: error => errors.push(error)},
    window: {matchMedia: () => ({matches: false, addEventListener() {}})},
    localStorage: {getItem: () => null, setItem() {}},
    document: {documentElement: element(), body: element(),
      querySelector: get, getElementById: id => get('#' + id),
      querySelectorAll: selector => selector === '.complex-card' ? cards : selector === 'svg.complex-canvas' ? canvases : [],
      createElement: element, createElementNS: element, addEventListener() {}},
    setTimeout: () => 0, clearTimeout() {},
    Blob: class { constructor(parts) { this.text = parts.join(''); } },
    URL: {createObjectURL(blob) { context.exported = blob.text; return 'blob:test'; }, revokeObjectURL() {}}
  });
  for (const script of scripts) vm.runInContext(script, context);
  const run = code => vm.runInContext(code, context);
  const json = code => JSON.parse(run(`JSON.stringify(${code})`));
  assert.deepEqual(errors, []);
  return {context, get, run, json, errors};
}

test('screenshot example preserves the component matches and the shared cycle', () => {
  const app = lab();
  assert.deepEqual(app.json('modelResults.bridge.map(h=>h.betti)'), [[3,2,2],[1,1,1],[0,0,0]]);
  assert.deepEqual(app.json('modelResults.bridge.map(h=>h.multiplicities["0,2"])'), [2,1,0]);
  assert.deepEqual(app.json('modelResults.ambient.map(h=>h.multiplicities["0,2"])'), [2,0,0]);
  assert.deepEqual(app.json('modelResults.intersection.map(h=>h.multiplicities["0,2"])'), [1,1,0]);
  assert.deepEqual(app.json('derived.bridges'), ['0,6','0,9','4,7','5,9']);
  assert(!app.get('#simplices-1').innerHTML.includes('data-remove-simplex'));
  assert.equal(app.get('#middle-label').textContent, 'M');
  assert(app.get('svg[data-index="1"]').children.some(el=>el.class==='edge bridge-edge'));
  assert.deepEqual(app.errors, []);
});

test('all modes render and model changes do not mutate the input complexes', () => {
  const app=lab(), before=app.json('state.complexes.map(c=>[...c])');
  for(const model of ['ambient','union','intersection','bridge']){
    app.run(`selectModel('${model}')`);
    assert.deepEqual(app.json('state.complexes.map(c=>[...c])'),before);
    assert.equal(app.get('#middle-model').value,model);
    assert.equal(app.get('#simplices-1').innerHTML.includes('data-remove-simplex'),model==='ambient');
    assert.equal(app.get('#diagram-equation').textContent.includes('← I →'),model==='intersection');
  }
  app.run("state.tool='erase';handlePointerDown({button:0,currentTarget:{dataset:{index:'1'}}})");
  assert.deepEqual(app.json('state.complexes.map(c=>[...c])'),before);
  assert.deepEqual(app.errors,[]);
});

test('presets include limits of the construction and ambient-only components', () => {
  const app=lab();
  for(const name of ['sphere','filled','union-cycle','endpoint-filled','union-filled','ambient-only','empty']){
    app.run(`preset('${name}')`);
    for(const model of ['bridge','ambient','union','intersection'])app.run(`selectModel('${model}')`);
  }
  app.run("preset('filled')");
  assert.deepEqual(app.json('modelResults.bridge[2].betti'),[1,1,1]);
  assert.deepEqual(app.json('modelResults.ambient[2].betti'),[1,0,1]);
  app.run("preset('union-filled')");
  assert.deepEqual(app.json('modelResults.bridge[1].betti'),[1,0,1]);
  assert.equal(app.run('modelResults.bridge[1].multiplicities["0,2"]'),0);
  app.run("preset('union-cycle')");
  assert.deepEqual(app.json('modelResults.bridge[1].betti'),[0,1,0]);
  app.run("preset('ambient-only')");
  assert.deepEqual(app.json('modelResults.bridge[0].betti'),[1,2,1]);
  assert.equal(app.run('modelResults.bridge[0].multiplicities["1,1"]'),1);
  assert.deepEqual(app.errors,[]);
});

test('edits, form targeting, capacity limits, and JSON import/export preserve invariants', () => {
  const app=lab();
  app.run("preset('empty');addSimplex(0,[0]);addSimplex(2,[1]);addSimplex(1,[0,1])");
  assert.equal(app.run('selectedModel'),'ambient');
  assert.equal(app.run('modelResults.bridge[0].multiplicities["0,2"]'),1);
  app.run('deleteSimplex(1,[0,1])');
  assert.equal(app.run('modelResults.bridge[0].multiplicities["0,2"]'),0);
  app.get('#target-complex').value='1';app.get('#simplex-input').value='0,00';
  app.run('handleSimplexForm({preventDefault(){}})');
  assert.match(app.get('#toast').textContent,/must not repeat/);
  app.run("preset('empty');for(let i=0;i<11;i++)addSimplex(0,[i])");
  assert.throws(()=>app.run('addSimplex(2,[11,12])'),/at most 12/);
  assert.equal(app.run('state.vertices.length'),11);
  app.run("preset('screenshot');exportJSON()");
  const before=app.json('modelResults');
  app.run("preset('empty');importJSON(exported)");
  assert.deepEqual(app.json('modelResults'),before);
  const original=JSON.parse(app.context.exported);
  original.format='zigzag-lab/v1'; // Import the existing union-oriented lab.
  app.context.legacy=JSON.stringify(original);app.run('importJSON(legacy)');
  assert.deepEqual(app.json('modelResults'),before);
  original.complexes[1]=[];app.context.invalid=JSON.stringify(original);
  assert.throws(()=>app.run('importJSON(invalid)'),/Invalid inclusion/);
  assert.deepEqual(app.json('modelResults'),before);
  assert.deepEqual(app.errors,[]);
});

// Independent ranks and connectivity, without using the HTML's elimination routines.
function rank(columns){
  const a=columns.slice();let r=0;
  for(let bit=29;bit>=0;bit--){
    const p=a.findIndex((v,i)=>i>=r&&((v>>>bit)&1));if(p<0)continue;
    [a[p],a[r]]=[a[r],a[p]];
    for(let i=0;i<a.length;i++)if(i!==r&&((a[i]>>>bit)&1))a[i]^=a[r];
    r++;
  }
  return r;
}
const faces=(c,k)=>[...c].filter(key=>key.split(',').length===k+1).sort();
function boundary(c,k){
  const target=faces(c,k-1);
  return faces(c,k).map(key=>k===0?0:key.split(',').reduce((v,_,i,a)=>v^(1<<target.indexOf(a.filter((_,j)=>j!==i).join(','))),0));
}
const betti=(c,k)=>faces(c,k).length-rank(boundary(c,k))-rank(boundary(c,k+1));
function components(c){
  const adjacency=new Map(faces(c,0).map(v=>[v,[]]));
  for(const edge of faces(c,1)){const [a,b]=edge.split(',');adjacency.get(a).push(b);adjacency.get(b).push(a);}
  const result=new Map();let id=0;
  for(const start of adjacency.keys())if(!result.has(start)){
    const queue=[start];result.set(start,id);
    for(const v of queue)for(const next of adjacency.get(v))if(!result.has(next)){result.set(next,id);queue.push(next);}
    id++;
  }
  return result;
}

test('150 random bridges preserve ambient connectivity and union higher homology', () => {
  const app=lab();let seed=94;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const closure=mask=>{
    const out=[];for(let sub=mask;sub;sub=(sub-1)&mask)out.push([0,1,2,3,4].filter(j=>(sub>>>j)&1).join(','));return out;
  };
  for(let t=0;t<150;t++){
    const a=new Set(),b=new Set(),c=new Set();
    for(let mask=1;mask<31;mask++){
      if(random()<.12)for(const key of closure(mask)){a.add(key);c.add(key);}
      if(random()<.12)for(const key of closure(mask)){b.add(key);c.add(key);}
      if(random()<.18)for(const key of closure(mask))c.add(key);
    }
    app.context.input=[a,c,b];
    const built=app.json('(()=>{const d=buildBridge(input);return {middle:[...d.middle],union:[...d.union],bridges:d.bridges}})()');
    const m=new Set(built.middle),u=new Set(built.union);
    for(const key of u)assert(m.has(key));for(const key of m)assert(c.has(key));
    const cm=components(m),cc=components(c);
    assert.deepEqual([...cm.keys()].sort(),[...cc.keys()].sort());
    for(const x of cc.keys())for(const y of cc.keys())assert.equal(cm.get(x)===cm.get(y),cc.get(x)===cc.get(y));
    for(const k of [1,2])assert.equal(betti(m,k),betti(u,k));
    const current=new Set([...u,...faces(c,0)]);
    for(const key of built.bridges){const [x,y]=key.split(',');const partition=components(current);assert.notEqual(partition.get(x),partition.get(y));current.add(key);}
    app.context.middle=m;app.context.union=u;
    const bm=app.json('analyzeZigzag([input[0],middle,input[2]])');
    const bc=app.json('analyzeZigzag(input)');
    const bu=app.json('analyzeZigzag([input[0],union,input[2]])');
    assert.deepEqual(bm[0].multiplicities,bc[0].multiplicities);
    for(const k of [1,2])assert.deepEqual(bm[k].multiplicities,bu[k].multiplicities);
    // The selected tree may depend on IDs, but insertion order cannot change it.
    app.context.reversed=[a,c,b].map(set=>new Set([...set].reverse()));
    assert.deepEqual(app.json('buildBridge(reversed).bridges'),built.bridges);
  }
});

