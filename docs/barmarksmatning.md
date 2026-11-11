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
   Mätfrekvensen får stå kvar på 4 Hz — i gångfart blir det en punkt ungefär
   var 35:e centimeter, så att varje meterruta längs varvet får träff.
4. Kontrollera under **System Configuration** att **Log to SD Card** är
   ikryssad. Tryck **Save Configuration** och sedan **Exit and Reset**.
5. Ladda batteriet fullt.

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

**Gör kalibreringen där himlen är fri** — på grusplanen, en öppen bit av
gatan, inte under träd. Under tallarna vid brunn 7 fick pucken nästan ingen
fix och gav en antennhöjd som var en halvmeter fel.

1. **Slå på pucken** och vänta några minuter tills den har fix. Den visar inte
   RTK — det är som det ska utan korrektioner. Kontrollera att
   loggningsikonen syns.
2. **Marken bredvid framhjulet, 2 minuter.** Lägg pucken på marken precis
   intill där hjulet står.
3. **På fästet, 2 minuter.** Sätt pucken på fästet utan att flytta
   fyrhjulingen. Skillnaden mot steg 2 blir antennhöjden.
4. **Kör.** Hela spårgatan, kurvorna och spårdelningarna också, i lugn
   gångfart — högst 5 km/h. **Ungefär en meter mellan varven**: pucken mäter
   bara rakt under sig, så en 8 meter bred gata behöver omkring åtta varv.
   Det går bra att stanna, tanka och köra om en bit. Titta på
   loggningsikonen vid varje vändpunkt; har den blivit ett streck loggar
   pucken inte längre.
5. **Stå still en minut** på ett öppet ställe med pucken kvar på fästet.
   Appen klipper körningen där, så att punkterna medan pucken bärs i handen
   inte kommer med.
6. **Marken bredvid framhjulet igen, 2 minuter.** Kontrollen: antennhöjden
   räknas en gång till och ska stämma med steg 2–3 inom några centimeter.
7. Stäng av pucken med ett långt tryck **innan** minneskortet tas ut. Skriv
   upp datum och ungefärliga klockslag.

Mät också med tumstock från marken där framhjulet står upp till pucken på
fästet, och skriv upp det. Det ska vara samma som antennhöjden appen räknar
fram — pucken mäter till samma punkt i sig själv båda gångerna, så etikettens
millimetrar under pucken behöver inte läggas till.

Hinner ni inte hela gatan i ett pass går det bra att dela upp. Varje pass
räknas för sig och gör sin egen kalibrering.

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
   - Interpolering av basens data: på (dygnsfilerna har bara en mätning var
     30:e sekund)
   - Utdata: latitud, longitud och höjd i grader
4. **Läs in .pos-filen** i appen under fliken **Snödjup → Läs in mätning**.
   Kartan visar vad som är inmätt (blått) och luckorna mellan varven (rött).
   Under kartan står antennhöjden, kontrollen i slutet och vilka brunnar som
   saknar mätning i närheten.
5. **Kör om luckorna** ett annat pass och läs in det också — rutnätet fylls på.
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

Kontrollen mellan passen sköter rutnätet själv: varven ligger en meter isär,
och grannrutor från olika pass ska ge nästan samma höjd. Gula rutor i appen
betyder att de inte gör det.
