/* Verifierar de tretton fel som granskningen hittade.
   Kör: node verify.mjs */
import { JSDOM } from "jsdom"; import fs from "fs";

const html = fs.readFileSync("index.html", "utf8");
const swSrc = fs.readFileSync("sw.js", "utf8");
let pass = 0, fail = 0;
const ok = (n, c, info = "") => { c ? pass++ : fail++; console.log(`${c ? "  ok  " : " FEL  "}${n}${info ? " — " + info : ""}`); };

/* ---------- statiska kontroller ---------- */
const cdn = [...html.matchAll(/<script src="(https:\/\/[^"]+)"/g)].map(m => m[1]);
ok("10 alla CDN-adresser har låst version",
   cdn.every(u => /@\d+\.\d+\.\d+/.test(u)),
   cdn.filter(u => !/@\d+\.\d+\.\d+/.test(u)).join(" ") || `${cdn.length} adresser`);
const iH = html.indexOf("hammerjs"), iZ = html.indexOf("chartjs-plugin-zoom");
ok("11 Hammer.js laddas före zoom-pluginet", iH > -1 && iH < iZ);
ok(" 4 formulärets förval för antal lansar stämmer med DEFAULTS",
   /id="lanceCount"[^>]*value="3"/.test(html) && /lanceCount:\s*3,/.test(html));
ok("12 service workern cachar bara giltiga svar som startsida",
   /if \(res && res\.ok\)/.test(swSrc));

/* ---------- appen i jsdom ---------- */
const now = Math.floor(Date.now() / 1000 / 900) * 900;
const mk = (n, step, t, wind, dir) => { const o = { time: [], temperature_2m: [], relative_humidity_2m: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], surface_pressure: [] };
  for (let i = 0; i < n; i++) { o.time.push(now + i * step); o.temperature_2m.push(t); o.relative_humidity_2m.push(75);
    o.wind_speed_10m.push(wind); o.wind_gusts_10m.push(wind + 2); o.wind_direction_10m.push(dir); o.surface_pressure.push(1013); } return o; };

function boot({ temp = -5, wind = 4, dir = 20, slowFirst = false, host = "example.org" } = {}) {
  const dom = new JSDOM(html.replace(/<script src="https:\/\/[^"]+"><\/script>/g, "").replace(/<link rel="stylesheet" href="https:\/\/[^"]+">/g, ""),
    { runScripts: "outside-only", pretendToBeVisual: true, url: `http://${host}:8000/` });
  const w = dom.window;
  const ctx = new Proxy({}, { get: () => () => ({ width: 10 }) });
  class FC { constructor(c, cfg) { cfg = cfg || { data: { datasets: [] }, options: { scales: {} } }; this.data = cfg.data; this.options = cfg.options; this.ctx = ctx;
      this.chartArea = { top: 0, bottom: 1, left: 0, right: 1 }; this.tooltip = { _active: [] };
      this.scales = { x: { min: Date.now(), max: Date.now() + 864e5, getPixelForValue: () => 1 }, y: {} }; }
    destroy() {} update() {} resize() {} zoomScale(i, r) { this.scales.x.min = r.min; this.scales.x.max = r.max; } }
  w.Chart = FC;
  w.L = { map: () => ({ setView() { return this; }, on() { return this; }, invalidateSize() {}, fitBounds() { return this; }, _fitted: false }),
    tileLayer: () => ({ addTo() { return this; }, on() { return this; } }), layerGroup: () => ({ addTo() { return this; }, clearLayers() {} }),
    divIcon: o => o, control: { layers: () => ({ addTo() { return this; } }) },
    marker: () => ({ addTo() { return this; }, setLatLng() { return this; }, bindPopup() { return this; }, bindTooltip() { return this; }, on() { return this; }, getLatLng: () => ({ lat: 58.5, lng: 13.09 }) }),
    polyline: () => ({ addTo() { return this; }, bindTooltip() { return this; }, getBounds: () => ({}) }), polygon: () => ({ addTo() { return this; } }) };
  w.HTMLCanvasElement.prototype.getContext = () => ctx;
  let calls = 0;
  w.fetch = async u => { const mine = ++calls;
    const slow = slowFirst && mine <= 2;
    const t = slow ? -10 : temp;
    if (slow) await new Promise(r => setTimeout(r, 400));
    return { ok: true, json: async () => u.includes("minutely_15") ? { minutely_15: mk(96, 900, t, wind, dir) } : { hourly: mk(240, 3600, t, wind, dir) } }; };
  w.confirm = () => true; w.prompt = () => "1"; w.alert = () => {};
  const reg = []; Object.defineProperty(w.navigator, "serviceWorker", { configurable: true,
    value: { register: p => { reg.push(p); return Promise.resolve({}); } } });
  const errs = []; const oe = console.error; console.error = (...a) => errs.push(String(a));
  w.eval(html.split("<script>")[1].split("</script>")[0] +
    "\n;window.__t={S,DEFAULTS,thresholds,capacity,wetBulbPsychrometric,parseWellText,crossStats,windGeometry," +
    "getWells:()=>wells,nearestSegment,nearestWell,getTrack:()=>track,getSegs:()=>segments,resolveTrack,clearUserTrack,useBuiltinTrack,haversine," +
    "setPlace:(a,b,n)=>{place.lat=a;place.lon=b;if(n)place.name=n;}};");
  console.error = oe;
  return { w, d: w.document, reg, errs };
}

