# Zigzag Labs

Standalone, interactive introductions to zigzag persistent homology over $\mathbb{F}_2$, with barcodes in dimensions 0, 1, and 2.

| Lab | Diagram | Open |
|---|---|---|
| Union orientation | $K_0 \to K_1 \leftarrow K_2$ | [HTML](zigzag-union-lab.html) · [Online](https://juniocesarferreira.github.io/simplicial-homology/extra-zigzag/zigzag-union-lab.html) |
| Intersection | $K_0 \leftarrow K_0\cap K_1 \rightarrow K_1$ | [HTML](zigzag-intersection-lab.html) · [Online](https://juniocesarferreira.github.io/simplicial-homology/extra-zigzag/zigzag-intersection-lab.html) |
| Bridge comparison | $A\to M\leftarrow B$ | [HTML](zigzag-bridge-lab.html) · [Online](https://juniocesarferreira.github.io/simplicial-homology/extra-zigzag/zigzag-bridge-lab.html) |

In the union-oriented lab, the central complex contains both outer complexes but may also contain additional simplices. In the intersection lab, the central complex is exactly the set of shared simplices and updates automatically.

The **Bridge Zigzag Lab** compares the ambient complex, the subcomplex of the ambient complex induced by the endpoint vertices, the exact union, the intersection, and a forest-based bridge complex. Its bridge barcode agrees with the ambient diagram in $H_0$ and the induced-subcomplex diagram in positive degrees. See [the mathematical construction, proofs, examples, and limitations](bridge-zigzag-mathematics.md). The sections below describe the union-oriented and intersection labs.

[Back to the main project](../README.md)

## Run locally

Open any of the HTML files in a modern browser. Each contains its own HTML, CSS, and JavaScript; no installation, build, or external libraries are required.

Alternatively, run this command from the repository root:

```bash
python3 -m http.server 8000
```

Then open the chosen HTML file under `/extra-zigzag/` at <http://localhost:8000>.

## Using the lab

| Control | Action |
|---|---|
| Move | Drag a vertex to update its position in all three panels |
| Vertex | Click empty space to add a vertex |
| Edge / Face / Tetrahedron | Select 2, 3, or 4 vertices in the same panel |
| Erase | Click a simplex to remove it and all of its cofaces |
| Simplex editor | Choose a complex and enter vertex IDs, such as `0,1,2` |
| Simplices | Expand the list to inspect or remove individual simplices |
| Example | Load a predefined example or start from scratch |
| Export JSON / Import JSON | Save or load the three complexes and their vertex positions |
| Dark mode | Toggle the theme; the choice is saved when browser storage is available |

The initial theme follows the system preference unless a theme has already been saved. Complexes are not automatically saved across page reloads; use JSON export to preserve your work.

Adding a simplex includes all of its faces. In the **union-oriented lab**, adding it to $K_0$ or $K_2$ also adds it to $K_1$. Removing a simplex from $K_1$ removes it and its cofaces from the outer complexes as well. Removing from an outer complex does not remove from the central complex.

In the **intersection lab**, edit only the outer complexes $K_0$ and $K_1$. Reuse vertex IDs through the simplex editor to create shared vertices or simplices. The middle panel is read-only, except that vertices can be dragged to adjust the shared drawing. Deleting a simplex from one outer complex updates the intersection without changing the other outer complex. JSON exports use a separate format and are not interchangeable between the two labs.

Vertex IDs identify the same vertex across panels. The drawing is a 2D projection of an abstract complex: crossing edges or overlapping triangles do not create additional simplices. Moving vertices does not change the homology.

## Reading the results

Each homology panel displays the Betti numbers at the three positions, the ranks of the induced maps, and the interval decomposition. Additional rank information depends on the orientation, as described below.

- $H_0$ describes connected components (ordinary, unreduced homology).
- $H_1$ describes independent one-dimensional cycles modulo boundaries.
- $H_2$ describes independent two-dimensional cycles modulo boundaries. Filled tetrahedra can kill these classes through $\operatorname{im}\partial_3$.

An interval $[a,b]$ includes both endpoints and represents a summand supported at positions $a,a+1,\ldots,b$. A dot such as $[0,0]$ is supported at only one position. The indices label positions from left to right, not a continuous time axis. In the intersection lab, positions 0, 1, and 2 mean $K_0$, $K_0\cap K_1$, and $K_1$, respectively.

In the union-oriented lab, **H₂ — persistent sphere** places the boundary of a tetrahedron at all three positions, producing one $H_2$ interval $[0,2]$. **H₂ — filled sphere** fills the central tetrahedron, giving Betti numbers $(1,0,1)$ and intervals $[0,0]$ and $[2,2]$.

The intersection lab includes these examples:

| Example | Homology | Betti numbers | Intervals |
|---|---|---|---|
| Shared circle | $H_1$ | $(1,1,1)$ | $[0,2]$ |
| Circle filled on the left | $H_1$ | $(0,1,1)$ | $[1,2]$ |
| Circle killed on both sides, using different cone vertices | $H_1$ | $(0,1,0)$ | $[1,1]$ |
| Persistent sphere | $H_2$ | $(1,1,1)$ | $[0,2]$ |
| Sphere filled on the left | $H_2$ | $(0,1,1)$ | $[1,2]$ |
| Disjoint complexes | $H_0$ | $(1,0,1)$ | $[0,0]$, $[2,2]$ |

## Computation

For each $k=0,1,2$, the application computes

$$H_k(K;\mathbb{F}_2)=\ker\partial_k/\operatorname{im}\partial_{k+1}$$

using binary Gaussian elimination with `BigInt` bit vectors. Inclusion maps send representative cycles into their target complexes, where they are expressed in homology coordinates.

### Union orientation

Write $V_i=H_k(K_i;\mathbb{F}_2)$ and let $f:V_0\to V_1$ and $g:V_2\to V_1$. Set $r_f=\operatorname{rank}f$, $r_g=\operatorname{rank}g$, and

$$s=\dim(\operatorname{im}f\cap\operatorname{im}g)=r_f+r_g-\operatorname{rank}[f\;g].$$

The interval multiplicities are:

| Interval | Multiplicity |
|---|---|
| $[0,0]$ | $\dim V_0-r_f$ |
| $[0,1]$ | $r_f-s$ |
| $[0,2]$ | $s$ |
| $[1,1]$ | $\dim V_1-\operatorname{rank}[f\;g]$ |
| $[1,2]$ | $r_g-s$ |
| $[2,2]$ | $\dim V_2-r_g$ |

Thus the Betti numbers alone do not determine the barcode.

### Intersection orientation

Write $A=H_k(K_0)$, $B=H_k(K_0\cap K_1)$, and $C=H_k(K_1)$. Both maps have the same source: $f:B\to A$ and $g:B\to C$. Set $r_f=\operatorname{rank}f$, $r_g=\operatorname{rank}g$, and $r=\operatorname{rank}(f,g)$, where $(f,g):B\to A\oplus C$.

| Interval | Multiplicity |
|---|---|
| $[0,0]$ | $\dim A-r_f$ |
| $[0,1]$ | $r-r_g$ |
| $[0,2]$ | $r_f+r_g-r$ |
| $[1,1]$ | $\dim B-r$ |
| $[1,2]$ | $r-r_f$ |
| $[2,2]$ | $\dim C-r_g$ |

Here $\dim B-r=\dim(\ker f\cap\ker g)$. The joint map is computed by stacking the two matrices using the same source basis. In particular, $H_k(K_0\cap K_1)$ is computed from the shared simplices, not by intersecting the homology groups of the outer complexes.

Background: [Carlsson and de Silva, *Zigzag Persistence*](https://arxiv.org/abs/0812.0197).

## Scope

- Exactly three positions, with the fixed orientation of the chosen lab.
- Coefficients in $\mathbb{F}_2$ only; no integer homology or torsion computation.
- At most 12 distinct vertices across the three complexes and simplices of dimension at most 3.
- Results for $H_0$, $H_1$, and $H_2$ only.
- Each lab has its own implementation embedded in its HTML file.

## Tests

Run `node --test tests/zigzag-intersection.test.js` from the repository root. The intersection lab's tests cover the examples, editing invariants, JSON round-trips, input validation, and 150 random intersections checked against independent chain-level computations. They execute the embedded script with a minimal DOM; they do not test browser layout. The union-oriented lab does not yet have a dedicated automated test suite.
