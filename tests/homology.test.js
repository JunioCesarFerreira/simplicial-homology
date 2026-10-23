'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/homology.js');
const Presets = require('../js/presets.js');

const ascii = (result) => result.groups.map((g) => H.formatGroup(g, { ascii: true }));

// Deterministic pseudo-random numbers (mulberry32).
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomComplex(rand, nVertices, nFacets, maxSize) {
  const facets = [];
  for (let f = 0; f < nFacets; f++) {
    const size = 1 + Math.floor(rand() * maxSize);
    const s = [];
    while (s.length < size) {
      const v = Math.floor(rand() * nVertices);
      if (!s.includes(v)) s.push(v);
    }
    facets.push(s);
  }
  return new H.SimplicialComplex(facets);
}

// ----------------------------------------------------------- complex basics

test('add closes under faces and normalizes vertex order', () => {
  const c = new H.SimplicialComplex([[2, 0, 1]]);
  assert.deepEqual(c.fVector(), [3, 3, 1]);
  assert.ok(c.has([1, 0]));
  assert.ok(c.has([0, 1, 2]));
  assert.equal(c.dimension, 2);
  assert.deepEqual(c.facets(), [[0, 1, 2]]);
});

test('remove deletes the open star and keeps the faces', () => {
  const c = new H.SimplicialComplex([[0, 1, 2], [1, 2, 3]]);
  assert.equal(c.remove([1, 2]), 3); // the edge and both triangles
  assert.deepEqual(c.fVector(), [4, 4]);
  assert.ok(c.has([0, 1]) && c.has([2, 3]));
  assert.equal(c.remove([0]), 3); // vertex 0 and its two edges
  assert.deepEqual(c.facets(), [[1, 3], [2, 3]]);
});

test('the boundary of a boundary is zero', () => {
  const rand = rng(1);
  for (let trial = 0; trial < 30; trial++) {
    const c = randomComplex(rand, 8, 6, 5);
    for (let k = 2; k <= c.dimension; k++) {
      const a = H.boundaryMatrix(c, k - 1);
      const b = H.boundaryMatrix(c, k);
      for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b[0].length; j++) {
          let s = 0;
          for (let t = 0; t < b.length; t++) s += a[i][t] * b[t][j];
          assert.equal(s, 0);
        }
      }
    }
  }
});

// ------------------------------------------------------- Smith normal form

function det(m) {
  const n = m.length;
  if (n === 0) return 1n;
  if (n === 1) return m[0][0];
  let s = 0n;
  for (let j = 0; j < n; j++) {
    if (m[0][j] === 0n) continue;
    const minor = m.slice(1).map((row) => row.filter((_, c) => c !== j));
    s += (j % 2 === 0 ? 1n : -1n) * m[0][j] * det(minor);
  }
  return s;
}

function combinations(n, k) {
  if (k === 0) return [[]];
  const out = [];
  for (let i = 0; i < n; i++) {
    for (const rest of combinations(n, k - 1)) if (rest.length === 0 || rest[0] > i) out.push([i, ...rest]);
  }
  return out;
}

const gcd = (a, b) => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};

// Invariant factors via determinantal divisors: d_1 ⋯ d_i = gcd of the i×i minors.
function invariantsByMinors(rows) {
  const m = rows.map((r) => r.map(BigInt));
  const out = [];
  let prev = 1n;
  for (let i = 1; i <= Math.min(m.length, m[0].length); i++) {
    let g = 0n;
    for (const rs of combinations(m.length, i)) {
      for (const cs of combinations(m[0].length, i)) {
        g = gcd(g, det(rs.map((r) => cs.map((c) => m[r][c]))));
      }
    }
    if (g === 0n) break;
    out.push(g / prev);
    prev = g;
  }
  return out;
}

test('Smith normal form of textbook examples', () => {
  assert.deepEqual(H.smithInvariants([[2, 4, 4], [-6, 6, 12], [10, -4, -16]]), [2n, 6n, 12n]);
  assert.deepEqual(H.smithInvariants([[2, 0], [0, 3]]), [1n, 6n]);
  assert.deepEqual(H.smithInvariants([[0, 0], [0, 0]]), []);
  assert.deepEqual(H.smithInvariants([]), []);
  assert.deepEqual(H.smithInvariants([[6, 10, 15]]), [1n]);
});

test('Smith normal form agrees with determinantal divisors', () => {
  const rand = rng(7);
  for (let trial = 0; trial < 300; trial++) {
    const r = 1 + Math.floor(rand() * 4);
    const c = 1 + Math.floor(rand() * 4);
    const scale = [3, 10, 40][trial % 3];
    const m = Array.from({ length: r }, () =>
      Array.from({ length: c }, () => (rand() < 0.3 ? 0 : Math.floor(rand() * (2 * scale + 1)) - scale))
    );
    const input = JSON.stringify(m);
    assert.deepEqual(H.smithInvariants(m), invariantsByMinors(m), input);
    assert.equal(JSON.stringify(m), input, 'input must not be modified');
  }
});

test('Smith normal form does not overflow', () => {
  const big = 2 ** 40;
  assert.deepEqual(H.smithInvariants([[big, big + 1], [big + 1, big + 2]]), [1n, 1n]);
  assert.deepEqual(H.smithInvariants([[big, 0], [0, big]]), [BigInt(big), BigInt(big)]);
});

// ---------------------------------------------------------------- homology

