/* Tester av beräkningarna och logiken i index.html.

   Kör:  node unit.mjs
   Kräver jsdom, som installeras lokalt utan att någon paketfil skapas:
         npm install --no-save --no-package-lock jsdom

   run.mjs går igenom gränssnittet och survey.mjs GPS-inmätningen. Den här
   filen kontrollerar att siffrorna stämmer: våttemperatur, startgränser,
   sidodrift, körfönster, spårgeometri och det som sparas i telefonen.

   Tester märkta KÄNT FEL beskriver hur appen borde bete sig men inte gör än.
   De visas som "todo" och fäller inte körningen. När felet är rättat tas
   markeringen bort, så att testet i stället vaktar rättelsen.

   Inga riktiga nätanrop: Chart.js, Leaflet och fetch byts mot attrapper. */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";

const HTML = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const SW = readFileSync(new URL("./sw.js", import.meta.url), "utf8");
const H = 3600000;

/* ---------- attrapper ---------- */

// Leaflet ersätts av ett objekt som svarar på allt och returnerar sig självt.
// Klickhanterare sparas, så att ett test kan "trycka" på kartan.
function chain() {
  const props = {}, handlers = {};
  const p = new Proxy(function () {}, {
    get(_, k) {
      if (k in props) return props[k];
      if (k === "on") return (ev, h) => { (handlers[ev] ||= []).push(h); return p; };
      if (k === "_handlers") return handlers;
      if (k === Symbol.toPrimitive) return () => "";
      if (k === "then") return undefined;
      return (props[k] = chain());
    },
    set(_, k, v) { props[k] = v; return true; },
    apply() { return chain(); }
  });
  return p;
}

// Påhittad Open-Meteo-prognos. `f(ts)` ger vädret vid en tidpunkt.
function weather(f, now = Date.now()) {
  const block = (step, n) => {
    const t0 = Math.floor(now / step) * step;
    const o = { time: [], temperature_2m: [], relative_humidity_2m: [], wind_speed_10m: [],
                wind_gusts_10m: [], wind_direction_10m: [], surface_pressure: [] };
    for (let i = 0; i < n; i++) {
      const ts = t0 + i * step, w = f(ts);
      o.time.push(ts / 1000);
      o.temperature_2m.push(w.temp); o.relative_humidity_2m.push(w.rh);
      o.wind_speed_10m.push(w.wind); o.wind_gusts_10m.push(w.gust ?? w.wind * 1.4);
      o.wind_direction_10m.push(w.dir); o.surface_pressure.push(w.pressure ?? 1013);
    }
    return o;
  };
  return { hourly: block(H, 240), minutely_15: block(H / 4, 288) };
}

const COLD_NIGHT = () => ({ temp: -6, rh: 70, wind: 3, dir: 270 });

function okResponse(data) { return { ok: true, json: async () => data }; }

/* Laddar appen i jsdom. `storage` är localStorage före start, `fetch` kan
   bytas ut för att simulera nätfel eller långsamma svar. */
async function loadApp({ storage = {}, wx = COLD_NIGHT, fetch, url = "https://gkrallo.github.io/snowgun-forecast/", setup } = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(e.message));
  vc.on("error", e => errors.push(String(e)));
  const data = weather(wx);
  const dom = new JSDOM(HTML, {
    url, runScripts: "dangerously", virtualConsole: vc,
    beforeParse(w) {
      w.Chart = class {
        constructor(ctx, cfg) {
          this.config = cfg; this.data = cfg.data; this.options = cfg.options;
          this.scales = { x: { min: 0, max: 0 } };
          (w.__charts ||= []).push(this);
        }
        destroy() { w.__charts = w.__charts.filter(c => c !== this); }
        resize() {} update() {}
        zoomScale(axis, r) { this.scales.x.min = r.min; this.scales.x.max = r.max; }
      };
      w.L = chain();
      w.fetch = fetch || (async () => okResponse(data));
      w.HTMLCanvasElement.prototype.getContext = () => chain();
      w.matchMedia = () => ({ matches: false });
      w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
      for (const [k, v] of Object.entries(storage)) {
        w.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
      }
      setup?.(w);
    }
  });
  const win = dom.window;
  const app = {
    win, errors,
    $: id => win.document.getElementById(id),
    // Kör kod i appens globala räckvidd, så att även let/const går att nå.
    run: code => win.eval(code),
    // Hämtar ett värde som vanlig JSON, så att jämförelser inte snubblar på
    // att arrayer från jsdom har en annan prototyp än Nodes egna.
    get: code => JSON.parse(win.eval(`JSON.stringify(${code})`)),
    settle: async (n = 40) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 2)); },
    close: () => win.close()
  };
  for (let i = 0; i < 200; i++) {
    if (app.run("fetchedAt") !== null || app.$("err").textContent) break;
    await new Promise(r => setTimeout(r, 5));
  }
  return app;
}

