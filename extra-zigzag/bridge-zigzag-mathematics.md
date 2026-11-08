# Bridge Zigzag Lab: construction and mathematics

[Open the tool](zigzag-bridge-lab.html) · [All zigzag labs](README.md)

The Bridge Zigzag Lab constructs an intermediate simplicial complex that uses the connectivity of a supplied ambient complex while preserving the positive-dimensional homology of the exact union of the endpoints. It computes an ordinary three-position zigzag barcode for this new complex. It does not concatenate or take the set-theoretic union of two existing barcodes.

The interface and calculations use coefficients in $\mathbb F_2$, ordinary unreduced homology, and dimensions $0,1,2$.

## 1. Input and notation

The input consists of finite simplicial complexes $A,C,B$ with

$$A\subseteq C\supseteq B.$$

Vertex IDs are shared across the three complexes. Define

$$U=A\cup B,\qquad I=A\cap B.$$

These are unions and intersections of **sets of simplices**, including their faces. They are not geometric operations on the drawings and are not operations on homology groups. In particular, crossing edges do not create a vertex.

The ambient complex $C$ can contain additional vertices, connecting edges, triangles, and tetrahedra. It need not equal $U$. An additional filling in $C$ may kill a cycle that is present in both endpoints and in $U$. Additional edges in $C$ may also connect components that have no shared vertices in $I$.

The tool compares four diagrams:

| Model | Diagram | Role |
|---|---|---|
| Ambient | $A\to C\leftarrow B$ | All supplied connections and fillings |
| Exact union | $A\to U\leftarrow B$ | Only simplices present in an endpoint |
| Intersection | $A\leftarrow I\to B$ | Only shared simplices |
| Bridge | $A\to M\leftarrow B$ | Ambient connectivity and union higher homology |

Positions $0,1,2$ always mean the left endpoint, selected middle complex, and right endpoint. They are diagram indices, not elapsed time.

## 2. Constructing the bridge complex

Let $V(C)$ be the vertices of $C$. Start with

$$M_0=U\cup\{\{v\}:v\in V(C)\}.$$

Thus every vertex of $C$ is retained, even when it belongs to neither endpoint. The new vertices initially form isolated components.

Process the edges of $C$ in increasing numerical lexicographic order of their sorted vertex IDs. For each edge $e=\{u,v\}$:

- if $u$ and $v$ are already connected in the current complex, skip the edge;
- otherwise, add the edge and merge its two connected components.

If $F$ is the set of selected edges, the final result is

$$\boxed{M=U\cup V(C)\cup F.}$$

Here $V(C)$ denotes the collection of singleton simplices. No additional triangles or tetrahedra of $C$ are added; any already belonging to $U$ remain in $M$.

The implementation uses a disjoint-set structure. It first merges the endpoints of every edge of $U$, then scans the edges of $C$. This is a spanning-forest construction on the graph obtained by contracting each connected component of $U$ to one node and retaining each other vertex of $C$ as its own node. Loops in that contracted graph are skipped.

The forest spans every ambient component, including components disjoint from $U$. This convention preserves all of $H_0(C)$ and allows ambient-only components to appear as middle-only bars.

The selected forest is deterministic for fixed vertex IDs and does not use screen coordinates. It is not a shortest-path or minimum-geometric-length construction. It may retain branches that are unnecessary for connecting the endpoints, because every ambient vertex is retained.

## 3. Guarantees and proofs

### Subcomplex inclusions

By construction,

$$A,B\subseteq U\subseteq M\subseteq C.$$

The complex $U$ is closed under faces. Every added edge has both endpoint vertices in $M_0$. Therefore $M$ is a simplicial complex, and both arrows of $A\to M\leftarrow B$ are valid inclusions.

### Ambient connectivity is preserved

The inclusion induces an isomorphism

$$H_0(M;\mathbb F_2)\xrightarrow{\cong}H_0(C;\mathbb F_2).$$

**Proof.** All vertices of $C$ occur in $M$. Every edge of $C$ either was selected or had endpoints already connected when it was examined. Connections are never removed, so the endpoints of every edge of $C$ are connected in the final $M$. Every path in $C$ therefore induces connectivity in $M$. Conversely, every path in $M$ lies in $C$. The connected-component partitions of the common vertex set are equal. The conclusion includes the empty-complex case.

### Positive-dimensional homology of the union is preserved

For every $k\geq1$, inclusion induces an isomorphism

$$H_k(U;\mathbb F_2)\xrightarrow{\cong}H_k(M;\mathbb F_2).$$

