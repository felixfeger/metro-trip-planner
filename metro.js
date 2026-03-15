/* ═══════════════════════════════════════════════════
   CONFIG
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

const CONNECTIONS = [
  // A Line
  { from:"Union Station",                   to:"Downtown Lego City",              line:"A" },
  { from:"Downtown Lego City",              to:"Airport Metro Transit Center",     line:"A" },
  { from:"Airport Metro Transit Center",    to:"Death Star City",                  line:"A" },
  { from:"Death Star City",                 to:"Downtown Santa Mooica",            line:"A" },
  // B Line
  { from:"Union Station",                   to:"Airport Metro Transit Center",     line:"B" },
  { from:"Airport Metro Transit Center",    to:"Couch Chair Park",                 line:"B" },
  { from:"Couch Chair Park",                to:"Dine Park",                        line:"B" },
  { from:"Dine Park",                       to:"TV Central",                       line:"B" },
  { from:"TV Central",                      to:"North Hollowwood",                 line:"B" },
  // D Line
  { from:"Union Station",                   to:"Airport Metro Transit Center",     line:"D" },
  { from:"Airport Metro Transit Center",    to:"William Western",                  line:"D" },
  // E Line
  { from:"Union Station",                   to:"Downtown Lego City",               line:"E" },
  { from:"Downtown Lego City",              to:"Emergency HQ",                     line:"E" },
  { from:"Emergency HQ",                    to:"Airport Metro Transit Center",     line:"E" },
  { from:"Airport Metro Transit Center",    to:"Desktop Hills",                    line:"E" },
  { from:"Desktop Hills",                   to:"Table Central",                    line:"E" },
  // F Line
  { from:"FLX T2",                          to:"Airport Metro Transit Center",     line:"F" },
  // K Line
  { from:"Asian Town",                      to:"Union Station",                    line:"K" },
];

/* ═══════════════════════════════════════════════════
   BUILD GRAPH
═══════════════════════════════════════════════════ */
const graph = {};
STATIONS.forEach(s => (graph[s] = []));
CONNECTIONS.forEach(c => {
  graph[c.from].push({ station: c.to,   line: c.line });
  graph[c.to  ].push({ station: c.from, line: c.line });
});

/* ═══════════════════════════════════════════════════
   POPULATE DROPDOWNS
═══════════════════════════════════════════════════ */
const sorted = [...STATIONS].sort();
const startSel = document.getElementById('start');
const endSel   = document.getElementById('end');

sorted.forEach(s => {
  startSel.appendChild(new Option(s, s));
  endSel.appendChild(new Option(s, s));
});
// Default end to something different
endSel.value = sorted[1] || sorted[0];

/* ═══════════════════════════════════════════════════
   BFS ROUTE FINDER
   Returns array of segments: { line, stops[] }
═══════════════════════════════════════════════════ */
function findRoute(start, end) {
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
  const segments = [];
  let current = { line: path[0].line, stops: [path[0].from, path[0].to] };

  for (let i = 1; i < path.length; i++) {
    const step = path[i];
    if (step.line === current.line) {
      current.stops.push(step.to);
    } else {
      segments.push(current);
      current = { line: step.line, stops: [step.from, step.to] };
    }
  }
  segments.push(current);
  return segments;
}

/* ═══════════════════════════════════════════════════
   LIVE TRAINS — A/E/F/K from API, B/D simulated
═══════════════════════════════════════════════════ */
let liveTrainsAPI = [];  // real trains from API (A, E, F, K)

/* ── Simulated B/D service ──────────────────────────
   Trains run every 3–4 min. We derive next arrivals
   from current clock time so they feel real.          */
const BD_HEADWAYS = { B: 3.5, D: 3 }; // minutes between trains

function getSimulatedTrains() {
  const now     = Date.now();
  const simulated = [];

  for (const [line, headwayMins] of Object.entries(BD_HEADWAYS)) {
    const headwayMs  = headwayMins * 60 * 1000;
    // Create 3 "trains" per line, offset by 1/3 headway each
    for (let i = 0; i < 3; i++) {
      const offset     = Math.floor(i * headwayMs / 3);
      const cyclePos   = (now + offset) % headwayMs;
      const minsInCycle = cyclePos / 60000;
      // Give each simulated train a stable pseudo-number
      const num = `${line}${(i + 1) * 100}`;
      simulated.push({
        number:      num,
        route:       line,
        location:    null,    // simulated — no block location
        connected:   1,
        coupled_with: null,
        simulated:   true,
        nextArrivalMins: parseFloat((headwayMins - minsInCycle % headwayMins).toFixed(1)),
      });
    }
  }
  return simulated;
}

