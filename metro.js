/* ═══════════════════════════════════════════════════
   City Metro Trip Planner — metro.js
═══════════════════════════════════════════════════ */

const API_BASE = 'https://trains-api.felixfeger46.workers.dev';

const LINE_COLORS = {
  A: '#1d4ed8', B: '#6d28d9', D: '#0e7490',
  E: '#b45309', F: '#b91c1c', K: '#db2777',
};
const LINE_NAMES = {
  A: 'A Line', B: 'B Line', D: 'D Line',
  E: 'E Line', F: 'F Line', K: 'K Line',
};

/* ═══════════════════════════════════════════════════
   METRO SYSTEM DATA
═══════════════════════════════════════════════════ */
const STATIONS = [
  "Union Station",
  "Downtown Lego City",
  "Airport Metro Transit Center",
  "Death Star City",
  "Downtown Santa Mooica",
  "Emergency HQ",
  "Desktop Hills",
  "Table Central",
  "FLX T2",
  "Asian Town",
  "Couch Chair Park",
  "Dine Park",
  "TV Central",
  "North Hollowwood",
  "William Western",
];

// Map station code → display name (matches API closure station_id values)
const STATION_CODE_MAP = {
  USP: "Union Station",
  DLP: "Downtown Lego City",
  EQP: "Emergency HQ",
  AMP: "Airport Metro Transit Center",
  DSP: "Death Star City",
  SMP: "Downtown Santa Mooica",
  DHP: "Desktop Hills",
  TCP: "Table Central",
  FTP: "FLX T2",
  ATP: "Asian Town",
};

const BASE_CONNECTIONS = [
  // A Line
  { from:"Union Station",                to:"Downtown Lego City",              line:"A" },
  { from:"Downtown Lego City",           to:"Airport Metro Transit Center",    line:"A" },
  { from:"Airport Metro Transit Center", to:"Death Star City",                 line:"A" },
  { from:"Death Star City",              to:"Downtown Santa Mooica",           line:"A" },
  // B Line
  { from:"Union Station",                to:"Airport Metro Transit Center",    line:"B" },
  { from:"Airport Metro Transit Center", to:"Couch Chair Park",                line:"B" },
  { from:"Couch Chair Park",             to:"Dine Park",                       line:"B" },
  { from:"Dine Park",                    to:"TV Central",                      line:"B" },
  { from:"TV Central",                   to:"North Hollowwood",                line:"B" },
  // D Line
  { from:"Union Station",                to:"Airport Metro Transit Center",    line:"D" },
  { from:"Airport Metro Transit Center", to:"William Western",                 line:"D" },
  // E Line
  { from:"Union Station",                to:"Downtown Lego City",              line:"E" },
  { from:"Downtown Lego City",           to:"Emergency HQ",                    line:"E" },
  { from:"Emergency HQ",                 to:"Airport Metro Transit Center",    line:"E" },
  { from:"Airport Metro Transit Center", to:"Desktop Hills",                   line:"E" },
  { from:"Desktop Hills",                to:"Table Central",                   line:"E" },
  // F Line
  { from:"FLX T2",                       to:"Airport Metro Transit Center",    line:"F" },
  // K Line
  { from:"Asian Town",                   to:"Union Station",                   line:"K" },
];

/* ═══════════════════════════════════════════════════
   LIVE STATE
═══════════════════════════════════════════════════ */
let liveTrainsAPI = [];
let closures      = [];   // [{ station_id, station_name, reason }]
let turnbacks     = [];   // [{ station_id, station_name, line, direction }]

const BD_HEADWAYS = { B: 3.5, D: 3 };

