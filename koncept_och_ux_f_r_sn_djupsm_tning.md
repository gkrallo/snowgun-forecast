# Master-specifikation: RTK-baserad Snödjupsmätning, 3D-Spårprofilering & Gästvy (`snowgun-forecast`)

Detta dokument är huvudspecifikationen (arkitektur, matematisk modell, hårdvaruintegration, Cloud Firestore-backend samt 2D/3D-UX) för att utöka `snowgun-forecast` vid **Sparbanksspåret i Råda (Rådåsgården, Lidköping)**.

Dokumentet är utformat som en komplett teknisk kontextfil för vidareutveckling i **Claude Code**.

---

## 1. Anläggningsfakta & Förutsättningar (Sparbanksspåret Råda)

- **Geografi & Brunnar:** Ca 850 meter lång konstsnösträckning i nord-sydlig riktning med **20 brunnar**:
  - **Brunn 1:** Södra änden (Spårdelning & vändslinga).
  - **Brunn 7 (`58.503781, 13.087922`):** Anläggningens mittpunkt och origo `(0, 0)` i vårt lokala koordinatsystem. Håller systemets väderstation (temperatur/fukt). **OBS:** *Vindmätaren på Brunn 7 är ej pålitlig – all vinddata för kastlängd/kanonriktning ska hämtas från extern prognos (t.ex. SMHI).*
  - **Brunn 16–19 ("Klockan"):** Norra änden där spåret delar sig i en slinga.
- **Spårgatans bredd & profil:** Normalt ca **8 meter bred**, men bredare i kurvor och vid spårdelningarna (Brunn 1 och Brunn 16). Vid god snötillgång pistar man **`2 klassiska spår + skejtbädd + 2 klassiska spår`**. Åkriktningen är **motsols** med vändslingor i ändarna där spåret är enkelriktat.
- **Slangräckvidd från brunnar:** Brunnarna är djupa och slangarna är styva i kyla. En nominell 10-metersslang når i praktiken **8,0 – 9,0 meter** (default **8,5 meter**) horisontellt från brunnen.
- **Närmaste RTK-referens:** Swepos fasta basstation i Lidköping ligger endast **2,4 km** österut (`58.502074, 13.128938`). Alternativt används RTK2go eller egen basstation vid Rådåsgården.

---

## 2. Hårdvara & Kommunikation (`SparkFun RTK Facet`)

Mätenheten är en **SparkFun RTK Facet** (u-blox ZED-F9P L1/L2 + ESP32 + inbyggd kupolantenn, skärm och batteri) som ger **14 mm noggrannhet i X, Y och Z** vid `RTK Fixed`. Undertill sitter en **5/8"-11 gänga** för magnetfot (fästs på fyrhjuling/band-ATV, schaktblad eller spårsläde).

### Fyra sätt att ta emot position i webbappen (`SparkFunFacetService.ts`)
1. **Web Bluetooth BLE (Primär):** Läser NMEA `$GNGGA` i 5–10 Hz direkt från puckens ESP32 över BLE UART. Parsar `Fix Quality` (`4 = RTK Fixed`, `5 = RTK Float`), `HDOP`, `MSL Altitude` (RH2000) och `Geoid Separation`.
2. **Web Serial API (USB-C / BT COM-port):** Direkt seriell läsning av `$GNGGA`.
3. **Android Mock Location (via SW Maps):** SW Maps sköter NTRIP + BT i bakgrunden och injicerar RTK-positionen i `navigator.geolocation.watchPosition`.
4. **Inbyggd Råda-simulator & microSD-import:** Simulator som kör längs Brunn 1–20 för utveckling i Claude Code, samt import av `.txt`/`.nmea`-loggfiler från puckens minneskort.

---

## 3. Matematisk Modell & Påfyllningsbart 1x1m-Grid

Alla WGS84-koordinater projiceras i realtid till ett **lokalt meter-rutnät (`1.0 x 1.0 meter`)** med origo `(0, 0)` i **Brunn 7**:
- $1^\circ \text{ Latitud} = 111\,395\text{ m}$
- $1^\circ \text{ Longitud} = 58\,210\text{ m}$

$$x = (\text{lng} - 13.087922) \times 58\,210, \quad y = (\text{lat} - 58.503781) \times 111\,395$$
$$g_x = \lfloor x \rfloor, \quad g_y = \lfloor y \rfloor, \quad \text{gridKey} = \text{`"\${gx}\_\${gy}"`}$$