const A = boot();
await new Promise(r => setTimeout(r, 400));

// 1 — tabellen mot motorn
const tbl = [[0, 90, -0.6], [0, 30, -4.1], [2, 90, 1.4], [2, 30, -2.5]];
let worst = 0, worstTxt = "";
for (const [T, rh, shown] of tbl) {
  const calc = A.w.__t.wetBulbPsychrometric(T, rh, 1013.25);
  if (Math.abs(calc - shown) > worst) { worst = Math.abs(calc - shown); worstTxt = `${T}°/${rh}%: tabell ${shown}, motor ${calc.toFixed(2)}`; }
}
ok(" 1 teoritabellen stämmer med appens beräkning", worst <= 0.15, worstTxt);

// 2 — lansens startgräns
const th = A.w.__t.thresholds();
const cap = A.w.__t.capacity(th.lance - 0.5, th.lance, A.w.__t.S.waterTemp);
ok(" 2 lansens startgräns är fri från kvalitetsvalet", cap > 0,
   `gräns ${th.lance.toFixed(2)}, kapacitet vid ${(th.lance - 0.5).toFixed(2)} = ${cap.toFixed(0)} %`);

// 3 — koordinater med komma som avgränsare
const forms = ["1,58.50123,13.08812", "2; 58,50123; 13,08812", "58.50123, 13.08812", "4 58.50123 13.08812"];
const parsed = forms.map(f => A.w.__t.parseWellText(f)[0]);
ok(" 3 alla koordinatformat läses in",
   parsed.every(p => p && Math.abs(p.lat - 58.50123) < 1e-6 && Math.abs(p.lon - 13.08812) < 1e-6),
   parsed.map((p, i) => p ? "ok" : `format ${i + 1} föll`).join(" "));

// 6 — platslistan vid första start
const opts = [...A.d.getElementById("favSelect").options].map(o => o.textContent);
ok(" 6 platslistan har Sparbanksspåret en gång", opts.filter(t => t.includes("Sparbanksspåret")).length === 1, opts.join(" | "));

// 9 — tvärvinden i graferna följer spåret
const g = A.w.__t.crossStats(4, 20);
const manual = A.w.__t.windGeometry(4, 20, A.w.__t.S.trailBearing).crossAbs;
ok(" 9 graferna använder spårets geometri", g.mode === "track" && g.median > 0.2,
   `median ${g.median.toFixed(2)} m/s över ${g.count} sträckor (manuell bäring gav ${manual.toFixed(2)})`);

