# Snöprognos — projektanteckningar

Beslutsstöd för snöproduktion i längdskidspår, byggt för Lidköpings
Vintersportklubbs snögrupp. Ligger på GitHub Pages som en PWA.

## Grundregler för det här repot

- **Allt i `index.html`.** Ingen bygg, inga lokala beroenden, ingen npm.
  Chart.js och Leaflet hämtas från CDN. Behåll det så — appen ska gå att
  öppna, läsa och felsöka av en icke-programmerare om jag inte finns till
  hands.
- **Svenska i allt** som syns för användaren, och i kodkommentarer.
- **Kommentarer förklarar varför, inte vad.** Särskilt där ett värde är
  empiriskt eller där något en gång var fel.
- Skriv aldrig över `index.html` i sin helhet när en riktad ändring räcker.
  Filen är stor och innehåller fysik som tagit tid att kalibrera.

## Anläggningen

Sex fläktkanoner (Sufag Super Access, numera MND Snow) och två lansar
(MND Taurus 2.0). Alla mobila. Styrsystemet är Sufags eget med
våttemperaturgivare på kanonerna.

Lansen står på en vagn med hjul. Stången är drygt sex meter, fäst ungefär
1,5 m upp och lutad, så dysorna hamnar på ungefär 6–7 m — `lanceHeight` är
7. Huvudet har tolv dysor i två rader om sex, och alla går bara när det är
ordentligt kallt: styrsystemet kopplar in dem stegvis. Appen räknar inte
stegen utan med den mjuka kurvan i `capacity`, som når drygt 90 % ungefär
fem grader under startgränsen.

Tjugo fasta brunnar med vatten och el, inlagda som `BUILTIN_WELLS`. Nummer ett
längst i söder, ungefär sextio meters mellanrum. De sitter **i kanten på
spårgatan**, som är cirka åtta meter bred och bredare i kurvorna. Vid god
snötillgång pistas gatan som två spår, skejtbädd och två spår; åkriktningen är
motsols.

Brunn 1 och 16 står där spåret delar sig. Det inspelade varvet följer bara ena
grenen, så de hamnar längre från linjen på kartan än de är från spårgatan i
verkligheten. Samma gäller 10, 13 och 17 — det är inte fel i koordinaterna.

Brunn 20 är en reserv vid schaktytan, aldrig använd, markerad `spare: true` och
utesluten ur förslag om inkoppling.

**Brunn 7 bär styrsystemets väderstation.** Det är den givaren som ska läsas av
vid kalibrering. Dess vindmätare är inte tillförlitlig — vinden ska alltid tas
från prognosen, aldrig från stationen.

Slangen är tio meter, ibland tjugo, men förvalet är åtta. Brunnarna är djupa
och slangen går inte att böja tvärt vid brunnskanten, så ett par meter
försvinner innan den ligger på marken.

Ändrade förval i `DEFAULTS` når bara den som inte har sparat inställningar —
`loadSettings` lägger de sparade ovanpå. Övriga får trycka Återställ under ⚙️.

Spåret är Sparbanksspåret, 2,3 km, inbakat i `index.html` som
`BUILTIN_TRACK`. Drygt hälften går i nord–sydlig led.

## Fysiken — rör inte utan att läsa detta

**Våttemperatur** löses numeriskt ur den psykrometriska jämvikten
(`wetBulbPsychrometric`), med Buck 1996 för mättnadsångtrycket och verkligt
lufttryck från prognosen. Stulls approximation finns kvar som alternativ men
räknar 0,2–0,5 grader för kallt vid hög luftfuktighet. Verifierat mot
tabellvärden: 0 °C/90 % ska ge ungefär −0,6.

Appen räknar mot vatten även under noll, eftersom dropparna i fanan är
flytande. ASHRAE:s definition räknar mot is under noll och ger ett par
tiondelar kallare i torr luft (0 °C/30 %: −4,25 mot appens −4,08; +2 °C/30 %:
−2,76 mot −2,50). Det ligger precis vid startgränsen, så byt inte modell utan
att jämföra mot styrsystemets givare — kalibreringen tar annars hand om det.

