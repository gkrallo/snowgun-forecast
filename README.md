# ❄️ Snöprognos — snowgun-forecast

Beslutsstöd för snöproduktion i längdskidspår. Appen visar våttemperatur, vind
och färdiga körfönster, och räknar ut hur kanonerna behöver riktas för att snön
ska landa i spåret.

### 🔗 [Öppna appen](https://gkrallo.github.io/snowgun-forecast/)

Allt ligger i en enda `index.html`. Ingen bygg, ingen server, inga beroenden
utöver Chart.js och Leaflet från CDN.

## Vad appen svarar på

**Långsiktigt — går det att köra, och när?**
Körfönstren högst upp listar sammanhängande perioder de närmaste tio dygnen där
våttemperatur, vind och sidodrift håller sig inom gränserna. Gula fönster är
marginella, gröna är trygga.

**I stunden — måste vi stoppa i natt?**
Fliken *Timme för timme* visar kvartsvis upplösning de närmaste sex timmarna och
timvis därefter, med färgmarkering per rad. Där syns när våttemperaturen kryper
över gränsen mot morgonen och när vinden vänder.

**Var landar snön, och var ska aggregaten stå?**
Fliken *Vind & sikte* delar upp vinden i en komposant längs spåret (harmlös) och
en tvärs spåret (problemet). Utifrån kastbanans höjd räknas driften ut, och
appen säger hur många grader kanonen behöver vridas mot vinden.

Läs in en GPX-fil från en runda i spåret så används spårets verkliga geometri i
stället för en enda riktning. Kartan färgar varje sträcka efter om snön landar
innanför spårbredden, fläktar och lansar placeras ut med ett tryck, och varje
aggregat får sitt eget riktningsråd utifrån hur spåret ligger just där.
Tidsreglaget spolar fram i prognosen så det går att se vilka sträckor som blir
omöjliga när vinden vrider under natten.

## Inställningar

Under ⚙️ ställs anläggningens egna värden in. De sparas i webbläsaren.

| Inställning | Vad den gör |
| --- | --- |
| Spårets riktning | Grader, 0 = norr. Används när ingen GPX-fil är inläst. |
| Antal fläktar och lansar | Hur många aggregat som kan placeras ut på kartan. |
| Fläkt: fallhöjd och kastlängd | Hur högt fanan toppar och hur långt den når. |
| Lans: huvudets höjd och räckvidd | Lanshuvudets höjd över mark — där faller snön rakt ned. |
| Spårets bredd | Driver snön längre än halva bredden varnar appen. |
| Vattentemperatur | Varmare vatten ger kallare startgräns och lägre kapacitet. |
| Snökvalitet 1–10 | 1 = torr puder, 10 = blöt bassnö. Höjer kravet på kylan. |
| Start- och vindgränser | Justera fritt mot er egen erfarenhet. |
| Formel för våttemperatur | Psykrometrisk (rekommenderad) eller Stull 2011. |

## Brunnar och aggregat

Anläggningen har fasta brunnar med vatten och el, och aggregaten kopplas in med
slang. Brunnarna sätts ut på kartan, klistras in som koordinater eller mäts in
på plats med telefonens GPS, och kan numreras om automatiskt från söder till
norr.

Inmätningen samlar positioner under en vald mättid och viktar dem med 1/r² på
rapporterad noggrannhet. Första fixet slängs eftersom det ofta är cachat,
upprepade positioner räknas en gång, och fix som avviker mer än 2,5 gånger
medianavståndet från klungan sorteras bort. Resultatet redovisas med spridning
mellan fixen, vilket är ett ärligare kvalitetsmått än telefonens egen
noggrannhetssiffra. Skärmen hålls vaken under mätningen via Wake Lock där det
stöds. Varje utplacerat aggregat får en
streckad linje till närmaste brunn, röd när slangen inte räcker.

Plymen ritas i två lager: heldragen för vindstilla och streckad för den vind som
råder vid vald tidpunkt. Handtaget i plymens mitt vrider kanonen och ändrar
kastlängden, vilket sparas per aggregat. Utan egen inställning riktas fläktar
mot spåret och lansar längs det.

Brunnar och aggregat sparas per spår i webbläsaren.

## Inbyggt spår

Sparbanksspåret i Lidköping följer med appen: ett varv ur en GPX-logg,
förenklat till 56 punkter och drygt en kilobyte. Bara geometrin är inbakad,
inga tidsstämplar.

Spåret laddas automatiskt när den valda platsen ligger inom 15 km från det.
Längre bort döljs det — en karta över Lidköping ovanpå Arvikas väderprognos
vore bara vilseledande — men det går att visa som exempel med en knapp. Läser
man in en egen GPX-fil tar den över.