// En tidpunkt att bedöma, med våttemperaturen given direkt.
function point(wb, extra = {}) {
  return { x: Date.now(), temp: wb + 1, rh: 80, wind: 1, gust: 1.5, dir: 0, pressure: 1013, wb, ...extra };
}

/* ======================================================================== */

describe("Våttemperatur", () => {
  let app;
  before(async () => { app = await loadApp(); });
  after(() => app.close());

  test("0 °C och 90 % ger ungefär −0,6 °C (kalibreringspunkten i CLAUDE.md)", () => {
    assert.ok(Math.abs(app.win.wetBulbPsychrometric(0, 90, 1013.25) - -0.6) < 0.1);
  });

  test("i mättad luft är våttemperaturen lika med lufttemperaturen", () => {
    for (const T of [-12, -4, 0, 3]) {
      assert.ok(Math.abs(app.win.wetBulbPsychrometric(T, 100, 1013.25) - T) < 0.05, `T=${T}`);
    }
  });

  test("våttemperaturen är aldrig högre än lufttemperaturen och stiger med fukten", () => {
    for (let T = -15; T <= 8; T += 1) {
      let prev = -Infinity;
      for (let rh = 20; rh <= 100; rh += 10) {
        const wb = app.win.wetBulbPsychrometric(T, rh, 1013.25);
        assert.ok(wb <= T + 1e-6, `T=${T} rh=${rh} gav ${wb}`);
        assert.ok(wb >= prev, `T=${T} rh=${rh} sjönk`);
        prev = wb;
      }
    }
  });

  test("lägre lufttryck ger lägre våttemperatur", () => {
    assert.ok(app.win.wetBulbPsychrometric(0, 50, 900) < app.win.wetBulbPsychrometric(0, 50, 1013));
  });

  test("saknat lufttryck räknas som standardtryck", () => {
    assert.equal(app.win.wetBulbPsychrometric(0, 60, undefined), app.win.wetBulbPsychrometric(0, 60, 1013.25));
  });

  test("Stull räknar kallare än den psykrometriska vid hög luftfuktighet", () => {
    for (const [T, rh] of [[0, 90], [-3, 85], [-5, 90], [2, 90]]) {
      const d = app.win.wetBulbPsychrometric(T, rh, 1013.25) - app.win.wetBulbStull(T, rh);
      assert.ok(d > 0.2 && d < 0.7, `T=${T} rh=${rh}: skillnad ${d.toFixed(2)}`);
    }
  });

  test("kalibreringen läggs på i wetBulbAdj men inte i wetBulb", () => {
    const S = app.run("S");
    S.wbOffset = 1.5;
    try {
      const d = app.run("wetBulbAdj(-2, 80, 1013) - wetBulb(-2, 80, 1013)");
      assert.ok(Math.abs(d - 1.5) < 1e-9);
    } finally { S.wbOffset = 0; }
  });

  test("modellvalet Stull byter formel", () => {
    const S = app.run("S");
    S.wbModel = "stull";
    try {
      assert.equal(app.run("wetBulb(-1, 85, 1013)"), app.win.wetBulbStull(-1, 85));
    } finally { S.wbModel = "psychro"; }
  });

  test("ogiltig indata ger NaN och bedöms som Vänta", () => {
    assert.ok(Number.isNaN(app.run("wetBulb(NaN, 80, 1013)")));
    assert.equal(app.win.assess(point(NaN)).state, "stop");
  });

  test("tabellen i infokapitlet stämmer med appens egen beräkning", () => {
    const rows = [...app.run("INFO.c2").matchAll(/<tr><td>([+−-]?\d+) °C<\/td><td>(\d+) %<\/td><td>([+−-]?\d+,\d) °C<\/td>/g)];
    assert.equal(rows.length, 4);
    for (const [, t, rh, wb] of rows) {
      const T = +t.replace("−", "-"), shown = +wb.replace("−", "-").replace(",", ".");
      const calc = app.win.wetBulbPsychrometric(T, +rh, 1013.25);
      assert.ok(Math.abs(calc - shown) <= 0.15, `${t} °C/${rh} %: tabellen säger ${wb}, appen räknar ${calc.toFixed(2)}`);
    }
  });

  test("tabellens bedömning säger inte Kör där appen själv säger Vänta", () => {
    // +2 °C/30 % stod en gång som "går att köra" fast appen visar Vänta där.
    const th = app.get("thresholds()");
    const rows = [...app.run("INFO.c2").matchAll(/<td>([+−-]?\d+,\d) °C<\/td><td style="color:var\(--(\w+)\)">([^<]+)</g)];
    assert.equal(rows.length, 4);
    for (const [, wb, colour, word] of rows) {
      const v = +wb.replace("−", "-").replace(",", ".");
      if (colour === "go") assert.ok(v <= th.base - 0.5, `${wb} °C märkt "${word}" men ligger vid gränsen`);
      if (colour === "stop") assert.ok(v > th.base, `${wb} °C märkt "${word}" men går att köra`);
    }
  });
});

