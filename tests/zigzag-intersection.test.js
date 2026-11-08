'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../extra-zigzag/zigzag-intersection-lab.html'), 'utf8');
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

test('intersection presets have the expected intervals and render the computed panel', () => {
  const app = lab();
  const cases = [
    ['shared', 1, [1, 1, 1], [[0, 2]]],
    ['left-filled', 1, [0, 1, 1], [[1, 2]]],
    ['killed-both', 1, [0, 1, 0], [[1, 1]]],
    ['sphere', 2, [1, 1, 1], [[0, 2]]],
    ['filled', 2, [0, 1, 1], [[1, 2]]],
    ['disjoint', 0, [1, 0, 1], [[0, 0], [2, 2]]],
    ['empty', 0, [0, 0, 0], []]
  ];
  for (const [name, k, betti, intervals] of cases) {
    app.run(`preset('${name}')`);
    const result = app.json(`analyzeZigzag(state.complexes)[${k}]`);
    assert.deepEqual(result.betti, betti, name);
    assert.deepEqual(result.intervals.map(i => [i.start, i.end]), intervals, name);
    assert(!app.get('#simplices-1').innerHTML.includes('data-remove-simplex'));
  }
  assert.deepEqual(app.errors, []);
});

test('edits preserve the exact intersection and do not propagate to the other outer complex', () => {
  const app = lab();
  app.run("preset('empty');addSimplex(0,[0,1,2]);addSimplex(2,[0,1]);");
  assert.deepEqual(app.json('[...state.complexes[1]].sort()'), ['0', '0,1', '1']);
  app.run('deleteSimplex(0,[0,1])');
  assert(app.run("state.complexes[2].has('0,1')"));
  assert(!app.run("state.complexes[1].has('0,1')"));
  assert(!app.run("state.complexes[0].has('0,1,2')"));
  assert.throws(() => app.run('addSimplex(1,[9])'), /automatically/);
  assert.throws(() => app.run('deleteSimplex(1,[0])'), /automatically/);
  app.run('deleteSimplex(0,[0])');
  assert(app.run('!!byId(0)')); // Still present on the right.
  assert(!app.run("state.complexes[1].has('0')"));
  assert.deepEqual(app.errors, []);
});

test('editing the central canvas is blocked and outer form labels use K1, not K2', () => {
  const app = lab();
  const before = app.json('state.complexes.map(c=>[...c])');
  app.run("state.tool='erase';handlePointerDown({button:0,currentTarget:{dataset:{index:'1'}}})");
  assert.deepEqual(app.json('state.complexes.map(c=>[...c])'), before);
  app.get('#target-complex').value = '2';
  app.get('#simplex-input').value = '8';
  app.run('handleSimplexForm({preventDefault(){}})');
  assert.match(app.get('#toast').textContent, /added to K₁/);
  app.get('#simplex-input').value = '0,00';
  app.run('handleSimplexForm({preventDefault(){}})');
  assert.match(app.get('#toast').textContent, /must not repeat/);
});

test('vertex capacity failures are atomic', () => {
  const app = lab();
  app.run("preset('empty');for(let i=0;i<11;i++)addSimplex(0,[i]);");
  const before = app.json('state');
  assert.throws(() => app.run('addSimplex(2,[11,12])'), /at most 12/);
  assert.deepEqual(app.json('state'), before);
});

test('different kernels produce two partial intervals rather than two spanning intervals', () => {
  const app = lab();
  app.run(`preset('empty');
    for(const p of [0,2])for(const v of [0,1,2])addSimplex(p,[v]);
    addSimplex(0,[0,3]);addSimplex(0,[1,3]);
    addSimplex(2,[1,4]);addSimplex(2,[2,4]);`);
  const result = app.json('analyzeZigzag(state.complexes)[0]');
  assert.deepEqual(result.betti, [2, 3, 2]);
  assert.equal(result.rankF, 2);
  assert.equal(result.rankG, 2);
  assert.equal(result.jointRank, 3);
  assert.deepEqual(result.intervals.map(i => [i.start, i.end]), [[0, 2], [0, 1], [1, 2]]);
  // Reversing the two outer complexes reverses the one-sided interval.
  app.run("preset('left-filled');[state.complexes[0],state.complexes[2]]=[state.complexes[2],state.complexes[0]];updateAll()");
  assert.deepEqual(app.json('analyzeZigzag(state.complexes)[1].intervals'), [{start: 0, end: 1}]);
});