### Varför 1x1m Grid är optimalt för Råda
- **Ingen förprogrammerad rutt krävs:** Föraren behöver aldrig ange om man kör innervarv, yttervarv eller vändslinga. Varje mätpunkt hamnar automatiskt i rätt $1\times 1\text{ m}$-ruta baserat på sin koordinat.
- **Löpande påfyllning ("Patching"):** Ett varv i lugn mätfart (5–8 km/h, ~20–30 min per varv) täcker ett spår. Kör man 3–4 varv i bredd täcks hela 8-metersgatan. Upptäcker man på kartan att det saknas punkter i en bred kurva vid Brunn 16 kör man bara över den ytan och "fyller på" rutorna.

---

## 4. 3-stegs Kalibrerings-Wizard (Utan tumstock!)

För att slippa mäta monteringshöjd med tumstock och samtidigt kompensera för hur mycket en **bandgående fyrhjuling (ATV)**, spårsläde eller schaktblad sjunker ner i underlaget används en 3-stegs-wizard inför mätning.

*Säkerhetsspärr i alla 3 steg:* Knappen för att låsa värdet aktiveras endast när **`Fix Quality === 4 (RTK Fixed)`** och fordonet/pucken är **stillastående (`hastighet < 0.1 m/s` under minst 2 sekunder / ~5–10 samples)**.

1. **Steg 1: Nollpunkt på Brunn 7-locket (`well7ReferenceZ`)**
   - Ställ RTK Facet på en fast punkt på locket vid Brunn 7 och tryck `[1. Lås Brunn 7 Nollpunkt]`.
   - Vid allra första barmarksmätningen sparas detta som anläggningens master-höjd. Vid senare pass räknar appen ut dagens avvikelse:
     $$\Delta Z_{\text{session}} = Z_{\text{GPS\_lock}} - Z_{\text{Brunn7\_Ref}}$$
2. **Steg 2: Mark-/Snöyta bredvid mätriggen (`step2GroundZ`)**
   - Ställ ner pucken på marken (eller i/bredvid bandspåret på snön så den ligger i nivå med bandens undersida) precis intill fyrhjulingen/redskapet och tryck `[2. Läs av marknivå]`.
3. **Steg 3: Monterad på fordonet -> Automatisk Monteringshöjd (`activeAntennaHeightM`)**
   - Sätt fast pucken på fyrhjulingens fäste / schaktbladet / spårsläden (utan att flytta fordonet) och tryck `[3. Beräkna Monteringshöjd]`.
   - Appen räknar direkt ut:
     $$H_{\text{antenn}} = (Z_{\text{monterad}} - \Delta Z_{\text{session}}) - Z_{\text{yta}}$$
   - Visar t.ex. **`Monteringshöjd: 118.4 cm`** och sparar det på vald fordonsprofil (t.ex. *"Band-ATV"*).

---

## 5. Fyra Mät-typer & Driftsfall i Appen

Användaren väljer mät-typ innan loggning startas:

1. **Barmark (`bare_ground`):** Bygger och fyller på grundmodellen $Z_{\text{barmark}}$ över hela 8-metersgatan och kurvorna.
2. **Planering & Schaktning (`planning`):** Mätning av kanonhögar efter snösprutning samt realtidsstöd på schaktbladet när högarna trycks ut. Beräknar överskottsvolym ($\text{m}^3$) per brunn.
3. **Bädd (`bed`):** Mätning av den utschaktade och pistade snöbädden (skejtbädd / spårbädd innan spårning, eller ovankant bädd efter spårning).
4. **Spår (`track`):** Pucken sitter på spårsläden eller på skidor/band-ATV i det färdigdragna spåret. Fångar både **snödjup i spåret** och **faktisk spårlängd i meter** längs den aktiva slingan.

---

## 6. Grafiska 3D-Vyer & Visualiseringsprinciper (För Claude Code)

För att göra snödjupet och terrängen omedelbart begriplig i mörker och snörök ska UI:t byggas med **MapLibre GL JS** (gratis, WebGL-accelererat, ingen API-nyckel krävs) i ett mörkt högkontrast-tema (`#0B111E`).

### Gemensam Färgskala för 3D-staplar och spår
- 🔴 **Kritiskt grunt (`< 15 cm`):** `#EF4444` (Röd) – Lyft schaktbladet / risk för genomslag till grus/flis.
- 🟡 **Tunn bädd (`15 – 30 cm`):** `#F59E0B` (Gul) – Klarar skejtbädd, men grunt för dubbla klassiska spår.
- 🟢 **Måldjup (`30 – 60 cm`):** `#10B981` (Grön) – Optimal bädd för `2 klassiska + skejtbädd + 2 klassiska`.
- 🔵 **Snöhög / Överskott (`> 60 cm`):** `#3B82F6` till `#60A5FA` (Blå/Cyan) – Kanonhög att schakta ut längs spårgatan.

---