describe("Startgräns, kvalitet och kapacitet", () => {
  let app;
  before(async () => { app = await loadApp(); });
  after(() => app.close());
  const reset = () => app.run("Object.assign(S, DEFAULTS)");

  test("startgränsen flyttas av vattentemperaturen men inte av kvalitetsvalet", () => {
    reset();
    const S = app.run("S");
    S.waterTemp = 0.5;
    assert.equal(app.get("thresholds()").base, S.fanBase);
    S.quality = 1; const b1 = app.get("thresholds()").base;
    S.quality = 10; const b10 = app.get("thresholds()").base;
    assert.equal(b1, b10);
    S.waterTemp = 4.5;
    assert.ok(Math.abs(app.get("thresholds()").base - (S.fanBase - 0.6)) < 1e-9);
    reset();
  });

  test("kör/vänta följer startgränsen, inte målkvaliteten", () => {
    reset();
    const th = app.get("thresholds()");
    const between = app.win.assess(point((th.base + th.target) / 2));
    assert.equal(between.state, "marginal");
    assert.match(between.reasons.join(" "), /kvalitet/);
    assert.equal(app.win.assess(point(th.base + 0.3)).state, "stop");
    assert.equal(app.win.assess(point(th.target - 1)).state, "go");
  });

  test("lansens startgräns innehåller inte kvalitetsvalet", () => {
    reset();
    const S = app.run("S");
    const wb = S.lanceBase - app.win.waterOffset(S.waterTemp) - 0.5;
    assert.ok(app.win.assess(point(wb)).lanceCap > 0, `vid ${wb.toFixed(2)} °C ska lansen gå`);
  });

  test("kapaciteten är noll över gränsen och växer mot 100 % under den", () => {
    const cap = wb => app.win.capacity(wb, -2.5, 0.5);
    assert.equal(cap(-2), 0);
    assert.ok(cap(-3) > 0);
    assert.ok(cap(-8) > cap(-4));
    assert.ok(cap(-40) <= 100 && cap(-40) > 95);
  });

  test("varmare vatten sänker kapaciteten", () => {
    assert.ok(app.win.capacity(-6, -2.5, 4) < app.win.capacity(-6, -2.5, 0.5));
  });

  test("uppnåbar kvalitet: 10 vid gränsen, 1 långt under, ingen över", () => {
    reset();
    const base = app.run("S.fanBase");
    assert.equal(app.win.achievableQuality(base, 0.5), 10);
    assert.equal(app.win.achievableQuality(base - 3.6, 0.5), 1);
    assert.equal(app.win.achievableQuality(base + 0.2, 0.5), null);
  });
});

