// Simplicial homology over ℤ (Smith normal form) and over prime fields 𝔽_p.
//
// Port of the algorithm in go-homology: build the integer boundary matrices
// ∂_k : C_k → C_{k-1}, reduce them to Smith normal form and read off
//
//   H_k ≅ ℤ^(n_k − r_k − r_{k+1}) ⊕ ⨁ ℤ/d_i,   d_i > 1 the invariant factors of ∂_{k+1}.
//
// Entries are BigInt during elimination, so coefficient growth cannot overflow.
// Loaded as a classic script in the browser (global `Homology`) and as a
// CommonJS module in Node (tests).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Homology = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- simplices

  // A simplex is an increasing array of distinct integer vertex labels.
  function normalize(vertices) {
    const vs = [...new Set(vertices.map(Number))];
    for (const v of vs) {
      if (!Number.isSafeInteger(v)) throw new Error(`invalid vertex label: ${v}`);
    }
    return vs.sort((a, b) => a - b);
  }

  function key(vs) {
    return vs.join(',');
  }

  function compareSimplices(a, b) {
    for (let i = 0; i < a.length && i < b.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
  }

  // True when the sorted array `sub` is contained in the sorted array `sup`.
  function isFace(sub, sup) {
    let j = 0;
    for (let i = 0; i < sup.length && j < sub.length; i++) {
      if (sup[i] === sub[j]) j++;
      else if (sup[i] > sub[j]) return false;
    }
    return j === sub.length;
  }

  // The (k−1)-faces of [v_0, …, v_k] with the signs of the boundary formula:
  // ∂[v_0, …, v_k] = Σ (−1)^i [v_0, …, v̂_i, …, v_k].
  function faces(vs) {
    return vs.map((_, i) => ({
      simplex: vs.slice(0, i).concat(vs.slice(i + 1)),
      coeff: i % 2 === 0 ? 1 : -1,
    }));
  }

  // ------------------------------------------------------------------ complex

  // A finite abstract simplicial complex, kept closed under taking faces.
  class SimplicialComplex {
    constructor(simplices = []) {
      this._simplices = new Map(); // key -> vertices
      this._cache = null;
      for (const s of simplices) this.add(s);
    }

    // Inserts a simplex together with all of its faces. Returns true if it was new.
    add(vertices) {
      const vs = normalize(vertices);
      if (vs.length === 0) return false;
      return this._insert(vs);
    }

    _insert(vs) {
      const k = key(vs);
      if (this._simplices.has(k)) return false; // its faces are already present
      this._simplices.set(k, vs);
      this._cache = null;
      if (vs.length > 1) {
        for (const f of faces(vs)) this._insert(f.simplex);
      }
      return true;
    }

    has(vertices) {
      return this._simplices.has(key(normalize(vertices)));
    }

    // Removes a simplex and every simplex that contains it (its open star),
    // which keeps the complex closed under faces. Returns the number removed.
    remove(vertices) {
      const vs = normalize(vertices);
      if (!this._simplices.has(key(vs))) return 0;
      let removed = 0;
      for (const [k, ws] of this._simplices) {
        if (ws.length >= vs.length && isFace(vs, ws)) {
          this._simplices.delete(k);
          removed++;
        }
      }
      this._cache = null;
      return removed;
    }

    get size() {
      return this._simplices.size;
    }

    get dimension() {
      return this._index().byDim.length - 1;
    }

    _index() {
      if (this._cache) return this._cache;
      const byDim = [];
      for (const vs of this._simplices.values()) {
        const d = vs.length - 1;
        while (byDim.length <= d) byDim.push([]);
        byDim[d].push(vs);
      }
      const position = byDim.map((list) => {
        list.sort(compareSimplices);
        return new Map(list.map((vs, i) => [key(vs), i]));
      });
      this._cache = { byDim, position };
      return this._cache;
    }

    // The k-simplices in lexicographic order: the ordered basis of C_k.
    simplices(k) {
      return this._index().byDim[k] || [];
    }

    all() {
      return this._index().byDim.flat();
    }

    indexOf(vertices, k = vertices.length - 1) {
      const m = this._index().position[k];
      const i = m ? m.get(key(vertices)) : undefined;
      return i === undefined ? -1 : i;
    }

    vertices() {
      return this.simplices(0).map((vs) => vs[0]);
    }

    // f-vector (n_0, n_1, …, n_dim).
    fVector() {
      return this._index().byDim.map((list) => list.length);
    }

    euler() {
      return this.fVector().reduce((acc, n, k) => acc + (k % 2 === 0 ? n : -n), 0);
    }

    // Maximal simplices, which determine the complex.
    facets() {
      const { byDim } = this._index();
      const notMaximal = new Set();
      for (let d = byDim.length - 1; d >= 1; d--) {
        for (const vs of byDim[d]) {
          for (const f of faces(vs)) notMaximal.add(key(f.simplex));
        }
      }
      return byDim.flat().filter((vs) => !notMaximal.has(key(vs)));
    }

    clone() {
      const c = new SimplicialComplex();
      for (const [k, vs] of this._simplices) c._simplices.set(k, vs);
      return c;
    }
  }

  // ------------------------------------------------------- boundary matrices

  // Matrix of ∂_k : C_k → C_{k−1} (n_{k−1} rows, n_k columns); column j holds
  // the coefficients of ∂σ_j. Empty when k ≤ 0 or k > dim K.
  function boundaryMatrix(complex, k) {
    if (k <= 0) return [];
    const cols = complex.simplices(k);
    const rows = complex.simplices(k - 1);
    const m = rows.map(() => new Array(cols.length).fill(0));
    cols.forEach((s, j) => {
      for (const f of faces(s)) {
        const i = complex.indexOf(f.simplex, k - 1);
        if (i < 0) throw new Error(`face ${key(f.simplex)} of ${key(s)} is missing`);
        m[i][j] += f.coeff;
      }
    });
    return m;
  }

  // ------------------------------------------------------ Smith normal form

  const babs = (x) => (x < 0n ? -x : x);

  // Invariant factors d_1 | d_2 | … | d_r (BigInt, all > 0) of an integer
  // matrix given as an array of rows. The input is not modified.
  //
  // Same procedure as go-homology: for each diagonal position t, bring the
  // nonzero entry of least absolute value to (t, t), clear its row and column
  // with the Euclidean algorithm, and force the pivot to divide the rest of
  // the block before moving on.
  function smithInvariants(matrix) {
    const m = matrix.length;
    const n = m ? matrix[0].length : 0;
    const A = matrix.map((row) => row.map((x) => BigInt(x)));
    const swapRows = (i, j) => {
      const tmp = A[i];
      A[i] = A[j];
      A[j] = tmp;
    };
    // Rows above t are zero from column t on, so column swaps start at row t.
    const swapCols = (i, j, from) => {
      for (let r = from; r < m; r++) {
        const tmp = A[r][i];
        A[r][i] = A[r][j];
        A[r][j] = tmp;
      }
    };

    const invariants = [];
    for (let t = 0; t < m && t < n; t++) {
      let pr = -1;
      let pc = -1;
      let best = 0n;
      search: for (let i = t; i < m; i++) {
        const row = A[i];
        for (let j = t; j < n; j++) {
          if (row[j] === 0n) continue;
          const a = babs(row[j]);
          if (best === 0n || a < best) {
            best = a;
            pr = i;
            pc = j;
            if (a === 1n) break search;
          }
        }
      }
      if (best === 0n) break; // the remaining block is zero

      swapRows(t, pr);
      swapCols(t, pc, t);

      for (;;) {
        const p = A[t][t];
        let restart = false;

        // Clear column t below the pivot.
        for (let i = t + 1; i < m && !restart; i++) {
          const ri = A[i];
          if (ri[t] === 0n) continue;
          const q = ri[t] / p;
          const rt = A[t];
          for (let j = t; j < n; j++) {
            if (rt[j] !== 0n) ri[j] -= q * rt[j];
          }
          if (ri[t] !== 0n) {
            swapRows(t, i); // the remainder is a smaller pivot
            restart = true;
          }
        }
        if (restart) continue;

        // Clear row t right of the pivot. Column t is zero below the pivot,
        // so only row t changes.
        const rt = A[t];
        for (let j = t + 1; j < n && !restart; j++) {
          if (rt[j] === 0n) continue;
          rt[j] -= (rt[j] / p) * p;
          if (rt[j] !== 0n) {
            swapCols(t, j, t);
            restart = true;
          }
        }
        if (restart) continue;

        // The pivot must divide the remaining block (d_t | d_{t+1}).
        if (babs(p) !== 1n) {
          let bad = -1;
          outer: for (let i = t + 1; i < m; i++) {
            const ri = A[i];
            for (let j = t + 1; j < n; j++) {
              if (ri[j] !== 0n && ri[j] % p !== 0n) {
                bad = i;
                break outer;
              }
            }
          }
          if (bad >= 0) {
            const rb = A[bad];
            for (let j = t; j < n; j++) rt[j] += rb[j];
            continue;
          }
        }
        break;
      }
      invariants.push(babs(A[t][t]));
    }
    return invariants;
  }

  // ------------------------------------------------------ integer homology

  // Homology of the complex with integer coefficients.
  //
  // Returns { dimension, fVector, euler, groups, boundaries } where
  //   groups[k]     = { dim, rank (β_k), torsion: BigInt[] (all > 1),
  //                     cycles (rank Z_k), boundaries (rank B_k) }
  //   boundaries[k] = { k, rows, cols, rank, invariants: BigInt[] } for k ≥ 1.
  function computeHomology(complex) {
    const dim = complex.dimension;
    const fVector = complex.fVector();
    const boundaries = [];
    for (let k = 1; k <= dim; k++) {
      const invariants = smithInvariants(boundaryMatrix(complex, k));
      boundaries[k] = {
        k,
        rows: fVector[k - 1],
        cols: fVector[k],
        rank: invariants.length,
        invariants,
      };
    }
    const rankOf = (k) => (k >= 1 && k <= dim ? boundaries[k].rank : 0);

    const groups = [];
    for (let k = 0; k <= dim; k++) {
      const cycles = fVector[k] - rankOf(k);
      const bounds = rankOf(k + 1);
      groups.push({
        dim: k,
        rank: cycles - bounds,
        torsion: k < dim ? boundaries[k + 1].invariants.filter((d) => d > 1n) : [],
        cycles,
        boundaries: bounds,
      });
    }
    return { dimension: dim, fVector, euler: complex.euler(), groups, boundaries };
  }

  // ---------------------------------------------------- field coefficients

  function modInverse(a, p) {
    let [r0, r1] = [p, ((a % p) + p) % p];
    let [s0, s1] = [0, 1];
    while (r1 !== 0) {
      const q = Math.floor(r0 / r1);
      [r0, r1] = [r1, r0 - q * r1];
      [s0, s1] = [s1, s0 - q * s1];
    }
    if (r0 !== 1) throw new Error(`${a} is not invertible mod ${p}`);
    return ((s0 % p) + p) % p;
  }

  // Sparse column over 𝔽_p: increasing row indices and nonzero values in [1, p).
  // Returns a + c·b.
  function axpy(a, b, c, p) {
    const idx = [];
    const val = [];
    let i = 0;
    let j = 0;
    while (i < a.idx.length || j < b.idx.length) {
      if (j >= b.idx.length || (i < a.idx.length && a.idx[i] < b.idx[j])) {
        idx.push(a.idx[i]);
        val.push(a.val[i]);
        i++;
      } else if (i >= a.idx.length || b.idx[j] < a.idx[i]) {
        idx.push(b.idx[j]);
        val.push((c * b.val[j]) % p);
        j++;
      } else {
        const v = (a.val[i] + c * b.val[j]) % p;
        if (v !== 0) {
          idx.push(a.idx[i]);
          val.push(v);
        }
        i++;
        j++;
      }
    }
    return { idx, val };
  }

  // Homology with coefficients in the prime field 𝔽_p, with representative
  // cycles. Uses the standard column reduction of the full boundary matrix
  // (simplices ordered by dimension, then lexicographically): R = ∂V. A simplex
  // whose column reduces to zero and is not the lowest entry of any other
  // column is "essential", and the cycles V_j of the essential simplices form a
  // basis of H_*(K; 𝔽_p).
  //
  // Returns { p, betti, ranks, generators } where ranks[k] = rank ∂_k over 𝔽_p
  // and generators[k] is a list of chains [{ simplex, coeff }] (coeff in the
  // symmetric range −p/2 < c ≤ p/2).
  function fieldHomology(complex, p) {
    if (!Number.isInteger(p) || p < 2) throw new Error(`invalid prime: ${p}`);
    const all = complex.all();
    const dimOf = all.map((vs) => vs.length - 1);
    const offset = [];
    {
      let acc = 0;
      for (const n of complex.fVector()) {
        offset.push(acc);
        acc += n;
      }
    }
    const globalIndex = (vs) => offset[vs.length - 1] + complex.indexOf(vs);

    const R = all.map((vs) => {
      if (vs.length === 1) return { idx: [], val: [] };
      const entries = faces(vs)
        .map((f) => [globalIndex(f.simplex), (f.coeff + p) % p])
        .sort((x, y) => x[0] - y[0]);
      return { idx: entries.map((e) => e[0]), val: entries.map((e) => e[1]) };
    });
    const V = all.map((_, j) => ({ idx: [j], val: [1] }));
    const pivotOf = new Map(); // lowest row index -> column
    const ranks = new Array(complex.dimension + 2).fill(0);

    for (let j = 0; j < all.length; j++) {
      while (R[j].idx.length > 0) {
        const low = R[j].idx[R[j].idx.length - 1];
        const i = pivotOf.get(low);
        if (i === undefined) break;
        const lowJ = R[j].val[R[j].val.length - 1];
        const lowI = R[i].val[R[i].val.length - 1];
        const c = (p - ((lowJ * modInverse(lowI, p)) % p)) % p;
        R[j] = axpy(R[j], R[i], c, p);
        V[j] = axpy(V[j], V[i], c, p);
      }
      if (R[j].idx.length > 0) {
        pivotOf.set(R[j].idx[R[j].idx.length - 1], j);
        ranks[dimOf[j]]++;
      }
    }

    const betti = new Array(complex.dimension + 1).fill(0);
    const generators = betti.map(() => []);
    for (let j = 0; j < all.length; j++) {
      if (R[j].idx.length > 0 || pivotOf.has(j)) continue;
      const k = dimOf[j];
      betti[k]++;
      generators[k].push(
        V[j].idx.map((i, t) => ({
          simplex: all[i],
          coeff: V[j].val[t] > p / 2 ? V[j].val[t] - p : V[j].val[t],
        }))
      );
    }
    return { p, betti, ranks: ranks.slice(0, complex.dimension + 1), generators };
  }

  // -------------------------------------------------------------- formatting

  const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).replace(/\d/g, (d) => SUPERSCRIPT[d]);

  // "ℤ² ⊕ (ℤ/2)² ⊕ ℤ/6", or "Z^2 + Z/2 + Z/2 + Z/6" with { ascii: true }
  // (the notation used by go-homology). The trivial group is "0".
  function formatGroup(group, { ascii = false } = {}) {
    const parts = [];
    if (group.rank > 0) {
      if (ascii) parts.push(group.rank === 1 ? 'Z' : `Z^${group.rank}`);
      else parts.push(group.rank === 1 ? 'ℤ' : `ℤ${sup(group.rank)}`);
    }
    const counts = new Map();
    for (const d of group.torsion) counts.set(String(d), (counts.get(String(d)) || 0) + 1);
    for (const [d, c] of counts) {
      if (ascii) for (let i = 0; i < c; i++) parts.push(`Z/${d}`);
      else parts.push(c === 1 ? `ℤ/${d}` : `(ℤ/${d})${sup(c)}`);
    }
    if (parts.length === 0) return '0';
    return parts.join(ascii ? ' + ' : ' ⊕ ');
  }

  function formatChain(chain) {
    let s = '';
    chain.forEach(({ simplex, coeff }, i) => {
      const term = `[${simplex.join(',')}]`;
      const mag = Math.abs(coeff) === 1 ? '' : `${Math.abs(coeff)}·`;
      if (i === 0) s += (coeff < 0 ? '−' : '') + mag + term;
      else s += (coeff < 0 ? ' − ' : ' + ') + mag + term;
    });
    return s;
  }

  return {
    normalize,
    key,
    faces,
    isFace,
    SimplicialComplex,
    boundaryMatrix,
    smithInvariants,
    computeHomology,
    fieldHomology,
    formatGroup,
    formatChain,
    superscript: sup,
  };
});
