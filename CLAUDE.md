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
räknar 0,3–0,7 grader för kallt vid hög luftfuktighet. Verifierat mot
tabellvärden: 0 °C/90 % ska ge ungefär −0,6.

**Startgräns** −2,5 °C våttemperatur, justerad för vattentemperatur. Håll isär
den från målkvalitetens gräns — kör/vänta följer startgränsen, kvalitetsvalet
säger bara om man når sin målkvalitet. De var ihopslagna en gång och gjorde
appen onödigt pessimistisk.

**Sidodrift** = tvärvind × fallhöjd / 1,2 m/s × spridningsfaktor. Faktorn är
0,6 för fläkt (luftströmmen kastar fanan framåt, tyngdpunkten landar före
svansen) och 0,9 för lans (gravitationen, nästan allt faller hela vägen).
Fallhöjden är knoppen allt kalibreras med.

**Kalibrering** mot anläggningens egen våtmätare läggs på som `S.wbOffset`.
All våttemperatur ska gå genom `wetBulbAdj`, aldrig `wetBulb` direkt — utom
i modelljämförelsen och i våttemperaturkartan, som ska visa råa värden.

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

## Testning

`node run.mjs` kör appen i jsdom med påhittad väderdata, går igenom alla
flikar, inställningar och infokapitel, läser in en GPX och placerar aggregat.
Den ska gå igenom utan fel före varje commit. `survey.mjs` testar GPS-
inmätningen med simulerade fix, inklusive ett cachat startfix och ett grovt
felaktigt.

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