/* Combined list for display */
function allTrains() {
  return [...liveTrainsAPI, ...getSimulatedTrains()];
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

function renderLiveTrains() {
  const grid  = document.getElementById('live-trains-grid');
  const count = document.getElementById('active-count');

  const combined = allTrains();

  // Count: real trains (deduplicated couples) + simulated lines as "scheduled"
  const realCount = liveTrainsAPI.length;
  count.textContent = realCount;

  grid.innerHTML = '';

  // Real trains first
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
        ${label} <span style="color:var(--muted2);margin-left:2px">${t.route}</span>
      </div>`;
  }

  if (!realCount) {
    grid.innerHTML += `<span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted2)">No active trains on A·E·F·K</span>`;
  }

  // Simulated B/D as scheduled service chips
  for (const [line, headway] of Object.entries(BD_HEADWAYS)) {
    const color = LINE_COLORS[line] || '#888';
    grid.innerHTML += `
      <div class="chip" title="Scheduled service every ${headway} min">
        <div class="chip-dot" style="background:${color}"></div>
        ${line} Line <span style="color:var(--muted2);margin-left:4px">every ~${headway}m</span>
      </div>`;
  }
}

/* ═══════════════════════════════════════════════════
   FIND TRAINS ON ROUTE
   Real trains for A/E/F/K, simulated next arrival for B/D
═══════════════════════════════════════════════════ */
function trainsOnRoute(segments) {
  const onRoute = [];
  const seen    = new Set();

  for (const seg of segments) {

    // A/E/F/K — real API trains
    if (!['B','D'].includes(seg.line)) {
      for (const t of liveTrainsAPI) {
        if (t.route !== seg.line) continue;
        const pairKey = t.coupled_with ? [t.number, t.coupled_with].sort().join('+') : t.number;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        onRoute.push({ ...t, simulated: false });
      }
    }

    // B/D — simulated scheduled service
    if (['B','D'].includes(seg.line)) {
      const key = `sim-${seg.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const headway = BD_HEADWAYS[seg.line];
      const nowMs   = Date.now();
      const cycleMs = headway * 60 * 1000;
      const nextMs  = cycleMs - (nowMs % cycleMs);
      const nextMins = Math.max(1, Math.round(nextMs / 60000));
      onRoute.push({
        number: null,
        route: seg.line,
        simulated: true,
        nextMins,
        headway,
      });
    }
  }
  return onRoute;
}

/* ═══════════════════════════════════════════════════
   RENDER RESULTS
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

  const segments = findRoute(start, end);

  if (!segments) {
    card.style.display = 'block';
    card.innerHTML = `<div class="msg-box"><div class="icon">🚫</div><p>No route found between these stations.</p></div>`;
    return;
  }

  const totalStops    = segments.reduce((n, s) => n + s.stops.length - 1, 0);
  const transfers     = segments.length - 1;
  const estMins       = totalStops * 3 + transfers * 4;
  const onRoute       = trainsOnRoute(segments);

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
        <div class="stop-list" style="--line-clr:${color}">
    `;

    seg.stops.forEach((stop, idx) => {
      const isFirst    = si === 0 && idx === 0;
      const isLast     = si === segments.length - 1 && idx === seg.stops.length - 1;
      const isTransfer = !isLast && idx === seg.stops.length - 1;

      let tagHTML = '';
      if (isFirst)    tagHTML = `<span class="tag depart">Depart</span>`;
      if (isTransfer) tagHTML = `<span class="tag transfer">Transfer</span>`;
      if (isLast)     tagHTML = `<span class="tag arrive">Arrive</span>`;

      const cls = isTransfer ? 'stop-item is-transfer' : (isFirst || isLast ? 'stop-item is-terminal' : 'stop-item');
      journeyHTML += `
        <div class="${cls}">
          <div class="stop-label">${stop}</div>
          ${tagHTML}
        </div>`;
    });

    journeyHTML += `</div></div>`;
  });

  // Live trains notice
  let liveHTML = '';
  if (onRoute.length) {
    const realTrains = onRoute.filter(t => !t.simulated);
    const simLines   = onRoute.filter(t => t.simulated);

    let notices = [];

    if (realTrains.length) {
      const names = realTrains.map(t => t.coupled_with ? `#${t.number}+${t.coupled_with}` : `#${t.number}`).join(', ');
      notices.push(`<strong>Live:</strong> Train${realTrains.length > 1 ? 's' : ''} ${names} ${realTrains.length > 1 ? 'are' : 'is'} currently active on this route.`);
    }

    if (simLines.length) {
      for (const s of simLines) {
        notices.push(`<strong>${s.route} Line:</strong> Scheduled service every ~${s.headway} min · next train in ~${s.nextMins} min.`);
      }
    }

    liveHTML = notices.map(n => `
      <div class="route-notice is-live">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div>${n}</div>
      </div>`).join('');
  }

  card.style.display = 'block';
  card.innerHTML = `
    <div class="result-hero">
      <div>
        <div class="result-from-to">${start} <span class="arrow">→</span> ${end}</div>
        <div class="result-summary">${segments.length} line${segments.length > 1 ? 's' : ''} · ${totalStops} stop${totalStops !== 1 ? 's' : ''} · ~${estMins} min</div>
      </div>
      <div class="stats-strip">
        <div class="stat-item">
          <div class="stat-num">${totalStops}</div>
          <div class="stat-lbl">Stops</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">${transfers}</div>
          <div class="stat-lbl">Transfer${transfers !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">~${estMins}</div>
          <div class="stat-lbl">Minutes</div>
        </div>
      </div>
    </div>
    <div class="journey">${journeyHTML}</div>
    ${liveHTML}
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
loadLiveTrains();
setInterval(loadLiveTrains, 30000);
