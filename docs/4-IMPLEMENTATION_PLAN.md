# Implementační plán: Smart Renamer

## Cíl a motivace (Background & Motivation)

Vytvořit lokální macOS nástroj (CLI / Quick Action) pro deterministické a
bezpečné přejmenovávání dokumentů (PDF, skeny) pomocí lokálního OCR (Apple
Vision) a LLM (LM Studio). Cílem je sjednotit názvy souborů s důrazem na
absolutní soukromí (Privacy First) a minimalismus (Intentional Minimalism).

## Rozsah a dopad (Scope & Impact)

- **Komponenty:** CLI rozhraní, Swift OCR modul, integrace lokálního LLM (Gemma
  4), deterministické párování pomocí regulárních výrazů (Registry) a záložní
  uživatelský dialog (AppleScript).
- **Prostředí:** Node.js 22+, výhradně macOS (APFS/HFS+ file system limity).
- **Dopad:** Automatizace a standardizace názvů archivovaných souborů bez rizika
  odesílání citlivých dat do cloudu. Nástroj je plně reverzibilní díky
  transakčnímu logu.

## Navrhované řešení (Proposed Solution)

Architektura se bude skládat z následujících modulů (funkcionální paradigma,
jmenné exporty, žádné třídy):

1. **Deduplikace (`src/dedupe.js`):** Kontrola SHA-256 hashe přes stream,
   zamezení dvojímu zpracování.
2. **OCR (`src/ocr.js` a `bin/vision-ocr.swift`):** Využití nativního Apple
   Vision Frameworku pro extrakci textu a renderování PDF (komprese pod 4 MB).
3. **Registry (`src/registry.js`):** Rychlé a bezpečné přiřazení firmy/popisu
   pomocí regulárních výrazů (ochrana proti ReDoS útokům přes `safe-regex`).
4. **LLM Engine (`src/llm.js`):** Komunikace s LM Studio na localhostu s
   definovaným striktním timeoutem (35s).
5. **Fallback Dialog (`src/ui.js`):** Zobrazení nativního macOS dialogu přes
   `osascript`, pokud automatická detekce nedodá dostatek informací.
6. **Rename & Sanitize (`src/rename.js`):** Bezpečné sestavení názvu, ošetření
   kolizí a zkrácení názvu s ohledem na 255bytový limit macOS.
7. **Logger (`src/logger.js`):** Atomický zápis transakcí do append-only JSONL
   souboru s možností rotace (max 10 MB).

## Zvažované alternativy (Alternatives Considered)

- **Použití cloudového LLM (OpenAI/Anthropic):** Zamítnuto z důvodu striktních
  požadavků na soukromí dat (Privacy First).
- **Extrakce textu přes pdftotext:** Zamítnuto, protože nefunguje pro skenovaná
  (obrázková) PDF. Apple Vision Framework zabudovaný v macOS pokrývá vše.
- **Výhradní spoléhání na LLM (Single Pass):** Zamítnuto, modely mají tendenci
  halucinovat u nekvalitního textu. Zavedena stabilní víceúrovňová strategie
  (Registry -> LLM -> Ruční dialog).
- **Test-Driven Development (TDD):** Zamítnuto. Ačkoliv TDD přirozeně vynucuje
  čisté oddělení vedlejších efektů (side-effects) od byznys logiky a pomáhá
  objevovat správnou architekturu, pro tento projekt bylo rozhodnuto od něj
  upustit. Důvodem je předem pevně definovaná C4 architektura (popsaná v
  [DESIGN.md](./3-DESIGN.md) a [ARCHITECTURE.md](./2-ARCHITECTURE.md)), která
  již explicitně stanovuje hranice modulů, datové toky a zodpovědnosti
  jednotlivých kontejnerů (CLI, OCR, Logic Engine, Registry). Rozdělení na menší
  čisté funkce budeme vynucovat disciplinovaným dodržováním C4 diagramů, ne
  testy. Zároveň by komplexní mockování asynchronních operací (LLM timeouty 35s,
  vyvolávání `osascript` dialogů a spouštění nativních Swift binárek) přineslo
  obrovskou testovací režii, aniž by úměrně tomu zlepšilo už tak detailně
  specifikovaný návrh.

## Plán implementace (Implementation Plan)

1. **Fáze 1: Inicializace projektu a infrastruktury**
   - Vytvoření adresářové struktury (`src`, `bin`).
   - Nastavení výchozí konfigurace s ohledem na parametry LLM a operační limity
     (`src/config.js`).
2. **Fáze 2: OCR modul a vstupní filtry**
   - Vytvoření Swift rozhraní (`vision-ocr.swift`) pro Vision Framework.
   - Implementace streaming deduplikace přes SHA-256 (`src/dedupe.js`).
3. **Fáze 3: Integrační byznys logika (Registry & LLM)**
   - Vytvoření modulu pro ReDoS-safe vyhodnocování `registry.json`
     (`src/registry.js`).
   - Implementace klienta pro LM Studio s AbortControllerem (`src/llm.js`).
4. **Fáze 4: Fallback, Sanitizace a Logování**
   - Napsání modulu pro `osascript` dialogy s uživatelem (`src/ui.js`).
   - Bezpečné sestavení názvů a filesystémové přejmenování (`src/rename.js`).
   - Atomický rotující zápis do JSONL (`src/logger.js`).
5. **Fáze 5: Orchestrace a testování**
   - Sjednocení pipeline v `src/orchestrator.js`.
   - Vytvoření vstupního bodu a propojení s CLI (`index.js`).
   - Validace přes `pnpm check:all`.

## Ověření a testování (Verification & Testing)

- **Statická analýza:** Běh stávajících skriptů `pnpm check:lint` a
  `pnpm fix:format`.
- **Test OCR a Deduplikace:** Zpracování stejného PDF souboru dvakrát ověří, že
  se vyhodnotí jako `skipped`.
- **Zkouška záchranných sítí:** Odpojení LM Studia (localhost) a ověření, že
  systém po timeoutu nebo chybě spojení nespadne a nabídne `osascript` dialog.
- **Filesystémové limity:** Generování záměrně příliš dlouhých řetězců na vstupu
  k ověření UTF-8 zkrácení před dosažením limitu 255 bytů a přidání kolizního
  sufixu `(1)`.

## Migrace a Rollback (Migration & Rollback)

- Skript funguje iterativně. Každé spuštění zapisuje data (včetně původní a nové
  cesty) do `smart-renamer.log` v prostém JSONL formátu.
- V případě omylu uživatele (např. chybné pravidlo v `registry.json5`) lze
  vytvořit drobný reverzní skript, který z logu vezme staré cesty a provede
  operaci "undo".