// 13 — service worker på localhost
const L = boot({ host: "localhost" });
await new Promise(r => setTimeout(r, 200));
ok("13 service workern registreras på localhost", L.reg.length === 1, L.reg.join(""));

// 7 — ta bort inläst spår långt från Lidköping
const B = boot(); await new Promise(r => setTimeout(r, 300));
B.w.__t.setPlace(59.6549, 12.5910, "Arvika");
B.w.__t.clearUserTrack();
ok(" 7 inget spår kvar efter borttagning i Arvika", B.w.__t.getTrack() === null,
   B.w.__t.getTrack() ? B.w.__t.getTrack().name + " ritas ut" : "inget spår");

// 8 — ta bort platsen man står på
const C = boot(); await new Promise(r => setTimeout(r, 300));
C.w.localStorage.setItem("snowFavorites", JSON.stringify([
  { id: "a", name: "Arvika", lat: 59.6549, lon: 12.5910 },
  { id: "b", name: "Sparbanksspåret", lat: 58.50452, lon: 13.08813 }]));
const D = boot(); await new Promise(r => setTimeout(r, 300));
D.w.__t.setPlace(59.6549, 12.5910, "Arvika"); D.w.__t.resolveTrack();
const before = D.w.__t.getTrack();
D.w.__t.setPlace(58.50452, 13.08813, "Sparbanksspåret"); D.w.__t.resolveTrack();
ok(" 8 spåret laddas om när platsen byts", before === null && D.w.__t.getTrack() !== null,
   `Arvika: ${before ? "spår" : "inget"} → Lidköping: ${D.w.__t.getTrack() ? "spår" : "inget"}`);

// 5 — platsbyte mitt i en hämtning
const E = boot({ slowFirst: true, temp: 5 });
await new Promise(r => setTimeout(r, 60));
E.w.__t.setPlace(59.3293, 18.0686, "Stockholm");
E.d.getElementById("btnRefresh").click();
await new Promise(r => setTimeout(r, 900));
const shown = parseFloat(E.d.getElementById("roAir").textContent.replace(",", ".").replace("°", ""));
ok(" 5 senaste platsen vinner över en långsam hämtning", shown > 0,
   `visar ${shown} ° (gammal plats hade −10, ny har +5)`);



/* ---------- anläggningens förval ---------- */
const F = boot(); await new Promise(r => setTimeout(r, 400));
const wl = F.w.__t.getWells();
ok("20 alla tjugo brunnar laddas som förval", wl.length === 20, `${wl.length} brunnar`);
const st = wl.filter(x => x.station);
ok("21 brunn 7 är markerad som väderstation", st.length === 1 && st[0].no === 7,
   st.map(x => "nr " + x.no).join(",") || "ingen markerad");
ok("22 slanglängden är satt till åtta meter", F.w.__t.S.hoseLength === 8, `${F.w.__t.S.hoseLength} m`);
const near = wl.map(x => F.w.__t.nearestSegment(x.lat, x.lon).dist);
ok("23 nitton brunnar ligger vid spåret, en vid schaktytan",
   near.filter(d => d < 20).length === 19 && near.filter(d => d > 40).length === 1,
   `längst bort ${Math.max(...near).toFixed(0)} m`);
ok("24 spårgatan är åtta meter bred", F.w.__t.S.trailWidth === 8, `${F.w.__t.S.trailWidth} m`);
const spare = wl.filter(x => x.spare);
ok("25 brunn 20 är markerad som reserv", spare.length === 1 && spare[0].no === 20,
   spare.map(x => "nr " + x.no).join(",") || "ingen");
const nearSpare = F.w.__t.nearestWell(58.50341, 13.086911);
ok("26 reservbrunnen föreslås inte som inkoppling", nearSpare && nearSpare.well.no !== 20,
   nearSpare ? `föreslår brunn ${nearSpare.well.no} på ${Math.round(nearSpare.dist)} m` : "ingen brunn alls");

console.log(`\n${pass} godkända, ${fail} underkända`);
process.exit(fail ? 1 : 0);
