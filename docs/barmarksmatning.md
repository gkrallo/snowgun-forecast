# Barmarksmätning med RTK-pucken

Snödjupet räknas som snöytan minus marken under. Marken måste därför mätas
**innan snön kommer** — när kanonerna väl har gått kommer vi inte åt den igen.
Den här instruktionen gäller barmarken på Sparbanksspåret.

Vi mäter utan korrektioner i realtid. Pucken sparar sin rådata på
minneskortet, och positionerna räknas fram i efterhand mot Lantmäteriets
referensstationer (efterberäkning). Det kräver ingen täckning ute i spåret och
kostar ingenting.

## Före första mätningen

**Pucken (SparkFun RTK Facet)**

1. Uppdatera firmware till senaste version.
2. Sätt i ett minneskort.
3. Inställningen görs i webbsidan, inte på pucken: välj **Config** med
   knappen, anslut telefonen eller datorn till puckens wifi och öppna sidan.
   Vänta tills sidan visar riktig firmwareversion och position. Står det
   `v0.0` och en position i Colorado har den inte fått kontakt med pucken än.
   Under **GNSS Configuration → Message Rates**: tryck **Reset to Logging
   Defaults (NMEAx5 + RXMx2)** (i manualen heter den "PPP Logging Defaults").
   Då loggas både vanliga positioner och den rådata som efterberäkningen
   behöver: RXM-RAWX och RXM-SFRBX ska stå på 1 i listan under knapparna.
   Sätt sedan **NMEA-GSA** och **NMEA-GSV** till 0. Varken efterberäkningen
   eller appen använder dem, och utan dem blir det ungefär en fjärdedel
   mindre att skriva till kortet och att skicka över Bluetooth.
   Mätfrekvensen får stå kvar på 4 Hz — i gångfart blir det en punkt ungefär
   var 35:e centimeter, så att varje meterruta längs varvet får träff.
4. Kontrollera under **System Configuration** att **Log to SD Card** är
   ikryssad och att **Bluetooth Protocol** står på **BLE**. Tryck
   **Save Configuration**, vänta tills sidan har sparat, och tryck sedan
   **Exit and Reset**.
5. **Kontrollera på kortet att ändringen kom med.** Stäng av pucken med ett
   långt tryck, ta ut kortet och öppna `SFE_Facet_Settings_0.txt` i
   Anteckningar. Pucken sparar inställningarna både i sig själv och i den
   filen, men när den startar läser den filen sist — det som står där gäller,
   vad webbsidan än visade. Både 10 och 11 november kom ändringarna från
   webbsidan aldrig fram till filen, och pucken gick tillbaka till de gamla
   vid omstart. Detta ska stå i filen:
   - `message.UBX_NMEA_GSA.msgRate=0`
   - `message.UBX_NMEA_GSV.msgRate=0`
   - `bluetoothRadioType=1` (1 är BLE, 0 är SPP)

   Står det fel: ändra raderna direkt i filen och sätt dessutom
   `updateZEDSettings=1`. Utan den behåller GPS-kretsen i pucken sin egen
   sparade lista över meddelanden, och GSA och GSV fortsätter komma. Spara,
   sätt tillbaka kortet i den avstängda pucken och slå på den. Det är
   SparkFuns eget sätt att ställa in pucken med fil. Efter starten står
   `updateZEDSettings` på 0 igen — det betyder att kretsen har fått de nya
   inställningarna.
6. Ladda batteriet fullt.

**Lantmäteriet**

Registrera dig för Swepos öppna data (`swepos-open.lantmateriet.se`).
Dygnsfilerna från referensstationerna är gratis. Närmaste station är **LIDK**
i Lidköping, ungefär 2,4 km öster om brunn 7. Dess koordinater står i
`docs/ppk-lidk.conf`. I filnamnen heter den **`0LKO`**. Förväxla den inte
med `1LID`, som är Liden i Medelpad, 51 mil bort.

**Fyrhjulingen**

Pucken sitter på magnetfoten, så fritt mot himlen som möjligt och så stadigt
att den inte gungar. Samma fäste och samma höjd hela passet.

## Vid spåret — ordningen är viktig

Appen hittar kalibreringen själv i loggen, men bara om stegen görs i den här
ordningen och pucken står **helt stilla** när det står så.

Under fliken **Snödjup → Mätpass med pucken** finns en guide som tar dig
igenom stegen, räknar ner stunderna, piper när de är klara och skriver upp
klockslagen. Står pucken på **BLE** (System Configuration → Bluetooth
Protocol) kan appen dessutom visa att pucken har en position, via
**Anslut pucken**. Det fungerar i Chrome på Android och på dator, inte på
iPhone.

