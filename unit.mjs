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
      // Markörer och ikoner sparas, så att ett test kan läsa en kanons ikon
      // och ruta och trycka på knapparna i den.
      w.L.divIcon = o => ({ ...o });
      w.L.marker = (latlng, opts = {}) => {
        const m = {
          latlng, opts, handlers: {}, popup: null,
          addTo() { (w.__markers ||= []).push(m); return m; },
          bindPopup(html) { m.popup = html; return m; },
          bindTooltip() { return m; },
          on(ev, h) { (m.handlers[ev] ||= []).push(h); return m; },
          getLatLng() { return { lat: m.latlng[0], lng: m.latlng[1] }; },
          setLatLng(p) { m.latlng = Array.isArray(p) ? p : [p.lat, p.lng]; return m; }
        };
        return m;
      };
      w.fetch = fetch || (async () => okResponse(data));
      w.HTMLCanvasElement.prototype.getContext = () => chain();
      w.HTMLCanvasElement.prototype.toDataURL = () => "data:,";
      w.matchMedia = () => ({ matches: false });
      // Webbläsarens egna frågerutor ska inte användas. Anropas de ändå
      // noteras det, och svaret blir det som förhandsvisningen ger: nej.
      for (const k of ["confirm", "alert", "prompt"]) w[k] = () => { (w.__native ||= []).push(k); return k === "confirm" ? false : null; };
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
    // Svarar i appens egen frågeruta: fyller i fältet om `value` ges, trycker
    // sedan OK eller Avbryt. Returnerar rubriken, så att testet ser vad som frågades.
    answer: async ({ value, ok = true } = {}) => {
      const modal = win.document.getElementById("askModal");
      assert.ok(modal.classList.contains("open"), "ingen fråga visas");
      const title = win.document.getElementById("askTitle").textContent;
      if (value !== undefined) win.document.getElementById("askInput").value = value;
      win.document.getElementById(ok ? "askOk" : "askCancel").click();
      await app.settle();
      assert.ok(!modal.classList.contains("open"), "frågan stängdes inte");
      return title;
    },
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
      assert.equal(await app.answer(), "Ta bort inläst spår");
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
      assert.equal(await app.answer(), "Ta bort plats");
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
      assert.equal(await app.answer(), "Tillbaka till Sparbanksspåret");
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

  // Laddar appen med några aggregat utplacerade och fliken Vind & sikte öppen.
  async function withGuns(list) {
    const app = await loadApp({ storage: { snowGunsByTrack: { sparbanksparet: list } } });
    app.$("tabWind").click();
    const gunMarkers = () => (app.win.__markers || []).filter(m => m.opts.icon?.className === "gun-icon").slice(-app.run("guns.length"));
    return { app, gunMarkers };
  }
  const THREE_GUNS = [
    { id: "f1", type: "fan", lat: 58.5040, lon: 13.0878 },
    { id: "f2", type: "fan", lat: 58.5041, lon: 13.0877, aim: 45 },
    { id: "l1", type: "lance", lat: 58.5039, lon: 13.0879 }];

  test("ett tryck på en kanon ritar inte om kartan, så att rutan med Ta bort hinner visas", async () => {
    // Förut slog klicket på siktet och ritade om allt. Leaflet stänger en
    // ruta när dess markör tas bort, så rutan försvann på en gång.
    const { app, gunMarkers } = await withGuns(THREE_GUNS);
    try {
      const ms = gunMarkers();
      assert.equal(ms.length, 3);
      for (const m of ms) assert.equal(m.handlers.click, undefined);
      for (const m of ms) assert.match(m.popup, /data-del=/);
    } finally { app.close(); }
  });

  test("Ta bort i rutan tar bort just den kanonen och inga andra", async () => {
    const { app, gunMarkers } = await withGuns(THREE_GUNS);
    try {
      const m = gunMarkers().find(x => x.popup.includes('data-del="f2"'));
      const el = app.win.document.createElement("div");
      el.innerHTML = m.popup;
      m.handlers.popupopen[0]({ popup: { getElement: () => el } });
      el.querySelector("[data-del]").click();
      assert.deepEqual(app.get("guns.map(g => g.id)"), ["f1", "l1"]);
      const store = JSON.parse(app.win.localStorage.getItem("snowGunsByTrack"));
      assert.deepEqual(store.sparbanksparet.map(g => g.id), ["f1", "l1"]);
    } finally { app.close(); }
  });

  test("Rensa kanoner tar bort alla efter två tryck, utan inbyggd frågeruta", async () => {
    // I förhandsvisningen och i vissa inbyggda webbläsare svarar confirm()
    // nej utan att visas. Knappen får inte vara beroende av den.
    const { app } = await withGuns(THREE_GUNS);
    try {
      let asked = 0;
      app.win.confirm = () => { asked++; return false; };
      const btn = app.$("clearGuns");
      btn.click();
      assert.equal(app.run("guns.length"), 3, "första trycket ska bara fråga");
      assert.match(btn.textContent, /ta bort alla 3/);
      btn.click();
      assert.equal(app.run("guns.length"), 0);
      assert.equal(btn.textContent, "Rensa kanoner");
      assert.equal(JSON.parse(app.win.localStorage.getItem("snowGunsByTrack")).sparbanksparet.length, 0);
      assert.equal(asked, 0, "confirm() ska inte användas");
    } finally { app.close(); }
  });

  test("slangavståndet visas på decimetern och stämmer med varningen", async () => {
    // Med hela meter stod det "8 m — mer än 8 m slang" när brunnen låg 8,3 m
    // bort. Nu ska 8,3 m varna och knappt 8 m inte göra det.
    const lat7 = 58.503781, lon7 = 13.087922, m = 1 / 111320;
    const { app, gunMarkers } = await withGuns([
      { id: "far", type: "fan", lat: lat7 + 8.3 * m, lon: lon7 },
      { id: "near", type: "fan", lat: lat7 - 7.96 * m, lon: lon7 }]);
    try {
      const popup = id => gunMarkers().find(x => x.popup.includes(`data-del="${id}"`)).popup.replace(/\s+/g, " ");
      assert.match(popup("far"), /Brunn 7, 8,3 m <span[^>]*>— mer än 8 m slang/);
      assert.match(popup("near"), /Brunn 7, 8,0 m<br>/);
    } finally { app.close(); }
  });

  test("ikonen pekar dit aggregatet är riktat", async () => {
    const { app, gunMarkers } = await withGuns(THREE_GUNS);
    try {
      const rot = id => {
        const m = gunMarkers().find(x => x.popup.includes(`data-del="${id}"`));
        return +m.opts.icon.html.match(/rotate\((\d+) 16 16\)/)[1];
      };
      // Eget sikte: precis den vinkeln.
      assert.equal(rot("f2"), 45);
      // Automatiskt: samma riktning som appen räknar med för plymen.
      for (const id of ["f1", "l1"]) {
        assert.equal(rot(id), Math.round(app.run(`normDeg(gunAim(guns.find(g => g.id === "${id}")))`)), id);
      }
      // Lansen följer spåret, som går ungefär nord–syd här.
      const l = rot("l1") % 180;
      assert.ok(l < 35 || l > 145, `lansen pekar ${rot("l1")}°`);
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

describe("Anläggningens förval", () => {
  // Snögruppens egna uppgifter om Sparbanksspåret. Ändras de ska det vara
  // med avsikt, inte för att någon råkat ladda upp en gammal kopia.
  let app;
  before(async () => { app = await loadApp(); });
  after(() => app.close());

  test("alla tjugo brunnar laddas som förval på Sparbanksspåret", () => {
    assert.deepEqual(app.get("wells.map(w => w.no)"), Array.from({ length: 20 }, (_, i) => i + 1));
  });

  test("brunn 7 är väderstationen och brunn 20 reserven", () => {
    assert.deepEqual(app.get("wells.filter(w => w.station).map(w => w.no)"), [7]);
    assert.deepEqual(app.get("wells.filter(w => w.spare).map(w => w.no)"), [20]);
  });

  test("nitton brunnar ligger vid spåret, reserven vid schaktytan", () => {
    const d = app.get("wells.map(w => [w.no, nearestSegment(w.lat, w.lon).dist])");
    const far = d.filter(([, m]) => m >= 20);
    assert.deepEqual(far.map(([no]) => no), [20], `långt från spåret: ${far.map(([no, m]) => `${no} (${Math.round(m)} m)`).join(", ")}`);
    assert.ok(far[0][1] > 40);
  });

  test("reservbrunnen föreslås aldrig som inkoppling", () => {
    assert.notEqual(app.run("nearestWell(58.50341, 13.086911).well.no"), 20);
  });

  test("spårgatan och slanglängden är åtta meter, i koden och i formuläret", () => {
    assert.equal(app.run("DEFAULTS.trailWidth"), 8);
    assert.equal(app.run("DEFAULTS.hoseLength"), 8);
    assert.equal(app.$("trailWidth").getAttribute("value"), "8");
    assert.equal(app.$("hoseLength").getAttribute("value"), "8");
  });

  test("sex fläktar och två lansar, i koden och i formuläret", () => {
    assert.equal(app.run("DEFAULTS.fanCount"), 6);
    assert.equal(app.run("DEFAULTS.lanceCount"), 2);
    assert.equal(app.$("fanCount").getAttribute("value"), "6");
    assert.equal(app.$("lanceCount").getAttribute("value"), "2");
  });

  test("väderstationen och reserven syns på kartan", async () => {
    const a = await loadApp();
    try {
      a.$("tabWind").click();
      const icon = no => a.win.__markers.filter(m => m.opts.icon?.className === "well-icon" && m.popup.includes(`<b>Brunn ${no}</b>`)).pop();
      assert.match(icon(7).opts.icon.html, /#fbbf24/);
      assert.match(icon(7).popup, /väderstation/);
      assert.match(icon(20).popup, /reserv/);
      assert.match(icon(3).opts.icon.html, /#38bdf8/);
    } finally { a.close(); }
  });

  test("en egen brunnslista tar över förvalet, även en tom", async () => {
    const a = await loadApp({ storage: { snowWellsByTrack: { sparbanksparet: [] } } });
    try { assert.equal(a.run("wells.length"), 0); } finally { a.close(); }
  });

  test("förvalsbrunnarna följer inte med till ett inläst spår", async () => {
    const a = await loadApp();
    try {
      a.run(`saveTrack({ ...BUILTIN_TRACK, source: "import", name: "Egen runda" })`);
      assert.equal(a.run("wells.length"), 0);
    } finally { a.close(); }
  });
});

describe("Brunnarna på kartan", () => {
  // De senast ritade markörerna för brunnarna, och den för ett visst nummer.
  const wellMarkers = app => (app.win.__markers || [])
    .filter(m => m.opts.icon?.className === "well-icon").slice(-app.run("wells.length"));
  const well = (app, no) => wellMarkers(app).find(m => m.popup.includes(`<b>Brunn ${no}</b>`));
  const openPopup = (app, m) => {
    const el = app.win.document.createElement("div");
    el.innerHTML = m.popup;
    m.handlers.popupopen[0]({ popup: { getElement: () => el } });
    return el;
  };
  const OFFLINE = async () => { throw new Error("offline"); };

  test("brunnarna går inte att dra av misstag, bara efter Flytta", async () => {
    // Förut gick alla brunnar att dra. Panorerade man kartan med fingret på
    // en brunn flyttades den, och det nya läget sparades utan att synas.
    const app = await loadApp();
    try {
      app.$("tabWind").click();
      assert.equal(wellMarkers(app).length, 20);
      assert.ok(wellMarkers(app).every(m => !m.opts.draggable), "en brunn gick att dra utan Flytta");
      openPopup(app, well(app, 1)).querySelector("[data-wmove]").click();
      assert.deepEqual(wellMarkers(app).filter(m => m.opts.draggable).map(m => m.popup.match(/<b>Brunn (\d+)<\/b>/)[1]), ["1"]);
      assert.match(app.$("planNote").textContent, /Dra brunn 1/);
      const lat = 58.50010, lon = 13.08890;
      well(app, 1).handlers.dragend[0]({ target: { getLatLng: () => ({ lat, lng: lon }) } });
      assert.deepEqual(app.get("(w => [w.lat, w.lon])(wells.find(w => w.no === 1))"), [lat, lon]);
      const stored = JSON.parse(app.win.localStorage.getItem("snowWellsByTrack")).sparbanksparet;
      assert.equal(stored.find(w => w.no === 1).lat, lat);
      assert.ok(wellMarkers(app).every(m => !m.opts.draggable), "brunnen låstes inte igen");
      assert.match(app.$("planNote").textContent, /Brunn 1 flyttades 6,9 m och är låst igen/);
    } finally { app.close(); }
  });

  test("Lås efter Flytta låser brunnen utan att något sparas", async () => {
    const app = await loadApp();
    try {
      app.$("tabWind").click();
      openPopup(app, well(app, 7)).querySelector("[data-wmove]").click();
      assert.equal(well(app, 7).opts.draggable, true);
      const el = openPopup(app, well(app, 7));
      assert.equal(el.querySelector("[data-wmove]").textContent, "Lås");
      el.querySelector("[data-wmove]").click();
      assert.ok(wellMarkers(app).every(m => !m.opts.draggable));
      assert.equal(JSON.parse(app.win.localStorage.getItem("snowWellsByTrack")).sparbanksparet, undefined);
    } finally { app.close(); }
  });

  test("en flyttad brunn syns under kartan och kan återställas med två tryck", async () => {
    const app = await loadApp();
    try {
      app.$("tabWind").click();
      const btn = app.$("btnWellReset");
      assert.equal(btn.hidden, true, "orörda brunnar ska inte ha någon återställning");
      assert.doesNotMatch(app.$("trackOrigin").textContent, /skiljer/);

      app.run("wells.find(w => w.no === 1).lat += 30 / 111320; persistWells(); renderPlan();");
      assert.match(app.$("trackOrigin").textContent, /skiljer sig från anläggningens: brunn 1 flyttad 30 m\./);
      assert.equal(btn.hidden, false);

      btn.click();
      assert.notEqual(app.run("wells.find(w => w.no === 1).lat"), 58.500038, "första trycket ska bara fråga");
      assert.equal(btn.textContent, "Ja, återställ");
      btn.click();
      assert.equal(app.run("wells.find(w => w.no === 1).lat"), 58.500038);
      assert.equal(app.run("wells.length"), 20);
      assert.equal(JSON.parse(app.win.localStorage.getItem("snowWellsByTrack")).sparbanksparet, undefined);
      assert.equal(btn.hidden, true);
      assert.equal(btn.textContent, "Återställ brunnarna");
      assert.doesNotMatch(app.$("trackOrigin").textContent, /skiljer/);
    } finally { app.close(); }
  });

  test("borttagna och egna brunnar räknas också som ändringar, men inte på ett inläst spår", async () => {
    const app = await loadApp();
    try {
      app.run(`wells = wells.filter(w => w.no !== 5); wells.push({ id: "x", no: 21, lat: 58.501, lon: 13.088 }); persistWells();`);
      assert.deepEqual(app.get("wellChanges()"), ["brunn 5 saknas", "en brunn till"]);
      app.run(`saveTrack({ ...BUILTIN_TRACK, source: "import", name: "Egen runda" })`);
      assert.deepEqual(app.get("wellChanges()"), []);
    } finally { app.close(); }
  });

  test("kartan ritar spår, brunnar och kanoner även utan prognos", async () => {
    // Utan nät och utan sparad prognos slutade kartan innan något ritades,
    // fast brunnarna och uppställningen låg sparade i telefonen.
    const app = await loadApp({ fetch: OFFLINE, storage: { snowGunsByTrack: { sparbanksparet: [
      { id: "f1", type: "fan", lat: 58.5040, lon: 13.0878 }] } } });
    try {
      await app.settle();
      assert.match(app.$("err").textContent, /Ingen kontakt/);
      assert.equal(app.run("series.length"), 0);
      app.$("tabWind").click();
      assert.equal(wellMarkers(app).length, 20);
      const gun = app.win.__markers.filter(m => m.opts.icon?.className === "gun-icon").pop();
      assert.ok(gun, "kanonen ritades inte");
      assert.match(gun.opts.icon.html, /#93a4bd/, "utan prognos ska kanonen vara grå");
      assert.match(gun.popup, /Ingen prognos/);
      assert.match(app.$("planSummary").textContent, /Ingen väderprognos/);
      assert.equal(app.$("timeLabel").textContent, "ingen prognos");
      assert.deepEqual(app.errors.filter(e => !/offline/.test(e)), []);
    } finally { app.close(); }
  });
});

describe("Barmark", () => {
  // En påhittad men realistisk mätning, gjord som fältinstruktionen säger.
  // Marken är en svag lutning med vågor. Höjderna är ellipsoidhöjder mot
  // LIDK; pucken visar sitt fascentrum, PUCK över det den ligger på.
  const PUCK = 0.06, MOUNT = 1.18;
  const terrain = (x, y) => 100 + 0.002 * y + 0.15 * Math.sin(x / 9);
  let app, M, O;
  before(async () => {
    app = await loadApp();
    M = app.get("BARE_M"); O = app.get("[BARE_ORIGIN.lat, BARE_ORIGIN.lon]");
  });
  after(() => app.close());
  const xy = (lat, lon) => [(lon - O[1]) * M.lon, (lat - O[0]) * M.lat];
  const ll = (x, y) => [O[0] + y / M.lat, O[1] + x / M.lon];
  const reset = () => app.run("bareCells = new Map(); bareFiles = []; localStorage.removeItem('snowBareDraft')");

  function survey({ passes = 8, spacing = 1, closing = true, endStop = true, calib = true, midStop = false } = {}) {
    let seed = 11;
    const noise = s => (((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5) * 2 * s;
    let t = Date.UTC(2026, 10, 10, 13, 0, 0);
    const lines = [];
    const put = (x, y, h, q = 1) => {
      const [lat, lon] = ll(x, y);
      const d = new Date(t);
      const stamp = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")} ` +
        `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}.${String(d.getUTCMilliseconds()).padStart(3, "0")}`;
      lines.push(`${stamp} ${lat.toFixed(9)} ${lon.toFixed(9)} ${h.toFixed(4)} ${q} 18 0.0040 0.0040 ${q === 1 ? "0.0090" : "0.2500"} 0 0 0 0.00 999.9`);
      t += 250;
    };
    const still = (x, y, h, sec) => { for (let i = 0; i < sec * 4; i++) put(x + noise(0.004), y + noise(0.004), h + noise(0.004)); };
    const walk = (a, b, hOf, speed) => {
      const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / (speed / 4)));
      for (let i = 1; i <= n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n; put(x, y, hOf(x, y)); }
    };
    const hand = (x, y) => terrain(x, y) + 1.0 + PUCK;       // pucken i handen
    const rig = (x, y) => terrain(x, y) + MOUNT + PUCK;      // pucken på fästet

    // Utbenet söder om parkeringen, där brunn 4–9 står.
    const line = app.get("BUILTIN_TRACK.pts").slice(13, 27).map(p => xy(p[0], p[1]));
    const G = [line[0][0] - 6, line[0][1]];

    lines.push("% program   : RTKPOST ver.demo5 b34", "%  GPST                  latitude(deg) longitude(deg)  height(m)   Q  ns   sdn(m)   sde(m)   sdu(m)");
    // Pucken bärs fram till fyrhjulingen. Brunn 7 behövs inte längre.
    walk([G[0] + 8, G[1]], G, hand, 1.2);
    if (calib) {
      still(G[0], G[1], terrain(G[0], G[1]) + PUCK, 120);
      walk(G, [G[0], G[1] + 1], hand, 0.5);
      still(G[0], G[1] + 1, rig(G[0], G[1] + 1), 120);
    } else walk(G, [G[0], G[1] + 1], hand, 0.5);

    let pos = [G[0], G[1] + 1];
    for (let k = 0; k < passes; k++) {
      // Tankstopp mellan två varv: still på fästet, men inte följt av marken.
      if (midStop && k === 2) still(pos[0], pos[1], rig(pos[0], pos[1]), 90);
      const off = (k - (passes - 1) / 2) * spacing;
      const path = (k % 2 ? [...line].reverse() : line).map((p, i, arr) => {
        const q = arr[Math.min(i + 1, arr.length - 1)], r = arr[Math.max(i - 1, 0)];
        const dx = q[0] - r[0], dy = q[1] - r[1], L = Math.hypot(dx, dy);
        const s = k % 2 ? -1 : 1;
        return [p[0] + s * dy / L * off, p[1] - s * dx / L * off];
      });
      walk(pos, path[0], rig, 1.5);
      for (let i = 1; i < path.length; i++) {
        const before = lines.length;
        walk(path[i - 1], path[i], rig, 1.5);
        // Ett stycke float på varv två, med fel höjd som RTK-float ofta ger.
        if (k === 1 && i === 4) for (let j = before; j < lines.length; j++)
          lines[j] = lines[j].replace(/ (\d+\.\d{4}) 1 18 0\.0040 0\.0040 0\.0090/, (m, h) => ` ${(+h + 0.3).toFixed(4)} 2 18 0.0040 0.0040 0.2500`);
      }
      pos = path[path.length - 1];
    }
    if (endStop) still(pos[0], pos[1], rig(pos[0], pos[1]), 60);
    // Kontrollen: pucken på marken bredvid hjulet, en meter från fästet.
    // Fyra millimeter fel, så att kontrollen har något att visa.
    const E = [pos[0], pos[1] + 1];
    if (closing) { walk(pos, E, hand, 0.5); still(E[0], E[1], terrain(E[0], E[1]) + PUCK + 0.004, 120); }
    return lines.join("\n");
  }
  // Kontrollens förväntade värde: antennhöjden i slutet minus den i början.
  // Marken lutar två millimeter på metern mellan fästet och kontrollpunkten.
  const DRIFT = -0.002 - 0.004;

  async function importText(text, name = "barmark.pos") {
    await app.win.importBareFiles([{ name, text: async () => text }]);
  }

  const calOf = opts => {
    const pts = app.win.parseSurveyLog(survey(opts));
    return app.win.calibrateSurvey(app.win.findStillPeriods(pts), pts);
  };

  test("kalibreringen hittas i loggen: antennhöjd och kontroll i slutet", () => {
    const cal = calOf();
    assert.equal(cal.error, undefined);
    assert.ok(Math.abs(cal.antennaHeight - MOUNT) < 0.005, `antennhöjd ${cal.antennaHeight}`);
    assert.ok(Math.abs(cal.drift - DRIFT) < 0.003, `kontroll ${cal.drift}`);
    assert.deepEqual([...cal.warnings], []);
  });

  test("ett tankstopp mitt i passet tas inte för kontrollen", () => {
    const withClose = calOf({ midStop: true });
    assert.ok(Math.abs(withClose.drift - DRIFT) < 0.003, `kontroll ${withClose.drift}`);
    const noClose = calOf({ midStop: true, closing: false, endStop: false });
    assert.equal(noClose.drift, null);
    assert.equal(noClose.to, Infinity, "loggen slutar under körning — inget ska klippas");
  });

  test("varje ruta får markens höjd mot LIDK, utan float och utan handburna punkter", async () => {
    reset();
    await importText(survey());
    const cells = app.get("[...bareCells.values()].map(c => [c.gx, c.gy, c.sum / c.n, c.n])");
    assert.ok(cells.length > 2500, `${cells.length} rutor`);
    let worst = 0, where = null;
    for (const [gx, gy, dz] of cells) {
      const err = Math.abs(dz - (terrain(gx + 0.5, gy + 0.5) + PUCK));
      if (err > worst) { worst = err; where = [gx, gy]; }
    }
    assert.ok(worst < 0.025, `största fel ${(worst * 100).toFixed(1)} cm i ruta ${where}`);
  });

  test("åtta varv med en meter emellan täcker gatan, fyra med två meter gör det inte", async () => {
    reset();
    await importText(survey({ passes: 8, spacing: 1 }));
    const tight = app.get("(() => { const r = bareReport(); return { c: r.coverage, missed: r.missed }; })()");
    reset();
    await importText(survey({ passes: 4, spacing: 2 }));
    const loose = app.get("bareReport().coverage");
    assert.ok(tight.c > 0.9, `täta varv gav ${Math.round(tight.c * 100)} %`);
    assert.ok(loose < 0.7, `glesa varv gav ${Math.round(loose * 100)} %`);
    for (const no of [1, 2, 19]) assert.ok(tight.missed.includes(no), `brunn ${no} borde sakna mätning`);
    for (const no of [6, 7]) assert.ok(!tight.missed.includes(no), `brunn ${no} är inmätt`);
  });

  test("utan kontroll i slutet varnar appen, och utan stopp klipps slutet bort", () => {
    const noClose = calOf({ closing: false });
    assert.match(noClose.warnings.join(" "), /går inte att kontrollera/);
    assert.equal(noClose.drift, null);
    const noStop = calOf({ endStop: false });
    assert.match(noStop.warnings.join(" "), /burits i handen/);
    const lastStill = app.win.findStillPeriods(app.win.parseSurveyLog(survey({ endStop: false }))).pop();
    assert.ok(noStop.to <= lastStill.start - 120000);
  });

  test("en logg utan mark och fäste ger ett begripligt fel", async () => {
    reset();
    await importText(survey({ calib: false, closing: false }), "utankalib.pos");
    assert.match(app.$("bareReport").textContent, /marken och sedan på fästet/);
    assert.equal(app.run("bareCells.size"), 0);
  });

  test("två stunder långt isär eller med låg höjdskillnad tas inte för mark och fäste", () => {
    // Som på brunn 7-locket 10 november: tio minuter isär, 20 cm felaktig fix.
    const P = (min, h) => ({ start: min * 60000, end: min * 60000 + 60000, n: 200, lat: 58.50377, lon: 13.08793, h });
    assert.ok(app.win.calibrateSurvey([P(0, 126.81), P(10, 127.01)]).error, "tio minuter isär");
    assert.ok(app.win.calibrateSurvey([P(0, 126.81), P(1.5, 127.01)]).error, "20 cm är inget fäste");
    assert.equal(app.win.calibrateSurvey([P(0, 126.81), P(1.5, 127.80)]).error, undefined);
  });

  test("pucken rakt under fästet: mark och fäste blir ändå två stunder", () => {
    // Samma läge i plan, bara höjden skiljer.
    const pts = app.get(`(() => {
      const p = [];
      for (let i = 0; i < 240; i++) p.push({ t: i * 250, lat: 58.5, lon: 13.08, h: 100.06, q: 1 });
      for (let i = 0; i < 240; i++) p.push({ t: 70000 + i * 250, lat: 58.5, lon: 13.08, h: 101.24, q: 1 });
      return findStillPeriods(p).map(s => s.h);
    })()`);
    assert.deepEqual(pts, [100.06, 101.24]);
  });

  test("puckens NMEA-logg läses också: fix, höjd över ellipsoiden och höjdosäkerhet", () => {
    const cs = s => { let x = 0; for (const ch of s) x ^= ch.charCodeAt(0); return x.toString(16).toUpperCase().padStart(2, "0"); };
    const n = s => `$${s}*${cs(s)}`;
    const text = [
      n("GNGGA,130000.00,5830.22686,N,01305.27532,E,4,24,0.6,72.512,M,35.210,M,1.0,0000"),
      n("GNGST,130000.00,0.010,0.008,0.006,45.0,0.007,0.006,0.012"),
      n("GNGGA,130000.25,5830.22686,N,01305.27532,E,5,24,0.6,72.700,M,35.210,M,1.0,0000"),
      "$GNGGA,130000.50,5830.22686,N,01305.27532,E,4,24,0.6,72.512,M,35.210,M,1.0,0000*00",
      n("GNGGA,130000.75,5830.22686,N,01305.27532,E,0,0,99,0,M,0,M,,")
    ].join("\n");
    const pts = app.get(`parseSurveyLog(${JSON.stringify(text)})`);
    assert.equal(pts.length, 2, "fel kontrollsumma och 'ingen fix' ska bort");
    assert.equal(pts[0].q, 1);
    assert.equal(pts[1].q, 2);
    assert.ok(Math.abs(pts[0].h - 107.722) < 1e-9);
    assert.equal(pts[0].sdu, 0.012);
    assert.ok(Math.abs(pts[0].lat - 58.503781) < 1e-6 && Math.abs(pts[0].lon - 13.087922) < 1e-6);
  });

  test(".pos med GPS-vecka och sekunder i stället för datum", () => {
    const pts = app.get(`parseSurveyLog("2390 345600.000 58.503781 13.087922 100.2600 1 18 0.004 0.004 0.009")`);
    assert.equal(pts.length, 1);
    assert.equal(pts[0].t, Date.UTC(1980, 0, 6) + 2390 * 604800000 + 345600000);
  });

  test("barmarken sparas som fil och läses tillbaka utan att något ändras", async () => {
    reset();
    await importText(survey({ passes: 2 }));
    const json = app.get("bareToJson()");
    assert.equal(json.format, "snoprognos-barmark-2");
    // Version 1 var relativt brunn 7-locket och får inte blandas in.
    assert.equal(app.run(`bareFromJson(${JSON.stringify({ ...json, format: "snoprognos-barmark-1" })})`), false);
    assert.equal(json.files.length, 1);
    const before = app.get("[...bareCells.values()].map(c => [c.gx, c.gy, Math.round(c.sum / c.n * 1000), c.n])").sort();
    app.run(`bareFromJson(${JSON.stringify(json)})`);
    const after = app.get("[...bareCells.values()].map(c => [c.gx, c.gy, Math.round(c.sum / c.n * 1000), c.n])").sort();
    assert.deepEqual(after, before);
    assert.ok(app.win.localStorage.getItem("snowBareDraft"), "det inlästa ska ligga kvar i telefonen");
  });

  test("fliken Snödjup visar rutnätet och vad passet gav", async () => {
    const a = await loadApp();
    try {
      a.$("tabDepth").click();
      await a.settle();
      assert.match(a.$("bareStatus").textContent, /Ingen barmark/);
      await a.win.importBareFiles([{ name: "barmark.pos", text: async () => survey() }]);
      assert.match(a.$("bareStatus").textContent, /rutor/);
      assert.match(a.$("bareStatus").textContent, /inte sparat i appen/);
      assert.match(a.$("bareReport").textContent, /Antennhöjd 118,\d cm/);
      assert.match(a.$("bareReport").textContent, /av ytan mellan varven är inmätt/);
      assert.equal(a.$("bareSave").hidden, false);
      assert.deepEqual(a.errors, []);
    } finally { a.close(); }
  });
});

describe("Mätpass med pucken", () => {
  // Spolar fram klockan i guiden genom att flytta stegets start bakåt.
  const rewind = (app, sec) => {
    app.run(`guide.t0 -= ${sec * 1000}; const e = guide.log[guide.log.length - 1]; if (e && e.end === null) e.start -= ${sec * 1000}; guideTick()`);
  };
  const click = (app, id) => app.$(id).click();

  test("guiden går igenom passet, räknar ner och skriver upp klockslagen", async () => {
    const app = await loadApp();
    try {
      app.$("tabDepth").click();
      assert.match(app.$("guideStep").textContent, /Före passet/);
      click(app, "guideMain");                                   // pucken startar
      assert.match(app.$("guideStep").textContent, /steg 1 av 6/);
      assert.match(app.$("guideTimer").textContent, /av minst 4:00/);
      rewind(app, 250);
      assert.match(app.$("guideTimer").textContent, /minst 4:00 har gått/);
      click(app, "guideMain");                                   // marken
      assert.equal(app.$("guideTimer").hidden, true, "nedräkningen ska vänta på trycket");
      click(app, "guideMain");
      assert.equal(app.$("guideMain").disabled, true, "nästa steg går inte medan pucken ska ligga still");
      assert.match(app.$("guideTimer").textContent, /2:00/);
      rewind(app, 121);
      assert.match(app.$("guideStep").textContent, /Sätt pucken på fästet/);
      assert.equal(app.$("guideMain").disabled, false);
      click(app, "guideMain");                                   // fästet
      assert.equal(app.$("guideTapeRow").hidden, false);
      app.$("guideTape").value = "94.5"; app.$("guideTape").dispatchEvent(new app.win.Event("input"));
      click(app, "guideMain"); rewind(app, 121);
      assert.match(app.$("guideStep").textContent, /Nu kan du börja köra/);
      click(app, "guideMain"); click(app, "guideMain");          // kör
      rewind(app, 1500);
      click(app, "guideMain");                                   // stå still
      click(app, "guideMain"); rewind(app, 61);
      click(app, "guideMain");                                   // marken igen
      click(app, "guideMain"); rewind(app, 121);
      click(app, "guideMain");
      assert.match(app.$("guideStep").textContent, /innan<\/b> minneskortet|innan minneskortet/);
      const log = app.$("guideLog").textContent;
      for (const t of ["Pucken startar", "Pucken på marken (2:00)", "Pucken på fästet (2:00)", "Kör (25:00)", "Stå still (1:00)",
                       "Pucken på marken igen (2:00)", "Tumstock till puckens undersida: 94,5 cm"])
        assert.ok(log.includes(t), `saknar "${t}" i\n${log}`);
      // Klockslagen ligger kvar tills en ny guide startas.
      click(app, "guideMain");
      assert.match(app.$("guideStep").textContent, /Före passet/);
      assert.equal(app.$("guideLogWrap").hidden, false);
      assert.deepEqual(app.errors, []);
    } finally { app.close(); }
  });

  test("guiden fortsätter där den var efter en omladdning", async () => {
    const t0 = Date.now() - 30000;
    const app = await loadApp({ storage: { snowGuide: { step: 2, phase: "running", t0, tape: "",
      log: [{ key: "ground", title: "Pucken på marken", start: t0, end: null }] } } });
    try {
      app.$("tabDepth").click();
      assert.match(app.$("guideStep").textContent, /Pucken på marken/);
      assert.match(app.$("guideTimer").textContent, /1:3\d/);
      assert.equal(app.$("guideMain").disabled, true);
    } finally { app.close(); }
  });

  test("börja om steget tar bort det påbörjade klockslaget", async () => {
    const app = await loadApp();
    try {
      click(app, "guideMain"); click(app, "guideMain");          // till marken
      click(app, "guideMain");                                   // starta nedräkningen
      assert.equal(app.get("guide.log.length"), 2);
      click(app, "guideBack");
      assert.equal(app.get("guide.log.length"), 1);
      assert.equal(app.get("guide.phase"), "idle");
    } finally { app.close(); }
  });

  test("Bluetooth: GGA plockas ur strömmen trots binär rådata och halva rader", async () => {
    const app = await loadApp();
    try {
      const cs = s => { let x = 0; for (const ch of s) x ^= ch.charCodeAt(0); return x.toString(16).toUpperCase().padStart(2, "0"); };
      const gga = "GNGGA,201500.00,5830.22686,N,01305.27532,E,2,24,0.6,72.512,M,35.210,M,,";
      const bin = "\xb5b\x02\x15\x10\x00\x01\x02\x03$\x05\n\xff";
      const stream = `${bin}$${gga}*${cs(gga)}\r\n$GNGGA,201500.25,5830.2,N,01305.2,E,1,30,0.5,72.5,M,35.2,M,,*00\r\n`;
      for (let i = 0; i < stream.length; i += 7) app.run(`feedPuck(${JSON.stringify(stream.slice(i, i + 7))})`);
      const g = app.get("puck.gga");
      assert.equal(g.q, 2, "raden med fel kontrollsumma ska inte räknas");
      assert.equal(g.sats, 24);
      app.run("puck.device = {}");
      assert.match(app.get("puckSummary()").replace(/<[^>]+>/g, ""), /✓ position \(SBAS\) · 24 satelliter · HDOP 0,6/);
      app.run("puck.at = Date.now() - 9000");
      assert.match(app.get("puckSummary()"), /Inget från pucken på 9 s/);
    } finally { app.close(); }
  });

  test("utan Bluetooth i webbläsaren säger appen var det fungerar", async () => {
    const app = await loadApp();
    try {
      await app.win.connectPuck();
      assert.match(app.$("btStatus").textContent, /Chrome på Android/);
    } finally { app.close(); }
  });
});

describe("Frågor i appen", () => {
  // Webbläsarens alert, confirm och prompt svarar tyst nej i förhandsvisningen
  // och i inbyggda webbläsare. Allt ska gå genom appens egen ruta.
  const TWO_PLACES = { snowFavorites: [
    { id: "spb", name: "Sparbanksspåret", lat: 58.50452, lon: 13.08813 },
    { id: "arv", name: "Arvika", lat: 59.6547, lon: 12.5903 }] };
  const noNative = app => assert.deepEqual(app.win.__native ?? [], [], "en inbyggd frågeruta användes");

  test("appen anropar aldrig alert, confirm eller prompt", () => {
    const script = HTML.split("<script>")[1];
    assert.equal(script.match(/(^|[^.\w])(alert|confirm|prompt)\(/m), null);
  });

  test("spara plats: namnfältet börjar tomt och platsen hamnar i listan", async () => {
    // Med förra platsens namn ifyllt flyttades Sparbanksspåret tyst om man
    // bara tryckte Spara.
    const app = await loadApp();
    try {
      app.$("btnMap").click();
      await new Promise(r => setTimeout(r, 100));
      app.run("marker.setLatLng([58.6, 13.2])");
      app.$("btnSaveMap").click();
      assert.equal(app.$("askInput").value, "");
      assert.equal(await app.answer({ value: "Hemmaspåret" }), "Spara platsen");
      assert.equal(app.run("place.name"), "Hemmaspåret");
      assert.deepEqual(app.get("favorites.map(f => f.name)"), ["Sparbanksspåret", "Hemmaspåret"]);
      assert.ok(Math.abs(app.run("favorites[0].lat") - 58.50452) < 1e-6, "Sparbanksspåret flyttades");
      noNative(app);
    } finally { app.close(); }
  });

  test("spara plats utan namn använder platsen men lägger den inte i listan", async () => {
    const app = await loadApp();
    try {
      app.$("btnMap").click();
      await new Promise(r => setTimeout(r, 100));
      app.run("marker.setLatLng([58.6, 13.2])");
      app.$("btnSaveMap").click();
      await app.answer({ ok: false });
      assert.equal(app.run("place.name"), "Vald plats");
      assert.equal(app.run("place.lat"), 58.6);
      assert.equal(app.run("favorites.length"), 1);
    } finally { app.close(); }
  });

  test("Esc när platsen ska sparas ångrar bytet helt", async () => {
    const app = await loadApp();
    try {
      app.$("btnMap").click();
      await new Promise(r => setTimeout(r, 100));
      app.run("marker.setLatLng([58.6, 13.2])");
      app.$("btnSaveMap").click();
      app.win.document.dispatchEvent(new app.win.KeyboardEvent("keydown", { key: "Escape" }));
      await app.settle();
      assert.equal(app.run("place.name"), "Sparbanksspåret");
      assert.ok(Math.abs(app.run("place.lat") - 58.50452) < 1e-6);
    } finally { app.close(); }
  });

  test("byt namn på platsen man står på", async () => {
    const app = await loadApp();
    try {
      app.$("btnRenameFav").click();
      assert.equal(app.$("askInput").value, "Sparbanksspåret");
      assert.equal(await app.answer({ value: "Sparbanksspåret Lidköping" }), "Byt namn");
      assert.equal(app.run("favorites[0].name"), "Sparbanksspåret Lidköping");
      assert.equal(app.run("place.name"), "Sparbanksspåret Lidköping");
      noNative(app);
    } finally { app.close(); }
  });

  test("Esc stänger frågan utan att något ändras", async () => {
    const app = await loadApp();
    try {
      app.$("btnRenameFav").click();
      app.win.document.dispatchEvent(new app.win.KeyboardEvent("keydown", { key: "Escape" }));
      await app.settle();
      assert.ok(!app.$("askModal").classList.contains("open"));
      assert.equal(app.run("favorites[0].name"), "Sparbanksspåret");
    } finally { app.close(); }
  });

  test("Avbryt vid ta bort plats behåller platsen", async () => {
    const app = await loadApp({ storage: TWO_PLACES });
    try {
      app.$("favSelect").value = "arv";
      app.$("btnDelFav").click();
      await app.answer({ ok: false });
      assert.equal(app.run("favorites.length"), 2);
    } finally { app.close(); }
  });

  test("den sista platsen går inte att ta bort, och appen säger varför", async () => {
    const app = await loadApp();
    try {
      app.$("btnDelFav").click();
      assert.ok(app.$("askCancel").hidden, "beskedet ska bara ha en OK-knapp");
      assert.match(app.$("askText").textContent, /sista platsen/);
      await app.answer();
      assert.equal(app.run("favorites.length"), 1);
      noNative(app);
    } finally { app.close(); }
  });

  test("byt nummer på en brunn", async () => {
    const app = await loadApp({ storage: { snowWellsByTrack: { sparbanksparet: [
      { id: "w1", no: 1, lat: 58.5040, lon: 13.0878 }] } } });
    try {
      app.$("tabWind").click();
      const m = app.win.__markers.filter(x => x.opts.icon?.className === "well-icon").pop();
      const el = app.win.document.createElement("div");
      el.innerHTML = m.popup;
      m.handlers.popupopen[0]({ popup: { getElement: () => el } });
      el.querySelector("[data-wno]").click();
      assert.equal(await app.answer({ value: "7" }), "Brunn 1");
      assert.equal(app.run("wells[0].no"), 7);
      assert.equal(JSON.parse(app.win.localStorage.getItem("snowWellsByTrack")).sparbanksparet[0].no, 7);
      noNative(app);
    } finally { app.close(); }
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
  function loadSw(response, fetches = []) {
    const handlers = {}, puts = [];
    const cache = { put: async k => { puts.push(k); }, add: async () => {}, match: async () => undefined };
    vm.runInNewContext(SW, {
      self: { addEventListener: (ev, h) => { handlers[ev] = h; }, location: { origin: "https://gkrallo.github.io" },
              skipWaiting() {}, clients: { claim() {} } },
      caches: { open: async () => cache, match: async () => undefined, keys: async () => [] },
      fetch: async (req, init) => { fetches.push(init); return response; }, URL, Promise
    });
    return async url => {
      let p;
      handlers.fetch({ request: { method: "GET", url, mode: "navigate" }, respondWith: x => { p = x; } });
      await p; await new Promise(r => setTimeout(r, 5));
      return puts;
    };
  }

  test("appens version stämmer med service workerns", () => {
    // Båda höjs vid varje utgåva. Höjs bara den ena syns fel siffra under Om appen.
    const app = +HTML.match(/const APP_VERSION = (\d+);/)[1];
    assert.equal(SW.match(/const VERSION = "snoprognos-v(\d+)"/)[1], String(app));
  });

  test("startsidan hämtas förbi webbläsarens cache", async () => {
    // GitHub Pages tillåter tio minuters återanvändning. Utan "no-cache"
    // kunde en nyss utlagd version dröja, eller aldrig nå en installerad app.
    const fetches = [];
    await loadSw({ ok: true, status: 200, clone() { return this; } }, fetches)("https://gkrallo.github.io/snowgun-forecast/");
    assert.equal(fetches[0]?.cache, "no-cache");
  });

  test("service workern sparar startsidan när den hämtas", async () => {
    const nav = loadSw({ ok: true, status: 200, clone() { return this; } });
    assert.deepEqual(await nav("https://gkrallo.github.io/snowgun-forecast/"), ["./index.html"]);
  });

  test("service workern sparar inte en felsida som appens startsida", async () => {
    const nav = loadSw({ ok: false, status: 404, clone() { return this; } });
    assert.deepEqual(await nav("https://gkrallo.github.io/snowgun-forecast/finns-inte"), []);
  });

  /* Appen med en låtsad service worker. `controller` säger om en service
     worker redan styrde sidan när den laddades. Sidan synlig eller dold
     styrs med `app.win.__hidden`; jsdom själv påstår att den alltid är dold. */
  async function withSw({ controller = {}, url = "https://gkrallo.github.io/snowgun-forecast/" } = {}) {
    const sw = { registered: false, updates: 0, handlers: {} };
    const app = await loadApp({ url, setup: w => {
      Object.defineProperty(w.navigator, "serviceWorker", { value: {
        controller,
        register: async () => { sw.registered = true; return { update: async () => { sw.updates++; } }; },
        addEventListener: (ev, h) => { (sw.handlers[ev] ||= []).push(h); }
      } });
      Object.defineProperty(w.document, "hidden", { configurable: true, get: () => !!w.__hidden });
    } });
    await app.settle(5);
    app.run("var __reloads = 0; reloadPage = () => { __reloads++; }");
    const show = hidden => { app.win.__hidden = hidden; app.win.document.dispatchEvent(new app.win.Event("visibilitychange")); };
    const takeOver = () => sw.handlers.controllerchange.forEach(h => h());
    return { app, sw, show, takeOver, reloads: () => app.run("__reloads") };
  }

  test("service workern registreras på GitHub Pages", async () => {
    const { app, sw } = await withSw();
    app.close();
    assert.ok(sw.registered);
  });

  test("service workern registreras även på localhost", async () => {
    const { app, sw } = await withSw({ url: "http://localhost:8000/" });
    app.close();
    assert.ok(sw.registered);
  });

  test("när appen kommer fram frågar den efter en ny version, högst en gång i minuten", async () => {
    const { app, sw, show } = await withSw();
    try {
      show(false);
      assert.equal(sw.updates, 1);
      show(true); show(false);
      assert.equal(sw.updates, 1);
    } finally { app.close(); }
  });

  test("en ny version laddar om appen när den tagit över", async () => {
    // En installerad app hålls vid liv av telefonen och laddades aldrig om,
    // så den nya versionen kom inte fram fast den låg ute.
    const { app, takeOver, reloads } = await withSw();
    try {
      takeOver();
      assert.equal(reloads(), 1);
    } finally { app.close(); }
  });

  test("mitt i en fråga väntar omladdningen tills appen läggs undan", async () => {
    const { app, takeOver, show, reloads } = await withSw();
    try {
      app.$("surveyModal").classList.add("open");
      takeOver();
      assert.equal(reloads(), 0, "laddade om mitt i GPS-inmätningen");
      show(false);
      assert.equal(reloads(), 0);
      show(true);
      assert.equal(reloads(), 1);
    } finally { app.close(); }
  });

  test("mitt i ett mätpass väntar omladdningen tills appen läggs undan", async () => {
    const { app, takeOver, show, reloads } = await withSw();
    try {
      app.run("guide.step = 3; guide.phase = 'running'; guide.t0 = Date.now()");
      takeOver();
      assert.equal(reloads(), 0, "laddade om mitt i guiden");
      show(false);
      show(true);
      assert.equal(reloads(), 1);
    } finally { app.close(); }
  });

  test("första installationen laddar inte om sidan", async () => {
    const { app, takeOver, reloads } = await withSw({ controller: null });
    try {
      takeOver();
      assert.equal(reloads(), 0);
    } finally { app.close(); }
  });
});
