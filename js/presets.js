// Example complexes. Each preset lists its maximal simplices, optional vertex
// positions (any vertex without one is placed by the force layout), and its
// known integral homology H_0, H_1, … in go-homology's ASCII notation, which
// the test suite checks.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Presets = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function polygon(n, radius, startAngle = -Math.PI / 2, labels) {
    const pos = {};
    for (let i = 0; i < n; i++) {
      const a = startAngle + (2 * Math.PI * i) / n;
      pos[labels ? labels[i] : i] = [radius * Math.cos(a), radius * Math.sin(a)];
    }
    return pos;
  }

  function subsets(items, size) {
    if (size === 0) return [[]];
    if (items.length < size) return [];
    const [first, ...rest] = items;
    return subsets(rest, size - 1)
      .map((s) => [first, ...s])
      .concat(subsets(rest, size));
  }

  // Minimal 7-vertex torus: triangles {i, i+1, i+3} and {i, i+2, i+3} mod 7.
  function torus() {
    const facets = [];
    for (let i = 0; i < 7; i++) {
      facets.push([i, (i + 1) % 7, (i + 3) % 7], [i, (i + 2) % 7, (i + 3) % 7]);
    }
    return facets;
  }

  // 9-vertex Klein bottle: a 3×3 grid with top and bottom glued directly and
  // left and right glued with a flip, (3, j) ~ (0, 3 − j).
  function klein() {
    const v = (i, j) => (i === 3 ? 3 * 0 + ((3 - j) % 3) : 3 * i + (j % 3));
    const facets = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        facets.push([v(i, j), v(i + 1, j), v(i + 1, j + 1)]);
        facets.push([v(i, j), v(i, j + 1), v(i + 1, j + 1)]);
      }
    }
    return facets;
  }

  function kleinPositions() {
    const pos = {};
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) pos[3 * i + j] = [(i - 1) * 170 + j * 25, (1 - j) * 170 + i * 25];
    }
    return pos;
  }

  // A disk whose boundary 9-gon wraps three times around a triangle x0 x1 x2:
  // H_1 = ℤ/3. Ring vertices y_i = 3 + i, center c = 12.
  function pseudoProjective3() {
    const y = (i) => 3 + (i % 9);
    const facets = [];
    for (let i = 0; i < 9; i++) {
      facets.push([i % 3, (i + 1) % 3, y(i)]);
      facets.push([(i + 1) % 3, y(i), y(i + 1)]);
      facets.push([y(i), y(i + 1), 12]);
    }
    return facets;
  }

  function pseudoProjective3Positions() {
    const pos = polygon(9, 150, -Math.PI / 2, [3, 4, 5, 6, 7, 8, 9, 10, 11]);
    pos[12] = [0, 0];
    Object.assign(pos, polygon(3, 300, -Math.PI / 2 + Math.PI / 9));
    return pos;
  }

  const list = [
    {
      id: 'point',
      name: 'Point',
      facets: [[0]],
      positions: { 0: [0, 0] },
      expected: ['Z'],
    },
    {
      id: 'two-points',
      name: 'Two points (S⁰)',
      facets: [[0], [1]],
      positions: { 0: [-120, 0], 1: [120, 0] },
      expected: ['Z^2'],
    },
    {
      id: 'circle',
      name: 'Circle S¹',
      facets: [[0, 1], [1, 2], [0, 2]],
      positions: polygon(3, 160),
      expected: ['Z', 'Z'],
    },
    {
      id: 'disk',
      name: 'Disk D²',
      facets: [[0, 1, 2]],
      positions: polygon(3, 160),
      expected: ['Z', '0', '0'],
    },
    {
      id: 'figure-eight',
      name: 'Figure eight S¹ ∨ S¹',
      facets: [[0, 1], [1, 2], [0, 2], [0, 3], [3, 4], [0, 4]],
      positions: { 0: [0, 0], 1: [-200, -110], 2: [-200, 110], 3: [200, -110], 4: [200, 110] },
      expected: ['Z', 'Z^2'],
    },
    {
      id: 'annulus',
      name: 'Annulus',
      facets: [[0, 1, 3], [1, 3, 4], [1, 2, 4], [2, 4, 5], [0, 2, 5], [0, 3, 5]],
      positions: { ...polygon(3, 260), ...polygon(3, 100, -Math.PI / 2, [3, 4, 5]) },
      expected: ['Z', 'Z', '0'],
    },
    {
      id: 'mobius',
      name: 'Möbius band',
      facets: [0, 1, 2, 3, 4].map((i) => [i, (i + 1) % 5, (i + 2) % 5]),
      positions: polygon(5, 200),
      expected: ['Z', 'Z', '0'],
    },
    {
      id: 'sphere',
      name: 'Sphere S² (hollow tetrahedron)',
      facets: subsets([0, 1, 2, 3], 3),
      positions: { ...polygon(3, 220), 3: [0, 0] },
      expected: ['Z', '0', 'Z'],
    },
    {
      id: 'ball',
      name: 'Ball D³ (solid tetrahedron)',
      facets: [[0, 1, 2, 3]],
      positions: { ...polygon(3, 220), 3: [0, 0] },
      expected: ['Z', '0', '0', '0'],
    },
    {
      id: 'three-sphere',
      name: 'Sphere S³ (boundary of a 4-simplex)',
      facets: subsets([0, 1, 2, 3, 4], 4),
      positions: polygon(5, 220),
      expected: ['Z', '0', '0', 'Z'],
    },
    {
      id: 'torus',
      name: 'Torus T² (7 vertices)',
      facets: torus(),
      positions: polygon(7, 240),
      expected: ['Z', 'Z^2', 'Z'],
    },
    {
      id: 'rp2',
      name: 'Projective plane ℝP² (6 vertices)',
      facets: [
        [0, 1, 2], [0, 1, 5], [0, 2, 3], [0, 3, 4], [0, 4, 5],
        [1, 2, 4], [1, 3, 4], [1, 3, 5], [2, 3, 5], [2, 4, 5],
      ],
      positions: { 0: [0, 0], ...polygon(5, 220, -Math.PI / 2, [1, 2, 3, 4, 5]) },
      expected: ['Z', 'Z/2', '0'],
    },
    {
      id: 'klein',
      name: 'Klein bottle (9 vertices)',
      facets: klein(),
      positions: kleinPositions(),
      expected: ['Z', 'Z + Z/2', '0'],
    },
    {
      id: 'pseudo-projective-3',
      name: 'Pseudo-projective plane of order 3',
      facets: pseudoProjective3(),
      positions: pseudoProjective3Positions(),
      expected: ['Z', 'Z/3', '0'],
    },
  ];

  return { list, byId: Object.fromEntries(list.map((p) => [p.id, p])) };
});
