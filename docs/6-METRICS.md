# Provozní metriky a auditní stopa: Smart Renamer (Finální Revize)

Tento dokument zaznamenává reálný čas dodávky (Wall-clock time) a spotřebu
zdrojů napříč všemi fázemi projektu.

## 1. Celkový čas dodávky (Total Delivery Time)

Měřeno od startu session po finální validaci. Zahrnuje reálný čas strávený nad
projektem, včetně hlubokých diskusí a revizí.

| Fáze                              | Čas dodávky (Wall-clock) | Charakteristika                                          |
| :-------------------------------- | :----------------------- | :------------------------------------------------------- |
| **1. Generování kódu**            | **15 minut**             | Prvotní zápis 13 souborů (včetně nefunkční Cache).       |
| **2. QA a Lintery**               | **55 minut**             | Oprava 173 chyb, boj s logickými smyčkami linteru.       |
| **3. Analýza selhání a prevence** | **95 minut**             | Hledání příčin neefektivity, náprava ústavy a prompterů. |
| **4. Hardening (Reálná data)**    | **487 minut**            | **Rekonstrukce Cache (O(1)) a lidská stabilizace.**      |
| **5. Robustnost a UI Hardening**  | **510 minut**            | **3,5h interakce + 5h lidská analýza a vývoj.**          |
| **6. TDD Readiness & Robustness** | **425 minut**            | **Testovatelnost, de-singletonizace a finální polish.**  |
| **CELKEM**                        | **1587 minut**           | **(26 hodin 27 minut) — Produkční integrita + TDD.**     |

## 2. Technické parametry (Resource Usage)

Zdroje jsou rozděleny podle hlavních vývojových epoch pro zachování auditní
stopy.

### A. Počáteční vývoj a QA (Fáze 1–3)

- **Model:** Google Gemini (v CLI optimalizaci)
- **Vstupy (Input):** **~7,5 milionu tokenů**
- **Produkce (Output):** **~55 000 tokenů**

### B. Produkční Hardening a Bezpečnost (Fáze 4–5)

- **Model:** Gemini 3 Flash (Main), Gemini 3.1 Pro
- **Vstupy (Input):** **~45,8 milionu tokenů** (kumulativně).
- **Produkce (Output):** **~242 000 tokenů**.
- **Context Management:** Dynamická regrese stran (6 -> 1) při detekci
  přetečení.

### C. TDD Readiness & Robustness (Fáze 6)

- **Model:** Gemini 3 Pro (CLI), GPT-5.3-Codex (externí implementace).
- **Review Tools:** CodeRabbit (3 běhy), GitHub Copilot Review (3 běhy).
- **Vstupy (Input):** **~12,4 milionu tokenů**.
- **Produkce (Output):** **~38 000 tokenů**.

## 3. Analýza efektivity (AI vs. Human) podle fází

| Fáze                              | Odhad člověk (Senior) | AI + Hybrid (Realita) | Poměr    | Charakteristika práce                                     |
| :-------------------------------- | :-------------------- | :-------------------- | :------- | :-------------------------------------------------------- |
| **1. Generování kódu**            | 16 hodin              | 15 minut              | **64×**  | Extrémní objem (1100 LOC), selhání implementace Cache.    |
| **2. QA (Sanace dluhu)**          | 16 hodin              | 55 minut              | **17×**  | **Oprava 173 chyb linteru způsobených AI ve Fázi 1.**     |
| **3. Prevence (Sanace logiky)**   | 8 hodin               | 95 minut              | **5×**   | **Řešení logických smyček a "AI arogance" z Fázi 1 a 2.** |
| **4. Hardening (Reálná data)**    | 80 hodin              | 487 minut             | **9,8×** | Komplexní integrace (OCR, Cache), lidská stabilizace.     |
| **5. Robustnost & Security**      | 40 hodin              | 510 minut             | **4,7×** | Hluboká lidská analýza, State machine, Security.          |
| **6. TDD Readiness & Robustness** | 32 hodin              | 425 minut             | **4,5×** | Testovatelnost jádra, review-cykly a nulové regrese.      |
| **CELKEM**                        | **192 hodin**         | **1587 minut**        | **7,3×** | **Kompletní doručení do produkční integrity + TDD.**      |

### Kognitivní audit efektivity:

- **Implementační lenost AI:** Fáze 1 prokázala, že AI dokáže brilantně
  analyzovat architekturu (Pět pilířů), ale při generování kódu sklouzává k
  neefektivním algoritmům. Cache byla v Fázi 1 pouze nefunkčním placeholderem.
- **Fáze 2 a 3 jako penalizace:** Tyto fáze byly vynuceny selháním disciplíny AI
  v úvodu. V čistě lidském procesu by seniorní inženýr psal kód rovnou v souladu
  s linterem.
- **Fáze 4 jako skutečná hodnota:** Zde došlo k nápravě selhání AI a
  implementaci robustního O(1) Learning systému podle původního návrhu.
- **Fáze 6 jako stabilizační uzávěr:** Refaktoring na testovatelnou architekturu
  snížil budoucí náklady na změny a oddělil runtime od testovacího kontextu.
- **Závěr:** AI proces je **6× náchylnější k tvorbě dluhu** v kreativní fázi,
  ale **10× rychlejší v jeho sanaci** při správném lidském vedení.

## 4. Architektonická reflexe

Rychlost dodávky byla ovlivněna:

- **Kladně:** Perfektní dokumentací (5 Pilířů), která eliminovala prodlevy v
  rozhodování.