**Startgräns** −2,5 °C våttemperatur, justerad för vattentemperatur. Håll isär
den från målkvalitetens gräns — kör/vänta följer startgränsen, kvalitetsvalet
säger bara om man når sin målkvalitet. De var ihopslagna en gång och gjorde
appen onödigt pessimistisk. Samma sak gäller lansen: `thresholds().lance` är
startgränsen, `lanceTarget` målet. Lansen bar kvalitetspåslaget i startgränsen
långt efter att fläkten rättats.

**Sidodrift** = tvärvind × fallhöjd / 1,2 m/s × spridningsfaktor. Faktorn är
0,6 för fläkt (luftströmmen kastar fanan framåt, tyngdpunkten landar före
svansen) och 0,9 för lans (gravitationen, nästan allt faller hela vägen).
Fallhöjden är knoppen allt kalibreras med.

**Kalibrering** mot anläggningens egen våtmätare läggs på som `S.wbOffset`.
All våttemperatur ska gå genom `wetBulbAdj`, aldrig `wetBulb` direkt — utom
i modelljämförelsen och i våttemperaturkartan, som ska visa råa värden, och i
Kalibrera-knappen, som måste jämföra mätningen mot det okorrigerade värdet.

**Tvärvind** ska gå genom `crossStats`/`windContext`, aldrig
`windGeometry(…, S.trailBearing)`. Inställningens bäring gäller bara när inget
spår är inläst. Graferna räknade en gång mot den och visade noll tvärvind på
Sparbanksspåret när verkligheten var nära tre m/s. Bäringsprofilen cachas —
allt som ändrar spår, kanoner eller `S` ska anropa `invalidateWindProfile`.

## Snödjup och barmark

Snödjup = snöyta − barmark, ruta för ruta. Fliken **Snödjup** har än så länge
bara barmarken; snömätningen och Firebase kommer sedan. Underlaget är
`koncept_och_ux_f_r_sn_djupsm_tning.md` och TypeScript-modulen bredvid — idéer,
inte kod som körs. Fältinstruktionen ligger i `docs/barmarksmatning.md`.

- **Rutnät** på en meter med origo i brunn 7, via `bareXY`/`bareLatLon` och
  WGS84-värdena i `BARE_M`. Allt som hamnar i rutnätet ska gå genom dem.
- **Höjderna är ellipsoidhöjder mot Swepos-stationen LIDK**, med stationens
  koordinater låsta i `docs/ppk-lidk.conf`. Alla pass räknas mot samma punkt
  och hamnar i samma höjdsystem. Ändra aldrig koordinaterna mitt i en säsong.
  Höjden är inte RH2000, och den är vad pucken visar liggande på marken —
  fascentrum några centimeter upp ingår och tar ut sig mot snöytan. Förut var
  brunn 7-locket nollpunkt (format `snoprognos-barmark-1`), men det står under
  tallar och gav ingen användbar fix i provpasset 10 november.
- **GLONASS-heltalen är av** i `ppk-lidk.conf`. LIDK är en Septentrio, pucken
  en u-blox, och heltalen låstes fel för pucken på marken bredvid
  fyrhjulingen 11 november — antennhöjden blev 16 cm för låg och kontrollen
  gick inte ihop. Sätt inte tillbaka fix-and-hold. RTKLIB tappar mappen i en
  sökväg som börjar med `..`, så basens fil måste ligga i passmappen.
- **Kalibreringen läses ur loggen** i fältinstruktionens ordning: marken,
  fästet (skillnaden är antennhöjden), körning, stopp, marken igen
  (kontrollen). Allt på ett ställe med fri himmel, var som helst. Stoppet
  före kontrollen klipper bort punkterna medan pucken bärs i handen — utan
  det hamnar handhöjden i rutnätet. Ett tankstopp mitt i passet följs inte av
  marken och räknas inte som kontroll. Föraren sitter på under fästet och
  stoppet, så att fjädringen står som under körningen; tumstocken mäts innan
  och kan därför visa någon centimeter mer än antennhöjden.