**Proof.** Adding isolated vertices to $U$ does not change positive-dimensional homology. Each subsequently selected edge joins two different connected components of the current complex. Such an attachment merges components without creating a cycle or filling an existing cycle.

More algebraically, for one edge attachment $X\subset X'$ with existing endpoints in distinct components, the relative chain complex has one generator in degree 1 and no others. The connecting map

$$H_1(X',X)\longrightarrow H_0(X)$$

sends that generator to the sum of the two distinct component classes. Over $\mathbb F_2$ this is nonzero, so the map is injective. The long exact sequence of the pair implies that $H_1(X)\to H_1(X')$ is an isomorphism. The maps in degrees at least 2 are also isomorphisms. Repeating this argument proves the claim.

This argument concerns the inclusion maps, not merely equality of Betti numbers. The same construction and guarantees work over any field, although this implementation computes only over $\mathbb F_2$.

### Consequences for the entire zigzag module

The preceding isomorphisms commute with the maps from $A$ and $B$. Therefore:

$$\operatorname{Bar}_0(A\to M\leftarrow B)
=\operatorname{Bar}_0(A\to C\leftarrow B),$$

and, for every $k\geq1$,

$$\operatorname{Bar}_k(A\to M\leftarrow B)
=\operatorname{Bar}_k(A\to U\leftarrow B).$$

These are equalities of interval multisets, including multiplicities and middle-only intervals. The construction thus realizes a degree-dependent combination with **one actual intermediate simplicial complex**: degree zero follows $C$, and positive degrees follow $U$.

Different valid spanning-forest choices can produce different drawings and different sets of bridge edges. Nevertheless, all satisfy these same module isomorphisms and give the same barcodes for fixed $A,B,C$. The particular edge set is not canonical; the resulting barcode is independent of that forest choice.

## 4. Computing the barcode

The tool builds simplicial boundary matrices and computes

$$H_k(X;\mathbb F_2)=\ker\partial_k/\operatorname{im}\partial_{k+1}$$

by exact binary Gaussian elimination with `BigInt` bit vectors. Tetrahedra contribute to $\partial_3$, so their effect on $H_2$ is included. Representative cycles determine the induced maps in homology.

For any of the cospans $A\to X\leftarrow B$, write

$$L=H_k(A),\quad V=H_k(X),\quad R=H_k(B),$$

$$f:L\to V,\qquad g:R\to V.$$

Set $r_f=\operatorname{rank}f$, $r_g=\operatorname{rank}g$, $t=\operatorname{rank}[f\;g]$, and $s=r_f+r_g-t$. Thus $s=\dim(\operatorname{im}f\cap\operatorname{im}g)$.

| Interval | Multiplicity |
|---|---|
| $[0,0]$ | $\dim L-r_f$ |
| $[0,1]$ | $r_f-s$ |
| $[0,2]$ | $s$ |
| $[1,1]$ | $\dim V-t$ |
| $[1,2]$ | $r_g-s$ |
| $[2,2]$ | $\dim R-r_g$ |

For the intersection diagram $A\leftarrow I\to B$, the maps instead share a source:

$$f:H_k(I)\to H_k(A),\qquad g:H_k(I)\to H_k(B).$$

With $r=\operatorname{rank}(f,g)$ for the stacked map into $H_k(A)\oplus H_k(B)$, the multiplicities in the same row order are

$$\dim H_k(A)-r_f,\quad r-r_g,\quad r_f+r_g-r,\quad
\dim H_k(I)-r,\quad r-r_f,\quad \dim H_k(B)-r_g.$$

The comparison table shows only the multiplicity of $[0,2]$. Select each model to inspect all of its intervals and Betti numbers. A full-length bar describes a module summand; the tool does not assign a canonical geometric representative to each individual bar.

## 5. The motivating example

The default example reproduces the topology of the supplied screenshots. Both endpoints contain the cycle with edges

$$[0,1],\ [1,3],\ [2,3],\ [0,2].$$

The left endpoint additionally contains isolated vertices $4$ and $5$. The right endpoint additionally contains edge $[7,8]$.

The ambient complex fills the cycle by coning its four edges to vertex $6$, connects $0$ to $5$ through vertex $9$, and includes the filled triangle $[4,7,8]$. Hence the ambient complex kills the shared cycle but connects the isolated vertex $4$ to the right-hand component.

The exact union has four components and retains the cycle. The intersection consists of the shared cycle. The bridge algorithm selects

$$F=\{[0,6],[0,9],[4,7],[5,9]\}.$$

It retains vertices $6$ and $9$, but not the additional filling triangles. The edge $[0,6]$ is a tree branch; it does not fill or create a cycle.

| Model | Betti triple in $H_0$ | Full-length $H_0$ bars | Betti triple in $H_1$ | Full-length $H_1$ bars |
|---|---|---|---|---|
| Ambient $C$ | $(3,2,2)$ | 2 | $(1,0,1)$ | 0 |
| Exact union $U$ | $(3,4,2)$ | 1 | $(1,1,1)$ | 1 |
| Intersection $I$ | $(3,1,2)$ | 1 | $(1,1,1)$ | 1 |
| Bridge $M$ | $(3,2,2)$ | 2 | $(1,1,1)$ | 1 |

The bridge barcode has two $[0,2]$ intervals and one $[0,0]$ interval in $H_0$, and one $[0,2]$ interval in $H_1$.

## 6. What this construction does not guarantee

- **It changes the model.** If the extra fillings in $C$ are meaningful observations, their effect on homology is real. Choosing $M$ deliberately excludes that effect. The interface preserves the original $C$ for comparison.
- **It does not recover classes already killed by $U$.** For example, take the square boundary in both endpoints, fill triangle $[0,1,2]$ in $A$, and fill $[0,2,3]$ in $B$. Each endpoint has one $H_1$ class, but their exact union is a filled disk. Every bridge complex containing this union still makes these endpoint classes zero. The preset “Both cycles killed by the union” demonstrates this limitation.
- **It does not force every feature to persist.** If $C$ provides no path between two endpoint components, the forest cannot invent one. Components that exist only in $C$ remain middle-only bars.
- **It can retain cycles born only in $U$.** Two paths whose union closes a loop produce a middle-only $H_1$ bar. The preset “Cycle born in the exact union” demonstrates this.
- **It does not unite interval lists or match arbitrary bases.** Barcodes alone do not contain all the chain-level information needed to construct $M$ or identify individual features across models.
- **It is not automatically functorial under editing.** Recomputing the chosen forest after an edit can replace bridge edges. The tool computes a separate three-position diagram for each input state; it does not compute persistence over the history of edits.
- **It uses combinatorial identity.** Shared vertex IDs and the connections supplied in $C$ determine the result. Screen distance and visual overlap do not establish correspondence.

For exact union and intersection, Mayer–Vietoris and the diamond principle relate the corresponding zigzag interval decompositions. Those results are not a general rule to keep whichever interval is longer in two unrelated barcodes. The forest construction here is an explicit additional modeling choice with the guarantees proved above.

## 7. Using and evaluating the implementation

Open [zigzag-bridge-lab.html](zigzag-bridge-lab.html). The default view displays $M$. The **Middle complex** selector switches among $M,C,U,I$ and updates the diagram, arrows, simplex list, and full barcodes together. Amber dashed edges in $M$ are the selected forest edges.

Edit $A$ and $B$ directly. Select the ambient view to edit $C$, or target $C$ in the simplex form. Adding to an endpoint also adds the simplex and its faces to $C$. Removing from $C$ removes the simplex and its cofaces from affected endpoints to preserve inclusion. The derived middle complexes are read-only, although their vertices can be dragged to change the shared layout.

Exports store the input $A,C,B$ and vertex positions, with format `zigzag-bridge-lab/v1` and field `F2`. Imports also accept the existing union-oriented lab's `zigzag-lab/v1` exports. Derived complexes are recomputed rather than loaded as independent editable inputs. Intersection-lab exports have a different meaning and are rejected. Reloading or importing does not preserve the selected comparison view; imports start with $M$.

The interface supports up to 12 vertices and simplices of dimension at most 3. It displays $H_0,H_1,H_2$ only. Themes are saved when browser storage is available; input complexes must be exported explicitly to preserve them across reloads.

Run the dedicated tests from the repository root:

```bash
node --test tests/zigzag-bridge.test.js
```

The suite checks the motivating example, all comparison views, input invariants, JSON round-trips, and failure cases. It also checks 150 random inputs against independent graph connectivity and binary boundary-matrix ranks, verifies that selected edges always join different current components, and compares the complete bridge barcode with the ambient barcode in degree zero and the union barcode in positive degrees. Script rendering is exercised with a minimal DOM; these are not browser layout tests.

## References

- Gunnar Carlsson and Vin de Silva, [*Zigzag Persistence*](https://arxiv.org/abs/0812.0197): interval decomposition for zigzag modules.
- Gunnar Carlsson, Vin de Silva, and Dmitriy Morozov, [*Zigzag Persistent Homology and Real-valued Functions*](https://mrzv.org/publications/zigzags/socg09/): Mayer–Vietoris diamonds and relations between union and intersection zigzags.

The specific forest-based bridge rule in this tool is defined in Section 2; it is not presented as a construction from these references.