describe("Vind och sidodrift", () => {
  let app;
  before(async () => { app = await loadApp(); });
  after(() => app.close());

  test("vind från norr blåser rakt tvärs ett öst–västligt spår och längs ett nord–sydligt", () => {
    const ew = app.win.windGeometry(4, 0, 90), ns = app.win.windGeometry(4, 0, 0);
    assert.equal(ew.blowsTo, 180);
    assert.ok(Math.abs(ew.crossAbs - 4) < 1e-9);
    assert.ok(ns.crossAbs < 1e-9);
  });

  test("sidodriften följer tvärvind × fallhöjd / 1,2 × spridningsfaktor", () => {
    const S = app.run("S");
    S.fanHeight = 6; S.lanceHeight = 7.2;
    try {
      assert.ok(Math.abs(app.win.driftDistance(2, "fan").centre - 2 * 5 * 0.6) < 1e-9);
      assert.ok(Math.abs(app.win.driftDistance(2, "lance").centre - 2 * 6 * 0.9) < 1e-9);
    } finally { app.run("Object.assign(S, DEFAULTS)"); }
  });

  test("stoppgränsen gäller både medelvind och byar", () => {
    const S = app.run("S");
    assert.equal(app.win.assess(point(-8, { wind: 4, gust: S.windStop })).state, "stop");
    assert.equal(app.win.assess(point(-8, { wind: S.windStop, gust: null })).state, "stop");
    assert.notEqual(app.win.assess(point(-8, { wind: 1, gust: 2 })).state, "stop");
  });
});

describe("Körfönster", () => {
  let app;
  before(async () => { app = await loadApp(); });
  after(() => app.close());

  // 15-minutersserie där `warm(i)` säger vilka kvartar som är för varma.
  function setSeries(n, warm) {
    const t0 = Math.floor(Date.now() / H) * H + H;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(point(warm(i) ? 1 : -8, { x: t0 + i * H / 4 }));
    app.run(`series = ${JSON.stringify(pts)}`);
    return t0;
  }

  test("ett uppehåll under en timme bryter inte fönstret", () => {
    const t0 = setSeries(48, i => i === 20 || i === 21);
    const w = app.win.findWindows(t0, t0 + 12 * H);
    assert.equal(w.length, 1);
    assert.equal(w[0].end - w[0].start, 47 * H / 4);
  });

  test("ett uppehåll på två timmar ger två fönster", () => {
    const t0 = setSeries(48, i => i >= 20 && i < 28);
    assert.equal(app.win.findWindows(t0, t0 + 12 * H).length, 2);
  });

  test("ett fönster kortare än en timme räknas inte", () => {
    const t0 = setSeries(48, i => i < 10 || i > 13);
    assert.equal(app.win.findWindows(t0, t0 + 12 * H).length, 0);
  });
});

