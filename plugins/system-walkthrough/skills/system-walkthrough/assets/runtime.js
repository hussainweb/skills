/* Walkthrough runtime: scroll-driven reveal, highlight, camera and flow
   animation over inline SVG scenes rendered by D2. No dependencies. */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = document.querySelector('.wt-stage');
  const caption = document.querySelector('.wt-caption');
  const progress = document.querySelector('.wt-progress');
  const navItems = [...document.querySelectorAll('.wt-nav li')];

  // ---- scenes -------------------------------------------------------------
  const scenes = {};
  stage.querySelectorAll('svg[data-scene]').forEach((svg) => {
    const nodes = new Map(), edges = new Map();
    svg.querySelectorAll('[data-id]').forEach((g) => {
      (g.dataset.kind === 'edge' ? edges : nodes).set(g.dataset.id, g);
    });
    const all = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    scenes[svg.dataset.scene] = { svg, nodes, edges, all, cur: all.slice(), raf: 0 };
  });

  function matcher(pat) {
    if (pat === '*') return () => true;
    if (pat.includes('->')) {
      const [a, b] = pat.split('->').map((s) => s.trim());
      const ma = matcher(a), mb = matcher(b);
      return (id, g) => g && g.dataset.kind === 'edge' && ma(g.dataset.from) && mb(g.dataset.to);
    }
    if (pat.endsWith('.*')) { const base = pat.slice(0, -2); return (id) => id === base || id.startsWith(base + '.'); }
    return (id) => id === pat;
  }
  function expand(sc, pats, which) {
    const out = [];
    for (const pat of pats || []) {
      const m = matcher(pat);
      if (which !== 'edges') sc.nodes.forEach((g, id) => { if (!pat.includes('->') && m(id, g)) out.push(id); });
      if (which !== 'nodes') sc.edges.forEach((g, id) => { if (pat.includes('->') ? m(id, g) : false) out.push(id); });
    }
    return out;
  }

  // ---- steps: resolve cumulative visibility ------------------------------
  const steps = [...document.querySelectorAll('.step')].map((el) => ({ el, d: JSON.parse(el.dataset.state) }));
  let prev = null;
  for (const s of steps) {
    const sc = scenes[s.d.scene];
    if (!sc) { console.warn('unknown scene', s.d.scene); s.visible = new Set(); s.hidden = new Set(); continue; }
    const same = prev && prev.d.scene === s.d.scene && !s.d.reset;
    s.visible = s.d.only ? new Set(expand(sc, s.d.only, 'nodes')) : new Set(same ? prev.visible : []);
    s.hidden = new Set(same && !s.d.only ? prev.hidden : []);
    if (s.d.all) sc.nodes.forEach((_, id) => s.visible.add(id));
    expand(sc, s.d.reveal, 'nodes').forEach((id) => { s.visible.add(id); });
    expand(sc, s.d.reveal, 'edges').forEach((id) => s.hidden.delete(id));
    expand(sc, s.d.hide, 'nodes').forEach((id) => s.visible.delete(id));
    expand(sc, s.d.hide, 'edges').forEach((id) => s.hidden.add(id));
    prev = s;
  }

  // ---- apply --------------------------------------------------------------
  function setState(g, visible, dim, hot) {
    g.classList.toggle('is-hidden', !visible);
    g.classList.toggle('is-dim', visible && dim);
    g.classList.toggle('is-hot', visible && hot);
  }
  function bboxOf(sc, ids) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
    for (const id of ids) {
      const g = sc.nodes.get(id) || sc.edges.get(id); if (!g) continue;
      const b = g.getBBox(); if (!b.width && !b.height) continue;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); n++;
    }
    if (!n) return sc.all;
    const w = x1 - x0, h = y1 - y0, pad = Math.max(40, Math.max(w, h) * 0.1);
    return [x0 - pad, y0 - pad, w + 2 * pad, h + 2 * pad];
  }
  function fitAspect(sc, vb) {
    // Keep the viewBox aspect equal to the stage so getBBox-based framing fills the card.
    const r = stage.getBoundingClientRect(); if (!r.width || !r.height) return vb;
    const ar = r.width / r.height; let [x, y, w, h] = vb;
    if (w / h < ar) { const nw = h * ar; x -= (nw - w) / 2; w = nw; } else { const nh = w / ar; y -= (nh - h) / 2; h = nh; }
    return [x, y, w, h];
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function camera(sc, target, instant) {
    target = fitAspect(sc, target);
    cancelAnimationFrame(sc.raf);
    const set = (vb) => { sc.cur = vb; sc.svg.setAttribute('viewBox', vb.map((v) => v.toFixed(2)).join(' ')); };
    if (instant || reduce) { set(target); return; }
    const from = sc.cur.slice(), t0 = performance.now(), dur = 700;
    const frame = (now) => {
      const k = ease(Math.min(1, (now - t0) / dur));
      set(from.map((v, i) => v + (target[i] - v) * k));
      if (k < 1) sc.raf = requestAnimationFrame(frame);
    };
    sc.raf = requestAnimationFrame(frame);
  }

  let flowRaf = 0, dot = null, flowing = [];
  function stopFlow() {
    cancelAnimationFrame(flowRaf); flowRaf = 0;
    flowing.forEach((g) => g.classList.remove('is-flowing')); flowing = [];
    if (dot) { dot.remove(); dot = null; }
  }
  function startFlow(sc, pats) {
    const groups = [];
    for (const p of pats) expand(sc, [p], 'edges').forEach((id) => groups.push(sc.edges.get(id)));
    if (!groups.length) return;
    flowing = groups; groups.forEach((g) => g.classList.add('is-flowing'));
    if (reduce) return;
    dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('class', 'wt-dot'); sc.svg.appendChild(dot);
    let i = 0, start = 0; const dur = 1000, gap = 150, loopGap = 700;
    const frame = (now) => {
      if (!start) start = now;
      const path = groups[i].querySelector('path.connection');
      if (path) {
        const L = path.getTotalLength(), k = Math.max(0, Math.min(1, (now - start) / dur));
        const p = path.getPointAtLength(k * L);
        dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); dot.setAttribute('r', Math.max(5, sc.cur[2] / 150));
        if (k >= 1) { i = (i + 1) % groups.length; start = now + (i === 0 ? loopGap : gap); }
      } else { i = (i + 1) % groups.length; }
      flowRaf = requestAnimationFrame(frame);
    };
    flowRaf = requestAnimationFrame(frame);
  }

  let active = null, manual = false, overview = false;
  function apply(step, instant) {
    const d = step.d, sc = scenes[d.scene]; if (!sc) return;
    const switching = !active || active.d.scene !== d.scene;
    sc.svg.querySelectorAll('[data-id].is-ghost').forEach((g) => g.classList.remove('is-ghost'));
    Object.entries(scenes).forEach(([n, s]) => s.svg.classList.toggle('is-active', n === d.scene));
    const hot = new Set([...expand(sc, d.highlight, 'nodes'), ...expand(sc, d.highlight, 'edges')]);
    // Edges carrying a flow are part of the story; never dim them.
    if (hot.size) expand(sc, d.flow, 'edges').forEach((id) => hot.add(id));
    sc.nodes.forEach((g, id) => setState(g, step.visible.has(id), hot.size > 0 && !hot.has(id), hot.has(id)));
    sc.edges.forEach((g, id) => {
      const v = step.visible.has(g.dataset.from) && step.visible.has(g.dataset.to) && !step.hidden.has(id);
      setState(g, v, hot.size > 0 && !hot.has(id), hot.has(id));
    });
    let target;
    if (d.camera === 'all') target = sc.all;
    else if (Array.isArray(d.camera) && d.camera.length) target = bboxOf(sc, [...expand(sc, d.camera, 'nodes'), ...expand(sc, d.camera, 'edges')]);
    else target = bboxOf(sc, [...step.visible]);
    step.target = target;
    if (overview) showOverview(sc, instant || switching);
    else if (!manual) camera(sc, target, instant || switching);
    stopFlow(); if (d.flow && d.flow.length) startFlow(sc, d.flow);
    caption.textContent = d.caption || '';
  }

  // ---- overview: everything on the scene, faintly, framed whole --------
  function showOverview(sc, instant) {
    sc.nodes.forEach((g) => { if (g.classList.contains('is-hidden')) { g.classList.remove('is-hidden'); g.classList.add('is-ghost'); } });
    sc.edges.forEach((g) => { if (g.classList.contains('is-hidden')) { g.classList.remove('is-hidden'); g.classList.add('is-ghost'); } });
    camera(sc, sc.all, instant);
  }
  function setOverview(on) {
    overview = on; manual = false;
    stage.classList.toggle('is-overview', on);
    btnOverview.classList.toggle('is-on', on);
    if (active) apply(active, false);
  }

  // ---- pan and zoom ------------------------------------------------------
  const btnOverview = document.querySelector('.wt-controls [data-act="overview"]');
  function zoomBy(sc, factor, cx, cy) {
    // cx, cy in viewBox units; default = centre
    const [x, y, w, h] = sc.cur;
    if (cx == null) { cx = x + w / 2; cy = y + h / 2; }
    const nw = Math.max(80, Math.min(sc.all[2] * 4, w / factor)), nh = h * (nw / w);
    manual = true;
    camera(sc, [cx - (cx - x) * (nw / w), cy - (cy - y) * (nh / h), nw, nh], true);
  }
  function toViewBox(sc, clientX, clientY) {
    const r = stage.getBoundingClientRect(), [x, y, w, h] = sc.cur;
    return [x + (clientX - r.left) / r.width * w, y + (clientY - r.top) / r.height * h];
  }
  function currentScene() { return active ? scenes[active.d.scene] : null; }
  document.querySelector('.wt-controls').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const sc = currentScene(); if (!sc) return;
    const act = b.dataset.act;
    if (act === 'in') zoomBy(sc, 1.3);
    else if (act === 'out') zoomBy(sc, 1 / 1.3);
    else if (act === 'fit') { manual = false; if (overview) setOverview(false); else camera(sc, active.target, false); }
    else if (act === 'overview') setOverview(!overview);
  });
  stage.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return; // plain wheel keeps scrolling the story
    const sc = currentScene(); if (!sc) return;
    e.preventDefault();
    const [cx, cy] = toViewBox(sc, e.clientX, e.clientY);
    zoomBy(sc, Math.exp(-e.deltaY * 0.0025), cx, cy);
  }, { passive: false });
  stage.addEventListener('dblclick', () => { const sc = currentScene(); if (sc) { manual = false; camera(sc, overview ? sc.all : active.target, false); } });
  const pointers = new Map(); let pinchDist = 0, moved = false;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.wt-controls')) return;
    e.preventDefault();
    pointers.set(e.pointerId, [e.clientX, e.clientY]); stage.setPointerCapture(e.pointerId); moved = false;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a[0] - b[0], a[1] - b[1]); }
    stage.classList.add('is-panning');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return; const sc = currentScene(); if (!sc) return;
    const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const r = stage.getBoundingClientRect(), [x, y, w, h] = sc.cur, k = w / r.width;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinchDist) { const [cx, cy] = toViewBox(sc, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); zoomBy(sc, d / pinchDist, cx, cy); }
      pinchDist = d; return;
    }
    const dx = (e.clientX - prev[0]) * k, dy = (e.clientY - prev[1]) * k;
    if (Math.abs(dx) + Math.abs(dy) > 0) { moved = true; manual = true; camera(sc, [x - dx, y - dy, w, h], true); }
  });
  const endPointer = (e) => { pointers.delete(e.pointerId); if (!pointers.size) { stage.classList.remove('is-panning'); pinchDist = 0; } };
  stage.addEventListener('pointerup', endPointer); stage.addEventListener('pointercancel', endPointer);

  function activate(step, instant) {
    if (active === step) return;
    if (active) active.el.classList.remove('is-active');
    active = step; step.el.classList.add('is-active');
    manual = false;
    if (overview) { overview = false; stage.classList.remove('is-overview'); btnOverview.classList.remove('is-on'); }
    apply(step, instant);
    const i = steps.indexOf(step);
    progress.style.width = ((i + 1) / steps.length * 100).toFixed(1) + '%';
    const ch = step.el.dataset.chapter;
    navItems.forEach((li) => li.classList.toggle('is-current', li.dataset.chapter === ch));
    history.replaceState(null, '', '#' + step.el.id);
  }

  // ---- scroll + keys ------------------------------------------------------
  const byEl = new Map(steps.map((s) => [s.el, s]));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) activate(byEl.get(e.target), false);
  }, { rootMargin: '-42% 0px -50% 0px', threshold: 0 });
  steps.forEach((s) => io.observe(s.el));

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    const i = steps.indexOf(active);
    let next = null;
    const sc = currentScene();
    if (e.key === 'o' && sc) { setOverview(!overview); return; }
    if ((e.key === '+' || e.key === '=') && sc) { zoomBy(sc, 1.3); return; }
    if (e.key === '-' && sc) { zoomBy(sc, 1 / 1.3); return; }
    if (e.key === '0' && sc) { manual = false; camera(sc, overview ? sc.all : active.target, false); return; }
    if (e.key === 'ArrowDown' || e.key === 'j') next = steps[Math.min(steps.length - 1, i + 1)];
    if (e.key === 'ArrowUp' || e.key === 'k') next = steps[Math.max(0, i - 1)];
    if (next) { e.preventDefault(); next.el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }
  });
  addEventListener('resize', () => { if (active && !manual) apply(active, true); });

  // initial state: the step named in the hash, else the first one
  const fromHash = steps.find((s) => '#' + s.el.id === location.hash);
  if (fromHash) {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    activate(fromHash, true); fromHash.el.scrollIntoView({ block: 'center' });
  }
  else if (steps.length) activate(steps[0], true);
})();