for (const preset of Presets.list) {
  test(`homology of ${preset.name}`, () => {
    const c = new H.SimplicialComplex(preset.facets);
    const result = H.computeHomology(c);
    assert.deepEqual(ascii(result), preset.expected);
    const bettiSum = result.groups.reduce((s, g) => s + (g.dim % 2 ? -g.rank : g.rank), 0);
    assert.equal(bettiSum, result.euler, 'Euler characteristic');
  });
}

test('f-vectors of the go-homology examples', () => {
  const f = (id) => new H.SimplicialComplex(Presets.byId[id].facets).fVector();
  assert.deepEqual(f('torus'), [7, 21, 14]);
  assert.deepEqual(f('rp2'), [6, 15, 10]);
  assert.deepEqual(f('klein'), [9, 27, 18]);
});

test('ℝP² has invariant factors (1×9, 2) in ∂_2', () => {
  const r = H.computeHomology(new H.SimplicialComplex(Presets.byId.rp2.facets));
  assert.deepEqual(r.boundaries[2].invariants, [...Array(9).fill(1n), 2n]);
  assert.equal(r.boundaries[1].rank, 5);
});

test('empty complex', () => {
  const r = H.computeHomology(new H.SimplicialComplex());
  assert.equal(r.dimension, -1);
  assert.deepEqual(r.groups, []);
  assert.deepEqual(H.fieldHomology(new H.SimplicialComplex(), 2).betti, []);
});

test('formatting', () => {
  assert.equal(H.formatGroup({ rank: 0, torsion: [] }), '0');
  assert.equal(H.formatGroup({ rank: 3, torsion: [2n, 2n, 6n] }), 'ℤ³ ⊕ (ℤ/2)² ⊕ ℤ/6');
  assert.equal(H.formatGroup({ rank: 1, torsion: [2n] }, { ascii: true }), 'Z + Z/2');
  assert.equal(
    H.formatChain([{ simplex: [0, 1], coeff: 1 }, { simplex: [0, 2], coeff: -1 }, { simplex: [1, 2], coeff: 2 }]),
    '[0,1] − [0,2] + 2·[1,2]'
  );
});

// ------------------------------------------------------ field coefficients

const PRIMES = [2, 3, 5, 7];

// Universal coefficient theorem: dim H_k(K; 𝔽_p) = β_k + #{p | t in Tors H_k} + #{p | t in Tors H_{k−1}}.
function expectedFieldBetti(result, p) {
  const P = BigInt(p);
  const tors = (k) => (k < 0 ? 0 : result.groups[k].torsion.filter((t) => t % P === 0n).length);
  return result.groups.map((g) => g.rank + tors(g.dim) + tors(g.dim - 1));
}

function checkFieldHomology(c, label) {
  const z = H.computeHomology(c);
  for (const p of PRIMES) {
    const f = H.fieldHomology(c, p);
    assert.deepEqual(f.betti, expectedFieldBetti(z, p), `${label}, p = ${p}`);
    // every generator is a cycle: ∂(Σ c_i σ_i) = 0 mod p
    f.generators.forEach((gens, k) => {
      for (const chain of gens) {
        const total = new Map();
        for (const { simplex, coeff } of chain) {
          assert.equal(simplex.length, k + 1);
          if (k === 0) continue;
          for (const face of H.faces(simplex)) {
            const key = H.key(face.simplex);
            total.set(key, (total.get(key) || 0) + coeff * face.coeff);
          }
        }
        for (const v of total.values()) assert.equal(((v % p) + p) % p, 0, `${label}: cycle`);
      }
    });
  }
}

test('field homology of the presets satisfies the universal coefficient theorem', () => {
  for (const preset of Presets.list) checkFieldHomology(new H.SimplicialComplex(preset.facets), preset.name);
  const rp2 = H.fieldHomology(new H.SimplicialComplex(Presets.byId.rp2.facets), 2);
  assert.deepEqual(rp2.betti, [1, 1, 1]);
});

test('field homology of random complexes satisfies the universal coefficient theorem', () => {
  const rand = rng(42);
  for (let trial = 0; trial < 150; trial++) {
    const c = randomComplex(rand, 4 + Math.floor(rand() * 7), 1 + Math.floor(rand() * 12), 4);
    checkFieldHomology(c, `random #${trial}`);
  }
});

test('integral Betti numbers of random complexes match rational ranks', () => {
  // Rank over ℚ by exact fraction-free elimination, independent of the SNF code.
  const rankQ = (rows) => {
    const m = rows.map((r) => r.map(BigInt));
    let rank = 0;
    for (let col = 0; m.length && col < m[0].length; col++) {
      const piv = m.findIndex((r, i) => i >= rank && r[col] !== 0n);
      if (piv < 0) continue;
      [m[rank], m[piv]] = [m[piv], m[rank]];
      for (let i = rank + 1; i < m.length; i++) {
        const a = m[i][col];
        if (a === 0n) continue;
        const b = m[rank][col];
        m[i] = m[i].map((x, j) => x * b - m[rank][j] * a);
      }
      rank++;
    }
    return rank;
  };
  const rand = rng(99);
  for (let trial = 0; trial < 60; trial++) {
    const c = randomComplex(rand, 9, 10, 5);
    const r = H.computeHomology(c);
    for (let k = 1; k <= c.dimension; k++) {
      assert.equal(r.boundaries[k].rank, rankQ(H.boundaryMatrix(c, k)));
    }
  }
});
