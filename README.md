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
| 5 | InPost ShipX + Geowidget (Paczkomat i kurier, etykiety, statusy) | gotowe; Furgonetka — opcjonalnie |
| 6 | Panel admina, maile (Resend), faktury (Fakturownia) | panel i maile gotowe; faktury — dalej |
| 7 | Regulamin, prywatność, odstąpienie, limity prób, Turnstile, nagłówki, testy | gotowe |
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
  api/lockers.js              wyszukiwarka Paczkomatów (publiczne API punktów InPost, bez konta)
  api/withdrawal.js           formularz odstąpienia od umowy
  api/config.js               publiczne ustawienia frontu (klucz Turnstile)
  _lib/guard.js               limity prób w D1, weryfikacja Turnstile
  api/checkout.js             GET wycena dla dostawy i płatności, POST złożenie zamówienia
  api/order/…                 GET /api/order?number=&t=, POST /api/order/pay (ponowna płatność)
  api/webhooks/stripe.js      powiadomienia Stripe (podpis HMAC, idempotencja)
  api/webhooks/przelewy24.js  powiadomienia P24 (podpis SHA-384 + transaction/verify)
  api/payments/simulate.js    bramka testowa w trybie demo, gdy brak kluczy
  api/downloads/[token].js    produkty cyfrowe: link ważny 7 dni, 5 pobrań
  api/admin/…                 panel: summary, orders, orders/:id (akcje), products, variants/:id, uploads/:id
  _lib/inpost.js              ShipX: przesyłka, status, etykieta, sprawdzanie Paczkomatu, symulator z etykietą PDF
  _lib/shipping.js            przesyłka zamówienia, synchronizacja statusu z zamówieniem
  api/admin/shipments/[id]/label.js  etykieta A6/A4 (token InPost nie trafia do przeglądarki)
  api/webhooks/inpost/[key].js       powiadomienia InPost (klucz w adresie, status pobierany z API)
  _lib/mail.js                maile przez Resend: szablony HTML + tekst, dziennik wysyłek
  _lib/admin.js               uprawnienia (ADMIN_EMAILS), przejścia statusów, zwroty
  _lib/orders.js              zamówienie z koszyka w jednej transakcji, finalizacja, wygaszanie rezerwacji
  _lib/payments.js            Stripe Checkout, Przelewy24 REST, wspólne oznaczanie płatności
  api/uploads/…               POST /api/uploads (R2), GET/DELETE /api/uploads/:id (tylko właściciel)
  _lib/catalog.js             zapytania D1, Omnibus (najniższa cena z 30 dni)
  _lib/cart.js                koszyk gościa (ciasteczko) i klienta, łączenie po zalogowaniu
  _lib/crypto.js              PBKDF2 100 000 iteracji, tokeny, SHA-256
public/admin/                 panel admina: index.html, admin.js, admin.css (pod adresem /admin/)
public/assets/legal.js        regulamin, polityka prywatności, odstąpienie (wzory do uzupełnienia danymi firmy)
public/_headers               nagłówki bezpieczeństwa i Content-Security-Policy
tests/unit.test.mjs           testy jednostkowe (npm test)
public/assets/pricing.js      wyliczanie sum koszyka — wspólne dla frontu i API
public/assets/store.js        koszyk i konto: przez API albo lokalnie w podglądzie
migrations/0001_init.sql      pełny schemat: katalog, klienci, koszyk, zamówienia,
                              płatności (idempotencja webhooków), wysyłki, rabaty, bony, pobrania
migrations/0002_…sql          sesje, reset hasła, pliki klientów
migrations/0005_przesylki.sql dane przesyłek InPost
migrations/0004_maile.sql     link do zamówienia w mailach, dziennik maili
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

## Maile (Resend)

Sekret `RESEND_API_KEY` (Cloudflare → Settings → Variables and Secrets), nadawca i adres do odpowiedzi w `wrangler.toml` (`MAIL_FROM`, `MAIL_REPLY_TO`).
Domena nadawcy musi być zweryfikowana w Resend (Domains → Add Domain → rekordy DNS).

| Kiedy | Mail do klienta |
|---|---|
| Zamówienie z przelewem lub za pobraniem | „Przyjęliśmy zamówienie” — z danymi do przelewu |
| Płatność online przyjęta / przelew potwierdzony w panelu | „Płatność przyjęta” — z linkami do plików cyfrowych i kodami kart podarunkowych |
| Panel: projekt do poprawy | treść uwagi od grafika |
| Panel: projekt zaakceptowany | „drukujemy” |
| Panel: wysłane | numer przesyłki i link do śledzenia InPost (albo „gotowe do odbioru”) |
| Panel: zwrot / anulowanie | kwota i termin zwrotu / informacja o anulowaniu |
| Reset hasła | link ważny 60 min |

