// init/seed.mjs — first-boot demo data for the EDMS stack.
//
// Builds a realistic dataset through the public HTTP/WS API only:
//   1. 30 endpoints across 11 public test APIs. Each is created by actually
//      being RUN (the backend makes the call), so it carries real request /
//      response / headers data and a genuine history entry - "an endpoint
//      exists because it was tested".
//   2. 4 themed Collections holding them.
//   3. A RepoView per Collection (annotations, row tags, Index Tables), plus
//      one combined RepoView built with Combine-by-tag.
//   4. 3 WebViews with front pages in the rich-text editor's JSON format.
//
// Safe by default: if the backend already has endpoints it does nothing, so
// a real database is never polluted. Set SEED_FORCE=1 to seed into a
// database that already has data (existing endpoints with the same URL +
// method are reused, not duplicated). Every step also checks whether its
// object already exists, so re-running only fills in what is missing.
//
// Runs automatically as the `seed` service in docker-compose.yml on
// `docker compose up`, then exits. Also runnable by hand:
//   EDMS_BASE=http://localhost:3000 node init/seed.mjs
//
// Requires Node 22+ (built-in fetch + WebSocket) and outbound internet from
// the backend container (it is the backend that makes the test calls).
// Offline: endpoints are still created, just without run data.

const BASE = process.env.EDMS_BASE || "http://localhost:3000";
const WS_BASE = BASE.replace(/^http/, "ws");
const FORCE = ["1", "true", "yes"].includes(String(process.env.SEED_FORCE || "").toLowerCase());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, ok: r.ok, json };
}

async function get(path) {
  const r = await fetch(BASE + path);
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, ok: r.ok, json };
}

function wsOnce(path, send, waitType, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_BASE + path);
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      try { ws.close(); } catch {}
      resolve(v);
    };
    const t = setTimeout(() => finish(null), timeoutMs);
    ws.addEventListener("open", () => {
      if (send !== undefined) ws.send(typeof send === "string" ? send : JSON.stringify(send));
    });
    ws.addEventListener("message", (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      const ty = m?.event?.type || m?.type;
      if (!waitType || ty === waitType) finish(m);
    });
    ws.addEventListener("error", (err) => {
      if (!done) { done = true; clearTimeout(t); reject(err); }
    });
  });
}

// ── data ────────────────────────────────────────────────────────────
// Real, reachable URLs (each probed before it went in: status, latency).
// `runs` is how many times to test it (>1 gives an endpoint several
// request/response sets). `col` is the Collection it belongs to.

const JP = "https://jsonplaceholder.typicode.com";
const HB = "https://httpbin.org";
const PE = "https://postman-echo.com";

