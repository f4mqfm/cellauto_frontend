# Tesztelesi technologia es tesztelesi megkozelites (Cellauto)

## 1. Bevezetes

A Cellauto webalkalmazas tesztelesi megkozelitese ket fo szintre oszthato:

- automatizalt backend tesztelesre,
- valamint funkcionalis (manualis) rendszer- es felhasznaloi folyamatellenorzesre.

A ket szint egyutt biztositja, hogy a rendszer egyszerre legyen technikailag stabil es a valos felhasznaloi mukodes szempontjabol is megbizhato.

## 2. A projektben hasznalt tesztelesi technologiak

### 2.1 Backend automatizalt teszteles (Laravel)

A backend Laravel alapu, ahol a tesztek futtatasa a dokumentacio szerint a kovetkezo paranccsal tortenik:

```bash
composer run test
```

Ez a Laravel tesztelesi kornyezetere epul, amely a gyakorlatban a `php artisan test` futtatasi modot hasznalja.  
A keretrendszer alapesetben PHPUnit kompatibilis, igy a szerveroldali logika automatizalt ellenorzese reprodukalhato modon vegezheto.

Tipikusan itt ellenorizheto:

- authentikacios folyamatok (belepes, tokenkezeles),
- jogosultsagok (pl. admin vegpontok vedelme),
- API vegpontok valaszai (statuszkod + JSON struktura),
- adatreteget erinto folyamatok (mentes, lekerdezes, allapotvaltas).

### 2.2 API szintu funkcionalis ellenorzes

A dokumentacioban kulon szerepel API elerhetosegi teszt (pl. `GET /ping`), ami gyors smoke tesztkent hasznalhato telepites vagy modositas utan.

Ez a szint elsosorban azt igazolja, hogy:

- az API fut es valaszol,
- az alap endpointok elerhetok,
- a kliens-backerend kommunikacio technikailag mukodik.

### 2.3 Frontend funkcionalis/manualis teszteles

A frontend vanilla JavaScript alapu, es a jelenlegi repo dokumentumai alapjan nem jelenik meg kulon browser-E2E teszt keretrendszer (pl. Cypress, Playwright) vagy frontend unit teszt runner (pl. Jest, Vitest).

Ennek megfeleloen a kliens oldali ellenorzes hangsulyosan manualis, forgatokonyv alapu modon tortenik:

- tabla interakciok helyessege,
- vizsga es gyakorlas mod folyamatai,
- eredmenyek megjelenitese es szamolasi logikaja,
- API hivasok UI-beli hatasa.

## 3. Altalanos tesztelesi szemlelet a rendszerben

A szakdolgozati szempontbol ajanlott tesztelesi szemlelet:

1. **Unit/komponens szint (backend logika):**  
   Kulon funkcionalis egysegek ellenorzese automatizalt tesztekkel.

2. **Integracios szint (API + adatbazis):**  
   Vegpontok, jogosultsagok, es adatmukodes egyuttes vizsgalata.

3. **Rendszer szint (frontend + backend):**  
   Teljes felhasznaloi folyamatok vegigtesztelese (bejelentkezes, feladatmegoldas, mentes, kiertekeles).

4. **Smoke/regresszios ellenorzes:**  
   Minden nagyobb modositas utan gyors ellenorzes, hogy a fo funkciok nem serultek.

## 4. Miert megfelelo ez a megkozelites egy oktatasi webalkalmazasnal

A Cellauto eseten kulonosen fontos, hogy a kiertekelesi eredmenyek megbizhatoak legyenek. Ezert indokolt:

- a backend szabalyok automatizalt tesztelese (mert itt van az uzleti es adatelerveny logic),
- a UI folyamatok valos hasznalati mintakkal torteno manualis ellenorzese (mert a felhasznaloi elmeny es interakcio kritikus).

Ez a kombinacio jo kompromisszum a fejlesztesi ido, a megbizhatosag es a tenyleges oktatasi hasznalhatosag kozott.

## 5. Tovabbfejlesztesi javaslatok

A jelenlegi gyakorlat kesobb tovabb erositheto:

- frontend E2E keretrendszer bevezetesevel (pl. Playwright),
- kritikus JavaScript modulokra unit tesztekkel,
- CI futtatassal (pl. minden commit/pull request eseten automatikus tesztfuttatas).

Igy a minosegbiztositas konzisztenciája tovabb novelheto, es a regresszios hibak hamarabb azonosithatok.