Sklep dostaje jedno powiadomienie o każdym nowym zamówieniu na adresy z `ADMIN_EMAILS`.
Każda wysyłka ląduje w tabeli `emails` i jest widoczna w panelu przy zamówieniu (wysłany / błąd / pominięty). Błąd Resend nie blokuje zamówienia — maile idą w tle (`waitUntil`). W panelu można zaznaczyć „nie wysyłaj maila” przy zmianie statusu.

## Wysyłki InPost (Etap 5)

**Kasa:** przy dostawie do Paczkomatu klient wybiera punkt na mapie InPost (Geowidget v5, ładowany po kliknięciu). Bez tokenu mapy — wpisuje kod.
Serwer sprawdza w publicznym API punktów, czy Paczkomat istnieje i działa.

**Panel (zamówienie „W realizacji”):**
1. *Utwórz przesyłkę InPost* — gabaryt A/B/C podpowiadany z produktów (Paczkomat) albo waga i wymiary (kurier). Pobranie i ubezpieczenie ustawiają się same.
2. *Etykieta A6 / A4* — PDF prosto z InPost.
3. Status aktualizuje się sam (webhook) albo przyciskiem *Odśwież status*. Odebrana od nadawcy → zamówienie „Wysłane” + mail z numerem; doręczona → „Dostarczone”, a pobranie rozliczone.

Bez tokenu (tryb demo) działa symulator: numer przesyłki, etykieta testowa PDF i kolejne statusy przy każdym odświeżeniu.

**Konfiguracja (sandbox):**
1. Konto: https://sandbox-manager.paczkomaty.pl — uzupełnij dane firmy i do faktury, w zakładce Płatności doładuj konto wirtualnie.
2. Moje konto → API: **Token API ShipX** → sekret `INPOST_API_TOKEN`, **ID organizacji** → sekret `INPOST_ORGANIZATION_ID`.
3. Moje konto → API → Geowidget: token dla domeny `promokuznia.pages.dev` → `INPOST_GEOWIDGET_TOKEN`.
4. Losowy klucz (min. 24 znaki) → sekret `INPOST_WEBHOOK_KEY`; w Ustawieniach organizacji adres webhooka:
   `https://promokuznia.pages.dev/api/webhooks/inpost/<INPOST_WEBHOOK_KEY>`.
5. Produkcja: konto na manager.paczkomaty.pl, te same kroki i `INPOST_SANDBOX = "0"` w `wrangler.toml`.

## Dokumenty, bezpieczeństwo i testy (Etap 7)

**Dokumenty** (`#regulamin`, `#prywatnosc`, `#odstapienie`) — wzory oparte na ustawie o prawach konsumenta i RODO, z miejscami na dane firmy (`SELLER` w `public/assets/legal.js`). Przed prawdziwą sprzedażą: uzupełnij dane i daj do sprawdzenia prawnikowi.
Formularz odstąpienia zapisuje oświadczenie przy zamówieniu (widać je w historii w panelu) i wysyła maile do klienta i sklepu.

**Limity prób** (tabela `rate_limits`, licznik w jednym zapytaniu UPSERT):

| Co | Limit |
|---|---|
| Logowanie | 10 prób / 15 min na konto, 30 / 15 min z jednego IP; udane logowanie zeruje licznik konta |
| Rejestracja | 10 / godz. z IP |
| Reset hasła | 3 / godz. na adres, 10 / godz. z IP |
| Kasa | 20 zamówień / godz. z IP |
| Wgrywanie plików | 40 / godz. z IP |
| Odstąpienie | 5 / godz. z IP |

**Turnstile** (opcjonalnie, darmowe): Cloudflare → Turnstile → Add widget dla domeny sklepu; klucz publiczny do `TURNSTILE_SITE_KEY` w `wrangler.toml`, tajny jako sekret `TURNSTILE_SECRET`. Chroni rejestrację, reset hasła, kasę gościa i formularz odstąpienia.

**Nagłówki** (`public/_headers`): CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy.

**Testy:** `npm test` — 19 testów: sumy, dostawa, rabaty, pobranie, VAT, walidacja kasy i NIP, Omnibus, podpis Stripe, hasła, uprawnienia panelu, przesyłki InPost.

**Wybór Paczkomatu bez konta InPost:** kasa szuka punktów po mieście, kodzie pocztowym, lokalizacji („Blisko mnie”) albo kodzie punktu przez `/api/lockers` (publiczne API punktów ShipX). Mapa Geowidget pojawia się dodatkowo, gdy jest `INPOST_GEOWIDGET_TOKEN`.