const ENDPOINTS = [
  // placeholder-posts — a fake blog REST API
  { col: "placeholder-posts", method: "GET",    url: `${JP}/posts`,            note: "List all posts.", runs: 2 },
  { col: "placeholder-posts", method: "GET",    url: `${JP}/posts/1`,          note: "Fetch one post by ID.", runs: 1 },
  { col: "placeholder-posts", method: "GET",    url: `${JP}/posts/1/comments`, note: "Comments on a post.", runs: 1 },
  { col: "placeholder-posts", method: "GET",    url: `${JP}/users/1`,          note: "Fetch the author's profile.", runs: 1 },
  { col: "placeholder-posts", method: "POST",   url: `${JP}/posts`,            note: "Create a post (simulated - nothing is persisted).", runs: 1 },
  { col: "placeholder-posts", method: "PUT",    url: `${JP}/posts/1`,          note: "Replace a post.", runs: 1 },
  { col: "placeholder-posts", method: "DELETE", url: `${JP}/posts/1`,          note: "Delete a post.", runs: 1 },
  { col: "placeholder-posts", method: "GET",    url: `${JP}/posts/9999`,       note: "A post that does not exist: expect 404.", runs: 1, errorCase: true },

  // http-echo-tests — services that echo the request back
  { col: "http-echo-tests", method: "GET",    url: `${HB}/get`,              note: "Echo a GET request.", runs: 2 },
  { col: "http-echo-tests", method: "POST",   url: `${HB}/post`,             note: "Echo a POST body.", runs: 1 },
  { col: "http-echo-tests", method: "PUT",    url: `${HB}/put`,              note: "Echo a PUT body.", runs: 1 },
  { col: "http-echo-tests", method: "PATCH",  url: `${HB}/patch`,            note: "Echo a PATCH body.", runs: 1 },
  { col: "http-echo-tests", method: "DELETE", url: `${HB}/delete`,           note: "Echo a DELETE request.", runs: 1 },
  { col: "http-echo-tests", method: "GET",    url: `${HB}/status/404`,       note: "Always answers 404 Not Found.", runs: 1, errorCase: true },
  { col: "http-echo-tests", method: "GET",    url: `${HB}/status/401`,       note: "Always answers 401 Unauthorized.", runs: 1, errorCase: true },
  { col: "http-echo-tests", method: "GET",    url: `${HB}/uuid`,             note: "Return a fresh random UUID.", runs: 1 },
  { col: "http-echo-tests", method: "GET",    url: `${PE}/get?foo=bar`,      note: "Echo a GET with a query string.", runs: 1 },
  { col: "http-echo-tests", method: "POST",   url: `${PE}/post`,             note: "Echo a POST body.", runs: 1 },
  { col: "http-echo-tests", method: "GET",    url: `${PE}/status/201`,       note: "Always answers 201 Created.", runs: 1 },

  // open-data — public reference data
  { col: "open-data", method: "GET", url: "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current_weather=true", note: "Current weather for Berlin.", runs: 1 },
  { col: "open-data", method: "GET", url: "https://restcountries.com/v3.1/name/france",              note: "Country details by name.", runs: 1 },
  { col: "open-data", method: "GET", url: "https://openlibrary.org/search.json?q=the+hobbit&limit=3", note: "Book search.", runs: 1 },
  { col: "open-data", method: "GET", url: "https://api.agify.io/?name=michael",                       note: "Predict an age from a first name.", runs: 1 },
  { col: "open-data", method: "GET", url: "https://fakestoreapi.com/products?limit=3",                note: "Sample store products.", runs: 1 },

  // fun-apis — small, friendly APIs
  { col: "fun-apis", method: "GET", url: "https://pokeapi.co/api/v2/pokemon/ditto",   note: "One Pokemon, with its full detail (a large response).", runs: 1 },
  { col: "fun-apis", method: "GET", url: "https://pokeapi.co/api/v2/pokemon?limit=5", note: "A page of Pokemon names.", runs: 1 },
  { col: "fun-apis", method: "GET", url: "https://catfact.ninja/fact",                note: "A random cat fact.", runs: 1 },
  { col: "fun-apis", method: "GET", url: "https://catfact.ninja/breeds?limit=3",      note: "Cat breeds, paginated.", runs: 1 },
  { col: "fun-apis", method: "GET", url: "https://dog.ceo/api/breeds/image/random",   note: "A random dog picture.", runs: 1 },
  { col: "fun-apis", method: "GET", url: "https://official-joke-api.appspot.com/random_joke", note: "A random joke.", runs: 1 },
];

const COLLECTIONS = [
  { name: "placeholder-posts", annotation: "CRUD against a fake blog API (JSONPlaceholder)." },
  { name: "http-echo-tests",   annotation: "Echo services for testing methods, status codes and bodies." },
  { name: "open-data",         annotation: "Public reference data: weather, countries, books, names, products." },
  { name: "fun-apis",          annotation: "Small friendly APIs: Pokemon, cats, dogs and jokes." },
];

// RepoViews: one per Collection. `tags` are the view's own editable tags.
const REPOVIEWS = [
  { name: "blog-api",      col: "placeholder-posts", tags: ["stable", "crud"],         approach: "endpoint_segments", annotation: "The blog REST API, every CRUD method." },
  { name: "echo-suite",    col: "http-echo-tests",   tags: ["stable", "http-basics"],  approach: "sorted_tags",       annotation: "Methods and status codes, including the deliberate 401/404 cases." },
  { name: "reference-data", col: "open-data",        tags: ["public", "stable"],       approach: "endpoint_segments", annotation: "Read-only public data sources." },
  { name: "playground",    col: "fun-apis",          tags: ["experimental"],           approach: "sorted_tags",       annotation: "Fun APIs; some responses change on every call." },
];
const COMBINED = { name: "all-stable", tags: ["stable"], annotation: "Everything tagged stable, combined." };

// ── rich-text editor documents (what a WebView front page stores) ───
const text = (t, marks) => (marks ? { type: "text", text: t, marks } : { type: "text", text: t });
const heading = (level, t) => ({ type: "heading", attrs: { level }, content: [text(t)] });
const para = (...parts) => ({ type: "paragraph", content: parts.map((p) => (typeof p === "string" ? text(p) : p)) });
const bullets = (items) => ({
  type: "bulletList",
  content: items.map((i) => ({ type: "listItem", content: [para(i)] })),
});
const doc = (...content) => ({ type: "doc", content });