- **Mätpassguiden** (Snödjup) sparar sitt läge i `snowGuide` och räknar tid
  från klockslag, så att en omladdning eller en nedsaktad timer inte tappar
  bort var man var. `reloadForUpdate` väntar medan guiden pågår. Pucken läses
  via Bluetooth LE med Nordics UART-tjänst — det klassiska SPP, puckens
  förval, kan webbläsaren inte.
- **Bara fix** och höjdosäkerhet under fem centimeter. Float ger decimeterfel.
- **Ett varv täcker en meter.** Pucken mäter rakt under sig; en åttameters gata
  behöver åtta varv. Luckorna mellan varven visas rött.
- **Lagring:** färdig barmark i `barmark.json` i roten; inläst men inte sparad
  i localStorage (`snowBareDraft`). Mätloggar i `matdata/`, som inte följer med
  till git.
- **Firestore** (projekt `snoprognos`, inte inkopplat än): lägg aldrig ett helt
  rutnät i ett dokument. Gränserna är 1 MiB och 40 000 indexposter per
  dokument; konceptets förslag slår i dem efter ett par hundra meter gata.

## Fallgropar som redan kostat tid

- **Tidszon.** Open-Meteo levererar UTC utan zonmarkering som standard, och
  JavaScript tolkar en sådan sträng som lokal tid. Hela prognosen hamnade en
  till två timmar fel. Lösningen är `timeformat=unixtime`. Ändra aldrig till
  ISO-format.
- **Flex-shrink.** Knappar i en flexrad krymper under sitt innehåll om man
  inte sätter `flex:0 0 auto`. Texten rann ut över knapparna.
- **Död kod efter en tidig retur.** Kartans klickhanterare registrerades
  aldrig eftersom ett `return true;` hamnade före den. Appen gick inte att
  placera kanoner med på flera dagar innan någon märkte det.
- **Varvsömmen.** Varvdetekteringen måste välja ett varv som täcker 95 % av
  hela loggen. Kortaste slutna slingan ger en delslinga; första paret inom
  tjugo meter ger ett synligt hål i spåret.
- **OpenStreetMaps kartrutor** blockeras om Referer strippas, och deras policy
  ber appar med tung användning att gå någon annanstans. Flygbild från Esri är
  förval, OSM alternativ med `referrerPolicy` satt.
- **Täckning i svängar.** Ett aggregat bedöms mot hela den sammanhängande
  sträcka det når, inte mot närmaste segment, och täckningen klipps mot
  räckvidden. Annars räknas den parallella returslingan in.
- **Demoläget är klibbigt.** `useBuiltinTrack` sätter en flagga som visar
  Sparbanksspåret var man än är. Den är bara till för demoknappen. För att ta
  bort ett inläst spår används `clearUserTrack`, annars följer Sparbanksspåret
  med till Arvika.
- **Inbyggda frågerutor.** `alert`, `confirm` och `prompt` visas inte i
  förhandsvisningen i Claude-appen, i vissa installerade appar eller i
  Messengers webbläsare — de svarar nej eller tomt direkt och knappen ser död
  ut. Rensa kanoner och fem andra knappar gjorde ingenting på det viset. Använd
  `ask()`/`tell()` (appens egen ruta) eller `armConfirm()` (tryck två gånger).
  `unit.mjs` fäller den som använder de inbyggda.
- **En klickhanterare på en Leaflet-markör som ritar om kartan** stänger
  markörens ruta direkt — Leaflet stänger rutan när markören tas bort. Därför
  gick det inte att ta bort enskilda kanoner.
