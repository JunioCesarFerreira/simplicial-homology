// Interactive editor: draws the complex on an SVG canvas, edits it, and shows
// its homology computed by homology.js.
(function () {
  'use strict';

  const H = window.Homology;
  const NS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'simplicial-homology/v1';
  const MAX_SIMPLEX_SIZE = 12; // a simplex on n vertices has 2^n − 1 faces
  const MAX_MATRIX_CELLS = 1600; // larger boundary matrices are summarized only
  const MAX_CHAIN_TERMS = 14;
  const HISTORY_LIMIT = 200;

  const $ = (id) => document.getElementById(id);
  const svg = $('canvas');

  const state = {
    complex: new H.SimplicialComplex(),
    positions: new Map(), // vertex -> { x, y } in world coordinates
    selection: new Set(),
    view: { x: 0, y: 0, scale: 1 }, // screen = world · scale + (x, y)
    prime: 2,
    reduced: false,
    hover: null, // simplex keys highlighted while hovering a generator
    pinned: null, // { id, keys } of the generator clicked last
  };
  const history = { undo: [], redo: [] };
  let results = null;
  let drag = null;

  // ------------------------------------------------------------- utilities

  const keyOf = (vs) => H.key(H.normalize(vs));
  const sel = () => [...state.selection].sort((a, b) => a - b);

  function el(tag, attrs = {}, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function html(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function localPoint(e) {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  const toScreen = (p) => ({
    x: p.x * state.view.scale + state.view.x,
    y: p.y * state.view.scale + state.view.y,
  });
  const toWorld = (p) => ({
    x: (p.x - state.view.x) / state.view.scale,
    y: (p.y - state.view.y) / state.view.scale,
  });

  let toastTimer = null;
  function toast(message) {
    let node = document.querySelector('.toast');
    if (!node) {
      node = html('div', { class: 'toast', role: 'status' });
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('visible'), 2600);
  }

  // Convex hull (Andrew's monotone chain) of screen points.
  function hull(points) {
    const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const half = (list) => {
      const out = [];
      for (const p of list) {
        while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
        out.push(p);
      }
      out.pop();
      return out;
    };
    return half(pts).concat(half(pts.slice().reverse()));
  }

  // --------------------------------------------------- state and history

  function snapshot() {
    return {
      vertices: [...state.positions].map(([v, p]) => ({ id: v, x: round(p.x), y: round(p.y) })),
      facets: state.complex.facets(),
    };
  }

  const round = (x) => Math.round(x * 100) / 100;

  function restore(snap) {
    const complex = new H.SimplicialComplex();
    for (const f of snap.facets) complex.add(f);
    const positions = new Map();
    for (const { id, x, y } of snap.vertices) positions.set(Number(id), { x: Number(x), y: Number(y) });
    for (const v of complex.vertices()) if (!positions.has(v)) complex.remove([v]);
    for (const v of [...positions.keys()]) if (!complex.has([v])) complex.add([v]);
    state.complex = complex;
    state.positions = positions;
    for (const v of [...state.selection]) if (!positions.has(v)) state.selection.delete(v);
  }

  function pushHistory() {
    history.undo.push(snapshot());
    if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
    history.redo.length = 0;
  }

  // Runs a change to the complex as one undoable step.
  function commit(mutate) {
    pushHistory();
    mutate();
    for (const v of [...state.positions.keys()]) {
      if (!state.complex.has([v])) state.positions.delete(v);
    }
    for (const v of [...state.selection]) if (!state.positions.has(v)) state.selection.delete(v);
    complexChanged();
  }

  function undo() {
    if (!history.undo.length) return toast('Nothing to undo');
    history.redo.push(snapshot());
    restore(history.undo.pop());
    complexChanged();
  }

  function redo() {
    if (!history.redo.length) return toast('Nothing to redo');
    history.undo.push(snapshot());
    restore(history.redo.pop());
    complexChanged();
  }

  function complexChanged() {
    state.pinned = null;
    state.hover = null;
    recompute();
    save();
    render();
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...snapshot(), prime: state.prime, reduced: state.reduced })
      );
    } catch (_) {
      // storage unavailable (private mode, quota): the editor still works
    }
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data && Array.isArray(data.vertices) && Array.isArray(data.facets)) {
        restore(data);
        if ([2, 3, 5, 7, 11].includes(data.prime)) state.prime = data.prime;
        state.reduced = !!data.reduced;
        return true;
      }
    } catch (_) {
      // ignore unreadable or missing data
    }
    return false;
  }

  function nextVertexId() {
    let max = -1;
    for (const v of state.positions.keys()) if (v > max) max = v;
    return max + 1;
  }

  // ---------------------------------------------------------------- layout

  // Fruchterman–Reingold layout of the 1-skeleton. Vertices in `fixed` keep
  // their positions; the others start from `positions` (or near their
  // positioned neighbours) and are moved.
  function forceLayout(positions, fixed = new Set()) {
    const ids = state.complex.vertices();
    const edges = state.complex.simplices(1);
    const neighbours = new Map(ids.map((v) => [v, []]));
    for (const [a, b] of edges) {
      neighbours.get(a).push(b);
      neighbours.get(b).push(a);
    }
    const pos = new Map();
    const missing = ids.filter((v) => !positions.has(v));
    ids.forEach((v) => {
      if (positions.has(v)) pos.set(v, { ...positions.get(v) });
    });
    const radius = 60 * Math.sqrt(ids.length) + 60;
    missing.forEach((v, i) => {
      const placed = neighbours.get(v).filter((u) => pos.has(u));
      const a = (2 * Math.PI * i) / Math.max(missing.length, 1);
      if (placed.length && pos.size) {
        const cx = placed.reduce((s, u) => s + pos.get(u).x, 0) / placed.length;
        const cy = placed.reduce((s, u) => s + pos.get(u).y, 0) / placed.length;
        pos.set(v, { x: cx + 40 * Math.cos(a), y: cy + 40 * Math.sin(a) });
      } else {
        pos.set(v, { x: radius * Math.cos(a), y: radius * Math.sin(a) });
      }
    });

    if (ids.every((v) => fixed.has(v))) return pos;

    const k = 110;
    const n = ids.length;
    let temperature = 80;
    const iterations = n > 300 ? 120 : 400;
    for (let it = 0; it < iterations; it++) {
      const disp = new Map(ids.map((v) => [v, { x: 0, y: 0 }]));
      for (let i = 0; i < n; i++) {
        const p = pos.get(ids[i]);
        for (let j = i + 1; j < n; j++) {
          const q = pos.get(ids[j]);
          let dx = p.x - q.x;
          let dy = p.y - q.y;
          let d = Math.hypot(dx, dy);
          if (d < 0.01) {
            dx = Math.cos(i + j);
            dy = Math.sin(i + j);
            d = 1;
          }
          const f = (k * k) / d / d;
          disp.get(ids[i]).x += dx * f;
          disp.get(ids[i]).y += dy * f;
          disp.get(ids[j]).x -= dx * f;
          disp.get(ids[j]).y -= dy * f;
        }
      }
      for (const [a, b] of edges) {
        const p = pos.get(a);
        const q = pos.get(b);
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const f = Math.hypot(dx, dy) / k;
        disp.get(a).x -= dx * f;
        disp.get(a).y -= dy * f;
        disp.get(b).x += dx * f;
        disp.get(b).y += dy * f;
      }
      for (const v of ids) {
        if (fixed.has(v)) continue;
        const p = pos.get(v);
        const dv = disp.get(v);
        dv.x -= p.x * 0.01; // gravity keeps components together
        dv.y -= p.y * 0.01;
        const len = Math.hypot(dv.x, dv.y);
        if (len > 0) {
          const step = Math.min(len, temperature);
          p.x += (dv.x / len) * step;
          p.y += (dv.y / len) * step;
        }
      }
      temperature = Math.max(temperature * 0.985, 1);
    }
    return pos;
  }

  function autoLayout() {
    if (!state.positions.size) return;
    pushHistory();
    state.positions = forceLayout(new Map());
    save();
    fitView();
  }

  function fitView() {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const pts = [...state.positions.values()];
    if (!pts.length) {
      state.view = { x: r.width / 2, y: r.height / 2, scale: 1 };
      return render();
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 48;
    const scale = Math.min(
      (r.width - 2 * pad) / Math.max(x1 - x0, 1),
      (r.height - 2 * pad) / Math.max(y1 - y0, 1),
      1.6
    );
    state.view = {
      scale,
      x: r.width / 2 - ((x0 + x1) / 2) * scale,
      y: r.height / 2 - ((y0 + y1) / 2) * scale,
    };
    render();
  }

  // ------------------------------------------------------------- editing

  function addVertexAt(world) {
    commit(() => {
      const v = nextVertexId();
      state.complex.add([v]);
      state.positions.set(v, { x: world.x, y: world.y });
    });
  }

  function fillSelection() {
    const vs = sel();
    if (vs.length < 2) return toast('Select at least two vertices to fill a simplex');
    if (vs.length > MAX_SIMPLEX_SIZE) {
      return toast(`At most ${MAX_SIMPLEX_SIZE} vertices per simplex`);
    }
    if (state.complex.has(vs)) return toast(`[${vs.join(',')}] is already in the complex`);
    commit(() => state.complex.add(vs));
  }

  function removeSelection() {
    const vs = sel();
    if (!vs.length) return toast('Select the vertices of the simplex to remove');
    if (!state.complex.has(vs)) {
      return toast(`[${vs.join(',')}] is not a simplex of the complex`);
    }
    commit(() => state.complex.remove(vs));
  }

  function deleteSelectedVertices() {
    const vs = sel();
    if (!vs.length) return toast('No vertices selected');
    commit(() => {
      for (const v of vs) state.complex.remove([v]);
    });
  }

  // Joins a new vertex w to every simplex spanned by selected vertices.
  function coneSelection() {
    const vs = sel();
    if (!vs.length) return toast('Select the vertices to cone off');
    const inside = state.complex.all().filter((s) => s.every((v) => state.selection.has(v)));
    if (inside.some((s) => s.length >= MAX_SIMPLEX_SIZE)) {
      return toast(`At most ${MAX_SIMPLEX_SIZE} vertices per simplex`);
    }
    commit(() => {
      const w = nextVertexId();
      let x = 0;
      let y = 0;
      for (const v of vs) {
        x += state.positions.get(v).x / vs.length;
        y += state.positions.get(v).y / vs.length;
      }
      if (vs.length <= 2) y -= 80 / state.view.scale;
      state.positions.set(w, { x, y });
      state.complex.add([w]);
      for (const s of inside) state.complex.add([...s, w]);
      state.selection = new Set([w]);
    });
  }

  function selectAll() {
    state.selection = new Set(state.positions.keys());
    render();
  }

  function clearSelection() {
    state.selection.clear();
    render();
  }

  function loadPreset(id) {
    const preset = window.Presets.byId[id];
    if (!preset) return;
    commit(() => {
      state.complex = new H.SimplicialComplex(preset.facets);
      const given = new Map();
      for (const [v, [x, y]] of Object.entries(preset.positions || {})) given.set(Number(v), { x, y });
      const complete = state.complex.vertices().every((v) => given.has(v));
      state.positions = complete ? given : forceLayout(given, new Set(given.keys()));
      state.selection.clear();
    });
    fitView();
  }

  function parseFacets(text) {
    const facets = [];
    const lines = text.split(/[\n;]+/);
    lines.forEach((line, i) => {
      const cleaned = line.replace(/#.*/, '').replace(/[[\](){}]/g, ' ').trim();
      if (!cleaned) return;
      const tokens = cleaned.split(/[\s,]+/).filter(Boolean);
      for (const t of tokens) {
        if (!/^\d+$/.test(t)) throw new Error(`line ${i + 1}: "${t}" is not a vertex number`);
      }
      const vs = H.normalize(tokens.map(Number));
      if (vs.length > MAX_SIMPLEX_SIZE) {
        throw new Error(`line ${i + 1}: at most ${MAX_SIMPLEX_SIZE} vertices per simplex`);
      }
      facets.push(vs);
    });
    return facets;
  }

  function applyFacets() {
    const error = $('facets-error');
    let facets;
    try {
      facets = parseFacets($('facets').value);
    } catch (err) {
      error.textContent = err.message;
      return;
    }
    error.textContent = '';
    let added = false;
    commit(() => {
      state.complex = new H.SimplicialComplex(facets);
      const kept = new Map();
      for (const v of state.complex.vertices()) {
        if (state.positions.has(v)) kept.set(v, state.positions.get(v));
      }
      added = kept.size < state.complex.vertices().length;
      state.positions = added ? forceLayout(kept, new Set(kept.keys())) : kept;
    });
    if (added) fitView();
  }

  function exportJSON() {
    const data = { format: 'simplicial-homology', version: 1, ...snapshot() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = html('a', { href: URL.createObjectURL(blob), download: 'complex.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importJSON(file) {
    file.text().then((text) => {
      let data;
      try {
        data = JSON.parse(text);
        if (!Array.isArray(data.facets)) throw new Error('missing "facets"');
        data.facets.forEach((f) => {
          if (!Array.isArray(f) || f.length > MAX_SIMPLEX_SIZE) throw new Error('invalid facet');
          H.normalize(f);
        });
      } catch (err) {
        return toast(`Could not import: ${err.message}`);
      }
      commit(() => {
        state.complex = new H.SimplicialComplex(data.facets);
        const given = new Map();
        for (const p of data.vertices || []) {
          if (Number.isFinite(p.x) && Number.isFinite(p.y)) given.set(Number(p.id), { x: p.x, y: p.y });
        }
        for (const v of given.keys()) if (!state.complex.has([v])) state.complex.add([v]);
        state.positions = forceLayout(given, new Set(given.keys()));
        state.selection.clear();
      });
      fitView();
    });
  }

  // ------------------------------------------------------------ rendering

  function highlightKeys() {
    return state.hover || (state.pinned && state.pinned.keys) || null;
  }

  function render() {
    const view = svg.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${view.width} ${view.height}`);
    svg.replaceChildren();
    const layers = {
      high: el('g', { class: 'layer-high' }, svg),
      tri: el('g', { class: 'layer-tri' }, svg),
      edge: el('g', { class: 'layer-edge' }, svg),
      vertex: el('g', { class: 'layer-vertex' }, svg),
      ui: el('g', { class: 'layer-ui' }, svg),
    };
    const hl = highlightKeys();
    const selKey = state.selection.size ? H.key(sel()) : null;
    const screen = new Map();
    for (const [v, p] of state.positions) screen.set(v, toScreen(p));
    const cls = (base, k) =>
      base + (hl && hl.has(k) ? ' is-highlight' : '') + (k === selKey ? ' is-selected' : '');

    const dim = state.complex.dimension;
    for (let d = dim; d >= 3; d--) {
      for (const s of state.complex.simplices(d)) {
        const k = H.key(s);
        const pts = hull(s.map((v) => screen.get(v)));
        el('polygon', {
          class: cls(`simplex high dim-${Math.min(d, 5)}`, k),
          points: pts.map((p) => `${p.x},${p.y}`).join(' '),
          'data-kind': 'simplex',
          'data-key': k,
        }, layers.high);
      }
    }
    for (const s of state.complex.simplices(2)) {
      const k = H.key(s);
      el('polygon', {
        class: cls('simplex tri', k),
        points: s.map((v) => `${screen.get(v).x},${screen.get(v).y}`).join(' '),
        'data-kind': 'simplex',
        'data-key': k,
      }, layers.tri);
    }
    for (const s of state.complex.simplices(1)) {
      const k = H.key(s);
      const [a, b] = s.map((v) => screen.get(v));
      const g = el('g', { class: cls('simplex edge', k), 'data-kind': 'simplex', 'data-key': k }, layers.edge);
      el('line', { class: 'edge-hit', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, g);
      el('line', { class: 'edge-line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, g);
    }
    for (const [v, p] of screen) {
      const k = String(v);
      const g = el('g', {
        class: 'vertex' + (state.selection.has(v) ? ' is-selected' : '') + (hl && hl.has(k) ? ' is-highlight' : ''),
        'data-kind': 'vertex',
        'data-v': v,
        transform: `translate(${p.x},${p.y})`,
      }, layers.vertex);
      el('circle', { r: 12 }, g);
      el('text', { 'text-anchor': 'middle', dy: '0.35em' }, g).textContent = v;
    }

    if (drag && drag.type === 'edge' && drag.current) {
      const a = screen.get(drag.v);
      const b = drag.target !== null ? screen.get(drag.target) : drag.current;
      el('line', { class: 'rubber', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, layers.ui);
    }
    if (drag && drag.type === 'box' && drag.moved) {
      const [x0, x1] = [Math.min(drag.start.x, drag.current.x), Math.max(drag.start.x, drag.current.x)];
      const [y0, y1] = [Math.min(drag.start.y, drag.current.y), Math.max(drag.start.y, drag.current.y)];
      el('rect', { class: 'box', x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, layers.ui);
    }

    $('empty-hint').hidden = state.positions.size > 0;
    renderSelectionInfo();
    $('undo').disabled = !history.undo.length;
    $('redo').disabled = !history.redo.length;
  }

  function renderSelectionInfo() {
    const info = $('selection-info');
    const vs = sel();
    info.replaceChildren();
    if (!vs.length) {
      info.textContent = 'No vertices selected';
    } else {
      const d = vs.length - 1;
      info.append('Selected ', html('code', {}, `[${vs.join(',')}]`), ' — ');
      if (state.complex.has(vs)) {
        info.append(`a ${d}-simplex of the complex`);
      } else if (vs.length > MAX_SIMPLEX_SIZE) {
        info.append('too many vertices for one simplex');
      } else {
        info.append(`press Enter to fill this ${d}-simplex`);
      }
    }
    const has = state.complex.has(vs);
    $('fill').disabled = vs.length < 2 || has;
    $('remove').disabled = !vs.length || !has;
    $('delete-vertices').disabled = !vs.length;
    $('cone').disabled = !vs.length;
  }

  // ------------------------------------------------------------ results

  function recompute() {
    if (state.complex.size === 0) {
      results = null;
    } else {
      results = {
        z: H.computeHomology(state.complex),
        f: H.fieldHomology(state.complex, state.prime),
      };
    }
    renderResults();
    if (document.activeElement !== $('facets')) {
      $('facets').value = state.complex.facets().map((s) => s.join(' ')).join('\n');
      $('facets-error').textContent = '';
    }
  }

  const num = (n) => (n < 0 ? `−${-n}` : String(n));

  // Typesets a small math notation as HTML: x_k and x^{k+1} become sub- and
  // superscripts, ~H puts a tilde over H, and single letters are set in italic.
  function math(src, cls = 'math') {
    const node = html('span', { class: cls });
    const parse = (str, parent) => {
      let i = 0;
      const group = () => {
        if (str[i] !== '{') return [...str.slice(i)][0] || '';
        const end = str.indexOf('}', i);
        return str.slice(i + 1, end);
      };
      while (i < str.length) {
        const c = String.fromCodePoint(str.codePointAt(i));
        if (c === '_' || c === '^') {
          i++;
          const g = group();
          parse(g, parent.appendChild(document.createElement(c === '_' ? 'sub' : 'sup')));
          i += str[i] === '{' ? g.length + 2 : g.length;
        } else if (c === '~') {
          i++;
          const g = [...str.slice(i)][0];
          parse(g, parent.appendChild(html('span', { class: 'tilde' })));
          i += g.length;
        } else {
          const m = /^[A-Za-zα-ω]+/.exec(str.slice(i));
          if (m && m[0].length === 1) parent.appendChild(html('i', {}, m[0]));
          else parent.append(m ? m[0] : c);
          i += m ? m[0].length : c.length;
        }
      }
    };
    parse(src, node);
    return node;
  }

  // ℤ^{2} ⊕ (ℤ/2)^{2}, the notation of H.formatGroup for math().
  function groupNotation(group) {
    const parts = [];
    if (group.rank > 0) parts.push(group.rank === 1 ? 'ℤ' : `ℤ^{${group.rank}}`);
    const counts = new Map();
    for (const d of group.torsion) counts.set(String(d), (counts.get(String(d)) || 0) + 1);
    for (const [d, c] of counts) parts.push(c === 1 ? `ℤ/${d}` : `(ℤ/${d})^{${c}}`);
    return parts.length ? parts.join(' ⊕ ') : '0';
  }

  function renderResults() {
    const summary = $('summary');
    const table = $('homology-table');
    summary.replaceChildren();
    table.replaceChildren();
    if (!results) {
      summary.append(html('p', { class: 'muted' }, 'The complex is empty.'));
      renderGenerators();
      renderMatrices();
      return;
    }
    const { z, f } = results;
    const reduced = state.reduced;
    const betti = z.groups.map((g) => g.rank);
    const chiBetti = betti.reduce((s, b, k) => s + (k % 2 ? -b : b), 0);
    const components = betti[0];
    const items = [
      [math('dim K'), String(z.dimension)],
      [math('f-vector'), `(${z.fVector.join(', ')})`],
      [math('χ'), num(z.euler)],
      ['components', String(components)],
    ];
    const dl = html('dl', { class: 'stats' });
    for (const [k, v] of items) {
      const div = html('div');
      const dt = html('dt');
      dt.append(k);
      div.append(dt, html('dd', {}, v));
      dl.append(div);
    }
    summary.append(dl);
    // χ = Σ (−1)^k n_k = Σ (−1)^k β_k, with the summation index under Σ.
    const sum = (term) => {
      const op = html('span', { class: 'bigop' });
      op.append(html('span', {}, 'Σ'), math('k', 'math limit'));
      const node = html('span', { class: 'math' });
      node.append(op, math(term));
      return node;
    };
    const holds = z.euler === chiBetti;
    const check = html('p', { class: 'euler', title: 'Euler–Poincaré formula: the alternating sums of the simplex counts and of the Betti numbers agree' });
    const eq = '\u2005=\u2005'; // relation spacing, as in TeX
    check.append(math(`χ${eq}`), sum('(−1)^k\u2009n_k'));
    if (!holds) check.append(math(`${eq}${num(z.euler)}`));
    check.append(math(holds ? eq : ',\u2003'), sum('(−1)^k\u2009β_k'), math(`${eq}${num(chiBetti)}`));
    check.append(html('span', { class: holds ? 'verdict ok' : 'verdict fail' }, holds ? '✓' : '✗'));
    summary.append(check);

    const Hk = reduced ? '~H' : 'H';
    const head = html('tr');
    const cols = [
      ['k', 'Dimension'],
      ['n_k', 'Number of k-simplices = rank Cₖ'],
      ['rank ∂_k', 'Rank of the boundary map ∂ₖ : Cₖ → Cₖ₋₁ over ℤ'],
      ['rank Z_k', 'Cycles: rank ker ∂ₖ = nₖ − rank ∂ₖ'],
      ['rank B_k', 'Boundaries: rank im ∂ₖ₊₁'],
      [`${Hk}_k(ℤ)`, 'Integral homology: ℤ^βₖ ⊕ torsion from the invariant factors of ∂ₖ₊₁'],
      ['β_k', 'Betti number = rank of the free part'],
      [`dim ${Hk}_k(𝔽_{${state.prime}})`, 'Dimension of the homology with coefficients in the prime field (computed independently)'],
    ];
    for (const [label, title] of cols) {
      const th = html('th', { title });
      th.append(math(label));
      head.append(th);
    }
    const thead = html('thead');
    thead.append(head);
    const tbody = html('tbody');
    for (const g of z.groups) {
      const shift = reduced && g.dim === 0 ? 1 : 0;
      const group = { rank: g.rank - shift, torsion: g.torsion };
      const rankD = g.dim === 0 ? (reduced ? 1 : 0) : z.boundaries[g.dim].rank;
      const tr = html('tr');
      tr.append(
        html('td', {}, String(g.dim)),
        html('td', {}, String(z.fVector[g.dim])),
        html('td', {}, String(rankD)),
        html('td', {}, String(g.cycles - shift)),
        html('td', {}, String(g.boundaries)),
        html('td', { class: 'group' + (group.rank === 0 && !group.torsion.length ? ' trivial' : '') }),
        html('td', {}, String(group.rank)),
        html('td', {}, String(f.betti[g.dim] - shift))
      );
      tr.children[5].append(math(groupNotation(group)));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    renderGenerators();
    renderMatrices();
  }

  function renderGenerators() {
    const box = $('generators');
    box.replaceChildren();
    if (!results) return;
    const { f } = results;
    f.generators.forEach((gens, k) => {
      const section = html('div', { class: 'gen-group' });
      const title = html('h3');
      title.append(math(`H_${k}(K; 𝔽_{${f.p}})`), ' ', html('span', { class: 'muted' }, `dimension ${gens.length}`));
      section.append(title);
      if (!gens.length) {
        section.append(html('p', { class: 'muted small' }, 'trivial'));
      } else {
        if (k === 0) section.append(html('p', { class: 'muted small' }, 'One vertex per connected component.'));
        const ul = html('ul', { class: 'gen-list' });
        gens.forEach((chain, i) => {
          const id = `${f.p}:${k}:${i}`;
          const keys = new Set(chain.map((t) => H.key(t.simplex)));
          for (const t of chain) for (const v of t.simplex) keys.add(String(v));
          const shown = chain.length > MAX_CHAIN_TERMS ? chain.slice(0, MAX_CHAIN_TERMS) : chain;
          let text = H.formatChain(shown);
          if (shown.length < chain.length) text += ` + … (${chain.length} terms)`;
          const li = html('li', { tabindex: 0, class: state.pinned && state.pinned.id === id ? 'pinned' : '' });
          li.append(math(`z_{${i + 1}}`, 'math gen-name'), math(text.replace(/,/g, ',\u2009'), 'math chain'));
          li.addEventListener('mouseenter', () => {
            state.hover = keys;
            render();
          });
          li.addEventListener('mouseleave', () => {
            state.hover = null;
            render();
          });
          const toggle = () => {
            state.pinned = state.pinned && state.pinned.id === id ? null : { id, keys };
            for (const node of box.querySelectorAll('li')) node.classList.remove('pinned');
            if (state.pinned) li.classList.add('pinned');
            render();
          };
          li.addEventListener('click', toggle);
          li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle();
            }
          });
          ul.append(li);
        });
        section.append(ul);
      }
      box.append(section);
    });
  }

  function renderMatrices() {
    const box = $('matrices');
    box.replaceChildren();
    if (!$('matrices-details').open) return;
    if (!results || results.z.dimension < 1) {
      box.append(html('p', { class: 'muted small' }, 'No boundary maps: the complex has no edges.'));
      return;
    }
    const { z } = results;
    const intro = html('p', { class: 'muted small' });
    intro.append(
      'Rows are ', math('(k − 1)'), '-simplices, columns are ', math('k'), '-simplices; column ', math('j'),
      ' holds ', math('∂σ_j'), '. The invariant factors are the diagonal of the Smith normal form; those greater than 1 give the torsion of ',
      math('H_{k−1}'), '.'
    );
    box.append(intro);
    for (let k = 1; k <= z.dimension; k++) {
      const b = z.boundaries[k];
      const section = html('div', { class: 'matrix-block' });
      const title = html('h3');
      title.append(math(`∂_${k} : C_${k} → C_${k - 1}`), ' ', html('span', { class: 'muted' }, `${b.rows} × ${b.cols}, rank ${b.rank}`));
      section.append(title);
      const counts = new Map();
      for (const d of b.invariants) counts.set(String(d), (counts.get(String(d)) || 0) + 1);
      const factors = [...counts].map(([d, c]) => (c > 1 ? `${d} (×${c})` : d)).join(', ') || 'none';
      section.append(html('p', { class: 'small' }, `Invariant factors: ${factors}`));
      if (b.rows * b.cols <= MAX_MATRIX_CELLS) {
        const m = H.boundaryMatrix(state.complex, k);
        const rows = state.complex.simplices(k - 1);
        const cols = state.complex.simplices(k);
        const sep = state.complex.vertices().some((v) => v > 9) ? ',' : '';
        const wrap = html('div', { class: 'table-scroll' });
        const t = html('table', { class: 'matrix' });
        const hr = html('tr');
        hr.append(html('th'));
        for (const c of cols) hr.append(html('th', { class: 'col-label' }, c.join(sep)));
        t.append(hr);
        m.forEach((row, i) => {
          const tr = html('tr');
          tr.append(html('th', {}, rows[i].join(sep)));
          for (const x of row) {
            tr.append(html('td', { class: x > 0 ? 'pos' : x < 0 ? 'neg' : 'zero' }, x === 0 ? '·' : x > 0 ? String(x) : `−${-x}`));
          }
          t.append(tr);
        });
        wrap.append(t);
        section.append(wrap);
      } else {
        section.append(html('p', { class: 'muted small' }, 'Too large to display.'));
      }
      box.append(section);
    }
  }

  // --------------------------------------------------------- interaction

  function nearestVertex(p, exclude) {
    let best = null;
    let bestD = 18;
    for (const [v, w] of state.positions) {
      if (v === exclude) continue;
      const s = toScreen(w);
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  function moveVertices(vs, dx, dy) {
    for (const v of vs) {
      const p = state.positions.get(v);
      p.x += dx / state.view.scale;
      p.y += dy / state.view.scale;
    }
  }

  svg.addEventListener('contextmenu', (e) => e.preventDefault());

  svg.addEventListener('pointerdown', (e) => {
    if (drag) return;
    const p = localPoint(e);
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      drag = { type: 'pan', start: p, last: p };
    } else if (e.button === 0) {
      const target = e.target.closest('[data-kind]');
      if (target && target.dataset.kind === 'vertex') {
        const v = Number(target.dataset.v);
        drag = { type: e.shiftKey ? 'edge' : 'vertex', v, target: null };
      } else if (target && target.dataset.kind === 'simplex') {
        drag = { type: 'simplex', simplex: target.dataset.key.split(',').map(Number), additive: e.shiftKey };
      } else {
        drag = { type: 'box', additive: e.shiftKey };
      }
      Object.assign(drag, { start: p, last: p, current: p, moved: false });
    } else {
      return;
    }
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = localPoint(e);
    const dx = p.x - drag.last.x;
    const dy = p.y - drag.last.y;
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 4) {
      drag.moved = true;
      if (drag.type === 'vertex' || drag.type === 'simplex') pushHistory();
    }
    drag.current = p;
    if (drag.type === 'pan') {
      state.view.x += dx;
      state.view.y += dy;
    } else if (drag.moved && drag.type === 'vertex') {
      moveVertices(state.selection.has(drag.v) ? state.selection : [drag.v], dx, dy);
    } else if (drag.moved && drag.type === 'simplex') {
      moveVertices(drag.simplex, dx, dy);
    } else if (drag.type === 'edge') {
      drag.target = nearestVertex(p, drag.v);
    }
    drag.last = p;
    render();
  });

  function endDrag(e, cancelled) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    if (cancelled) {
      if (d.moved && (d.type === 'vertex' || d.type === 'simplex')) save();
      return render();
    }
    if (d.type === 'vertex' || (d.type === 'edge' && !d.moved)) {
      if (d.moved) save();
      else if (state.selection.has(d.v)) state.selection.delete(d.v);
      else state.selection.add(d.v);
    } else if (d.type === 'edge') {
      if (d.target !== null && !state.complex.has([d.v, d.target])) {
        const edge = [d.v, d.target];
        return commit(() => state.complex.add(edge));
      }
    } else if (d.type === 'simplex') {
      if (d.moved) {
        save();
      } else {
        const same = H.key(sel()) === H.key(d.simplex);
        if (!d.additive) state.selection.clear();
        if (!same || d.additive) for (const v of d.simplex) state.selection.add(v);
      }
    } else if (d.type === 'box') {
      if (!d.moved) return addVertexAt(toWorld(d.start));
      if (!d.additive) state.selection.clear();
      const [x0, x1] = [Math.min(d.start.x, d.current.x), Math.max(d.start.x, d.current.x)];
      const [y0, y1] = [Math.min(d.start.y, d.current.y), Math.max(d.start.y, d.current.y)];
      for (const [v, w] of state.positions) {
        const s = toScreen(w);
        if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) state.selection.add(v);
      }
    }
    render();
  }

  svg.addEventListener('pointerup', (e) => endDrag(e, false));
  svg.addEventListener('pointercancel', (e) => endDrag(e, true));

  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = localPoint(e);
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      const scale = Math.min(Math.max(state.view.scale * factor, 0.1), 8);
      const w = toWorld(p);
      state.view.scale = scale;
      state.view.x = p.x - w.x * scale;
      state.view.y = p.y - w.y * scale;
      render();
    },
    { passive: false }
  );

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if (mod && k === 'y') {
      e.preventDefault();
      return redo();
    }
    if (mod && k === 'a') {
      e.preventDefault();
      return selectAll();
    }
    if (mod || e.altKey) return;
    if (t.closest && t.closest('button, li[tabindex]') && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.key === 'Enter') fillSelection();
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (e.shiftKey) deleteSelectedVertices();
      else removeSelection();
    } else if (e.key === 'Escape') {
      state.pinned = null;
      renderGenerators();
      clearSelection();
    } else if (k === 'c') coneSelection();
    else if (k === 'f') fitView();
    else if (k === 'l') autoLayout();
  });

  // -------------------------------------------------------------- wiring

  const presetSelect = $('preset');
  for (const p of window.Presets.list) presetSelect.append(html('option', { value: p.id }, p.name));
  presetSelect.addEventListener('change', () => {
    loadPreset(presetSelect.value);
    presetSelect.value = '';
  });

  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('layout').addEventListener('click', autoLayout);
  $('fit').addEventListener('click', fitView);
  $('export').addEventListener('click', exportJSON);
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  });
  $('clear').addEventListener('click', () => {
    if (!state.positions.size) return;
    commit(() => {
      state.complex = new H.SimplicialComplex();
      state.positions = new Map();
      state.selection.clear();
    });
    toast('Cleared — Ctrl+Z to undo');
  });
  $('fill').addEventListener('click', fillSelection);
  $('remove').addEventListener('click', removeSelection);
  $('delete-vertices').addEventListener('click', deleteSelectedVertices);
  $('cone').addEventListener('click', coneSelection);
  $('apply-facets').addEventListener('click', applyFacets);
  $('facets').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) applyFacets();
  });

  const primeSelect = $('prime');
  primeSelect.addEventListener('change', () => {
    state.prime = Number(primeSelect.value);
    state.pinned = null;
    recompute();
    save();
    render();
  });
  const reducedBox = $('reduced');
  reducedBox.addEventListener('change', () => {
    state.reduced = reducedBox.checked;
    renderResults();
    save();
  });
  $('matrices-details').addEventListener('toggle', renderMatrices);

  new ResizeObserver(() => render()).observe(svg);

  // --------------------------------------------------------------- start

  if (!load()) {
    const start = window.Presets.byId.annulus;
    state.complex = new H.SimplicialComplex(start.facets);
    for (const [v, [x, y]] of Object.entries(start.positions)) state.positions.set(Number(v), { x, y });
  }
  primeSelect.value = String(state.prime);
  reducedBox.checked = state.reduced;
  recompute();
  requestAnimationFrame(fitView);
})();
