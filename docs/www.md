# Cellauto Webalkalmazas - Altalanos osszefoglalo

## A rendszer celja

A Cellauto program egy oktatasi celu, webes felulet, amelyben a felhasznalo egy cellas tablaban dolgozik, majd a rendszer automatikusan ertekeli a kitoltes helyesseget. Az alkalmazas ket fo uzemmodot tamogat: gyakorlas es vizsga. A cel, hogy a felhasznalo egyszerre kapjon interaktiv tanulasi elmenyt, egyertelmu visszajelzest, valamint merheto teljesitmenyadatokat.

## Fobb funkcionalis teruletek

- **Tablas jateklogika**: a felhasznalo a tablaban cellakat jelol, a rendszer figyeli a helyes, helytelen es hianyzo kitolteseket.
- **Vizsga es gyakorlas mod**: kulon kezeli az idozitett vizsgahelyzetet es a kotetlenebb gyakorlasi folyamatot.
- **Szolista alapu mondatmod**: a cellas fazis utan (vagy adott esetben kozvetlenul) a felhasznalo szavakbol mondatlancokat epit.
- **Automatikus kiertekeles**: az alkalmazas osszegzi a cellaszintu es mondatszintu eredmenyeket, illetve kulon kezeli a helyes, duplikalt es helytelen mondatokat.
- **Eredmenymentes**: a vizsgahoz tartozo meresi adatok API-n keresztul tarolodnak, igy kesobb visszakereshetok es feldolgozhatok.

## Felhasznaloi szerepkorok es hozzaferes

A rendszer bejelentkezes nelkul is hasznalhato bizonyos funkciokra, ugyanakkor tamogatja a hitelesitett felhasznaloi munkafolyamatot is. A szinlistak publikus jelleggel is elerhetok, mig a szolista es a vizsgahoz kapcsolt mentesi funkcionalitas jellemzoen bejelentkezett allapotban aktiv.

## Rendszerfelepites

A megoldas ket jol elkulonitheto reszre bonthato:

1. **Frontend (web kliens)**  
   A felhasznaloi interakcio, tablakezeles, vizsga/gyakorlas allapotgep, valamint az ertekelesi megjelenites JavaScript alapon valosul meg.

2. **Backend API (Laravel)**  
   A szerveroldali reteg felel az autentikacioert, az adatok tarolasaert, a mentett allapotok es ertekelesek kezelesert, valamint a naplozasi folyamatokert.

Ez a szetvalasztott architektura lehetove teszi, hogy a kliens gyors es interaktiv maradjon, mikozben az uzleti adatok tartosan, biztonsagosan es kovetkezetesen kerulnek tarolasra.

## Kiertekelesi logika szakmai jelentosege

A program kulonosen fontos eleme a tobbdimenzios visszajelzes:

- **Cellaszintu mutatok**: osszes kitoltheto cella, helyes kitoltes, hibas jeloles, hianyzo kitoltes.
- **Mondatszintu mutatok**: kinyerheto mondatok, egyedi helyes mondatok, duplikalt mondatok, helytelen mondatok.
- **Szoveges reszletes eredmeny**: a rendszer listazza az egyedi es helytelen mondatokat, ami tamogatja a tanulasi hibak celzott elemzeset.

Pedagogiai szempontbol ez azert lenyeges, mert nem csak pontszamot ad, hanem ertelmezheto visszajelzest is arrol, hogy a felhasznalo pontosan mely reszfolyamatban teljesitett jol vagy gyengen.

## Tarolasi es visszakovethetosegi szempontok

A vizsgaeredmenyek strukturalt formaban kerulnek mentesre (idoadat, cellaszamok, mondatmutatok, opcionalis szoveges osszegzes). Ez biztositja:

- a kesobbi statisztikai feldolgozhatosagot,
- a felhasznaloi fejlodes nyomon koveteset,
- az oktatoi visszajelzesek objektiv alapjat.

## Fejleszthetoseg es tovabbfejlesztesi iranyok

A jelenlegi struktura jo alapot ad tovabbi funkciok bevezetesere, peldaul:

- reszletes tanari riportok,
- feladatszintu osszehasonlito elemzesek,
- adaptiv nehezsegszint,
- vizsgaeredmenyek vizualizalt dashboardja.

Osszessegeben a Cellauto egy olyan oktatasi webalkalmazas, amely a jatekos interakciot, az automatizalt szakmai kiertekelest es a hosszu tavu adatalapu visszacsatolast egy kozos rendszerben egyesiti.