describe("Spårgeometri", () => {
  let app;
  before(async () => { app = await loadApp(); });
  after(() => app.close());

  const trackLength = pts => pts.slice(1).reduce((s, p, i) => s + app.win.haversine(pts[i], p), 0);

  test("det inbyggda Sparbanksspåret är 2,3 km och slutet", () => {
    const t = app.get("BUILTIN_TRACK");
    assert.ok(Math.abs(trackLength(t.pts) - t.length) / t.length < 0.01);
    assert.deepEqual(t.pts[0], t.pts[t.pts.length - 1]);
  });

  // GPX-logg: anmarsch från parkeringen, sedan tre varv med lite GPS-brus.
  // Varvet börjar mitt i spåret så att sömmen inte hamnar där slingan sluts.
  function syntheticGpx(laps = 3) {
    const base = app.get("BUILTIN_TRACK").pts.slice(0, -1);
    const k = Math.floor(base.length * 0.4);
    const loop = base.slice(k).concat(base.slice(0, k));
    const dense = [];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const n = Math.max(1, Math.round(app.win.haversine(a, b) / 3));
      for (let j = 0; j < n; j++) dense.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
    }
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
    const noisy = p => [p[0] + rnd() * 2.7e-5, p[1] + rnd() * 5.2e-5];
    const start = dense[0];
    const approach = [];
    for (let i = 50; i > 0; i--) approach.push([start[0], start[1] - i * 5.2e-5]);
    const pts = approach.concat(...Array.from({ length: laps }, () => dense)).map(noisy);
    return `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Testrunda</name><trkseg>` +
      pts.map(p => `<trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}"></trkpt>`).join("") +
      `</trkseg></trk></gpx>`;
  }

  test("ur en logg med tre varv blir ett slutet varv av rätt längd", () => {
    const raw = app.win.parseGpx(syntheticGpx(3));
    assert.equal(raw.name, "Testrunda");
    const single = app.win.buildTrack(raw, { singleLap: true, tolerance: 3 });
    const whole = app.win.buildTrack(raw, { singleLap: false, tolerance: 3 });
    const expected = app.run("BUILTIN_TRACK.length");
    assert.ok(Math.abs(single.length - expected) / expected < 0.06, `varvet blev ${single.length} m`);
    assert.ok(app.win.haversine(single.pts[0], single.pts[single.pts.length - 1]) < 1, "varvet är inte slutet");
    assert.ok(whole.length > single.length * 1.6, "hela loggen ska kännas igen som flera varv");
  });

  test("en fil utan spårpunkter ger ett begripligt fel", () => {
    assert.throws(() => app.win.parseGpx(`<gpx><trk><trkseg></trkseg></trk></gpx>`), /Hittade inga spårpunkter/);
    assert.throws(() => app.win.parseGpx(`det här är <inte xml`), /gick inte att läsa/);
  });

  test("ett aggregat räknas inte mot returslingan några meter bort", () => {
    // Punkten ligger på utbenet söder om parkeringen. Returbenet går
    // parallellt sju meter österut och får inte räknas in.
    const g = { id: "t", type: "fan", lat: 58.5040, lon: 13.0878 };
    const cov = app.win.gunCoverage(g);
    const radius = app.run("S.fanDist");
    assert.ok(cov.offset < 2, `${cov.offset} m från spåret`);
    assert.ok(cov.covered <= 2 * radius * 1.1, `täcker ${Math.round(cov.covered)} m, max ${2 * radius}`);
  });
});

describe("Brunnar", () => {
  let app;
  before(async () => { app = await loadApp(); });
  after(() => app.close());
  const parse = txt => JSON.parse(JSON.stringify(app.win.parseWellText(txt))).map(({ no, lat, lon }) => ({ no, lat, lon }));

  test("koordinater i formaten som hjälptexten nämner", () => {
    assert.deepEqual(parse("1 58.50123 13.08812"), [{ no: 1, lat: 58.50123, lon: 13.08812 }]);
    assert.deepEqual(parse("58.50123, 13.08812"), [{ no: 1, lat: 58.50123, lon: 13.08812 }]);
    assert.deepEqual(parse("7;58,50123;13,08812"), [{ no: 7, lat: 58.50123, lon: 13.08812 }]);
  });

  test("rader utan koordinater hoppas över och numret räknas i ordning", () => {
    assert.deepEqual(parse("Brunnar\n58.5 13.08\n\n58.6 13.09"),
      [{ no: 1, lat: 58.5, lon: 13.08 }, { no: 2, lat: 58.6, lon: 13.09 }]);
  });

  test("CSV med komma mellan fälten och punkt som decimaltecken", () => {
    assert.deepEqual(parse("1,58.50123,13.08812"), [{ no: 1, lat: 58.50123, lon: 13.08812 }]);
  });

  test("Numrera från söder sätter nummer ett längst söderut", () => {
    app.run(`wells = ${JSON.stringify([
      { id: "a", no: 1, lat: 58.507, lon: 13.087 },
      { id: "b", no: 2, lat: 58.500, lon: 13.088 },
      { id: "c", no: 3, lat: 58.503, lon: 13.088 }])}`);
    app.win.renumberWellsFromSouth();
    assert.deepEqual(app.get("wells.map(w => [w.id, w.no])"), [["b", 1], ["c", 2], ["a", 3]]);
  });
});

