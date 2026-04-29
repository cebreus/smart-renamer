# Kronika vývoje: Cesta k inženýrské integritě (26. 4. – 27. 4. 2026)

Tento dokument zachovává historický kontext a klíčové momenty vývoje, který
definoval nové standardy práce s AI agenty.

## 1. Fáze 1: Generování kódu (Expanze, 0–15 min)

- **Stav:** Čistý stůl, pouze dokumentace (5 Pilířů).
- **Děj:** Agent v YOLO režimu vygeneroval 1100 řádků kódu (13 souborů) za 11,5
  minuty.
- **Chyba:** Totální ignorování `eslint.config.js` a odložení validace na konec.
  Vznikl masivní technický dluh (**173 chyb linteru**) a byla implementována
  pouze nefunkční skořápka Cache.

## 2. Fáze 2: QA a Lintery (Bitva o čistotu, 15–70 min)

- **Stav:** Kód existuje, ale neprochází CI/CD.
- **Děj:** Úmorný boj s pravidly. Identifikována logická smyčka mezi
  `consistent-return` a `unicorn`.
- **Zlom:** Uživatel identifikoval **„AI aroganci“** — agent opravoval chyby
  nahodile, místo aby analyzoval příčiny. Došlo k uvěznění v nekonečné smyčce
  opravování jednoho řádku.

## 3. Fáze 3: Analýza selhání a prevence (Sebereflexe, 70–165 min)

- **Stav:** Hledání systémové nápravy po kolapsu Fáze 2.
- **Děj:** Hluboká diskuse o prioritách. Uznání, že technické limity jsou
  nadřazené estetice.
- **Výsledek:** Dekompozice orchestrátoru na atomické funkce, nasazení
  robustního Loggeru, odstranění všech `eslint-disable` z kódu a vytvoření
  Meta-Promptu v2 v `GEMINI.md`.

## 4. Fáze 4: Hardening na reálných datech (Střet s realitou, 27. 4. 2026)

- **Časový rámec:** 487 minut (8h 7m) intenzivního ladění.
- **Srážka s realitou (T+0):** Spuštění `DRY_RUN` odhalilo "spící" katastrofy:
  Swift `guard` fallthrough, chybný `ROOT_DIR` a polykání chyb v OCR modulu.
- **Technické drama:**
  - **Stitching Failure:** AI nedokázala zpracovat 12000px "nudle" PDF. Došlo k
    implementaci **Atomického stránkování**.
  - **Error 400:** Masivní base64 obrazy zahltily LM Studio. Vyřešeno ořezem
    `smartTrim`.
  - **Context Bloat:** Při 36M tokenech začal agent vykazovat "bolení hlavy" a
    neschopnost udržet integritu linteru.
- **Zlom (Lidské převzetí):** Po 6,5 hodinách AI navigace převzal seniorní
  inženýr kormidlo. Během **2,5 hodiny** provedl chirurgický refaktoring
  orchestrátoru a stabilizoval učící se O(1) Cache.
- **Výsledek:** Transformace z naivního skriptu v učící se organismus s
  "Hierarchií pravdy".

## 5. Fáze 5: Produkční stabilizace a konverzační inteligence (27. 4. 2026)

- **Časový rámec:** 510 minut (3,5h interakce + 5h lidská analýza a vývoj).
- **Stav:** Projekt je funkční, ale vykazuje křehkost v UI a při parsování
  nestandardních odpovědí.
