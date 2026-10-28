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

Sex fläktkanoner (Sufag Super Access, numera MND Snow) och tre lansar
(MND Taurus 2.0). Alla mobila. Arton fasta brunnar med vatten och el; slangen
är tio meter, ibland tjugo. Styrsystemet är Sufags eget med
våttemperaturgivare på kanonerna.

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

**Höj `VERSION` i `sw.js` vid varje utgåva.** Annars kan de som installerat
appen bli kvar på gammal kod.

Testa lokalt med en enkel server, till exempel `python -m http.server 8000`,
och öppna `http://localhost:8000`. Service worker, geolocation och
installationsprompten kräver säker kontext, och localhost räknas som sådan —
men `file://` gör det inte.

## Användaren

Kristian i snögruppen. Inte programmerare, men tekniskt påläst och van vid
anläggningen. Förklara vad en ändring gör och varför, inte bara att den är
gjord. Han hittar fel som inte syns i koden — lyssna när han säger att något
inte stämmer med verkligheten.