**Gör kalibreringen där himlen är fri** — på grusplanen, en öppen bit av
gatan, inte under träd. Under tallarna vid brunn 7 fick pucken nästan ingen
fix och gav en antennhöjd som var en halvmeter fel.

1. **Ställ fyrhjulingen där himlen är fri, slå på pucken och lägg den
   direkt på marken** precis intill framhjulet. Vänta några minuter tills den
   har fix. Den visar inte RTK — det är som det ska utan korrektioner.
   Kontrollera att loggningsikonen syns.
2. **Marken bredvid framhjulet, 4 minuter.** Pucken ligger kvar där den
   ligger. Rör den inte.
3. **På fästet, 2 minuter.** Sätt pucken på fästet utan att flytta
   fyrhjulingen. Mät med tumstock (se nedan), och **sätt dig sedan på
   fyrhjulingen som när du kör** och sitt still. Fjädringen sjunker med
   någon på, och antennhöjden ska vara den som gäller under körningen.
   Skillnaden mot steg 2 blir antennhöjden.
4. **Kör.** Gatans **kanter**: ytterkanten, och innerkanten i
   vändslingorna. Kör dessutom **utfyllnad** däremellan där marken har åsar
   och dalar, så att det blir högst ungefär tio meter mellan linjerna. Pucken
   mäter bara rakt under sig, men marken mellan linjerna räknar appen fram.
   Ta kurvorna och spårdelningarna också, i lugn gångfart runt 5 km/h. Det
   går bra att stanna, tanka och köra om en bit. Titta på loggningsikonen
   vid varje vändpunkt; har den blivit ett streck loggar pucken inte längre.
5. **Stå still en minut** på ett öppet ställe med pucken kvar på fästet,
   och **sitt kvar** som när du kör — det här är steg 3 en gång till.
   Appen klipper körningen där, så att punkterna medan pucken bärs i handen
   inte kommer med.
6. **Marken bredvid framhjulet igen, 5 minuter.** Kontrollen: antennhöjden
   räknas en gång till och ska stämma med steg 2–3 inom några centimeter.

Varför så länge på marken: efterberäkningen räknar passet både framåt och
bakåt i tiden och litar bara på en fix som båda riktningarna har. Framåt
tappar fixen när pucken flyttas för hand och behöver ett par minuter på sig
igen, och bakåt börjar från noll i slutet av loggen. Den 11 november, med två
minuter, hade bara den ena riktningen fix på marken både i början och i
slutet, och antennhöjden skilde 4 cm mellan dem.

Appen kan inte visa i förväg om fixen blir bra. Det pucken skickar över
Bluetooth — satelliter, signalstyrka, låsta signaler — såg likadant ut där
efterberäkningen fick fix som där den inte fick det. Fixen syns först när
passet är efterberäknat; kör det som saknas ett annat pass (fliken Uppdrag).
7. Stäng av pucken med ett långt tryck **innan** minneskortet tas ut. Skriv
   upp datum och ungefärliga klockslag.

Mät också med tumstock från marken där framhjulet står upp till pucken på
fästet, innan du sätter dig, och skriv upp det (guiden har en ruta för det).
Pucken mäter till samma punkt i sig själv båda gångerna, så etikettens
millimetrar under pucken behöver inte läggas till. Antennhöjden appen räknar
fram kan bli någon centimeter mindre än tumstocken, eftersom fjädringen
sjunker när du sitter på. Det är appens värde som gäller.

Hinner ni inte hela gatan i ett pass går det bra att dela upp. Varje pass
räknas för sig och gör sin egen kalibrering.

## Brunnsrundan

Brunnarna lades in med mobilen, och flera ligger 2–7 m fel — några hamnar
inne bland träden när man jämför med barmarken och flygbilden. De mäts om
med pucken.

Här behövs ingen fix. En halvmeter räcker för slangen och för uppdragen, och
det ger efterberäkningen även med float, alltså även under träd. Därför
räcker en minut per brunn.

1. Gör rundan **direkt efter ett mätpass**, när kontrollen på marken (steg 6)
   är klar men innan pucken stängs av. Appen klipper barmarken vid stoppet
   före kontrollen, så rundan kommer inte med i rutnätet. Den hjälper dessutom
   efterberäkningen bakåt i tiden att ha fix redan vid kontrollen. Det går
   också att göra rundan för sig: starta pucken och låt den ligga 4 minuter
   under fri himmel först.