test('JSON round-trip preserves the diagrams and invalid imports leave state untouched', () => {
  const app = lab();
  app.run("preset('killed-both');exportJSON()");
  const saved = app.context.exported;
  const before = app.json('analyzeZigzag(state.complexes)');
  app.run("preset('empty');importJSON(exported)");
  assert.deepEqual(app.json('analyzeZigzag(state.complexes)'), before);
  const invalid = JSON.parse(saved);
  invalid.complexes[1] = [];
  app.context.invalid = JSON.stringify(invalid);
  assert.throws(() => app.run('importJSON(invalid)'), /must equal the intersection/);
  assert.deepEqual(app.json('analyzeZigzag(state.complexes)'), before);
  invalid.format = 'zigzag-lab/v1';
  app.context.invalid = JSON.stringify(invalid);
  assert.throws(() => app.run('importJSON(invalid)'), /Intersection Zigzag Lab/);
});

// Independent finite-field calculation using ordinary numeric vectors and exhaustive cycles.
function rank(columns) {
  const rows = columns.slice();
  let r = 0;
  for (let b = 29; b >= 0; b--) {
    const p = rows.findIndex((v, i) => i >= r && ((v >>> b) & 1));
    if (p < 0) continue;
    [rows[r], rows[p]] = [rows[p], rows[r]];
    for (let i = 0; i < rows.length; i++) if (i !== r && ((rows[i] >>> b) & 1)) rows[i] ^= rows[r];
    r++;
  }
  return r;
}
const faces = (c, k) => [...c].filter(s => s.split(',').length === k + 1).sort();
function boundaries(c, k, target) {
  return faces(c, k).map(s => k === 0 ? 0 : s.split(',').reduce((v, _, i, a) =>
    v ^ (1 << target.indexOf(a.filter((_, j) => i !== j).join(','))), 0));
}
function cycles(c, k) {
  const basis = faces(c, k), columns = boundaries(c, k, faces(c, k - 1)), out = [];
  for (let mask = 1; mask < 2 ** basis.length; mask++) {
    let boundary = 0;
    for (let j = 0; j < basis.length; j++) if ((mask >>> j) & 1) boundary ^= columns[j];
    if (!boundary) out.push(mask);
  }
  return {basis, vectors: out};
}
function embed(vector, source, target) {
  return source.reduce((v, key, j) => v ^ (((vector >>> j) & 1) ? 1 << target.indexOf(key) : 0), 0);
}

test('150 random intersections agree with independent chain-level quotient ranks', () => {
  const app = lab();
  let seed = 67;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const complex = () => {
    const c = new Set();
    for (let mask = 1; mask < 31; mask++) if (random() < .18) {
      for (let sub = mask; sub; sub = (sub - 1) & mask) {
        c.add([0, 1, 2, 3, 4].filter(j => (sub >>> j) & 1).join(','));
      }
    }
    return c;
  };
  for (let trial = 0; trial < 150; trial++) {
    const a = complex(), c = complex(), b = new Set([...a].filter(s => c.has(s)));
    app.context.input = [a, b, c];
    const results = app.json('analyzeZigzag(input)');
    for (let k = 0; k <= 2; k++) {
      const left = faces(a, k), right = faces(c, k), source = cycles(b, k);
      const ba = boundaries(a, k + 1, left), bc = boundaries(c, k + 1, right);
      const f = source.vectors.map(v => embed(v, source.basis, left));
      const g = source.vectors.map(v => embed(v, source.basis, right));
      const jointBoundaries = [...ba, ...bc.map(v => v << left.length)];
      const jointCycles = f.map((v, j) => v | (g[j] << left.length));
      const result = results[k];
      assert.equal(result.rankF, rank([...ba, ...f]) - rank(ba));
      assert.equal(result.rankG, rank([...bc, ...g]) - rank(bc));
      assert.equal(result.jointRank, rank([...jointBoundaries, ...jointCycles]) - rank(jointBoundaries));
      [a, b, c].forEach((complex, i) => {
        const expected = faces(complex, k).length - rank(boundaries(complex, k, faces(complex, k - 1))) - rank(boundaries(complex, k + 1, faces(complex, k)));
        assert.equal(result.betti[i], expected);
        assert.equal(result.intervals.filter(interval => interval.start <= i && i <= interval.end).length, expected);
      });
    }
  }
});
