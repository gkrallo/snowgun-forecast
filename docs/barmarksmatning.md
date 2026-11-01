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
3. I menyn **Messages**: välj **Reset to PPP Logging Defaults (NMEAx5 +
   RXMx2)**. Då loggas både vanliga positioner och den rådata som
   efterberäkningen behöver.
4. Kontrollera att loggning till minneskortet är påslagen.
5. Ladda batteriet fullt.

**Lantmäteriet**

Registrera dig för Swepos öppna data (`swepos-open.lantmateriet.se`).
Dygnsfilerna från referensstationerna är gratis. Leta upp närmaste station i
Lantmäteriets e-tjänst *Hämta koordinatlista*.

**Fyrhjulingen**

Pucken sitter på magnetfoten, så fritt mot himlen som möjligt och så stadigt
att den inte gungar. Samma fäste och samma höjd hela passet.

## Vid spåret — ordningen är viktig

Appen hittar kalibreringen själv i loggen, men bara om stegen görs i den här
ordningen och pucken står **helt stilla** när det står så.

1. **Slå på pucken** och vänta några minuter tills den har fix. Den visar inte
   RTK — det är som det ska utan korrektioner.
2. **Brunn 7-locket, 5 minuter.** Ställ pucken mitt på locket, alltid på samma
   punkt (märk den gärna med färg). Rör den inte. Detta är passets nollpunkt.
3. **Marken bredvid fyrhjulingen, 2 minuter.** Ställ pucken på marken precis
   där ett hjul står.
4. **På fästet, 2 minuter.** Sätt pucken på fästet utan att flytta
   fyrhjulingen. Skillnaden mot steg 3 blir antennhöjden.
5. **Kör.** Hela spårgatan, kurvorna och spårdelningarna också, i lugn
   gångfart — högst 5 km/h. **Ungefär en meter mellan varven**: pucken mäter
   bara rakt under sig, så en 8 meter bred gata behöver omkring åtta varv.
   Det går bra att stanna och att köra om en bit.
6. **Stå still en minut** med pucken kvar på fästet innan du tar loss den.
   Appen klipper körningen där, så att punkterna medan pucken bärs i handen
   inte kommer med.
7. **Brunn 7-locket igen, 2 minuter.** Kontrollen: om höjden skiljer mer än
   några centimeter från steg 2 har något glidit under passet.
8. Stäng av pucken. Skriv upp datum och ungefärliga klockslag.

Hinner ni inte hela gatan i ett pass går det bra att dela upp — varje pass
börjar och slutar på brunn 7-locket och räknas för sig.

## Efteråt

1. **Kopiera loggfilen** från minneskortet till mappen `matdata/` i projektet.
   Den mappen följer inte med till GitHub.
2. **Hämta dygnsfilen** från närmaste Swepos-station för samma datum och lägg
   den i samma mapp.
3. **Efterberäkna** med RTKLIB (gratis; Tim Everetts version *demo5*
   rekommenderas för SparkFuns loggar). Första gången gör vi det tillsammans i
   Claude Code. Inställningar att börja med:
   - Läge: *Kinematic*, frekvenser L1+L2, filter *Combined*
   - Basens position: från RINEX-filens huvud
   - Interpolering av basens data: på (dygnsfilerna har bara en mätning var
     30:e sekund)
   - Utdata: latitud, longitud och höjd i grader
4. **Läs in .pos-filen** i appen under fliken **Snödjup → Läs in mätning**.
   Kartan visar vad som är inmätt (blått) och luckorna mellan varven (rött).
   Under kartan står antennhöjden, kontrollen på locket och vilka brunnar som
   saknar mätning i närheten.
5. **Kör om luckorna** ett annat pass och läs in det också — rutnätet fylls på.
6. När allt ser bra ut: **Spara barmark som fil**. Filen `barmark.json` läggs in
   i appen, så att alla ser samma barmark.

## Varför brunn 7

Locket sitter på en frostfritt nedgrävd betongkassun och rör sig inte med
tjälen. Alla höjder sparas relativt locket. Då spelar det ingen roll vilken
referensstation eller vilket höjdsystem ett pass använde — varje pass börjar
på locket och räknas mot det, både barmarken nu och snöytan i vinter.