Varje spår har sin egen kanonuppställning i webbläsarens lagring, nycklad på
spårets mittpunkt och längd. Man kan alltså växla mellan anläggningar utan att
placera om aggregaten.

## Egen spårfil

GPX från Samsung Health, Strava, Garmin, Polar och de flesta andra klockor och
appar fungerar direkt. Flera varv är inget problem: appen letar upp den punkt
längre fram på rundan som ligger tillbaka på samma ställe och klipper där.

Varvet väljs på kriteriet att det ska förklara hela loggen: kandidaterna
prövas från kortast till längst tills en täcker 95 % av punkterna, och bland
varv av ungefär den längden tas det med minst söm. Utan täckningstestet fastnar
sökningen på en delslinga, eftersom en runda ofta passerar startpunkten mitt
i varvet. Är slingan sluten fogas den ihop så att det inte blir ett hål.

Loggen förenklas sedan med Douglas–Peucker vid 2,5 meters tolerans, hörnen
rundas av med två varv Chaikin, och resultatet förenklas igen vid 0,8 m för
att plocka bort punkter på raksträckorna. En runda på 2,3 km med en punkt i
sekunden går från 2 449 punkter till drygt hundra, med segment på omkring
femton meter, och tar 2,6 kB i webbläsarens lagring.

Avrundningen flyttar linjen någon meter i skarpa svängar och kortar banan med
knappt två procent. Ett riktigt spår svänger mjukt, så kurvorna blir både
snyggare och mer representativa för vindmodellens bäringar än en polygon med
skarpa knän.

Inlästa spår och utplacerade aggregat sparas lokalt i webbläsaren, inte i repot.
Det inbyggda spåret ligger däremot i `index.html` och följer med alla besökare.

## Kalibrering

Har anläggningen egna våttemperaturgivare väger de tyngre än en prognospunkt
tio meter över öppen mark. Under ⚙️ skrivs avläsningen in, appen räknar ut
skillnaden mot modellen och lägger den som en fast korrigering på alla
våttemperaturer. Korrigeringen visas i statusraden så att den inte blir osynlig.

Använd referensgivaren, inte en kanon i drift: ett aggregat i sin egen plym
mäter sin egen fukt och visar flera grader för varmt.

## Beräkningar

**Våttemperatur** löses numeriskt ur den psykrometriska jämvikten med
mättnadsångtryck enligt Buck (1996) och verkligt lufttryck från prognosen.
Modellen ligger inom ett par tiondels grad från tabellvärden.

Den tidigare versionen använde Stulls approximation (2011). Den är snabb men
räknar 0,3–0,7 grader för kallt vid hög luftfuktighet, alltså precis i de lägen
som är intressanta här. Båda finns kvar under ⚙️ för jämförelse.

| Luft / RF | Facit | Psykrometrisk | Stull |
| --- | --- | --- | --- |
| 0 °C / 90 % | −0,6 | −0,56 | −0,93 |
| 0 °C / 30 % | −4,3 | −4,08 | −4,29 |
| +2 °C / 90 % | +1,5 | +1,39 | +1,04 |
| +2 °C / 30 % | −2,8 | −2,50 | −2,78 |

**Startgräns** utgår från −2,5 °C våttemperatur, tillverkarnas normalvärde för
fläktaggregat, och skjuts nedåt av varmt vatten. Målkvaliteten lägger på
ytterligare 0,4 °C per steg neråt på kvalitetsskalan.

**Kapacitet** växer med marginalen under startgränsen enligt en mättande kurva
som når ungefär 90 % vid fyra grader under gränsen.

**Sidodrift** beräknas som tvärvindens hastighet gånger tiden snön hänger i
luften, där hangtiden är fallhöjden delat med 1,2 m/s. Fläkt och lans räknas var
för sig: fläktkanonen skjuter iväg fanan med egen luftström så tyngdpunkten
landar långt före svansen (faktor 0,6), medan lansen släpper snön från huvudets
höjd och låter gravitationen sköta resten (faktor 0,9). Med ett inläst spår
räknas detta per segment; hero och tabell visar medianen över de utplacerade
aggregaten.

Lansar ställs i svängar eller vid sidan av spåret så att plymen faller i
spårets längdriktning. Därför bedöms varje utplacerat aggregat mot hela den
sammanhängande sträcka det faktiskt når, inte mot närmaste segment: i en sväng
pekar den sträckan åt flera håll samtidigt och det är den värsta riktningen
som sätter gränsen. Avståndet till spåret mäts vinkelrätt mot sträckan, och
täckningen klipps mot räckvidden genom att punkta spåret var fjärde meter.
Står ett aggregat längre ut än sin räckvidd säger appen till.

