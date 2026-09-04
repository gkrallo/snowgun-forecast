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
| Kastbanans höjd och längd | Styr hur långt snön hinner driva innan den landar. |
| Spårets bredd | Driver snön längre än halva bredden varnar appen. |
| Vattentemperatur | Varmare vatten ger kallare startgräns och lägre kapacitet. |
| Snökvalitet 1–10 | 1 = torr puder, 10 = blöt bassnö. Höjer kravet på kylan. |
| Start- och vindgränser | Justera fritt mot er egen erfarenhet. |
| Formel för våttemperatur | Psykrometrisk (rekommenderad) eller Stull 2011. |

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

Loggen förenklas med Douglas–Peucker vid tre meters tolerans. En runda på
2,3 km med en punkt i sekunden går från 2 449 punkter till ett femtiotal utan
att geometrin ändras mer än ett par meter, och tar då drygt en kilobyte i
webbläsarens lagring.

Inlästa spår och utplacerade aggregat sparas lokalt i webbläsaren, inte i repot.
Det inbyggda spåret ligger däremot i `index.html` och följer med alla besökare.

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
luften, där hangtiden är kastbanans höjd delat med 1,2 m/s. Tyngdpunkten i fanan
landar tidigare än svansen, därav faktorn 0,6. Med ett inläst spår räknas detta
per segment; hero och tabell visar medianen över de utplacerade aggregaten.

Kastbanans höjd är den parameter driften ska kalibreras med. Stämmer inte den
beräknade driften med vad ni ser i spåret, justera höjden tills den gör det.

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

Sökvägarna är relativa, så det fungerar både i repotets underkatalog på GitHub
Pages och på en egen domän.

## Kör lokalt

Ladda ner `index.html` och öppna den i valfri webbläsare. Inget mer behövs —
service workern hoppas över när sidan inte serveras över https.

## Licens

Öppen källkod. Använd den fritt för er egen anläggning.