describe("Hämtning och lagring", () => {
  test("prognosen hämtas med unixtid, inte ISO-tid utan zon", async () => {
    const app = await loadApp();
    try {
      for (const kind of ["hourly", "fine"]) {
        assert.match(app.run(`buildUrl("${kind}")`), /timeformat=unixtime/);
      }
      const d = app.get("mapBlock({ time: [1700000000], temperature_2m: [-5], relative_humidity_2m: [80], wind_speed_10m: [2], wind_direction_10m: [90] })");
      assert.equal(d[0].x, 1700000000000);
    } finally { app.close(); }
  });

  test("utan nät visas den senast sparade prognosen", async () => {
    const first = await loadApp();
    const cache = first.win.localStorage.getItem("snowCache");
    first.close();
    assert.ok(cache, "prognosen sparades inte");
    const app = await loadApp({ storage: { snowCache: cache }, fetch: async () => { throw new Error("offline"); } });
    try {
      // Den sparade prognosen visas redan innan hämtningen hunnit misslyckas,
      // så vänta in felet innan meddelandet kontrolleras.
      await app.settle();
      assert.match(app.$("err").textContent, /senast hämtade/);
      assert.ok(app.run("series.length") > 100);
      assert.notEqual(app.$("verdictWord").textContent, "Läser av");
    } finally { app.close(); }
  });

  test("ändrade inställningar sparas och finns kvar vid nästa start", async () => {
    const app = await loadApp();
    app.$("fanBase").value = "-3";
    app.$("fanBase").dispatchEvent(new app.win.Event("input"));
    const stored = app.win.localStorage.getItem("snowSettings");
    app.close();
    assert.equal(JSON.parse(stored).fanBase, -3);
    const again = await loadApp({ storage: { snowSettings: stored } });
    try { assert.equal(again.run("S.fanBase"), -3); } finally { again.close(); }
  });

  test("formulärets förval i HTML stämmer med DEFAULTS", async () => {
    const app = await loadApp();
    const defaults = app.get("DEFAULTS"), fields = app.get("SETTING_FIELDS");
    app.close();
    const doc = new JSDOM(HTML).window.document;
    for (const [id, key, numeric] of fields) {
      if (!numeric) continue;
      assert.equal(+doc.getElementById(id).getAttribute("value"), defaults[key], id);
    }
  });

  test("byter man plats under en pågående hämtning vinner den senaste platsen", async () => {
    const app = await loadApp();
    try {
      const slowCold = weather(() => ({ temp: -10, rh: 70, wind: 2, dir: 0 }));
      const fastMild = weather(() => ({ temp: 5, rh: 70, wind: 2, dir: 0 }));
      app.win.fetch = async url => {
        const lat = new URL(url).searchParams.get("latitude");
        if (lat === "59.0000") { await new Promise(r => setTimeout(r, 60)); return okResponse(slowCold); }
        return okResponse(fastMild);
      };
      app.run(`place = { lat: 59, lon: 13, name: "A" }; fetchData();`);
      app.run(`place = { lat: 60, lon: 14, name: "B" }; fetchData();`);
      await new Promise(r => setTimeout(r, 150));
      assert.equal(app.run("hourly[0].temp"), 5, "visar fel plats väder");
      const cache = JSON.parse(app.win.localStorage.getItem("snowCache"));
      assert.equal(cache.lat, 60);
      assert.equal(cache.hourly[0].temp, 5, "sparad prognos hör till fel plats");
    } finally { app.close(); }
  });
});

