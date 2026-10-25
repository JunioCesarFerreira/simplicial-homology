# simplicial-homology

An interactive web application for constructing and visualizing simplicial complexes, computing simplicial homology groups, and exploring topological invariants.

Draw vertices, fill in edges, triangles, tetrahedra or higher simplices, and the homology updates as you edit:

- $H_k(K;\mathbb{Z})$, Betti numbers and torsion included (e.g. $\mathbb{Z} \oplus \mathbb{Z}/2$ for the Klein bottle), and optionally the reduced homology;
- $\dim H_k(K;\mathbb{F}_p)$ for $p = 2, 3, 5, 7, 11$, with a basis of representative cycles that you can highlight on the canvas;
- the f-vector, the Euler characteristic, and the ranks of $\partial_k$, $Z_k$ and $B_k$;
- the boundary matrices $\partial_k$ with their invariant factors.

The homology code is a JavaScript port of the Smith normal form method in [go-homology](https://github.com/JunioCesarFerreira/go-homology). Its README explains the theory.

## Running

There is no build step and there are no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

The folder can be published as-is on GitHub Pages or any other static host.

## Using the editor

| Action | How |
|---|---|
| Add a vertex | Click empty space |
| Select vertices | Click them, or drag a box over empty space (Shift adds to the selection) |
| Select a simplex | Click an edge, triangle or tetrahedron |
| Fill the simplex spanned by the selection | <kbd>Enter</kbd> (2 vertices → edge, 3 → triangle, 4 → tetrahedron, …) |
| Add an edge | Shift + drag from one vertex to another |
| Cone off the selection | <kbd>C</kbd>: a new vertex joined to every simplex inside the selection, e.g. to fill a polygonal hole |
| Remove the selected simplex | <kbd>Delete</kbd>: removes it and every simplex containing it, and keeps its faces |
| Delete the selected vertices | <kbd>Shift</kbd>+<kbd>Delete</kbd> |
| Move | Drag a vertex (or the whole selection), or drag a simplex |
| Undo / redo | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> |
| Zoom / pan | Mouse wheel / right- or middle-drag; <kbd>F</kbd> fits the view, <kbd>L</kbd> runs the auto layout |

You can also type the maximal simplices directly, one per line (`0 1 2`), in the *Maximal simplices* box, and import or export a complex as JSON. Adding a simplex always adds all of its faces, so the complex stays closed under faces. The current complex is saved in the browser's local storage.

The *Example* menu contains the complexes from go-homology (circle, disk, sphere, 7-vertex torus, 6-vertex $\mathbb{RP}^2$, 9-vertex Klein bottle) and also a point, $S^0$, the figure eight, an annulus, the Möbius band, a solid tetrahedron, $S^3$, and a pseudo-projective plane of order 3 with $H_1 = \mathbb{Z}/3$.

The drawing is a 2D picture of an abstract complex. Simplices may overlap on screen, and simplices of dimension 3 and higher are drawn as the convex hull of their vertices. Only the combinatorics affects the homology.

## How it is computed

[js/homology.js](js/homology.js):

- **Over $\mathbb{Z}$.** For each $k$ the code builds the matrix of $\partial_k : C_k \to C_{k-1}$ and computes its invariant factors with the Smith normal form algorithm from go-homology. Then
  $$H_k \cong \mathbb{Z}^{\,n_k - r_k - r_{k+1}} \oplus \bigoplus_{d_i(\partial_{k+1}) > 1} \mathbb{Z}/d_i,$$
  where $r_k = \text{rank} \partial_k$. Unlike the Go version, the elimination uses `BigInt`, so entries that grow during elimination cannot overflow.
- **Over $\mathbb{F}_p$.** This is a separate computation, not derived from the integer result. It is the standard column reduction $R = \partial V$ of the full boundary matrix. Each simplex whose column reduces to zero and is not the pivot of another column contributes the cycle $V_j$, and these cycles form a basis of $H_*(K;\mathbb{F}_p)$. They are the generators listed in the panel.

## Tests

```bash
npm test   # or: node --test tests/
```

Requires Node.js 20 or newer. Besides the known homology of every example, the suite checks the results against independent computations:

- $\partial_{k-1}\partial_k = 0$;
- the Smith normal form against determinantal divisors (gcds of all $i \times i$ minors) on random matrices;
- the ranks against exact elimination over $\mathbb{Q}$;
- the $\mathbb{Z}$ and $\mathbb{F}_p$ results against the universal coefficient theorem, on the examples and on random complexes;
- every $\mathbb{F}_p$ generator against the cycle condition.

## Project layout

| File | Contents |
|---|---|
| [index.html](index.html) | Page structure |
| [css/style.css](css/style.css) | Styles (light and dark) |
| [js/homology.js](js/homology.js) | Complexes, boundary matrices, Smith normal form, homology over $\mathbb{Z}$ and $\mathbb{F}_p$ |
| [js/presets.js](js/presets.js) | Example complexes and their expected homology |
| [js/app.js](js/app.js) | Canvas editor and results panel |
| [tests/homology.test.js](tests/homology.test.js) | Test suite |

## Limitations

- Matrices are dense, so the cost grows roughly cubically with the number of simplices. Complexes with a few hundred simplices are instant; complexes with thousands may take seconds.
- A single simplex can have at most 12 vertices, because a simplex on $n$ vertices has $2^n - 1$ faces.
