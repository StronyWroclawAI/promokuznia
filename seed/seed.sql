-- Wygenerowano przez scripts/build-seed.mjs — nie edytuj ręcznie
PRAGMA foreign_keys = ON;

INSERT INTO categories (id, slug, name, lead, sort) VALUES (1, 'wizytowki', 'Wizytówki', 'Klasyczna kreda 350 g albo premium soft-touch z lakierem UV. Od 100 sztuk, wysyłka Paczkomatem.', 1);
INSERT INTO categories (id, slug, name, lead, sort) VALUES (2, 'plakaty', 'Plakaty', 'Projekt i druk plakatów od A5 do A0 — na wydarzenie, do witryny i na ścianę biura.', 2);

INSERT INTO products (id, slug, category_id, name, type, short, description, vat_rate, personalizable, lead_time_days, weight_g, length_cm, width_cm, height_cm, shipping_class, parcel_size, art_shape, art_tone, specs_json, badges_json, compare_at_gr, gpsr_json) VALUES (1, 'wizytowki-standard', 1, 'Wizytówki Standard', 'physical', 'Kreda matowa 350 g/m², druk dwustronny 4+4, format 85×55 mm.', 'Najczęściej zamawiane wizytówki: sztywny papier kredowy 350 g/m², żywe kolory CMYK po obu stronach i równe cięcie. Wgrywasz własny plik PDF — przed drukiem sprawdzamy spady i rozdzielczość, a podgląd wysyłamy do akceptacji.', 23, 1, 3, 400, 10, 7, 5, 'paczkomat', 'A', 'card', 'magenta', '[["Format","85 × 55 mm (+2 mm spadu)"],["Papier","kreda matowa 350 g/m²"],["Kolorystyka","4+4 CMYK"],["Plik","PDF/X-1a, 300 dpi"]]', '["Bestseller"]', NULL, '{"name":"PromoKuźnia (dane przykładowe — sklep demonstracyjny)","address":"ul. Kowalska 12, 50-000 Wrocław","contact":"bezpieczenstwo@promokuznia.pl"}');
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (1, 1, 'PK-DR01-100', '100 szt.', 4900, 999, 0);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (2, 1, 'PK-DR01-250', '250 szt.', 7900, 999, 1);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (3, 1, 'PK-DR01-500', '500 szt.', 11900, 999, 2);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (4, 1, 'PK-DR01-1000', '1000 szt.', 17900, 999, 3);
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (1, 4900, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (2, 7900, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (3, 11900, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (4, 17900, '2026-09-05T22:57:50Z');
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (1, '', 'https://images.pexels.com/photos/4466176/pexels-photo-4466176.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Stosy białych wizytówek na stole', 0);
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (1, '', 'https://images.pexels.com/photos/4466175/pexels-photo-4466175.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Wizytówki na biurku obok żółtego kwiatu', 1);
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (1, '', 'https://images.pexels.com/photos/8947692/pexels-photo-8947692.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Notes i wizytówka na biurku', 2);

INSERT INTO products (id, slug, category_id, name, type, short, description, vat_rate, personalizable, lead_time_days, weight_g, length_cm, width_cm, height_cm, shipping_class, parcel_size, art_shape, art_tone, specs_json, badges_json, compare_at_gr, gpsr_json) VALUES (2, 'wizytowki-soft-touch', 1, 'Wizytówki Premium Soft Touch', 'physical', 'Aksamitna folia soft-touch i lakier UV wybiórczy na logo.', 'Wizytówka, którą klient zapamięta w dłoni: folia soft-touch o aksamitnym chwycie i błyszczący lakier UV punktowo na logo. Papier 400 g/m² nie wygina się w portfelu.', 23, 1, 5, 450, 10, 7, 5, 'paczkomat', 'A', 'card', 'ink', '[["Format","85 × 55 mm"],["Papier","kreda 400 g/m²"],["Uszlachetnienie","folia soft-touch 2-str., lakier UV 1+0"],["Plik","PDF + osobna warstwa lakieru"]]', '[]', NULL, '{"name":"PromoKuźnia (dane przykładowe — sklep demonstracyjny)","address":"ul. Kowalska 12, 50-000 Wrocław","contact":"bezpieczenstwo@promokuznia.pl"}');
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (5, 2, 'PK-DR02-250', '250 szt.', 13900, 999, 0);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (6, 2, 'PK-DR02-500', '500 szt.', 19900, 999, 1);
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (5, 13900, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (6, 19900, '2026-09-05T22:57:50Z');
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (2, '', 'https://images.pexels.com/photos/4466420/pexels-photo-4466420.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Czarne wizytówki na białym tle', 0);
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (2, '', 'https://images.pexels.com/photos/8489953/pexels-photo-8489953.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Wizytówki na ciemnych kamieniach', 1);
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (2, '', 'https://images.pexels.com/photos/6373839/pexels-photo-6373839.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Wizytówki na desce z bawełną', 2);

INSERT INTO products (id, slug, category_id, name, type, short, description, vat_rate, personalizable, lead_time_days, weight_g, length_cm, width_cm, height_cm, shipping_class, parcel_size, art_shape, art_tone, specs_json, badges_json, compare_at_gr, gpsr_json) VALUES (3, 'projekt-plakatu', 2, 'Projekt plakatu', 'service', 'Plakat zaprojektowany przez grafika — od A5 do A0, gotowy do druku i do internetu.', 'Opisz wydarzenie, ofertę albo promocję i dołącz logo, a grafik przygotuje plakat w wybranym formacie. Dostajesz dwie propozycje, dwie rundy poprawek i komplet plików: PDF do druku ze spadami oraz wersję do social mediów. Plakat możesz od razu wydrukować u nas — dodaj do koszyka „Druk plakatu” w tym samym formacie.', 23, 1, 4, NULL, NULL, NULL, NULL, NULL, NULL, 'pentool', 'magenta', '[["Co dostajesz","2 propozycje i 2 rundy poprawek"],["Pliki","PDF do druku (spad 3 mm, CMYK) + PNG do internetu"],["Termin","pierwsze propozycje w 4 dni robocze"],["Formaty","A5–A0, w pionie lub w poziomie"],["Materiały","logo i teksty wgrywasz w koszyku albo wysyłasz mailem"]]', '["Nowość"]', NULL, NULL);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (7, 3, 'PK-PL-PRJ-A5', 'A5 · 148 × 210 mm', 24900, NULL, 0);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (8, 3, 'PK-PL-PRJ-A4', 'A4 · 210 × 297 mm', 26900, NULL, 1);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (9, 3, 'PK-PL-PRJ-A3', 'A3 · 297 × 420 mm', 29900, NULL, 2);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (10, 3, 'PK-PL-PRJ-A2', 'A2 · 420 × 594 mm', 34900, NULL, 3);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (11, 3, 'PK-PL-PRJ-A1', 'A1 · 594 × 841 mm', 39900, NULL, 4);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (12, 3, 'PK-PL-PRJ-A0', 'A0 · 841 × 1189 mm', 44900, NULL, 5);
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (7, 24900, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (8, 26900, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (9, 29900, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (10, 34900, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (11, 39900, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (12, 44900, '2026-09-05T22:57:50Z');
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (3, '', 'https://images.pexels.com/photos/13451104/pexels-photo-13451104.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Grafik projektujący przy komputerze', 0);
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (3, '', 'https://images.pexels.com/photos/12903003/pexels-photo-12903003.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Projektowanie na tablecie graficznym i laptopie', 1);
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (3, '', 'https://images.pexels.com/photos/4348404/pexels-photo-4348404.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Projekt graficzny na ekranie laptopa', 2);

INSERT INTO products (id, slug, category_id, name, type, short, description, vat_rate, personalizable, lead_time_days, weight_g, length_cm, width_cm, height_cm, shipping_class, parcel_size, art_shape, art_tone, specs_json, badges_json, compare_at_gr, gpsr_json) VALUES (4, 'druk-plakatu', 2, 'Druk plakatu A5–A0', 'physical', 'Kreda satyna 170 g/m², pełny kolor. Od 1 sztuki, wysyłka w tubie.', 'Plakaty z Twojego pliku albo z projektu zamówionego u nas. Drukujemy na satynowanej kredzie 170 g/m² — kolory są nasycone, a papier nie odbija światła jak błysk. Plakaty zwijamy do sztywnej tuby kartonowej, więc docierają bez zagięć. Cena dotyczy jednej sztuki; większy nakład ustawisz liczbą w koszyku.', 23, 1, 2, 600, 95, 10, 10, 'kurier', NULL, 'flyer', 'cyan', '[["Papier","kreda satyna 170 g/m²"],["Druk","4+0 CMYK, jednostronnie"],["Plik","PDF, spad 3 mm; 300 dpi (A5–A3), min. 150 dpi (A2–A0)"],["Pakowanie","tuba kartonowa"],["Dostawa","kurier InPost"]]', '[]', NULL, '{"name":"PromoKuźnia (dane przykładowe — sklep demonstracyjny)","address":"ul. Kowalska 12, 50-000 Wrocław","contact":"bezpieczenstwo@promokuznia.pl"}');
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (13, 4, 'PK-PL-DRK-A5', 'A5 · 148 × 210 mm', 690, NULL, 0);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (14, 4, 'PK-PL-DRK-A4', 'A4 · 210 × 297 mm', 990, NULL, 1);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (15, 4, 'PK-PL-DRK-A3', 'A3 · 297 × 420 mm', 1690, NULL, 2);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (16, 4, 'PK-PL-DRK-A2', 'A2 · 420 × 594 mm', 3490, NULL, 3);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (17, 4, 'PK-PL-DRK-A1', 'A1 · 594 × 841 mm', 5490, NULL, 4);
INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (18, 4, 'PK-PL-DRK-A0', 'A0 · 841 × 1189 mm', 8990, NULL, 5);
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (13, 690, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (14, 990, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (15, 1690, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (16, 3490, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (17, 5490, '2026-09-05T22:57:50Z');
INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (18, 8990, '2026-09-05T22:57:50Z');
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (4, '', 'https://images.pexels.com/photos/6373486/pexels-photo-6373486.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Plakat na ścianie we wnętrzu', 0);
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (4, '', 'https://images.pexels.com/photos/3752659/pexels-photo-3752659.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Plakaty reklamowe na ścianie', 1);
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (4, '', 'https://images.pexels.com/photos/3964819/pexels-photo-3964819.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Plakaty na ścianie w mieście', 2);
INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (4, '', 'https://images.pexels.com/photos/7149338/pexels-photo-7149338.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Wieszanie plakatu na ścianie', 3);

INSERT INTO coupons (code, kind, value, min_total_gr, max_uses, valid_until) VALUES ('START10', 'procent', 10, 5000, 100, '2027-11-04T22:57:50Z');
INSERT INTO coupons (code, kind, value, min_total_gr, max_uses, valid_until) VALUES ('DOSTAWA0', 'darmowa_dostawa', 0, 10000, NULL, '2027-11-04T22:57:50Z');
