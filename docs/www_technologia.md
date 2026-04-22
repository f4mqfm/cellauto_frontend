# Cellauto projektben hasznalt technologiak

## 1. Attekintes

A projekt egy tobb komponensbol allo webes rendszer, amelyben a kliens oldali felulet (Cellauto UI) es a szerver oldali API kulon retegben mukodik.  
A frontend jelen repoban talalhato (`cellauto-app`), mig a backend egy Laravel alapu API szolgaltatas, amelyhez a frontend HTTP hivasokon keresztul kapcsolodik.

## 2. Frontend technologiak

### 2.1 Alap web technologiak

- **HTML5**: az alkalmazas strukturaja (`index.html`).
- **CSS3**: egyedi stiluslapok (`hex.css`, `style.css`, `app.css`).
- **JavaScript (vanilla)**: a kliens oldali uzleti logika, tablaallapot kezeles, vizsga/gyakorlas folyamat, valamint a DOM kezeles.

A frontend nem keretrendszerre (pl. React/Vue/Angular), hanem sajat, modularis JavaScript fajlokra epul.

### 2.2 Frontend kiszolgalo es fejlesztoi futtatas

- **PHP beepitett szerver (`php -S`)**: helyi fejleszteshez statikus fajl kiszolgalas.
- **PHP router/proxy logika** (`router.php`): az `/api/*` hivasok tovabbitasa a Laravel backend fele.
- **cURL (PHP extension)**: a proxy HTTP tovabbitashoz.

Ennek celja, hogy fejleszteskor a frontend es az API egy host/port alatt latszodjon a bongeszo szamara, ezaltal egyszerubb legyen a CORS kezeles.

## 3. Backend technologiak

A backend dokumentacio alapjan a szerveroldali rendszer fo technologiai elemei:

- **PHP 8.2+**
- **Laravel 12**
- **Laravel Sanctum** (token alapu autentikacio)
- **REST API** vegpontok

Kiszolgalasi oldalon tipikusan:

- **php artisan serve** fejlesztoi futtatasra,
- illetve production kornyezetben **Apache/Nginx** reverz proxy mogotti uzemeltetes.

## 4. Adatkezeles es tarolas

A backend dokumentacio szerint az alapertelmezett fejlesztoi adatbazis:

- **SQLite** (lokalis fejlesztoi kornyezetben),

de a Laravel architektura miatt mas relacios adatbazisok (pl. MySQL) is tamogathatok megfelelo konfiguracioval.

A rendszer perzisztalja tobbek kozott:

- felhasznaloi adatokat es jogosultsagokat,
- feladatokat, szolistakat es kapcsolataikat,
- tablaallapot menteseket,
- vizsga- es kiertekelesi eredmenyeket.

## 5. Kommunikacios es integracios technologiak

- **HTTP/HTTPS** alapú kliens-szerver kommunikacio.
- **JSON** adatcsere formatum az API hivasokban.
- **Bearer token** hitelesites vedett vegpontoknal (Sanctum).

## 6. Architekturalis osszegzes

A projekt technologiai szempontbol egy klasszikus, retegezett webes megoldas:

1. prezentacios reteg (HTML/CSS/JavaScript frontend),
2. alkalmazaslogikai es API reteg (Laravel backend),
3. adatperzisztencia reteg (relacios adatbazis, alapertelmezetten SQLite fejlesztesben).

Ez a felepites jo alapot ad a tovabbi boviteshez (uj modulok, uj szerepkorok, riportok, statisztikai funkciok), mikozben a fejlesztes es az uzemeltetes kulon-kulon is jol kezelheto marad.