### Vy 1: Isometrisk 3D-Voxelvy för Planering & Snöhögar (`Planning3DVoxelMap`)
Används på surfplatta/dator för att analysera snöhögar vid brunnarna och planera schaktning:
- **MapLibre `fill-extrusion`-lager:** Varje uppmätt $1\times 1\text{ m}$-ruta konverteras till en GeoJSON-polygon via `buildGridExtrusionGeoJson()` i `SparkFunFacetService.ts`.
- **Visuell Z-förstärkning (`verticalExaggeration = 5.0`):** Eftersom 40 cm snö annars ser platt ut på en stor karta multipliceras stapelns 3D-höjd med en valbar faktor (t.ex. `5x`, så 50 cm snö ritas som en 2,5 meter hög 3D-stapel). En kanonhög på 2,5 meter reser sig då som ett tydligt blått berg runt brunnen.
- **Slangräckviddscirklar i 3D:** Runt varje brunn (1–20) ritas en streckad cyan-cirkel med **8,5 meters radie** (`hoseReachEffectiveM`) via `buildWellHoseCirclesGeoJson()` så man ser exakt var kanonslangen når och var högarna hamnar.
- **Sidopanel med KPI-kort:** Visar *Snittdjup (cm)*, *RTK Status (`RTK FIXED 14mm`)*, *Täckningsgrad (%)* samt *Snövolym ($\text{m}^3$) per brunn*.

---

### Vy 2: Förar-HUD i Hytten med 3D-Follow & Tvärsnittsprofil (`DriverCockpitHUD`)
Används på surfplattan i maskinen/på bandfyrhjulingen under pågående körning:
- **Övre del – 3D-korridor i körriktningen:**
  - Kameran låst på fordonets position med `pitch: 60` (lutad framåtblick) och `bearing: currentHeadingDeg` (roterar mjukt med körriktningen).
  - Ritar ut den **8 meter breda spårgatan** som en färgkodad 3D-matta rakt framåt så föraren ser röda/gula partier eller blå snöhögar 15–30 meter framför bladet.
  - Stor realtidssiffra uppe till vänster (t.ex. **`35 cm`**) som skiftar färg efter aktuell ruta.
- **Nedre del – Live Tvärsnittsgraf över 8-metersbredden (`CrossSectionProfileChart`):**
  - En bred SVG/Canvas-graf längst ner på skärmen som visar ett tvärsnitt av den 8 meter breda gatan (`-4m` vänster till `+4m` höger om maskinen/spårets mittlinje), genererad via `getTrackCrossSectionProfile()`.
  - **Brun basyta i botten:** Visar barmarkens lutning/dosering ($Z_{\text{barmark}}$).
  - **Blå/Grön snöyta ovanpå:** Visar aktuell snötjocklek över hela bredden samt var de klassiska spårprofilerna skär ner i bädden.

---

### Vy 3: Publik 3D-Gäst- & Åkarsida i Mobilen (`PublicGuestMobileView`)
Öppen sida på `/sparet` eller `/guest` för skidåkare (läser endast 1 dokument: `public/status`):
- **3 kompakta glaskort (Glassmorphism) överst:**
  1. **Sparbanksspåret:** Aktuell öppen spårlängd, t.ex. **`2.1 km`** (uppmätt från senaste `track`-körningen).
  2. **Snödjup:** T.ex. **`42 cm`** (medeldjup på bädden).
  3. **Spårprofil:** T.ex. **`2 klassiska + skejtbädd + 2 klassiska`** med ikon för spårbredd.
- **Tiltad 3D-översiktskarta över Råda:**
  - Visar hela slingan med en självlysande (neon-grön/cyan) 3D-spårlinje som visar exakt vilka vändslingor som är dragna för dagen, hur man åker runt Klockan (Brunn 16–19) och åkriktningen (motsols).
  - Enkel knapp nere till höger för att växla mellan `[2D]` och `[3D]`.

---

## 7. Backend-arkitektur i Cloud Firestore (Kostnads- & Läsoptimerad)

För att undvika tusentals dokumentläsningar när gäster öppnar spårkartan lagras rutnätet samlat i dokument med `setDoc(..., { merge: true })`.

### Dokumentstruktur i Firestore (`facilities/rada_sparbankssparet/...`)
- **`grids/bare_ground`**: `{ cells: Record<gridKey, { z, samples, updatedAt }>, well7ReferenceZ, lastModified }`
- **`grids/snow_planning`**: `{ cells: Record<gridKey, SnowCell>, updatedAt }`
- **`grids/snow_bed`**: `{ cells: Record<gridKey, SnowCell>, updatedAt }`
- **`grids/snow_track`**: `{ cells: Record<gridKey, SnowCell>, activePolyline: TrackLinePoint[], activeTrackLengthM: number, updatedAt }`
- **`public/status`**: Publikt sammanfattningsdokument (1 enda läsning för gästsidan).
- **`sessions/{sessionId}`**: Loggar varje mätkörning.