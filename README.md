# PromoKuźnia

Sklep z materiałami marketingowymi dla małych firm — projekt portfolio Strony AI Wrocław.
Stack: **Cloudflare Pages + Pages Functions + D1** (później KV, R2, Cron), front w czystym HTML/CSS/JS.

> Sklep demonstracyjny: zamówienia nie są realizowane, płatności działają tylko w trybie testowym.

## Stan prac

| Etap | Zakres | Status |
|---|---|---|
| 1 | Szkielet, schemat bazy D1, 26 produktów / 51 wariantów, identyfikacja | gotowe |
| 2 | Katalog: strona główna, kategorie, wyszukiwarka, karta produktu, API | gotowe |
| 3 | Koszyk w D1, konto klienta, upload plików do R2, kody rabatowe | gotowe |
| 4 | Checkout, Stripe test + Przelewy24 sandbox, webhooki | — |
| 5 | InPost ShipX + Geowidget, Furgonetka | — |
| 6 | Panel admina, maile (Resend), faktury (Fakturownia) | — |
| 7 | Regulamin, RODO, Omnibus, testy | Omnibus już liczony |
| 8 | Domena, tryb demo, karta portfolio | — |

## Uruchomienie lokalne

```bash
npm install
npm run db:migrate      # tworzy tabele w lokalnej bazie D1
npm run db:seed         # generuje seed/seed.sql z seed/catalog.json i wgrywa produkty
cp .dev.vars.example .dev.vars   # lokalnie wystarczy EXPOSE_RESET_LINKS=1
npm run dev             # http://localhost:8788
```

Konto testowe zakładasz w sklepie (#konto). Link resetu hasła, dopóki nie ma maili (Etap 6),
pojawia się w odpowiedzi API i w logu `wrangler`, gdy w `.dev.vars` jest `EXPOSE_RESET_LINKS=1`.

Reset bazy: `npm run db:reset`.

## Wdrożenie na Cloudflare

```bash
npx wrangler login
npx wrangler d1 create promokuznia-db       # skopiuj database_id do wrangler.toml
npx wrangler r2 bucket create promokuznia-files
npx wrangler pages project create promokuznia
npm run db:migrate:remote
npm run db:seed:remote
npm run deploy
```

Albo podłącz repozytorium GitHub w panelu: Workers & Pages → Create → Pages → Connect to Git,
katalog wyjściowy `public`, bez komendy budowania. W ustawieniach projektu dodaj bindingi: D1 `DB` i R2 `FILES`.

## Struktura

```
public/                 front (Pages)
  index.html
  assets/style.css      identyfikacja: papier, linie cięcia, pasek CMYK
  assets/app.js         router (#start, #kategoria-…, #p-…, #koszyk), widoki, koszyk
  data/catalog.json     katalog statyczny (fallback bez API) — generowany
functions/              API (Pages Functions)
  api/categories.js           GET /api/categories
  api/products/index.js       GET /api/products?kategoria=&q=&typ=&sort=
  api/products/[slug].js      GET /api/products/:slug
  api/_middleware.js          blokada żądań z obcych stron, sesja, ciasteczka, obsługa błędów
  api/cart/…                  GET /api/cart, POST/PATCH/DELETE /api/cart/items, POST/DELETE /api/cart/coupon
  api/auth/…                  register, login, logout, me, reset-request, reset
  api/account/orders.js       historia zamówień
  api/uploads/…               POST /api/uploads (R2), GET/DELETE /api/uploads/:id (tylko właściciel)
  _lib/catalog.js             zapytania D1, Omnibus (najniższa cena z 30 dni)
  _lib/cart.js                koszyk gościa (ciasteczko) i klienta, łączenie po zalogowaniu
  _lib/crypto.js              PBKDF2 100 000 iteracji, tokeny, SHA-256
public/assets/pricing.js      wyliczanie sum koszyka — wspólne dla frontu i API
public/assets/store.js        koszyk i konto: przez API albo lokalnie w podglądzie
migrations/0001_init.sql      pełny schemat: katalog, klienci, koszyk, zamówienia,
                              płatności (idempotencja webhooków), wysyłki, rabaty, bony, pobrania
migrations/0002_…sql          sesje, reset hasła, pliki klientów
seed/catalog.json             źródło asortymentu — edytuj tutaj
scripts/build-seed.mjs        catalog.json → seed/seed.sql + public/data/catalog.json
scripts/build-preview.mjs     cały sklep w jednym pliku HTML (dist/)
```

## Asortyment

6 kategorii, 26 produktów, każdy typ ścieżki zamówienia:

- **fizyczne** — wizytówki, ulotki, kubki, koszulki (rozmiary, brak XXL), roll-upy tylko kurierem
- **personalizowane** — flaga `personalizable`, status akceptacji projektu w `order_items`
- **cyfrowe** — szablony z wygasającym linkiem (`downloads`), promocja z ceną Omnibus
- **usługi** — termin realizacji zamiast stanu magazynowego
- **karty podarunkowe** — bon różnego przeznaczenia, VAT przy realizacji

Kody rabatowe w seedzie: `START10` (−10% od 50 zł), `DOSTAWA0` (darmowa dostawa od 100 zł).

Kwoty w bazie zawsze w groszach (INTEGER). Rezerwacja stanów pilnowana przez `CHECK (stock >= reserved)`.

## Bezpieczeństwo (Etap 3)

- Sesja i koszyk gościa w ciasteczkach `HttpOnly; Secure; SameSite=Lax` — JavaScript strony ich nie widzi.
- W bazie trzymamy tylko SHA-256 tokenów sesji i resetu, nie same tokeny.
- Hasła: PBKDF2-SHA256, 100 000 iteracji, losowa sól; porównanie w stałym czasie; logowanie nie zdradza, czy konto istnieje.
- Żądania zmieniające dane muszą mieć `Origin` naszej domeny.
- Pliki: typ rozpoznawany po zawartości (PDF, PNG, JPG, SVG, AI, EPS), limit 20 MB, podgląd tylko dla właściciela koszyka, SVG wyłącznie do pobrania.
- Ceny, rabaty i dostawę liczy serwer; front pokazuje to, co zwróci API.
- Do zrobienia w Etapie 7: limit prób logowania, Turnstile na formularzach, sprzątanie starych koszyków i plików przez Cron.