describe("Spår, platser och aggregat", () => {
  const ARVIKA = { snowLat: "59.6547", snowLon: "12.5903", snowName: "Arvika" };

  test("vid första start finns Sparbanksspåret en gång i platslistan", async () => {
    const app = await loadApp();
    try {
      const opts = [...app.$("favSelect").options].map(o => o.textContent);
      assert.deepEqual(opts, ["Sparbanksspåret"]);
    } finally { app.close(); }
  });

  test("vid Sparbanksspåret används det inbyggda spåret", async () => {
    const app = await loadApp();
    try { assert.equal(app.run("track && track.source"), "builtin"); } finally { app.close(); }
  });

  test("långt från Lidköping ritas inte Sparbanksspåret", async () => {
    const app = await loadApp({ storage: ARVIKA });
    try { assert.equal(app.run("track"), null); } finally { app.close(); }
  });

  test("'Ta bort inläst spår' långt från Lidköping lämnar inget spår kvar", async () => {
    const app = await loadApp({ storage: ARVIKA });
    try {
      app.run(`saveTrack({ ...BUILTIN_TRACK, pts: BUILTIN_TRACK.pts.map(p => [p[0] + 1.15, p[1] - 0.5]),
                           centre: [59.65, 12.59], source: "import", name: "Arvika" })`);
      assert.equal(app.run("track.source"), "import");
      app.$("btnBuiltin").click();
      assert.equal(app.run("track"), null);
    } finally { app.close(); }
  });

  test("tar man bort platsen man står på byts spåret till den nya platsens", async () => {
    const app = await loadApp({ storage: { ...ARVIKA, snowFavorites: [
      { id: "arv", name: "Arvika", lat: 59.6547, lon: 12.5903 },
      { id: "spb", name: "Sparbanksspåret", lat: 58.50452, lon: 13.08813 }] } });
    try {
      assert.equal(app.run("track"), null);
      app.$("favSelect").value = "arv";
      app.$("btnDelFav").click();
      await app.settle();
      assert.equal(app.run("place.name"), "Sparbanksspåret");
      assert.equal(app.run("track && track.source"), "builtin");
    } finally { app.close(); }
  });

  test("ett tryck på kartan placerar en fläkt och den sparas för spåret", async () => {
    // Vaktar mot att kartans klickhanterare hamnar efter en tidig retur igen.
    const app = await loadApp();
    try {
      app.$("tabWind").click();
      const click = app.run("planMap")._handlers.click?.[0];
      assert.ok(click, "kartan har ingen klickhanterare");
      app.$("addFan").click();
      click({ latlng: { lat: 58.5040, lng: 13.0878 } });
      assert.equal(app.run("guns.length"), 1);
      const store = JSON.parse(app.win.localStorage.getItem("snowGunsByTrack"));
      assert.equal(store.sparbanksparet.length, 1);
      assert.equal(store.sparbanksparet[0].type, "fan");
      assert.match(app.$("gunCount").textContent, /Fläkt 1\/6/);
    } finally { app.close(); }
  });

  test("'Ta bort inläst spår' vid Lidköping låter inte Sparbanksspåret följa med till nästa plats", async () => {
    // Knappen satte förut demoläget, och då ritades Sparbanksspåret även
    // över nästa plats man valde, hur långt bort den än låg.
    const app = await loadApp({ storage: { snowFavorites: [
      { id: "spb", name: "Sparbanksspåret", lat: 58.50452, lon: 13.08813 },
      { id: "arv", name: "Arvika", lat: 59.6547, lon: 12.5903 }] } });
    try {
      app.run(`saveTrack({ ...BUILTIN_TRACK, source: "import", name: "Egen runda" })`);
      app.$("btnBuiltin").click();
      assert.equal(app.run("track.source"), "builtin");
      app.$("favSelect").value = "arv";
      app.$("favSelect").dispatchEvent(new app.win.Event("change"));
      await app.settle();
      assert.equal(app.run("track"), null);
    } finally { app.close(); }
  });

  test("med två aggregat räknas det sämre lägets tvärvind", async () => {
    // Medianen över ett jämnt antal aggregat har alltid tagit det sämre av
    // de två mittersta. Den ska inte ha blivit snällare av omskrivningen.
    const app = await loadApp();
    try {
      const m = app.run(`windProfile = { mode: "guns", sets: [[0], [90]] }; crossStats(3, 270).median`);
      app.run("invalidateWindProfile()");
      assert.ok(Math.abs(m - 3) < 1e-9, `gav ${m}`);
    } finally { app.close(); }
  });

  test("Återställ inställningar räknar om tvärvinden mot den nya spårriktningen", async () => {
    // Utan inläst spår räknas tvärvinden mot inställningen. Bäringen sparas i
    // en cache som måste tömmas när inställningarna återställs.
    const app = await loadApp({ storage: { ...ARVIKA } });
    try {
      const cross = () => app.run("windContext({ wind: 3, dir: 270 }).median");
      app.$("trailBearing").value = "0";
      app.$("trailBearing").dispatchEvent(new app.win.Event("input"));
      assert.ok(Math.abs(cross() - 3) < 1e-9, "västvind mot ett nord–sydligt spår ska vara 3 m/s tvärs");
      app.$("btnResetSettings").click();
      assert.equal(app.run("S.trailBearing"), 90);
      assert.ok(cross() < 1e-9, "efter återställning går spåret öst–väst och vinden längs med");
    } finally { app.close(); }
  });

  test("vindgrafens tvärvind följer spårets verkliga riktning", async () => {
    // Västlig vind över ett spår som mest går nord–syd: rejäl tvärvind. Mot
    // inställningens 90° blir den noll.
    const app = await loadApp();
    try {
      const median = app.run("windContext(currentPoint()).median");
      assert.ok(median > 2, "förutsättningen håller inte");
      const chart = app.win.__charts.find(c => c.data.datasets.some(d => d.label === "Tvärs spåret"));
      const shown = chart.data.datasets.find(d => d.label === "Tvärs spåret").data[0].y;
      assert.ok(Math.abs(shown - median) < 0.3, `grafen visar ${shown.toFixed(2)}, spåret har ${median.toFixed(2)}`);
    } finally { app.close(); }
  });

  test("appen startar utan fel i konsolen", async () => {
    const app = await loadApp();
    try { assert.deepEqual(app.errors, []); } finally { app.close(); }
  });
});

