# Zigzag Lab

A standalone, interactive introduction to zigzag persistent homology. Edit three simplicial complexes related by inclusions,

$$K_0 \hookrightarrow K_1 \hookleftarrow K_2,$$

and explore the resulting barcodes in dimensions 0, 1, and 2, with coefficients in $\mathbb{F}_2$.

**Application:** [zigzag-lab.html](zigzag-lab.html)

**GitHub Pages URL (after publication):** <https://juniocesarferreira.github.io/simplicial-homology/extra-zigzag/zigzag-lab.html>

[Back to the main project](../README.md)

## Run locally

Open `zigzag-lab.html` in a modern browser. All HTML, CSS, and JavaScript are contained in this file; no installation, build, or external libraries are required.

Alternatively, run this command from the repository root:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/extra-zigzag/zigzag-lab.html>.

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

Adding a simplex includes all of its faces. Adding it to $K_0$ or $K_2$ also adds it to $K_1$. Removing a simplex from $K_1$ removes it and its cofaces from the outer complexes as well. These rules preserve both inclusions. Removing from an outer complex does not remove from the central complex.

Vertex IDs identify the same vertex across panels. The drawing is a 2D projection of an abstract complex: crossing edges or overlapping triangles do not create additional simplices. Moving vertices does not change the homology.

## Reading the results

Each homology panel displays the Betti numbers at the three positions, the ranks of the induced maps, the dimension of the intersection of their images, and the interval decomposition.

- $H_0$ describes connected components (ordinary, unreduced homology).
- $H_1$ describes independent one-dimensional cycles modulo boundaries.
- $H_2$ describes independent two-dimensional cycles modulo boundaries. Filled tetrahedra can kill these classes through $\operatorname{im}\partial_3$.

An interval $[a,b]$ includes both endpoints and represents a summand supported at positions $a,a+1,\ldots,b$. A dot such as $[0,0]$ is supported at only one position. The indices label the three complexes, not a continuous time axis.

For example, **H₂ — persistent sphere** places the boundary of a tetrahedron at all three positions, producing one $H_2$ interval $[0,2]$. **H₂ — filled sphere** fills the central tetrahedron, giving Betti numbers $(1,0,1)$ and intervals $[0,0]$ and $[2,2]$.

## Computation

For each $k=0,1,2$, the application computes

$$H_k(K;\mathbb{F}_2)=\ker\partial_k/\operatorname{im}\partial_{k+1}$$

using binary Gaussian elimination with `BigInt` bit vectors. Inclusion maps send representative cycles into the central complex, where they are expressed in homology coordinates.

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

## Scope

- Exactly three complexes, with the fixed orientation $K_0\to K_1\leftarrow K_2$.
- Coefficients in $\mathbb{F}_2$ only; no integer homology or torsion computation.
- At most 12 distinct vertices across the three complexes and simplices of dimension at most 3.
- Results for $H_0$, $H_1$, and $H_2$ only.
- The lab has its own implementation embedded in the HTML file. The main project's `npm test` suite tests `js/homology.js`, not this standalone lab.

## GitHub Pages

The lab is a static file and can be published alongside the main application. With the repository root of `main` configured as the Pages source, include `extra-zigzag/zigzag-lab.html` in that branch and let the Pages deployment complete.

The application will then be available at:

<https://juniocesarferreira.github.io/simplicial-homology/extra-zigzag/zigzag-lab.html>

Use the full `.html` path: this directory does not contain an `index.html`. If you use a custom deployment workflow, include the `extra-zigzag` directory in the published artifact as well.
