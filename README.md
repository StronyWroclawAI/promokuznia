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
| 4 | Kasa, zamówienia, Stripe + Przelewy24 + bramka testowa, przelew, pobranie, webhooki | gotowe |
| 5 | InPost ShipX + Geowidget, Furgonetka | — |
| 6 | Panel admina, maile (Resend), faktury (Fakturownia) | panel admina gotowy; maile i faktury — dalej |
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
  api/checkout.js             GET wycena dla dostawy i płatności, POST złożenie zamówienia
  api/order/…                 GET /api/order?number=&t=, POST /api/order/pay (ponowna płatność)
  api/webhooks/stripe.js      powiadomienia Stripe (podpis HMAC, idempotencja)
  api/webhooks/przelewy24.js  powiadomienia P24 (podpis SHA-384 + transaction/verify)
  api/payments/simulate.js    bramka testowa w trybie demo, gdy brak kluczy
  api/downloads/[token].js    produkty cyfrowe: link ważny 7 dni, 5 pobrań
  api/admin/…                 panel: summary, orders, orders/:id (akcje), products, variants/:id, uploads/:id
  _lib/admin.js               uprawnienia (ADMIN_EMAILS), przejścia statusów, zwroty
  _lib/orders.js              zamówienie z koszyka w jednej transakcji, finalizacja, wygaszanie rezerwacji
  _lib/payments.js            Stripe Checkout, Przelewy24 REST, wspólne oznaczanie płatności
  api/uploads/…               POST /api/uploads (R2), GET/DELETE /api/uploads/:id (tylko właściciel)
  _lib/catalog.js             zapytania D1, Omnibus (najniższa cena z 30 dni)
  _lib/cart.js                koszyk gościa (ciasteczko) i klienta, łączenie po zalogowaniu
  _lib/crypto.js              PBKDF2 100 000 iteracji, tokeny, SHA-256
public/admin/                 panel admina: index.html, admin.js, admin.css (pod adresem /admin/)
public/assets/pricing.js      wyliczanie sum koszyka — wspólne dla frontu i API
public/assets/store.js        koszyk i konto: przez API albo lokalnie w podglądzie
migrations/0001_init.sql      pełny schemat: katalog, klienci, koszyk, zamówienia,
                              płatności (idempotencja webhooków), wysyłki, rabaty, bony, pobrania
migrations/0002_…sql          sesje, reset hasła, pliki klientów
migrations/0003_…sql          token dostępu do zamówienia, płatności z próbami i symulatorem
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

## Zamówienia i płatności (Etap 4)

Ścieżka: koszyk → `#kasa` → `POST /api/checkout` → bramka → powiadomienie → `#zamowienie`.

1. Serwer liczy kwotę sam (`pricing.js`) i porównuje z `expected_total_gr` z formularza — jeśli ceny się zmieniły, odrzuca zamówienie z komunikatem.
2. Zamówienie, pozycje (kopia nazw i cen), rezerwacja stanów, użycie kodu rabatowego i opróżnienie koszyka zapisują się w jednym `db.batch` (transakcja D1). Za mało towaru → `CHECK (stock >= reserved)` cofa całość.
3. Rezerwacja: 35 min przy płatności online, 3 dni przy przelewie. Po terminie zamówienie przechodzi w „Anulowane”, towar wraca do sprzedaży (`releaseExpired` — wołane przy kasie, podglądzie zamówienia i webhookach; Worker z Cron w Etapie 6).
4. Strona powrotu z bramki niczego nie oznacza jako opłacone — robi to dopiero podpisany webhook. Każde zdarzenie zapisuje się raz (`payment_events`), druga kopia nic nie zmienia.
5. Po płatności: stan magazynowy maleje, produkty cyfrowe dostają linki, karty podarunkowe kody, a status zależy od zawartości (akceptacja projektu / w realizacji / zrealizowane).
6. Nieudana płatność nie kasuje zamówienia — klient może zapłacić ponownie ze strony zamówienia.

Gość widzi zamówienie przez link z tokenem (`?zamowienie=…&t=…`), zalogowany klient — z historii na koncie.

### Podłączenie Stripe (tryb testowy)

1. Konto na stripe.com → przełącznik **Test mode** → Developers → API keys → `sk_test_…` do `.dev.vars` jako `STRIPE_SECRET_KEY`.
2. Settings → Payment methods: włącz **BLIK** i **Przelewy24** (karty są domyślnie).
3. Lokalnie: `stripe listen --forward-to localhost:8788/api/webhooks/stripe` → wypisany `whsec_…` do `STRIPE_WEBHOOK_SECRET`.
4. Na Cloudflare: Developers → Webhooks → endpoint `https://<domena>/api/webhooks/stripe`, zdarzenia `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`; sekrety przez `npx wrangler pages secret put`.
5. Testowo: karta `4242 4242 4242 4242`, dowolna przyszła data i CVC; BLIK — dowolny 6-cyfrowy kod.

### Podłączenie Przelewy24 (sandbox)

1. Konto sandbox: przelewy24.pl → rejestracja konta testowego (sandbox.przelewy24.pl).
2. Panel → Moje dane → Dane API: `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_API_KEY` (klucz do raportów), `P24_CRC`.
3. Powiadomienia przychodzą na `/api/webhooks/przelewy24` — adres podawany automatycznie przy rejestracji transakcji (sandbox musi widzieć sklep z internetu, więc testuj na wdrożonej wersji lub przez tunel `cloudflared`).

Bez kluczy, przy `SHOP_MODE = "demo"`, obie metody przechodzą przez **bramkę testową** w sklepie (`#symulator-platnosci`), która wywołuje tę samą logikę co prawdziwe powiadomienie.

## Panel admina (Etap 6)

Adres: `/admin/`. Logujesz się zwykłym kontem sklepu; dostęp mają e-maile z sekretu `ADMIN_EMAILS`
(Cloudflare → Settings → Variables and Secrets, kilka adresów po przecinku; lokalnie w `.dev.vars`).

- **Pulpit** — sprzedaż dziś / 7 / 30 dni, średni koszyk, wykres 14 dni, lista „do zrobienia”, kończące się stany.
- **Zamówienia** — filtry (przelewy do potwierdzenia, projekty do akceptacji, do wysłania…), wyszukiwanie po numerze, e-mailu, nazwisku i firmie.
- **Szczegóły** — pliki klienta do pobrania, płatności z każdą próbą, pełna historia z autorem zmiany (klient, płatność, sklep, automat) i przyciski tylko dla akcji dozwolonych w danym stanie:
  potwierdź przelew → projekt zaakceptowany / do poprawy → wysłane (numer przesyłki) → doręczone → zakończone; anulowanie; zwrot pełny lub częściowy (Stripe automatycznie, P24/przelew/pobranie — zapis do ręcznego zwrotu) z opcją oddania towaru na stan; notatki.
- **Produkty** — cena (każda zmiana trafia do historii cen pod Omnibus), stan magazynowy (nie niżej niż rezerwacje), włączanie wariantów i ukrywanie produktów.

Każda zmiana statusu ma warunek w zapytaniu (`UPDATE … WHERE status = <poprzedni>`), więc dwa kliknięcia albo dwóch adminów naraz nie przestawią zamówienia dwa razy.
