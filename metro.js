// ---- Metro System ----
const metroSystem = {
  stations: [
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

    // B Line stations
    "Couch Chair Park",
    "Dine Park",
    "TV Central",
    "North Hollowwood",

    // D Line station
    "William Western"
  ],

  connections: [
    // A Line
    { from: "Union Station", to: "Downtown Lego City", line: "A" },
    { from: "Downtown Lego City", to: "Airport Metro Transit Center", line: "A" },
    { from: "Airport Metro Transit Center", to: "Death Star City", line: "A" },
    { from: "Death Star City", to: "Downtown Santa Mooica", line: "A" },

    // B Line
    { from: "Union Station", to: "Airport Metro Transit Center", line: "B" },
    { from: "Airport Metro Transit Center", to: "Couch Chair Park", line: "B" },
    { from: "Couch Chair Park", to: "Dine Park", line: "B" },
    { from: "Dine Park", to: "TV Central", line: "B" },
    { from: "TV Central", to: "North Hollowwood", line: "B" },

    // D Line
    { from: "Union Station", to: "Airport Metro Transit Center", line: "D" },
    { from: "Airport Metro Transit Center", to: "William Western", line: "D" },

    // E Line
    { from: "Union Station", to: "Downtown Lego City", line: "E" },
    { from: "Downtown Lego City", to: "Emergency HQ", line: "E" },
    { from: "Emergency HQ", to: "Airport Metro Transit Center", line: "E" },
    { from: "Airport Metro Transit Center", to: "Desktop Hills", line: "E" },
    { from: "Desktop Hills", to: "Table Central", line: "E" },

    // F Line
    { from: "FLX T2", to: "Airport Metro Transit Center", line: "F" },

    // K Line
    { from: "Asian Town", to: "Union Station", line: "K" }
  ]
};

// ---- Build Graph ----
const graph = {};
metroSystem.stations.forEach(s => (graph[s] = []));

metroSystem.connections.forEach(c => {
  if (!graph[c.from] || !graph[c.to]) return;
  graph[c.from].push({ station: c.to, line: c.line });
  graph[c.to].push({ station: c.from, line: c.line });
});

// ---- Populate Dropdowns ----
const startSelect = document.getElementById("start");
const endSelect = document.getElementById("end");

startSelect.innerHTML = "";
endSelect.innerHTML = "";

metroSystem.stations.forEach(st => {
  startSelect.appendChild(new Option(st, st));
  endSelect.appendChild(new Option(st, st));
});

// ---- BFS Pathfinding ----
function findRoute(graph, start, end) {
  const queue = [{ station: start, path: [] }];
  const visited = new Set();

  while (queue.length > 0) {
    const { station, path } = queue.shift();
    if (station === end) return path;

    if (visited.has(station)) continue;
    visited.add(station);

    for (const next of graph[station]) {
      queue.push({
        station: next.station,
        path: [...path, { from: station, to: next.station, line: next.line }]
      });
    }
  }
  return null;
}

// ---- Display Route ----
function planTrip() {
  const start = startSelect.value;
  const end = endSelect.value;
  const result = document.getElementById("result");

  if (!start || !end) {
    result.textContent = "Please select both stations.";
    return;
  }

  const route = findRoute(graph, start, end);
  if (!route) {
    result.textContent = "No route found!";
    return;
  }

  let output = `Trip from ${start} to ${end}:\n\n`;
  let currentLine = null;

  route.forEach((step, index) => {
    // First step
    if (index === 0) {
      currentLine = step.line;
      output += `— Take ${currentLine} Line —\n`;
    }

    // Transfer
    if (step.line !== currentLine) {
      output += `\nTransfer to ${step.line} Line at ${step.from}\n`;
      output += `— Take ${step.line} Line —\n`;
      currentLine = step.line;
    }

    output += `${step.from} → ${step.to}\n`;
  });

  output += `\nArrive at ${end}`;

  result.textContent = output;
}


  route.forEach(step => {
    if (step.line !== currentLine) {
      currentLine = step.line;
      output += `— Take ${currentLine} Line —\n`;
    }
    output += `${step.from} → ${step.to}\n`;
  });

  result.textContent = output;
}