/* ═══════════════════════════════════════════════════
   GRAPH BUILDER — respects closures & turnbacks
═══════════════════════════════════════════════════ */
function buildGraph() {
  // Closed station names
  const closedNames = new Set(
    closures.map(c => STATION_CODE_MAP[c.station_id] || c.station_name)
  );

  // Turnback map: line → Set of stations where that line terminates short
  // When a turnback exists, remove connections BEYOND that station for that line
  const turnbackMap = {};
  for (const tb of turnbacks) {
    const name = STATION_CODE_MAP[tb.station_id] || tb.station_name;
    if (!turnbackMap[tb.line]) turnbackMap[tb.line] = new Set();
    turnbackMap[tb.line].add(name);
  }

  // Filter connections
  const activeConnections = BASE_CONNECTIONS.filter(c => {
    // Remove if either endpoint is closed
    if (closedNames.has(c.from) || closedNames.has(c.to)) return false;
    // Remove if this line has a turnback at either endpoint meaning service
    // doesn't continue beyond that point
    const tb = turnbackMap[c.line];
    if (tb && (tb.has(c.from) || tb.has(c.to))) {
      // Keep connection INTO the turnback station but not beyond
      // i.e. remove the connection where the turnback station is c.from
      // (trains don't depart from there further)
      if (tb.has(c.from)) return false;
    }
    return true;
  });

  // Build adjacency graph from active connections
  const g = {};
  STATIONS.forEach(s => { if (!closedNames.has(s)) g[s] = []; });

  activeConnections.forEach(c => {
    if (g[c.from]) g[c.from].push({ station: c.to,   line: c.line });
    if (g[c.to])   g[c.to  ].push({ station: c.from, line: c.line });
  });

  return { graph: g, closedNames };
}

/* ═══════════════════════════════════════════════════
   BFS ROUTE FINDER
═══════════════════════════════════════════════════ */
function findRoute(start, end, graph) {
  if (start === end) return [];

  const queue   = [{ station: start, path: [] }];
  const visited = new Set();

  while (queue.length) {
    const { station, path } = queue.shift();
    if (station === end) return buildSegments(path);
    if (visited.has(station)) continue;
    visited.add(station);

    for (const next of (graph[station] || [])) {
      queue.push({
        station: next.station,
        path: [...path, { from: station, to: next.station, line: next.line }],
      });
    }
  }
  return null;
}

function buildSegments(path) {
  if (!path.length) return [];
  const segs = [];
  let cur = { line: path[0].line, stops: [path[0].from, path[0].to] };
  for (let i = 1; i < path.length; i++) {
    const s = path[i];
    if (s.line === cur.line) { cur.stops.push(s.to); }
    else { segs.push(cur); cur = { line: s.line, stops: [s.from, s.to] }; }
  }
  segs.push(cur);
  return segs;
}

/* ═══════════════════════════════════════════════════
   POPULATE DROPDOWNS — greys out closed stations
═══════════════════════════════════════════════════ */
function populateDropdowns() {
  const closedNames = new Set(
    closures.map(c => STATION_CODE_MAP[c.station_id] || c.station_name)
  );
  const sorted = [...STATIONS].sort();

  [document.getElementById('start'), document.getElementById('end')].forEach(sel => {
    const prev = sel.value;
    sel.innerHTML = '';
    sorted.forEach(s => {
      const opt = new Option(closedNames.has(s) ? `${s} (Closed)` : s, s);
      if (closedNames.has(s)) {
        opt.style.color = '#dc2626';
        opt.disabled    = true;
      }
      sel.appendChild(opt);
    });
    // Restore previous selection if still valid
    if (prev && !closedNames.has(prev)) sel.value = prev;
    else sel.value = sorted.find(s => !closedNames.has(s)) || sorted[0];
  });

  // Make sure start ≠ end
  const startEl = document.getElementById('start');
  const endEl   = document.getElementById('end');
  if (startEl.value === endEl.value) {
    const other = sorted.find(s => s !== startEl.value && !closedNames.has(s));
    if (other) endEl.value = other;
  }
}

