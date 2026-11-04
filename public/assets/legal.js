// Dokumenty sklepu. Wzór dla sklepu demonstracyjnego — przed prawdziwą sprzedażą uzupełnij dane firmy
// i daj treść do sprawdzenia prawnikowi. Podstawa: ustawa o prawach konsumenta z 30 maja 2014 r., RODO.

export const SELLER = {
  name: '[Nazwa firmy — sklep demonstracyjny]',
  address: '[ulica i numer, kod pocztowy, miejscowość]',
  ids: 'NIP [—], REGON [—]',
  email: 'zamowienia@stronyaiwroclaw.pl',
  returnAddress: '[adres do zwrotów]'
};

const SL = SELLER;

export const LEGAL = {
  regulamin: {
    title: 'Regulamin sklepu',
    updated: '4 listopada 2026',
    sections: [
      ['Kto sprzedaje', `<p>Sklep PromoKuźnia prowadzi ${SL.name}, ${SL.address}, ${SL.ids}. Kontakt: <span class="mono">${SL.email}</span>.</p>
        <p><b>To sklep demonstracyjny</b> — projekt portfolio. Zamówienia nie są realizowane, a płatności działają w trybie testowym.</p>`],
      ['Zamówienia', `<ol>
        <li>Zamówienie składasz przez koszyk i kasę. Konto nie jest wymagane.</li>
        <li>Umowa zostaje zawarta, gdy klikniesz przycisk zamówienia („Zamawiam i płacę” albo „Zamawiam z obowiązkiem zapłaty”). Potwierdzenie i link do zamówienia wysyłamy e-mailem.</li>
        <li>Ceny są cenami brutto w złotych i zawierają VAT. Koszt dostawy widzisz przed złożeniem zamówienia. Przy obniżce podajemy najniższą cenę z 30 dni przed obniżką.</li>
        <li>Produkty z Twoim logo wykonujemy według przesłanego pliku. Przed produkcją wysyłamy podgląd do akceptacji.</li>
      </ol>`],
      ['Płatności', `<p>Płacisz BLIK-iem, kartą, Apple Pay lub Google Pay (Stripe), przez Przelewy24, przelewem tradycyjnym albo przy odbiorze (kurier, +5 zł). Przy płatności online towar rezerwujemy na 35 minut, przy przelewie na 3 dni. Po tym czasie nieopłacone zamówienie anulujemy.</p>`],
      ['Dostawa i realizacja', `<ul>
        <li>Paczkomat InPost — 13,99 zł, kurier InPost — 16,99 zł, odbiór osobisty — bezpłatnie. Od 300 zł dostawa Paczkomatem i kurierem jest gratis.</li>
        <li>Czas przygotowania podajemy przy każdym produkcie; przy produktach z logo liczymy go od akceptacji podglądu.</li>
        <li>Produkty cyfrowe udostępniamy linkiem w e-mailu zaraz po płatności (link ważny 7 dni, 5 pobrań).</li>
        <li>Karty podarunkowe są ważne 12 miesięcy i można je wykorzystywać w częściach.</li>
      </ul>`],
      ['Odstąpienie od umowy', `<p>Jako konsument możesz odstąpić od umowy bez podawania przyczyny w ciągu <b>14 dni</b> od otrzymania towaru. Szczegóły, formularz i wyjątki: <a href="#odstapienie">Odstąpienie od umowy</a>.</p>`],
      ['Reklamacje', `<ol>
        <li>Odpowiadamy za zgodność towaru z umową przez 2 lata od dostarczenia (art. 43a–43g ustawy o prawach konsumenta).</li>
        <li>Reklamację zgłoś e-mailem na <span class="mono">${SL.email}</span>: podaj numer zamówienia, opis problemu i oczekiwanie (naprawa, wymiana, obniżka ceny lub odstąpienie). Zdjęcie pomaga, ale nie jest wymagane.</li>
        <li>Odpowiadamy w ciągu 14 dni. Brak odpowiedzi w tym terminie oznacza uznanie reklamacji.</li>
        <li>Koszt odesłania towaru w uznanej reklamacji pokrywa sklep.</li>
      </ol>`],
      ['Przedsiębiorcy', `<p>Osoba prowadząca jednoosobową działalność, która kupuje na cele niezwiązane bezpośrednio z zawodem (art. 38a ustawy o prawach konsumenta), ma prawo odstąpienia i ochronę jak konsument. Wobec pozostałych firm odpowiedzialność z tytułu rękojmi jest wyłączona w granicach dopuszczonych przez prawo.</p>`],
      ['Spory i postanowienia końcowe', `<p>W razie sporu możesz skorzystać z pomocy miejskiego lub powiatowego rzecznika konsumentów albo wojewódzkiego inspektoratu Inspekcji Handlowej. W sprawach nieuregulowanych stosuje się prawo polskie, w tym Kodeks cywilny i ustawę o prawach konsumenta. Zasady przetwarzania danych opisuje <a href="#prywatnosc">Polityka prywatności</a>.</p>`]
    ]
  },

  prywatnosc: {
    title: 'Polityka prywatności',
    updated: '4 listopada 2026',
    sections: [
      ['Administrator', `<p>Administratorem danych jest ${SL.name}, ${SL.address}. W sprawach danych pisz na <span class="mono">${SL.email}</span>.</p>`],
      ['Jakie dane i po co', `<table class="spec legal-table"><thead><tr><th>Cel</th><th>Dane</th><th>Podstawa (RODO)</th><th>Jak długo</th></tr></thead><tbody>
        <tr><td>Zamówienie i dostawa</td><td>imię i nazwisko, e-mail, telefon, adres lub Paczkomat, zawartość zamówienia</td><td>umowa — art. 6 ust. 1 lit. b</td><td>do końca realizacji i okresu reklamacji (2 lata)</td></tr>
        <tr><td>Faktury i księgowość</td><td>dane do faktury, NIP</td><td>obowiązek prawny — art. 6 ust. 1 lit. c</td><td>5 lat od końca roku podatkowego</td></tr>
        <tr><td>Konto klienta</td><td>e-mail, imię, hash hasła, historia zamówień</td><td>umowa o prowadzenie konta — lit. b</td><td>do usunięcia konta</td></tr>
        <tr><td>Bezpieczeństwo i obrona roszczeń</td><td>adres IP, dziennik zdarzeń, liczniki prób logowania</td><td>prawnie uzasadniony interes — lit. f</td><td>liczniki: do 1 godziny; dziennik: do przedawnienia roszczeń</td></tr>
        <tr><td>Informacje o nowościach</td><td>e-mail</td><td>zgoda — lit. a</td><td>do wycofania zgody</td></tr>
      </tbody></table>`],
      ['Komu przekazujemy dane', `<ul>
        <li><b>Cloudflare</b> — hosting strony, baza danych i pliki (w tym pliki z logo).</li>
        <li><b>Stripe</b> i <b>Przelewy24</b> — obsługa płatności. Danych karty nie widzimy.</li>
        <li><b>InPost</b> — doręczenie przesyłki.</li>
        <li><b>Resend</b> — wysyłka e-maili o zamówieniu.</li>
        <li><b>Pexels</b> — część zdjęć poglądowych ładuje się z serwerów Pexels, które widzą adres IP przeglądarki (jak każdy serwer obrazków).</li>
        <li>Biuro rachunkowe — księgowość.</li>
      </ul>
      <p>Część dostawców (Cloudflare, Stripe, Resend) może przetwarzać dane poza EOG — na podstawie standardowych klauzul umownych Komisji Europejskiej lub programu EU-US Data Privacy Framework.</p>`],
      ['Twoje prawa', `<p>Masz prawo do dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przeniesienia, sprzeciwu wobec przetwarzania na podstawie uzasadnionego interesu oraz do wycofania zgody w każdej chwili. Możesz też złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa).</p>
        <p>Podanie danych jest dobrowolne, ale bez danych do dostawy i kontaktu nie zrealizujemy zamówienia.</p>`],
      ['Pliki cookies', `<p>Używamy wyłącznie plików niezbędnych do działania sklepu, dlatego nie pytamy o zgodę:</p>
        <table class="spec legal-table"><tbody>
          <tr><th scope="row" class="mono">pk_cart</th><td>koszyk osoby niezalogowanej, 30 dni</td></tr>
          <tr><th scope="row" class="mono">pk_session</th><td>sesja zalogowanego klienta, 30 dni</td></tr>
          <tr><th scope="row" class="mono">Turnstile (Cloudflare)</th><td>ochrona formularzy przed botami, jeśli jest włączona</td></tr>
        </tbody></table>
        <p>Nie używamy cookies reklamowych ani analitycznych.</p>`]
    ]
  },

  odstapienie: {
    title: 'Odstąpienie od umowy',
    updated: '4 listopada 2026',
    sections: [
      ['14 dni na zwrot', `<p>Masz <b>14 dni od otrzymania towaru</b> na odstąpienie od umowy bez podawania przyczyny. Wystarczy, że przed upływem terminu wyślesz oświadczenie — formularzem poniżej albo e-mailem na <span class="mono">${SL.email}</span>.</p>
        <ol>
          <li>Odeślij towar w ciągu 14 dni od złożenia oświadczenia na adres: ${SL.returnAddress}. Koszt odesłania pokrywasz sam.</li>
          <li>Zwracamy pieniądze w ciągu 14 dni od otrzymania oświadczenia, tą samą metodą płatności — łącznie z kosztem najtańszej dostawy. Możemy wstrzymać zwrot do czasu otrzymania towaru.</li>
          <li>Odpowiadasz za zmniejszenie wartości towaru wynikające z korzystania z niego w sposób wykraczający poza sprawdzenie jego charakteru i działania.</li>
        </ol>`],
      ['Kiedy prawo odstąpienia nie przysługuje', `<ul>
        <li><b>Produkty z Twoim logo lub projektem</b> — wykonane według Twojej specyfikacji (art. 38 ust. 1 pkt 3 ustawy o prawach konsumenta).</li>
        <li><b>Produkty cyfrowe</b>, jeśli zgodziłeś się na ich dostarczenie od razu i przyjąłeś do wiadomości utratę prawa odstąpienia (art. 38 ust. 1 pkt 13) — zgodę potwierdzasz w kasie.</li>
        <li><b>Usługi</b> wykonane w pełni za Twoją wyraźną zgodą (art. 38 ust. 1 pkt 1).</li>
      </ul>
      <p>Te ograniczenia nie dotyczą reklamacji — wadliwy produkt z logo naprawimy, wymienimy albo zwrócimy pieniądze.</p>`],
      ['Wzór formularza', `<pre class="legal-form">Adresat: ${SL.name}, ${SL.address}, ${SL.email}

Ja/My(*) niniejszym informuję/informujemy(*) o moim/naszym odstąpieniu od umowy
sprzedaży następujących rzeczy(*): ………………………………………………
Data zawarcia umowy / odbioru(*): …………………
Numer zamówienia: …………………
Imię i nazwisko konsumenta(-ów): …………………
Adres konsumenta(-ów): …………………
Podpis (tylko przy wersji papierowej): …………………   Data: …………………

(*) Niepotrzebne skreślić.</pre>`]
    ]
  }
};