2. Vid varje brunn: lägg pucken plant i **hörnet mot spåret, precis där
   slangen kommer upp**, och låt den ligga helt still **en minut**. Samma
   hörn på alla brunnar — det är den punkten brunnens koordinater ska gälla,
   eftersom det är därifrån slangen når.
3. Mellan brunnarna kan pucken ligga i handen eller i knät. Ordningen spelar
   ingen roll, och brunnarna behöver inte skrivas upp — stoppen hittas i
   loggen och kopplas till närmaste brunn. Brunn 20 behövs inte.

Efterberäkna som vanligt. De nya positionerna läggs in i appen i Claude Code.

## Efteråt

1. **Kopiera loggfilen** från minneskortet till mappen `matdata/` i projektet.
   Den mappen följer inte med till GitHub.
2. **Hämta dygnsfilen** för LIDK samma datum. Öppna
   `ftp://swepos-open.lantmateriet.se/` i Utforskaren, eller `sftp://` i ett
   program som WinSCP. Gå till `rinex3/<år>/<dagnummer>/` och ta filen som
   börjar på `0LKO` och slutar på `MO.crx.gz`. Lägg den i samma mapp.
   Dagnumret räknas från 1 januari, så 1 november 2026 är dag 305. Filen för ett
   dygn finns ungefär en halvtimme efter midnatt UTC.
3. **Efterberäkna** med RTKLIB (gratis). Använd Tim Everetts version
   *RTKLIB-EX*, som tidigare hette *demo5*, för SparkFuns loggar. Den ligger i
   `verktyg/rtklib/`, som inte följer med till GitHub. Hämta den från
   rtklibexplorer på GitHub om mappen saknas. Inställningarna står i
   `docs/ppk-lidk.conf`, och här är de viktiga. Första gången gör vi det
   tillsammans i Claude Code.
   - Läge: *Kinematic*, frekvenser L1+L2, filter *Combined*
   - Basens position: LIDK:s koordinater från Swepos och antennhöjden 0,071 m
   - GLONASS-heltal (*GLO AR*): **av**. LIDK och pucken är av olika
     fabrikat, och då låses de lätt fel — 11 november blev antennhöjden
     16 cm för låg av det, och kontrollen i slutet gick inte ihop.
   - Interpolering av basens data: på (dygnsfilerna har bara en mätning var
     30:e sekund)
   - Utdata: latitud, longitud och höjd i grader
4. **Läs in .pos-filen** i appen under fliken **Snödjup → Läs in mätning**.
   Kartan visar vad som är uppmätt (blått), vad som är framräknat mellan
   linjerna (ljusblått), var det är för långt mellan linjerna (rött) och var
   pucken saknade fix (lila). Under kartan står antennhöjden och kontrollen
   i slutet.
5. **Fliken Uppdrag** listar det som återstår: kanter där fixen saknades,
   mellanrum som behöver en utfyllnad och kanter som inte är körda förbi
   brunnarna. Rita där också runt det som inte är spårgata — trädön i lilla
   vändslingan, skogen där spåret delar sig — med **Rita område utan
   spårgata**, så räknas ingenting fram där. Kör uppdragen ett annat pass och
   läs in det också; rutnätet fylls på, och det som blivit klart stryks.
   **Visa var jag är** visar puckens position om den är ansluten, annars
   telefonens.
6. När allt ser bra ut: **Spara barmark som fil**. Filen `barmark.json` läggs in
   i appen, så att alla ser samma barmark.

## Varför LIDK och inte brunn 7-locket

Först var tanken att varje pass skulle börja på brunn 7-locket och att alla
höjder skulle sparas relativt det. Locket sitter på en frostfritt nedgrävd
kassun och rör sig inte med tjälen. Men det står under höga tallar intill
väderstationens mast, och provpasset 10 november fick nästan ingen fix där:
lockets höjd skilde över en meter beroende på hur den räknades.

Locket behövs inte heller. Alla pass efterberäknas mot samma station, LIDK,
med samma fasta koordinater (`docs/ppk-lidk.conf`), och hamnar därför i samma
höjdsystem vilken dag de än gjordes. Swepos stationer rör sig millimeter per
år. Höjderna i `barmark.json` är ellipsoidhöjder mot LIDK — inte RH2000 — som
pucken visar liggande på marken. Snöytan mäts på samma sätt, så snödjupet blir
skillnaden rakt av.

Kontrollen mellan passen sköter rutnätet själv: där linjer från olika pass
korsar varandra ska rutan få nästan samma höjd. Gula rutor i appen betyder
att den inte gör det.