const WEBVIEWS = [
  {
    name: "http-testing-guide", col: "http-echo-tests", tags: ["guide"],
    annotation: "How to read the echo endpoints.",
    page: doc(
      heading(1, "HTTP testing guide"),
      para("These endpoints echo what they receive, so you can check ", text("methods", [{ type: "bold" }]), ", bodies and status codes."),
      heading(2, "What is in here"),
      bullets(["GET, POST, PUT, PATCH and DELETE against httpbin.org", "Fixed status codes: 201, 401 and 404", "A UUID endpoint whose answer changes on every call"]),
      para("Run any of them from Test View, then open its request, response and headers."),
    ),
  },
  {
    name: "public-data-guide", col: "open-data", tags: ["guide", "public"],
    annotation: "Where the reference data comes from.",
    page: doc(
      heading(1, "Public data sources"),
      para("Read-only APIs that need no key."),
      bullets(["Open-Meteo: current weather", "REST Countries: country details", "Open Library: book search", "Agify: age from a first name", "Fake Store API: sample products"]),
    ),
  },
  {
    name: "fun-apis-page", col: "fun-apis", tags: ["fun"],
    annotation: "A lighter page.",
    page: doc(
      heading(1, "Fun APIs"),
      para("Pokemon, cats, dogs and jokes. Some answers change on every call, so run them twice."),
      heading(2, "Try this"),
      bullets(["Fetch a cat fact, then a random dog", "Compare two runs of the joke endpoint"]),
    ),
  },
];

const EXTRA_HISTORY = [
  "200 OK in 41ms", "200 OK in 63ms", "201 Created in 88ms",
  "204 No Content in 33ms", "400 Bad Request in 22ms",
  "401 Unauthorized in 18ms", "404 Not Found in 19ms",
  "429 Too Many Requests in 12ms", "500 Server Error in 120ms",
];

// ── steps ───────────────────────────────────────────────────────────

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + "/home");
      if (r.ok) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`backend at ${BASE} never came up`);
}

async function hasEndpoints() {
  const snap = await wsOnce("/test-view/endpoints/load", undefined, "snapshot");
  return (snap?.endpoints?.length || 0) > 0;
}

// The EID of an endpoint that already exists for this exact URL + method.
async function lookupEid(e) {
  const q = `endpoint_str=${encodeURIComponent(e.url)}&method=${encodeURIComponent(e.method)}`;
  const r = await get(`/endpoints/lookup?${q}`);
  return r.ok ? r.json?.endpoint?.endpoint_id ?? null : null;
}

async function runOnce(e, eid) {
  const payload = { endpoint_str: e.url, method: e.method, body: {}, timeout_ms: 8000, tick_interval_ms: 300 };
  if (eid) payload.endpoint_id = eid;
  else payload.annotation = e.note;
  return wsOnce("/test-view/run", { type: "run_test", payload }, "TestFinished", 18000);
}

// Create-by-running: the first run (no endpoint_id) creates + tests the
// endpoint; extra runs reuse the allocated id. Returns the EID, or null if
// the run never reported back (e.g. offline). One retry for a flaky host.
async function seedEndpoint(e) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const first = await runOnce(e, null);
    const eid = first?.event?.payload?.endpoint_id;
    if (eid) {
      for (let k = 1; k < (e.runs || 1); k++) await runOnce(e, eid);
      return eid;
    }
    await sleep(1500);
  }
  return null;
}

// Endpoint tags by what the endpoint does, so Tags and the lists have
// something real to show.
function tagsFor(e) {
  const tags = [e.method === "GET" ? "read-only" : "write"];
  if (e.errorCase) tags.push("error-case");
  if (/httpbin|postman-echo/.test(e.url)) tags.push("echo");
  if (e.col === "open-data") tags.push("public-data");
  return tags;
}

async function ensureCollection(c, eidsByCol) {
  const exists = (await get(`/collections/${encodeURIComponent(c.name)}`)).ok;
  if (!exists) await post("/collections/create", { name: c.name, annotation: c.annotation });
  const members = (await get(`/collections/${encodeURIComponent(c.name)}/endpoints`)).json;
  const have = new Set((members?.endpoints || members?.items || []).map((m) => m.endpoint_id || m));
  let added = 0;
  for (const eid of eidsByCol[c.name] || []) {
    if (have.has(eid)) continue;
    await post("/test-view/save/bookmark", { collection: c.name, endpoint_id: eid, notes: "" });
    const saved = await post(`/bookmarks/${encodeURIComponent(c.name)}/${eid}/save`);
    if (saved.ok) added++;
  }
  return { created: !exists, added };
}

async function ensureRepoview(v) {
  if ((await get(`/repoview/${encodeURIComponent(v.name)}`)).ok) return false;
  const made = await post("/repoview/create", { name: v.name, annotation: v.annotation, source_collection: v.col });
  if (!made.ok) {
    console.log(`[seed]   repoview '${v.name}' failed: ${made.json?.error}`);
    return false;
  }
  for (const t of v.tags) await post(`/repoview/${encodeURIComponent(v.name)}/membership-tags/add`, { tag: t });
  await post(`/repoview/${encodeURIComponent(v.name)}/tables/generate`, { approach: v.approach });
  return true;
}