/* ═══════════════════════════════════════════════════
   CLOSURE / TURNBACK BANNER
═══════════════════════════════════════════════════ */
function updateAlertBanner() {
  const banner = document.getElementById('alert-banner');
  if (!banner) return;

  const items = [];
  for (const c of closures) {
    const name = STATION_CODE_MAP[c.station_id] || c.station_name;
    items.push(`<span class="alert-item">🚫 <strong>${name}</strong> — ${c.reason || 'Station closed'}</span>`);
  }
  for (const tb of turnbacks) {
    const name = STATION_CODE_MAP[tb.station_id] || tb.station_name;
    const dir  = tb.direction === 'both' ? '' : ` (${tb.direction}bound)`;
    items.push(`<span class="alert-item">↩ <strong>${tb.line} Line</strong> turns back at ${name}${dir} — ${tb.reason || 'Service adjustment'}</span>`);
  }

  if (items.length) {
    banner.innerHTML = `<span style="font-size:14px">⚠</span> ${items.join(' &nbsp;·&nbsp; ')}`;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════════
   LIVE TRAINS
═══════════════════════════════════════════════════ */
function getSimulatedTrains() {
  const nowMs = Date.now();
  const simulated = [];
  for (const [line, headwayMins] of Object.entries(BD_HEADWAYS)) {
    const headwayMs = headwayMins * 60 * 1000;
    for (let i = 0; i < 3; i++) {
      const offset       = Math.floor(i * headwayMs / 3);
      const cyclePos     = (nowMs + offset) % headwayMs;
      const minsInCycle  = cyclePos / 60000;
      simulated.push({
        number: `${line}${(i + 1) * 100}`,
        route:  line, location: null, connected: 1, coupled_with: null,
        simulated: true,
        nextArrivalMins: parseFloat((headwayMins - minsInCycle % headwayMins).toFixed(1)),
      });
    }
  }
  return simulated;
}

async function loadLiveTrains() {
  try {
    const res = await fetch(`${API_BASE}/trains`);
    if (!res.ok) throw new Error();
    liveTrainsAPI = await res.json();
    document.getElementById('live-dot').classList.remove('offline');
    document.getElementById('live-status').textContent = 'Live';
  } catch {
    liveTrainsAPI = [];
    document.getElementById('live-dot').classList.add('offline');
    document.getElementById('live-status').textContent = 'Offline';
  }
  renderLiveTrains();
}

async function loadClosuresAndTurnbacks() {
  try {
    const [cRes, tRes] = await Promise.all([
      fetch(`${API_BASE}/closures`),
      fetch(`${API_BASE}/turnbacks`),
    ]);
    closures  = cRes.ok  ? await cRes.json()  : [];
    turnbacks = tRes.ok  ? await tRes.json()  : [];
  } catch {
    closures  = [];
    turnbacks = [];
  }
  populateDropdowns();
  updateAlertBanner();
}

function renderLiveTrains() {
  const grid  = document.getElementById('live-trains-grid');
  const count = document.getElementById('active-count');

  const realCount = liveTrainsAPI.length;
  count.textContent = realCount;
  grid.innerHTML = '';

  const seen = new Set();
  for (const t of liveTrainsAPI) {
    const pairKey = t.coupled_with ? [t.number, t.coupled_with].sort().join('+') : t.number;
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);
    const color = LINE_COLORS[t.route] || '#888';
    const label = t.coupled_with ? `#${t.number}+${t.coupled_with}` : `#${t.number}`;
    grid.innerHTML += `
      <div class="chip">
        <div class="chip-dot" style="background:${color}"></div>
        ${label} <span class="chip-sub">${t.route}</span>
      </div>`;
  }

  if (!realCount) {
    grid.innerHTML += `<span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted2)">No active trains on A·E·F·K</span>`;
  }

  for (const [line, headway] of Object.entries(BD_HEADWAYS)) {
    const color = LINE_COLORS[line] || '#888';
    grid.innerHTML += `
      <div class="chip" title="Scheduled every ${headway} min">
        <div class="chip-dot" style="background:${color}"></div>
        ${line} Line <span class="chip-sub">every ~${headway}m</span>
      </div>`;
  }
}

/* ═══════════════════════════════════════════════════
   TRAINS ON ROUTE
═══════════════════════════════════════════════════ */
function trainsOnRoute(segments) {
  const onRoute = [];
  const seen    = new Set();

  for (const seg of segments) {
    if (!['B','D'].includes(seg.line)) {
      for (const t of liveTrainsAPI) {
        if (t.route !== seg.line) continue;
        const pairKey = t.coupled_with ? [t.number, t.coupled_with].sort().join('+') : t.number;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        onRoute.push({ ...t, simulated: false });
      }
    }
    if (['B','D'].includes(seg.line)) {
      const key = `sim-${seg.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const headway  = BD_HEADWAYS[seg.line];
      const cycleMs  = headway * 60 * 1000;
      const nextMins = Math.max(1, Math.round((cycleMs - (Date.now() % cycleMs)) / 60000));
      onRoute.push({ number: null, route: seg.line, simulated: true, nextMins, headway });
    }
  }
  return onRoute;
}

/* ═══════════════════════════════════════════════════
   PLAN TRIP
═══════════════════════════════════════════════════ */
function planTrip() {
  const start = document.getElementById('start').value;
  const end   = document.getElementById('end').value;
  const card  = document.getElementById('result-card');

  if (!start || !end) return;

  if (start === end) {
    card.style.display = 'block';
    card.innerHTML = `<div class="err-box">⚠ Please select two different stations.</div>`;
    return;
  }

  const { graph, closedNames } = buildGraph();

  // Warn if start or end is closed
  if (closedNames.has(start) || closedNames.has(end)) {
    card.style.display = 'block';
    card.innerHTML = `<div class="err-box">⚠ ${closedNames.has(start) ? start : end} is currently closed. Please select an alternative station.</div>`;
    return;
  }

  const segments = findRoute(start, end, graph);

  // If no route due to closures, try original graph as fallback and explain
  if (!segments) {
    const { graph: origGraph } = buildGraph();
    // Build original graph without restrictions for comparison
    const origG = {};
    STATIONS.forEach(s => (origG[s] = []));
    BASE_CONNECTIONS.forEach(c => {
      origG[c.from].push({ station: c.to,   line: c.line });
      origG[c.to  ].push({ station: c.from, line: c.line });
    });
    const origRoute = findRoute(start, end, origG);

    card.style.display = 'block';
    if (origRoute) {
      // Route exists normally but is blocked by closure/turnback
      const affected = closures.map(c => STATION_CODE_MAP[c.station_id] || c.station_name)
        .filter(n => origRoute.some(seg => seg.stops.includes(n)));
      card.innerHTML = `
        <div class="err-box" style="flex-direction:column;align-items:flex-start;gap:6px">
          <div>⚠ No route available due to service disruptions.</div>
          ${affected.length ? `<div style="font-size:12px">Affected: <strong>${affected.join(', ')}</strong></div>` : ''}
          <div style="font-size:12px;color:var(--muted)">Please check service alerts or try an alternative journey.</div>
        </div>`;
    } else {
      card.innerHTML = `<div class="msg-box"><div class="icon">🚫</div><p>No route found between these stations.</p></div>`;
    }
    return;
  }

  const totalStops = segments.reduce((n, s) => n + s.stops.length - 1, 0);
  const transfers  = segments.length - 1;
  const estMins    = totalStops * 3 + transfers * 4;
  const onRoute    = trainsOnRoute(segments);

  // Check if any stops on this route are adjacent to a closure (skipped)
  const closedNames2 = new Set(closures.map(c => STATION_CODE_MAP[c.station_id] || c.station_name));
  const skippedStops = [];
  for (const seg of segments) {
    for (const stop of seg.stops) {
      // Check if there's a closed station between this seg's stops
      // (train skips it on the real route)
    }
  }

  // Build journey HTML
  let journeyHTML = '';
  segments.forEach((seg, si) => {
    const color   = LINE_COLORS[seg.line] || '#888';
    const bgLight = `${color}14`;

    journeyHTML += `
      <div class="seg-wrap">
        <div class="seg-header" style="background:${bgLight}">
          <div class="line-circle" style="background:${color}">${seg.line}</div>
          <div class="seg-line-name" style="color:${color}">${LINE_NAMES[seg.line] || seg.line + ' Line'}</div>
          <div class="seg-stops">${seg.stops.length - 1} stop${seg.stops.length - 1 !== 1 ? 's' : ''}</div>
        </div>
        <div class="stop-list" style="--line-clr:${color}">`;

    seg.stops.forEach((stop, idx) => {
      const isFirst    = si === 0 && idx === 0;
      const isLast     = si === segments.length - 1 && idx === seg.stops.length - 1;
      const isTransfer = !isLast && idx === seg.stops.length - 1;
      const isClosed   = closedNames2.has(stop);

      let tagHTML = '';
      if (isFirst)    tagHTML += `<span class="tag depart">Depart</span>`;
      if (isTransfer) tagHTML += `<span class="tag transfer">Transfer</span>`;
      if (isLast)     tagHTML += `<span class="tag arrive">Arrive</span>`;
      if (isClosed)   tagHTML += `<span class="tag" style="background:#fef2f2;color:#dc2626;border-color:#fecaca">Closed</span>`;

      const cls = isTransfer ? 'stop-row is-transfer' : (isFirst || isLast ? 'stop-row is-terminal' : 'stop-row');
      journeyHTML += `
        <div class="${cls}" ${isClosed ? 'style="opacity:.5;text-decoration:line-through"' : ''}>
          <div class="stop-label">${stop}</div>
          ${tagHTML}
        </div>`;
    });

    journeyHTML += `</div></div>`;
  });

  // Notices
  const notices = [];

  // Closure warnings for stations on or near route
  for (const c of closures) {
    const name = STATION_CODE_MAP[c.station_id] || c.station_name;
    notices.push(`
      <div class="route-notice" style="background:#fef2f2;border-color:#fecaca;color:#991b1b">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div><strong>${name}</strong> is closed — ${c.reason}. Trains skip this station.</div>
      </div>`);
  }

  // Turnback warnings for lines on this route
  for (const tb of turnbacks) {
    if (!segments.some(s => s.line === tb.line)) continue;
    const name = STATION_CODE_MAP[tb.station_id] || tb.station_name;
    const dir  = tb.direction === 'both' ? '' : ` ${tb.direction}bound`;
    notices.push(`
      <div class="route-notice is-sched">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div><strong>${tb.line} Line${dir}</strong> is turning back at ${name} — ${tb.reason}.</div>
      </div>`);
  }

  // Live train notices
  if (onRoute.length) {
    const realTrains = onRoute.filter(t => !t.simulated);
    const simLines   = onRoute.filter(t => t.simulated);
    if (realTrains.length) {
      const names = realTrains.map(t => t.coupled_with ? `#${t.number}+${t.coupled_with}` : `#${t.number}`).join(', ');
      notices.push(`
        <div class="route-notice is-live">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div><strong>Live:</strong> Train${realTrains.length > 1 ? 's' : ''} ${names} ${realTrains.length > 1 ? 'are' : 'is'} currently active on this route.</div>
        </div>`);
    }
    for (const s of simLines) {
      notices.push(`
        <div class="route-notice is-sched">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div><strong>${s.route} Line:</strong> Scheduled every ~${s.headway} min · next in ~${s.nextMins} min.</div>
        </div>`);
    }
  }

  card.style.display = 'block';
  card.innerHTML = `
    <div class="result-hero">
      <div>
        <div class="result-from-to">${start} <span class="arrow">→</span> ${end}</div>
        <div class="result-summary">${segments.length} line${segments.length > 1 ? 's' : ''} · ${totalStops} stop${totalStops !== 1 ? 's' : ''} · ~${estMins} min</div>
      </div>
      <div class="stats-strip">
        <div class="stat-item"><div class="stat-num">${totalStops}</div><div class="stat-lbl">Stops</div></div>
        <div class="stat-item"><div class="stat-num">${transfers}</div><div class="stat-lbl">Transfer${transfers !== 1 ? 's' : ''}</div></div>
        <div class="stat-item"><div class="stat-num">~${estMins}</div><div class="stat-lbl">Minutes</div></div>
      </div>
    </div>
    <div class="journey">${journeyHTML}</div>
    ${notices.join('')}
  `;

  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ═══════════════════════════════════════════════════
   SWAP STATIONS
═══════════════════════════════════════════════════ */
function swapStations() {
  const a = document.getElementById('start').value;
  const b = document.getElementById('end').value;
  document.getElementById('start').value = b;
  document.getElementById('end').value   = a;
}

/* ═══════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════ */
// Populate dropdowns initially with all stations
const sorted = [...STATIONS].sort();
[document.getElementById('start'), document.getElementById('end')].forEach(sel => {
  sorted.forEach(s => sel.appendChild(new Option(s, s)));
});
document.getElementById('end').value = sorted[1] || sorted[0];

// Load live data
loadLiveTrains();
loadClosuresAndTurnbacks();
setInterval(loadLiveTrains, 30000);
setInterval(loadClosuresAndTurnbacks, 60000);