- **Gamla hämtningar.** Ett långsamt svar för en plats man lämnat får inte
  skriva över den nya. `fetchData` har en bricka (`fetchToken`) och läser
  färdigt svaret innan något skrivs.
- **Dragbara brunnar.** Brunnarna gick att dra, och på en telefon räcker det
  att panorera kartan med fingret på en brunn. Brunn 1 hamnade fel utan att
  någon märkte det, och den sparade listan tog sedan över anläggningens.
  Brunnarna är låsta nu (`movingWellId`, Flytta i rutan). `wellChanges` visar
  under kartan vad som skiljer sig, och Återställ brunnarna tar bort den
  sparade listan.
- **Kartan utan prognos.** `renderPlan` slutade förut när det inte fanns
  väderdata, så utan nät vid spåret blev kartan tom. Allt som behöver `pt`
  måste klara att den är `null`.

## Testning

(`run.mjs` och `survey.mjs` ligger inte i repot än — tills de gör det är
`unit.mjs` det som körs.)

`node run.mjs` kör appen i jsdom med påhittad väderdata, går igenom alla
flikar, inställningar och infokapitel, läser in en GPX och placerar aggregat.
Den ska gå igenom utan fel före varje commit. `survey.mjs` testar GPS-
inmätningen med simulerade fix, inklusive ett cachat startfix och ett grovt
felaktigt.

`node unit.mjs` kontrollerar siffrorna: våttemperatur, startgränser, drift,
körfönster, varvdetektering, täckning, brunnar, lagring och service worker.
Ska också gå igenom före varje commit. Tester märkta KÄNT FEL visas som
"todo" och fäller inte körningen — ta bort markeringen när felet är rättat.

jsdom installeras lokalt utan paketfiler:
`npm install --no-save --no-package-lock jsdom`. Det hamnar i `node_modules/`,
som är ignorerad.

Inga riktiga nätanrop i testerna — Chart.js, Leaflet och fetch stubbas.

## Publicering

GitHub Pages serverar direkt från `main`, gren-läge, root. Det finns inget
eget arbetsflöde och ska inte behövas. Ladda upp, så är det ute inom någon
minut.

**Höj `VERSION` i `sw.js` och `APP_VERSION` i `index.html` vid varje utgåva.**
Annars kan de som installerat appen bli kvar på gammal kod. `unit.mjs` fäller
den som bara höjer den ena. `APP_VERSION` står under Om appen, så att man kan
se vilken version telefonen kör.

En installerad app laddas nästan aldrig om — telefonen håller den vid liv.
Därför frågar appen efter en ny service worker när den kommer fram på
skärmen och laddar om när den nya tagit över (`reloadForUpdate`). Den första
utgåvan med det var version 10; äldre installationer måste startas om för
hand en gång.

Testa lokalt med en enkel server, till exempel `python -m http.server 8000`,
och öppna `http://localhost:8000`. Service worker, geolocation och
installationsprompten kräver säker kontext, och localhost räknas som sådan —
men `file://` gör det inte.

## Användaren

Kristian i snögruppen. Inte programmerare, men tekniskt påläst och van vid
anläggningen. Förklara vad en ändring gör och varför, inte bara att den är
gjord. Han hittar fel som inte syns i koden — lyssna när han säger att något
inte stämmer med verkligheten.

## Två vägar in i samma fil är den farligaste buggen

Den 1 november skrevs en hel commit bort — kanonernas riktningsspets, de egna
frågerutorna och rättningen av att en kanons ruta stängdes direkt — eftersom en
äldre `index.html` laddades upp via GitHubs webbgränssnitt ovanpå arbete som
gjorts i Claude Code. Uppladdningen ersätter filen rakt av och varnar inte för
att den är äldre.

Projektet redigeras därför i Claude Code. Kommer en fil utifrån: `git pull`
först, läs `git log` och jämför, lägg ändringen ovanpå. Ladda aldrig upp en
fil som byggts på något annat än aktuell HEAD.