- **Neutrálně:** Fáze 4 a 5 prokázaly, že AI připraví 90 % architektury, ale
  finální stabilitu a ošetření edge-cases musí vtisknout lidská autorita.
- **Neutrálně:** Fáze 6 potvrdila, že "hotovo" a "testovatelně hotovo" jsou dvě
  odlišné kvalitativní úrovně.
- **Záporně:** Incident "Registry Poisoning" ve Fázi 5, způsobený
  neinteraktivním testováním, což si vyžádalo sanaci registru a úpravu učící
  logiky.

## 5. Kompletní informační vstupy (Fáze 1–6)

### A. Řídicí dokumenty (Pět pilířů)

Tyto dokumenty tvořily neměnný základ (ústavu) projektu:

1.  **`4-IMPLEMENTATION_PLAN.md`**: Definice modulárních hranic a fází.
2.  **`5-LOE.md` (Sekce 9)**: Technické override (mandát JSON5, Swift
    kompilace).
3.  **`1-PRD.md`**: Definice byznys logiky a formátů (Golden Examples).
4.  **`2-ARCHITECTURE.md`**: C4 geometrie a "Privacy First" (Local-only)
    omezení.
5.  **`3-DESIGN.md`**: UX principy a "Intentional Minimalism".

### B. Agentní speciality (Phase 3-6 Additions)

6.  **`GEMINI.md`**: Technické standardy (Named functions, node: prefix).
7.  **Hierarchie pravdy**: Mandát pro prioritizaci Cache > Registry > AI.
8.  **O(1) Learning**: Transformace cache na in-memory index s auto-learningem.
9.  **Stavový Mini-chat**: Zavedení `llm-session` pro kontinuální konverzaci.
10. **JSON State Machine**: Mandát pro robustní parsování poškozených dat.
11. **Security Hardening**: Striktní pravidla pro AppleScript a Path Traversal.
12. **isMain Guard**: Oddělení role modulu a spustitelného entry pointu.
13. **Internals-first**: Standard řazení modulů pro nižší kognitivní zátěž.
14. **State Reset Hooks**: Mandát pro izolaci testů bez globálního leakování.

## 6. Statistiky Agentic Workflow (Audit Fáze 4)

Detailní výpis aktivity AI agenta během finálního vytvrzení (Session ID:
`3bc541da-76f7-49fa-93a1-0e3c6fd117ad`).

- **Tool Calls:** 242 (97.1% úspěšnost).
- **Code Velocity:** +2133 / -2398 řádků.
- **Success Rate:** 97.1 % (7 selhání na 242 volání).
- **Agent Active Time:** 1h 40m 50s.
- **Wall Time:** 6h 46m 43s.

## 7. Statistiky Agentic Workflow (Audit Fáze 5)

Data z etapy produkční stabilizace (Session ID:
`b32595fe-7f17-4503-b308-e3e473d4d2fd`).

- **Tool Calls:** ~115 (95% úspěšnost).
- **Code Velocity:** ~1400 modifikovaných řádků (refaktoring do `discovery.js`,
  `llm-session.js`, `rollback.js`).
- **Success Rate:** 95.6 % (převážně selhání vlivem neinteraktivního prostředí).
- **User Agreement:** 98.2 %.
- **Wall Time:** 8h 30m (včetně 5h externí analýzy uživatele).

### Rozsah dodávky ve Fázi 5 (obsahový audit)

- **Architektura:** Dekompozice orchestrátoru přesunem AI/slučovací logiky do
  `src/discovery.js` (orchestrátor jako řídicí vrstva).
- **Bezpečnost:** Hardening AppleScript escapingu, `isInsideBaseDirectory`
  guard, typové validace vstupů a kontrola limitu názvu souboru přes
  `Buffer.byteLength` (255 B na macOS).
- **AI Robustnost:** JSON state machine parser, `llm-session` s history/summary,
  rozšířený registr (`exact`/`substring`/`regex`, `MIN_PATTERN_LENGTH`,
  `titles[]`).
- **UX a lokalizace:** Rekurzivní `expandFiles` s `maxDepth` + ochranou proti
  symlink smyčkám (`visited`), lokalizované dialogové labely
  (`SMART_RENAMER_LOCALE`) a české interní logy.
- **OCR:** Rozšíření `bin/vision-ocr.swift` o nativní podporu obrazových formátů
  (JPG/PNG přes `CGImageSourceCreateWithURL`).

## 8. Statistiky Agentic Workflow (Audit Fáze 6)

Data z etapy TDD readiness a finálního polish (Session ID:
`d6a299d0-5f81-49f4-92d8-2f96c4743654`).

- **Tool/Review cykly:** 3x CodeRabbit + 3x GitHub Copilot Review.
- **Code Velocity:** +1868 / -664 řádků (hlavní refaktor).
- **Wall Time:** 7h 5m.
- **Výstup kvality:** `pnpm check:all` bez chyb.

### Rozsah dodávky ve Fázi 6 (obsahový audit)

- **Architektura:** `isMain` guard v entry pointu a standard internals-first
  (internals -> exporty).
- **Testovatelnost:** De-singletonizace stavových částí a resetovatelné hooks
  pro izolované testy.
- **Modularizace jádra:** Extrakce pipeline do modulů (`llm-json-parser.js`,
  `pipeline-steps.js`) a čistší separace odpovědností.
- **Operational hardening:** `SIGINT`/`SIGTERM` cleanup a eliminace
  nejrizikovějších runtime větví.
- **Konfigurační disciplína:** Integrace `VALUE_BLOCKLIST` a sjednocení pravidel
  lint/format bez ignore-listů.
