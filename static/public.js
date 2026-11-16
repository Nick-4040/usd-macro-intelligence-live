// Pagina pubblica in sola lettura: sezioni, filtri del calendario e conto alla rovescia.
// Nessuna richiesta di rete: tutti i dati sono già nella pagina generata.
(() => {
  'use strict';
  const root = document.querySelector('#main');
  const views = [...document.querySelectorAll('[data-view]')];
  const labels = {panoramica: 'Panoramica', briefing: 'Briefing AI', calendario: 'Calendario', grafici: 'Grafici', mondo: 'Il mondo', notizie: 'Comunicati ufficiali'};
  const sidebar = document.querySelector('#sidebar');
  const menu = document.querySelector('#menu-toggle');
  const search = document.querySelector('#event-filter');
  const impact = document.querySelector('#impact-filter');
  const mobile = window.matchMedia('(max-width: 760px)');
  let events = [];
  try { events = JSON.parse(document.querySelector('#calendar-data')?.textContent || '[]'); } catch (error) { events = []; }
  let range = 'week';

  function syncNavigation() { sidebar.inert = mobile.matches && !sidebar.classList.contains('open'); }
  mobile.addEventListener('change', syncNavigation);

  function activateView(id, focus = false) {
    if (!labels[id]) id = 'panoramica';
    for (const view of views) view.hidden = view.dataset.view !== id;
    for (const link of document.querySelectorAll('[data-view-target]')) {
      if (link.dataset.viewTarget === id && link.closest('nav')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.querySelector('#view-label').textContent = labels[id];
    document.title = `${labels[id]} · Il dollaro oggi`;
    sidebar.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    syncNavigation();
    if (focus) {
      window.scrollTo({top: 0, behavior: 'instant'});
      document.querySelector(`[data-view="${id}"] h1`)?.focus({preventScroll: true});
    }
    filterCalendar();
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-view-target]');
    if (link && !event.ctrlKey && !event.metaKey && event.button === 0) {
      event.preventDefault();
      const id = link.dataset.viewTarget;
      if (location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
      activateView(id, true);
    }
  });
  window.addEventListener('hashchange', () => activateView(location.hash.slice(1), true));
  window.addEventListener('popstate', () => activateView(location.hash.slice(1), true));
  menu.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
    syncNavigation();
    if (open) sidebar.querySelector('nav a')?.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); syncNavigation(); menu.focus();
    }
  });

  function countdown(epoch) {
    const seconds = Math.max(0, Math.ceil(epoch - Date.now() / 1000));
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ${minutes % 60} min`;
    return `${Math.floor(hours / 24)} g ${hours % 24} h`;
  }
  // "Oggi" e "domani" seguono l'orologio di chi legge (ora italiana), anche se la pagina è stata generata ieri.
  const dayKey = offset => new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Rome'}).format(new Date(Date.now() + offset * 86400000));
  function inRange(day) {
    if (range === 'today') return day === dayKey(0);
    if (range === 'tomorrow') return day === dayKey(1);
    if (range === 'week') return day < dayKey(7);
    return true;
  }
  function filterCalendar() {
    if (!search) return;
    const query = search.value.trim().toLocaleLowerCase('it');
    const level = impact.value;
    let visible = 0;
    for (const row of document.querySelectorAll('.event-row')) {
      const future = Number(row.dataset.eventTime) > Date.now() / 1000;
      const matches = !query || row.dataset.search.toLocaleLowerCase('it').includes(query);
      const impactMatches = level === 'all' || (level === 'high' ? row.dataset.impact === 'high' : ['high', 'medium'].includes(row.dataset.impact));
      row.hidden = !(future && matches && impactMatches && inRange(row.dataset.eventDay));
      if (!row.hidden) visible++;
    }
    for (const group of document.querySelectorAll('[data-calendar-day]')) {
      const rows = [...group.querySelectorAll('.event-row')].filter(row => !row.hidden);
      group.hidden = rows.length === 0;
      const label = group.querySelector('.day-heading span');
      if (label) label.textContent = `${rows.length} ${rows.length === 1 ? 'appuntamento' : 'appuntamenti'}`;
    }
    const undated = [...document.querySelectorAll('[data-unconfirmed-day]')];
    for (const row of undated) row.hidden = !inRange(row.dataset.unconfirmedDay) || Boolean(query && !row.textContent.toLocaleLowerCase('it').includes(query));
    const undatedSection = document.querySelector('.unconfirmed');
    if (undatedSection) {
      const remaining = undated.filter(row => !row.hidden).length;
      undatedSection.hidden = remaining === 0;
      undatedSection.querySelector('.count-badge').textContent = remaining;
    }
    const empty = document.querySelector('#calendar-empty');
    if (empty) empty.hidden = visible > 0;
    document.querySelector('#visible-event-count').textContent = visible;
  }
  for (const button of document.querySelectorAll('[data-calendar-range]')) button.addEventListener('click', () => {
    range = button.dataset.calendarRange;
    for (const candidate of document.querySelectorAll('[data-calendar-range]')) candidate.setAttribute('aria-pressed', String(candidate === button));
    filterCalendar();
  });
  search?.addEventListener('input', filterCalendar);
  impact?.addEventListener('change', filterCalendar);

  const newsFilter = document.querySelector('#news-filter');
  newsFilter?.addEventListener('input', () => {
    const query = newsFilter.value.trim().toLocaleLowerCase('it');
    let visible = 0;
    for (const card of document.querySelectorAll('[data-news-search]')) {
      card.hidden = !card.dataset.newsSearch.toLocaleLowerCase('it').includes(query);
      if (!card.hidden) visible++;
    }
    const empty = document.querySelector('[data-news-empty]');
    if (empty) empty.hidden = visible > 0 || !document.querySelector('[data-news-search]');
  });

  let worldTopic = 'all';
  function applyWorld() {
    const host = document.querySelector('#world-content');
    if (!host) return;
    let visible = 0;
    for (const item of host.querySelectorAll('.world-item')) {
      const show = worldTopic === 'all' || item.dataset.topic === worldTopic;
      item.hidden = !show;
      if (show) visible++;
    }
    for (const button of host.querySelectorAll('[data-world-topic]')) button.setAttribute('aria-pressed', String(button.dataset.worldTopic === worldTopic));
    for (const note of host.querySelectorAll('[data-why]')) note.hidden = note.dataset.why !== worldTopic;
    const all = host.querySelector('[data-why-all]');
    if (all) all.hidden = worldTopic !== 'all';
    const empty = host.querySelector('[data-world-empty]');
    if (empty) empty.hidden = visible > 0 || !host.querySelector('.world-item');
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-world-topic]');
    if (button) { worldTopic = button.dataset.worldTopic; applyWorld(); }
  });

  function tick() {
    const now = Date.now() / 1000;
    for (const row of document.querySelectorAll('[data-event-time]')) {
      if (Number(row.dataset.eventTime) <= now) {
        const focusInside = row.contains(document.activeElement);
        row.remove();
        if (focusInside) document.querySelector('#calendar-title')?.focus({preventScroll: true});
      }
    }
    for (const node of document.querySelectorAll('[data-countdown]')) node.textContent = `Tra ${countdown(Number(node.dataset.countdown))}`;
    const future = events.filter(e => e.epoch > now);
    const set = (selector, text) => { const node = document.querySelector(selector); if (node) node.textContent = text; };
    set('[data-upcoming-count]', future.length);
    set('[data-high-count]', future.filter(e => e.impact === 'high').length);
    set('[data-today-count]', future.filter(e => e.day === dayKey(0)).length);
    const next = future[0];
    set('[data-next-countdown]', next ? `Tra ${countdown(next.epoch)}` : 'Nessun evento');
    set('[data-next-title]', next ? next.title : 'Calendario aggiornato');
    set('[data-next-date]', next ? next.when : 'Nessun appuntamento con orario confermato.');
    filterCalendar();
  }
  function checkFreshness() {
    // Oltre tre ore senza aggiornamenti (PC spento, weekend) lo si dice chiaramente.
    const age = Date.now() / 1000 - Number(root.dataset.generated || 0);
    const stale = age > 3 * 3600;
    const notice = document.querySelector('[data-stale-notice]');
    if (notice) notice.hidden = !stale;
    for (const dot of document.querySelectorAll('[data-fresh-dot]')) dot.classList.toggle('good', !stale);
  }

  activateView(location.hash.slice(1));
  applyWorld();
  tick(); checkFreshness();
  setInterval(tick, 1000);
  setInterval(checkFreshness, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); checkFreshness(); } });
})();