Fallhöjden är den parameter driften ska kalibreras med. Stämmer inte den
beräknade driften med vad ni ser i spåret, justera höjden tills den gör det.

För en lans är fallhöjden exakt huvudets höjd över marken: profilens längd
gånger cosinus för lutningen från lodrätt. Mät profilen en gång så är den
siffran klar. För en fläktkanon finns ingen motsvarande specifikation — fanans
topp beror på rörvinkeln, och det vita molnet ovanför är till största delen
isdimma som aldrig landar.

## Kartlager

Flygbild från Esri som förval, vägkarta från OpenStreetMap som alternativ,
omkopplare nere till vänster på kartan. Flygbild är bättre i skogsmark där
vägkartan är nästan tom.

OpenStreetMaps kartrutor kommer från frivilligdrivna servrar vars policy ber
appar med tung användning att gå någon annanstans, och kontrollen har skärpts.
Lagret finns kvar som alternativ med `referrerPolicy: "strict-origin-when-cross-origin"`
satt, eftersom ett strippat Referer-huvud är den vanligaste orsaken till att
OSM nekar förfrågan.

Kartrutor cachas inte av service workern, varken Esris eller OSM:s.

## Väderdata

[Open-Meteo](https://open-meteo.com/), fri icke-kommersiell användning. Två
anrop slås ihop: kvartsvis upplösning i tre dygn och timvis i tio dygn.

Hämtade fält: `temperature_2m`, `relative_humidity_2m`, `wind_speed_10m`,
`wind_gusts_10m`, `wind_direction_10m`, `surface_pressure`.

Tidsstämplar hämtas som `timeformat=unixtime`. Standardformatet ISO 8601 utan
tidszonsangivelse tolkas av webbläsaren som lokal tid trots att Open-Meteo
menar UTC, vilket förskjuter hela prognosen en till två timmar.

## Installera som app

Appen har ett webbmanifest och en service worker, så den går att lägga på
hemskärmen och startar då utan adressfält, i eget fönster och med egen ikon.
Senast hämtade prognosen finns kvar utan täckning, vilket är poängen ute vid
spåret. Kartrutor och färsk väderdata kräver nät.

Service workern sparar appens egna filer och biblioteken från CDN. Väderdata,
platssökning och kartrutor går alltid mot nätet — det första för att färsk data
är hela poängen, det sista för att OpenStreetMaps villkor inte tillåter att
kartrutor cachas i bulk.

Manifestet heter `manifest.json` och inte `manifest.webmanifest`. Spec:en
rekommenderar det senare, men filändelsen kräver att servern känner till
MIME-typen `application/manifest+json`, och det gör inte alla statiska
webbhotell. `.json` serveras rätt överallt och accepteras av alla webbläsare.

**Vid uppdatering:** höj `VERSION` i `sw.js`. Annars kan besökare som redan
installerat appen ligga kvar på gammal kod tills cachen töms.

## Filer

| Fil | Roll |
| --- | --- |
| `index.html` | Hela appen. Ingen bygg, inga lokala beroenden. |
| `manifest.json` | Namn, ikoner och fristående läge. |
| `sw.js` | Offline-cache. |
| `icon-192.png`, `icon-512.png` | Appikoner. |
| `icon-maskable-512.png` | Ikon med marginal för Androids runda masker. |
| `apple-touch-icon.png` | Ikon för iOS hemskärm. |
| `unit.mjs` | Tester av beräkningarna. Följer inte med till besökarna. |

Sökvägarna är relativa, så det fungerar både i repotets underkatalog på GitHub
Pages och på en egen domän.

## Kör lokalt

Ladda ner `index.html` och öppna den i valfri webbläsare. Inget mer behövs —
service workern hoppas över när sidan öppnas direkt från disk.

Vill du prova offlineläget och installationen, starta en enkel server i
mappen, till exempel `python -m http.server 8000`, och öppna
`http://localhost:8000`. Webbläsaren räknar localhost som säkert, så där
startar service workern precis som på GitHub Pages.

## Tester

`node unit.mjs` kontrollerar beräkningarna: våttemperatur, startgränser,
sidodrift, körfönster, varvdetektering, täckning, brunnar, lagring och
service worker. Den laddar hela appen i en låtsasbrowser (jsdom) med påhittat
väder. Chart.js, Leaflet och `fetch` byts mot attrapper, så inga riktiga
nätanrop görs. Kör den före varje utgåva.

jsdom installeras en gång, utan att någon paketfil skapas:
`npm install --no-save --no-package-lock jsdom`.

## Licens

Öppen källkod. Använd den fritt för er egen anläggning.