async function ensureWebview(w) {
  if ((await get(`/webview/${encodeURIComponent(w.name)}`)).ok) return false;
  const made = await post("/webview/create", { name: w.name, annotation: w.annotation, source_collection: w.col });
  if (!made.ok) {
    console.log(`[seed]   webview '${w.name}' failed: ${made.json?.error}`);
    return false;
  }
  for (const t of w.tags) await post(`/webview/${encodeURIComponent(w.name)}/membership-tags/add`, { tag: t });
  await post(`/webview/${encodeURIComponent(w.name)}/front-page`, { front_page: w.page });
  return true;
}

async function main() {
  console.log(`[seed] target ${BASE}`);
  await waitForServer();

  const populated = await hasEndpoints();
  if (populated && !FORCE) {
    console.log("[seed] backend already has endpoints — nothing to do (SEED_FORCE=1 to seed anyway).");
    return;
  }

  // 1. endpoints: reuse one that already exists, otherwise create-by-running.
  console.log(`[seed] creating + running ${ENDPOINTS.length} endpoints …`);
  let ran = 0;
  let reused = 0;
  const eidFor = new Map();
  const freshKeys = new Set(); // created by this run (history is added only for these)
  for (const e of ENDPOINTS) {
    const key = `${e.method} ${e.url}`;
    let eid = await lookupEid(e);
    if (eid) {
      reused++;
    } else {
      eid = await seedEndpoint(e);
      if (eid) {
        ran++;
        freshKeys.add(key);
      }
    }
    if (eid) eidFor.set(key, eid);
  }
  console.log(`[seed] ${eidFor.size}/${ENDPOINTS.length} endpoints ready (${ran} run now, ${reused} already existed)`);
  if (eidFor.size === 0) throw new Error("no endpoints were created — is the backend reachable and online?");

  // 2. tags + a little extra history on the endpoints made this run.
  console.log("[seed] tagging …");
  const tagged = ENDPOINTS.filter((e) => eidFor.has(`${e.method} ${e.url}`));
  for (const e of tagged) {
    for (const t of tagsFor(e)) await post(`/tags/${eidFor.get(`${e.method} ${e.url}`)}/add`, { tag: t });
  }
  console.log("[seed] extra history …");
  const fresh = tagged.filter((e) => freshKeys.has(`${e.method} ${e.url}`));
  for (const [i, e] of fresh.slice(0, 12).entries()) {
    await post("/test-view/save/history", {
      endpoint_id: eidFor.get(`${e.method} ${e.url}`),
      action: "test",
      details: EXTRA_HISTORY[i % EXTRA_HISTORY.length],
    });
  }

  // 3. collections
  console.log("[seed] collections …");
  const eidsByCol = {};
  for (const e of tagged) (eidsByCol[e.col] ||= []).push(eidFor.get(`${e.method} ${e.url}`));
  for (const c of COLLECTIONS) {
    const r = await ensureCollection(c, eidsByCol);
    console.log(`[seed]   ${c.name}: ${r.created ? "created" : "exists"}, ${r.added} added`);
  }
  // Leave fun-apis with two bookmarks that are NOT saved into it, so
  // Bookmark View shows both states.
  const spare = [...eidFor.values()].filter((id) => !(eidsByCol["fun-apis"] || []).includes(id)).slice(0, 2);
  for (const id of spare) await post("/test-view/save/bookmark", { collection: "fun-apis", endpoint_id: id, notes: "" });

  // 4. RepoViews, then one combined by tag
  console.log("[seed] repoviews …");
  let views = 0;
  for (const v of REPOVIEWS) if (await ensureRepoview(v)) views++;
  if (!(await get(`/repoview/${encodeURIComponent(COMBINED.name)}`)).ok) {
    const c = await post("/repoview/combine", { name: COMBINED.name, tags: COMBINED.tags, annotation: COMBINED.annotation });
    if (c.ok) {
      views++;
      await post(`/repoview/${encodeURIComponent(COMBINED.name)}/tables/generate`, { approach: "sorted_tags" });
    } else {
      console.log(`[seed]   combine '${COMBINED.name}' failed: ${c.json?.error}`);
    }
  }

  // 5. WebViews
  console.log("[seed] webviews …");
  let pages = 0;
  for (const w of WEBVIEWS) if (await ensureWebview(w)) pages++;

  console.log(
    `[seed] done — ${eidFor.size} endpoints, ${COLLECTIONS.length} collections, ${views} repoviews, ${pages} webviews, tags + history populated.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[seed] FAILED:", e);
    process.exit(1);
  });
