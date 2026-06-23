# 🔒 GDPR Live Inspector

**Interaktywna nauka RODO przez praktykę**

Projekt edukacyjny pozwalający studentom nauczyć się wymogów GDPR/RODO poprzez interaktywne demonstracje zamiast suchej teorii.

## 🎯 Cele dydaktyczne

Zamiast czytać o RODO, student:
- **Widzi na żywo** jak działa maskowanie danych osobowych
- **Analizuje** formularz i obserwuje, które pola naruszają zasadę minimalizacji
- **Śledzi** przepływ danych przez system i rozumie, gdzie stosować zabezpieczenia
- **Doświadcza** realizacji praw użytkownika z perspektywy podmiotu danych

## 📚 Moduły

### 🎭 Maskowanie danych
- Wpisywanie danych i obserwacja maskowania w czasie rzeczywistym
- Trzy techniki: maskowanie, pseudonimizacja, anonimizacja
- Wyjaśnienia kiedy stosować którą metodę

### 📊 Analiza formularza
- Interaktywny formularz z oceną zgodności GDPR
- Kolorowe oznaczenia: dane wymagane, opcjonalne, nadmiarowe
- Live inspector komentujący każde pole
- Wskaźnik zgodności z RODO

### 🔐 Przepływ danych
- Wizualizacja: Formularz → Szyfrowanie → Baza → Dostęp
- Klikalne elementy z szczegółami technicznymi
- Odniesienia do konkretnych artykułów RODO

### ⚖️ Prawa użytkownika
- Symulacja panelu "Moje dane" z perspektywy użytkownika
- Demonstracje wszystkich kluczowych praw RODO:
  - Art. 15 — Prawo dostępu
  - Art. 16 — Prawo do sprostowania
  - Art. 17 — Prawo do usunięcia
  - Art. 20 — Prawo do przenoszenia
  - Art. 21 — Prawo do sprzeciwu
  - Art. 7 — Zarządzanie zgodami

## 🚀 Uruchomienie

### Lokalnie
Otwórz plik `index.html` w przeglądarce.

### GitHub Pages
1. Utwórz nowe repozytorium na GitHub
2. Wgraj pliki do repozytorium
3. Przejdź do Settings → Pages
4. Wybierz branch `main` i folder `/ (root)`
5. Strona będzie dostępna pod adresem: `https://[username].github.io/[repo-name]/`

## 📋 Propozycje zadań zaliczeniowych

### Zadanie 1: Analiza formularza (łatwe)
> Otwórz moduł "Analiza formularza". Wypełnij wszystkie pola i odpowiedz:
> 1. Które pola są nadmiarowe dla formularza rejestracji do newslettera?
> 2. Jaki artykuł RODO narusza zbieranie PESEL bez podstawy prawnej?
> 3. Jaki poziom zgodności osiągnąłeś?

### Zadanie 2: Maskowanie vs anonimizacja (średnie)
> W module "Maskowanie danych" wprowadź swoje przykładowe dane i porównaj trzy techniki:
> 1. Czym różni się maskowanie od pseudonimizacji?
> 2. Dlaczego dane anonimowe nie podlegają RODO?
> 3. W jakich sytuacjach zastosujesz każdą technikę?

### Zadanie 3: Realizacja praw (zaawansowane)
> W module "Prawa użytkownika" przeanalizuj każde prawo:
> 1. Na czym polega różnica między prawem do usunięcia a prawem do sprzeciwu?
> 2. Czy administrator może odmówić realizacji prawa do bycia zapomnianym? Podaj przykład.
> 3. Opisz proces eksportu danych wynikający z Art. 20.

### Zadanie 4: Projekt własnego formularza (projekt)
> Zaprojektuj zgodny z RODO formularz dla aplikacji fitness:
> 1. Jakie dane są niezbędne (podstawa: umowa)?
> 2. Jakie dane wymagają zgody?
> 3. Jakie dane są nadmiarowe?
> 4. Jak zrealizujesz prawo dostępu i usunięcia?

## 📖 Źródła i materiały

- [GDPR.eu](https://gdpr.eu/) — Oficjalny przewodnik po RODO
- [UODO](https://uodo.gov.pl/) — Urząd Ochrony Danych Osobowych
- [Rozporządzenie 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj) — Pełny tekst RODO
- [ICO Guide](https://ico.org.uk/for-organisations/guide-to-data-protection/) — Brytyjski przewodnik (angielski)

## 🛠️ Technologie

- HTML5
- CSS3 (animacje, flexbox, grid)
- Vanilla JavaScript
- Zero zależności — działa w każdej przeglądarce

## 📄 Licencja

Projekt edukacyjny — używaj swobodnie w celach dydaktycznych.

---

*Stworzono z myślą o praktycznej nauce RODO* 🎓