describe("Bibliotek och service worker", () => {
  test("alla bibliotek från CDN har låst version", () => {
    const srcs = [...HTML.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https:\/\/[^"]+)"/g)].map(m => m[1])
      .filter(u => /jsdelivr|unpkg/.test(u));
    assert.ok(srcs.length >= 5);
    for (const u of srcs) assert.match(u, /@\d+\.\d+\.\d+/, u);
  });

  test("Hammer.js laddas före zoom-pluginet, annars fungerar varken nyp eller panorering", () => {
    const hammer = HTML.search(/<script[^>]+hammer/i), zoom = HTML.search(/<script[^>]+chartjs-plugin-zoom/);
    assert.ok(hammer >= 0 && hammer < zoom);
  });

  test("alla filer som service workern sparar för offlinebruk finns", () => {
    const shell = [...SW.match(/const SHELL = \[([\s\S]*?)\]/)[1].matchAll(/"\.\/([^"]*)"/g)].map(m => m[1] || "index.html");
    for (const f of shell) assert.ok(existsSync(new URL(`./${f}`, import.meta.url)), f);
  });

  // Kör sw.js i en egen sandlåda med låtsade cachar och nätsvar.
  function loadSw(response) {
    const handlers = {}, puts = [];
    const cache = { put: async k => { puts.push(k); }, add: async () => {}, match: async () => undefined };
    vm.runInNewContext(SW, {
      self: { addEventListener: (ev, h) => { handlers[ev] = h; }, location: { origin: "https://gkrallo.github.io" },
              skipWaiting() {}, clients: { claim() {} } },
      caches: { open: async () => cache, match: async () => undefined, keys: async () => [] },
      fetch: async () => response, URL, Promise
    });
    return async url => {
      let p;
      handlers.fetch({ request: { method: "GET", url, mode: "navigate" }, respondWith: x => { p = x; } });
      await p; await new Promise(r => setTimeout(r, 5));
      return puts;
    };
  }

  test("service workern sparar startsidan när den hämtas", async () => {
    const nav = loadSw({ ok: true, status: 200, clone() { return this; } });
    assert.deepEqual(await nav("https://gkrallo.github.io/snowgun-forecast/"), ["./index.html"]);
  });

  test("service workern sparar inte en felsida som appens startsida", async () => {
    const nav = loadSw({ ok: false, status: 404, clone() { return this; } });
    assert.deepEqual(await nav("https://gkrallo.github.io/snowgun-forecast/finns-inte"), []);
  });

  async function registersOn(url) {
    let registered = false;
    const app = await loadApp({ url, setup: w => {
      Object.defineProperty(w.navigator, "serviceWorker", { value: { register: async () => { registered = true; } } });
    } });
    app.close();
    return registered;
  }

  test("service workern registreras på GitHub Pages", async () => {
    assert.ok(await registersOn("https://gkrallo.github.io/snowgun-forecast/"));
  });

  test("service workern registreras även på localhost", async () => {
    assert.ok(await registersOn("http://localhost:8000/"));
  });
});