- **Děj:**
  - **Registry Poisoning:** Identifikován kritický problém, kdy neinteraktivní
    testování "otrávilo" registr nesmyslnými pravidly. Provedena manuální sanace
    a nasazení pojistky `MIN_PATTERN_LENGTH`.
  - **Discovery Refactor:** Sloučení návrhů a AI rozhodování přesunuto z
    orchestrátoru do `src/discovery.js`; orchestrátor zjednodušen na řídicí tok.
  - **UI Revolution:** Přechod na **Emoji Dashboard** s rozdělením 📅/🏢/📝.
    Implementace číselných zkratek (1-9) pro bleskovou editaci.
  - **Folder Batch Engine:** Nasazen rekurzivní `expandFiles` s `maxDepth` a
    ochranou proti symlink smyčkám (`visited`).
  - **Localization Layer:** Dialogy získaly locale-aware popisky
    (`SMART_RENAMER_LOCALE`) s mapováním na kanonické akce (Skip/Cancel);
    interní logy sjednoceny do češtiny.
  - **Security Hardening:** Nasazení obrany proti AppleScript Injection a Path
    Traversal.
  - **Filename Limit Guard:** Přidána kontrola délky názvu přes
    `Buffer.byteLength` (255 B na macOS).
  - **JSON State Machine:** Nasazen stavový parser JSON bloků odolný vůči
    ořezaným/zašuměným odpovědím.
  - **Date Prioritization:** Implementováno bodování kandidátů data (ISO >
    tečkované formáty, 4-místný rok > 2-místný).
  - **Dynamic Context:** Implementována **regrese stran (6 -> 1)**. Pokud AI
    přeteče, systém automaticky ubere stranu a pokus zopakuje.
  - **AI Memory:** Zavedení `llm-session` s historií a sumarizací pro
    kontinuální dialog v rámci jednoho souboru.
  - **Vision OCR Upgrade:** `bin/vision-ocr.swift` rozšířen o nativní detekci
    obrazových formátů (JPG/PNG) přes `CGImageSourceCreateWithURL`.
- **Výsledek:** Stabilní, bezpečný a lokalizovaný systém připravený na batch
  zpracování stovek dokumentů.

## 6. Fáze 6: TDD Readiness & Robustness (29. 4. 2026)

- **Časový rámec:** 425 minut (7h 5m).
- **Stav:** Funkční produkční řešení z F5, ale s omezenou testovatelností kvůli
  hardcoded vstupům a module-level stavu.
- **Děj:**
  - **TDD Audit (0-35 min):** Analýza 16 souborů, identifikace bloků
    testovatelnosti (`index.js` import side-effects, rigidní config, singleton
    leakage).
  - **Big Bang Refactor:** Plošná úprava jádra přinesla modularizaci LLM
    pipeline, `isMain` guard a parametrizaci dříve globálních závislostí.
  - **Externí QA smyčka (120-360 min):** 3x CodeRabbit + 3x Copilot Review +
    implementační iterace přes GPT-5.3-Codex pod lidským dohledem.
  - **Finální polish (360-425 min):** `SIGINT/SIGTERM` cleanup,
    `VALUE_BLOCKLIST`, sjednocení konfigurací a eliminace posledních linter
    rizik.
- **Výsledek:** `pnpm check:all` bez chyb a potvrzení "All checks pass. Zero
  regressions." v review výstupech.

## 7. Klíčové inženýrské milníky

1.  **Linter Supremacy:** Technické limity (`AI_GUARDRAILS`) jsou absolutní.
2.  **Chain of Truth:** Cache (Fakta) > Registry (Pravidla) > AI (Odhady).
3.  **Human-AI Synergy:** AI staví lešení a hrubou stavbu (90 %), člověk
    vtiskuje stabilitu a "duši" (10 %).
4.  **Testability by design (Fáze 6):** Konfigurace a runtime stavy jsou
    injektovatelné, ne implicitně globální.
5.  **Review as system (Fáze 6):** Kvalita je výsledkem opakované vícezdrojové
    kontroly, ne jednorázového passu.

## 8. Technické resumé (Kumulativní)

- **Celkový čas:** 26h 27m.
- **Inženýrský poměr:** 7,3:1 (AI vs. Human).
- **Integrita:** 0 chyb linteru, 100% Type Safety na vstupu.
- **O(1) Learning:** Systém se učí z každého manuálního zásahu uživatele.
- **Testovatelnost:** `isMain` guard, resetovatelné stavové mechanismy a
  oddělení internals/exportů.

---

_Zapsáno agentem Gemini CLI pod dozorem Architekta, aktualizováno 29.
dubna 2026._
