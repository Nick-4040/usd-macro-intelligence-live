(() => {
  'use strict';
  const root = document.querySelector('[data-chart-app]');
  if (!root) return;
  const NS = 'http://www.w3.org/2000/svg';
  const RANGES = {'1M': 31, '3M': 92, '6M': 183, '1A': 366};
  const MAX_COMPARE = 3;
  const stage = root.querySelector('[data-chart-stage]');
  const legend = root.querySelector('[data-chart-legend]');
  const stats = root.querySelector('[data-chart-stats]');
  const table = root.querySelector('[data-chart-table]');
  const hint = root.querySelector('[data-chart-hint]');
  const title = root.querySelector('[data-chart-title]');
  const sub = root.querySelector('[data-chart-sub]');
  const hintDefault = hint.textContent;
  const day = 86400000;
  let data = {};
  let state = {range: '3M', selected: ['dxy']};
  let model = null;
  let cursor = null;

  try {
    const saved = JSON.parse(localStorage.getItem('usdmacro.chart') || 'null');
    if (saved && RANGES[saved.range] && Array.isArray(saved.selected)) state = {range: saved.range, selected: saved.selected.slice(0, MAX_COMPARE)};
  } catch (error) { /* la memoria del browser è solo una comodità */ }

  const number = (value, decimals) => new Intl.NumberFormat('it-IT', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}).format(value);
  const signed = (value, suffix) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value), 2)}${suffix}`;
  const shortDate = new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'short', timeZone: 'UTC'});
  const monthDate = new Intl.DateTimeFormat('it-IT', {month: 'short', year: '2-digit', timeZone: 'UTC'});
  const longDate = new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'});
  const time = day => Date.parse(day + 'T00:00:00Z');
  const el = (tag, attrs = {}, text) => {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const html = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function niceTicks(low, high, count) {
    const span = (high - low) || Math.abs(high) || 1;
    const rough = span / count;
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const fraction = rough / power;
    const step = (fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10) * power;
    const ticks = [];
    for (let v = Math.floor(low / step) * step; v <= Math.ceil(high / step) * step + step / 2; v += step) ticks.push(+v.toFixed(10));
    return {ticks, step};
  }

  function build() {
    const ids = state.selected.filter(id => data[id]);
    if (!ids.length) return null;
    const compare = ids.length > 1;
    const lastTime = Math.max(...ids.map(id => time(data[id].points.at(-1)[0])));
    const from = lastTime - RANGES[state.range] * day;
    const series = ids.map(id => {
      const record = data[id];
      let points = record.points.filter(point => time(point[0]) >= from).map(point => ({t: time(point[0]), day: point[0], v: point[1]}));
      if (points.length < 2) points = record.points.slice(-2).map(point => ({t: time(point[0]), day: point[0], v: point[1]}));
      const base = points[0].v;
      for (const point of points) point.y = compare ? (point.v / base - 1) * 100 : point.v;
      return {record, points, change: record.kind === 'pp' && !compare ? points.at(-1).v - base : (points.at(-1).v / base - 1) * 100};
    });
    return {ids, compare, series, from, to: lastTime};
  }

  function draw() {
    model = build();
    stage.replaceChildren();
    legend.replaceChildren();
    stats.replaceChildren();
    table.replaceChildren();
    if (!model) { stage.append(html('p', 'muted', 'Lo storico è in raccolta: i grafici compariranno dopo il primo aggiornamento.')); return; }
    const width = Math.max(280, Math.floor(stage.clientWidth));
    if (stage.clientWidth === 0) return;     // vista nascosta: si ridisegna quando compare
    const height = width < 520 ? 270 : 350;
    const longest = Math.max(...model.series.map(s => s.record.short.length));
    const m = {l: 54, r: model.compare ? Math.min(150, 22 + longest * 7.4) : 22, t: 18, b: 30};
    const w = width - m.l - m.r, h = height - m.t - m.b;
    const ys = model.series.flatMap(s => s.points.map(p => p.y));
    let low = Math.min(...ys), high = Math.max(...ys);
    if (model.compare) { low = Math.min(low, 0); high = Math.max(high, 0); }
    const pad = ((high - low) || 1) * 0.07;
    const {ticks, step} = niceTicks(low - pad, high + pad, 4);
    const y0 = ticks[0], y1 = ticks.at(-1);
    const X = t => m.l + (t - model.from) / ((model.to - model.from) || 1) * w;
    const Y = v => m.t + (1 - (v - y0) / ((y1 - y0) || 1)) * h;
    const primary = model.series[0].record;
    const decimals = model.compare ? 1 : Math.max(0, Math.min(primary.decimals, -Math.floor(Math.log10(step) + 1e-9)));

    const svg = el('svg', {viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', tabindex: 0, class: 'chart-svg',
      'aria-label': model.compare ? `Confronto tra ${model.series.map(s => s.record.short).join(', ')}, variazione percentuale nel periodo ${state.range}`
        : `${primary.label}, periodo ${state.range}: da ${number(model.series[0].points[0].v, primary.decimals)} a ${number(model.series[0].points.at(-1).v, primary.decimals)}. Usa le frecce per leggere i valori.`});
    for (const tick of ticks) {
      svg.append(el('line', {x1: m.l, x2: m.l + w, y1: Y(tick), y2: Y(tick), class: tick === 0 && model.compare ? 'chart-zero' : 'chart-grid'}));
      svg.append(el('text', {x: m.l - 8, y: Y(tick) + 4, class: 'chart-axis', 'text-anchor': 'end'}, (model.compare && tick > 0 ? '+' : '') + number(tick, decimals) + (model.compare ? '%' : '')));
    }
    const count = width < 520 ? 4 : 6;
    for (let i = 0; i < count; i++) {
      const t = model.from + (model.to - model.from) * i / (count - 1);
      const label = state.range === '1A' ? monthDate.format(t) : shortDate.format(t);
      svg.append(el('text', {x: X(t), y: height - 8, class: 'chart-axis', 'text-anchor': i === 0 ? 'start' : (i === count - 1 ? 'end' : 'middle')}, label));
    }
    if (!model.compare) {
      const s = model.series[0];
      const gradient = el('linearGradient', {id: 'chart-fill', x1: 0, x2: 0, y1: 0, y2: 1});
      gradient.append(el('stop', {offset: '0%', 'stop-color': s.record.color, 'stop-opacity': '0.22'}), el('stop', {offset: '100%', 'stop-color': s.record.color, 'stop-opacity': '0'}));
      const defs = el('defs'); defs.append(gradient); svg.append(defs);
      const line = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
      svg.append(el('path', {d: `${line} L${X(s.points.at(-1).t).toFixed(1)},${Y(y0)} L${X(s.points[0].t).toFixed(1)},${Y(y0)} Z`, fill: 'url(#chart-fill)', class: 'chart-area'}));
    }
    const ends = [];
    for (const s of model.series) {
      const line = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
      svg.append(el('path', {d: line, fill: 'none', stroke: s.record.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', pathLength: 1, class: 'chart-line'}));
      const last = s.points.at(-1);
      svg.append(el('circle', {cx: X(last.t), cy: Y(last.y), r: 4, fill: s.record.color, stroke: 'var(--panel)', 'stroke-width': 2}));
      ends.push({s, y: Y(last.y)});
    }
    if (model.compare) {     // etichette dirette a fine linea, distanziate per non sovrapporsi
      ends.sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 15);
      for (const end of ends) svg.append(el('text', {x: m.l + w + 10, y: end.y + 4, class: 'chart-end-label'}, end.s.record.short));
    }
    const hover = el('g', {class: 'chart-hover', visibility: 'hidden'});
    const guide = el('line', {y1: m.t, y2: m.t + h, class: 'chart-guide'});
    hover.append(guide);
    const dots = model.series.map(s => { const dot = el('circle', {r: 5, fill: s.record.color, stroke: 'var(--panel)', 'stroke-width': 2}); hover.append(dot); return dot; });
    svg.append(hover);
    const overlay = el('rect', {x: m.l, y: m.t, width: w, height: h, fill: 'transparent', class: 'chart-overlay'});
    svg.append(overlay);
    const tip = html('div', 'chart-tip'); tip.hidden = true; tip.setAttribute('role', 'status');
    stage.append(svg, tip);

    const nearest = (points, t) => {
      let lo = 0, hi = points.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (points[mid].t < t) lo = mid + 1; else hi = mid; }
      return lo > 0 && Math.abs(points[lo - 1].t - t) <= Math.abs(points[lo].t - t) ? lo - 1 : lo;
    };
    function show(t) {
      const picks = model.series.map(s => s.points[nearest(s.points, t)]);
      const anchor = picks.reduce((best, p) => Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best);
      const x = X(anchor.t);
      guide.setAttribute('x1', x); guide.setAttribute('x2', x);
      picks.forEach((p, i) => { dots[i].setAttribute('cx', X(p.t)); dots[i].setAttribute('cy', Y(p.y)); });
      hover.setAttribute('visibility', 'visible');
      tip.replaceChildren(html('div', 'tip-date', longDate.format(anchor.t)));
      model.series.forEach((s, i) => {
        const row = html('div', 'tip-row');
        const key = html('i', 'tip-key'); key.style.background = s.record.color;
        const value = model.compare ? signed(picks[i].y, '%') : number(picks[i].v, s.record.decimals) + (s.record.unit ? ' ' + s.record.unit : '');
        const extra = model.compare ? ` · ${number(picks[i].v, s.record.decimals)}` : '';
        row.append(key, html('strong', '', value), html('span', '', s.record.short + extra));
        tip.append(row);
      });
      tip.hidden = false;
      const room = stage.clientWidth - x;
      tip.style.left = (room < 190 ? x - tip.offsetWidth - 12 : x + 14) + 'px';
      tip.style.top = Math.max(0, m.t + 4) + 'px';
      cursor = anchor.t;
    }
    function hide() { hover.setAttribute('visibility', 'hidden'); tip.hidden = true; cursor = null; }
    overlay.addEventListener('pointermove', event => {
      const box = overlay.getBoundingClientRect();
      show(model.from + (event.clientX - box.left) / box.width * (model.to - model.from));
    });
    overlay.addEventListener('pointerleave', hide);
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', event => {
      const points = model.series[0].points;
      const keys = {ArrowLeft: -1, ArrowRight: 1, Home: 'start', End: 'end'};
      if (!(event.key in keys)) { if (event.key === 'Escape') hide(); return; }
      event.preventDefault();
      let index = cursor === null ? points.length - 1 : nearest(points, cursor);
      const move = keys[event.key];
      index = move === 'start' ? 0 : move === 'end' ? points.length - 1 : Math.min(points.length - 1, Math.max(0, index + move));
      show(points[index].t);
    });
    renderSide();
  }

  function renderSide() {
    const compare = model.compare;
    title.textContent = compare ? 'Confronto' : model.series[0].record.label;
    sub.textContent = compare ? `Variazione % dall’inizio del periodo (${state.range})` : (model.series[0].record.unit || 'Valore') + ` · ${model.series[0].record.source}`;
    legend.hidden = !compare;
    if (compare) for (const s of model.series) {
      const item = html('li');
      const key = html('i', 'legend-line'); key.style.background = s.record.color;
      item.append(key, html('span', '', s.record.label));
      legend.append(item);
    }
    const stat = (label, value) => { const box = html('div'); box.append(html('dt', '', label), html('dd', '', value)); stats.append(box); };
    if (compare) {
      for (const s of model.series) stat(s.record.short, signed(s.change, '%'));
    } else {
      const s = model.series[0], values = s.points.map(p => p.v);
      const lo = s.points.find(p => p.v === Math.min(...values)), hi = s.points.find(p => p.v === Math.max(...values));
      const fmt = v => number(v, s.record.decimals);
      stat('Ultimo', fmt(s.points.at(-1).v) + (s.record.unit && s.record.unit !== '%' ? ' ' + s.record.unit : s.record.unit));
      stat(`Variazione ${state.range}`, s.record.kind === 'pp' ? signed(s.change, ' pp') : signed(s.change, '%'));
      stat('Minimo', `${fmt(lo.v)} · ${shortDate.format(lo.t)}`);
      stat('Massimo', `${fmt(hi.v)} · ${shortDate.format(hi.t)}`);
    }
    const t = html('table', 'simple-table');
    const head = html('tr'); head.append(html('th', '', 'Data'));
    for (const s of model.series) head.append(html('th', '', s.record.short));
    const thead = html('thead'); thead.append(head); t.append(thead);
    const body = html('tbody');
    const days = [...new Set(model.series.flatMap(s => s.points.map(p => p.day)))].sort().reverse();
    for (const d of days) {
      const row = html('tr'); row.append(html('td', '', longDate.format(time(d))));
      for (const s of model.series) { const p = s.points.find(point => point.day === d); row.append(html('td', 'number-cell', p ? number(p.v, s.record.decimals) : '—')); }
      body.append(row);
    }
    t.append(body); table.append(t);
    for (const button of root.querySelectorAll('[data-chart-range]')) button.setAttribute('aria-pressed', String(button.dataset.chartRange === state.range));
    for (const button of root.querySelectorAll('[data-chart-series]')) button.setAttribute('aria-pressed', String(state.selected.includes(button.dataset.chartSeries)));
    try { localStorage.setItem('usdmacro.chart', JSON.stringify(state)); } catch (error) { /* facoltativo */ }
  }

  function setSelection(ids, message) {
    state.selected = ids;
    hint.textContent = message || hintDefault;
    draw();
  }
  root.addEventListener('click', event => {
    const range = event.target.closest('[data-chart-range]');
    if (range) { state.range = range.dataset.chartRange; draw(); return; }
    const chip = event.target.closest('[data-chart-series]');
    if (!chip) return;
    const id = chip.dataset.chartSeries;
    if (state.selected.includes(id)) {
      if (state.selected.length > 1) setSelection(state.selected.filter(x => x !== id));
    } else if (state.selected.length >= MAX_COMPARE) {
      const dropped = data[state.selected[0]]?.short;
      setSelection([...state.selected.slice(1), id], `Massimo ${MAX_COMPARE} serie insieme: ho tolto ${dropped}.`);
    } else setSelection([...state.selected, id]);
  });
  document.addEventListener('click', event => {       // le schede riepilogative aprono la serie nel grafico
    const card = event.target.closest('[data-chart-select]');
    if (card && data[card.dataset.chartSelect]) setSelection([card.dataset.chartSelect]);
  });
  let lastWidth = 0;
  new ResizeObserver(() => {      // solo la larghezza conta: ridisegnare cambia l'altezza e non deve riattivare l'osservatore
    if (stage.clientWidth && stage.clientWidth !== lastWidth) { lastWidth = stage.clientWidth; draw(); }
  }).observe(stage);

  function start(series) {
    data = Object.fromEntries(series.map(record => [record.id, record]));
    state.selected = state.selected.filter(id => data[id]);
    if (!state.selected.length) state.selected = [data.dxy ? 'dxy' : Object.keys(data)[0]].filter(Boolean);
    draw();
  }
  const embedded = document.querySelector('#series-data');
  if (embedded) {
    try { start(Object.values(JSON.parse(embedded.textContent))); } catch (error) { draw(); }
  } else if (['127.0.0.1', 'localhost'].includes(location.hostname)) {
    fetch('/api/series', {cache: 'no-store'}).then(r => r.json()).then(payload => start(payload.series)).catch(() => draw());
  } else {
    draw();      // pagina pubblica senza dati incorporati: nessuna chiamata a un'API che lì non esiste
  }
  // L'aggiornamento periodico serve solo alla dashboard locale; la pagina pubblica viene rigenerata dal monitor.
  window.MacroCharts = {refresh: () => embedded ? Promise.resolve() : fetch('/api/series', {cache: 'no-store'}).then(r => r.json()).then(p => start(p.series))};
})();
