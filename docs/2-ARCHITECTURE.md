# Systémová architektura: Smart Renamer

Tento dokument popisuje technickou architekturu projektu Smart Renamer podle
požadavků v [1-PRD.md](./1-PRD.md).

## 1. Přehled systému

Smart Renamer je lokální macOS nástroj (CLI / Quick Action) pro deterministické
a bezpečné přejmenovávání dokumentů (PDF, skeny) pomocí lokálního OCR a LLM.

### Klíčové principy

- **Privacy First:** Veškerá data zůstávají na lokálním stroji.
- **Intentional Minimalism:** Stručné a konzistentní názvy souborů.
- **Graceful Degradation:** Pokud selže AI, systém přejde na deterministické
  regexy nebo uživatelský dialog.

## 2. Diagram komponent

```text
                  ┌──────────────────────┐
                  │ Vstup (CLI / Finder) │
                  │  [Soubory ke čtení]  │
                  └──────────┬───────────┘
                             │
                  ┌──────────▼───────────┐
                  │  Validace & Dedupe   │◄── (Streaming SHA-256)
                  └──────────┬───────────┘
                             │
                  ┌──────────▼───────────┐
                  │    Swift OCR Modul   │──┐ PDF: Render str. 1-4 do JPG
                  │ (Apple Vision Frmwk) │  │ OCR text všech stran
                  └──────────┬───────────┘  │
                             │              │
                  ┌──────────▼───────────┐  │
                  │   REGISTRY Matching  │  │ (Rychlá cesta - regex)
                  └──────────┬───────────┘  │
                             │              │
                  ┌──────────▼───────────┐  │
                  │    LLM Inference     │◄─┘ (Image JPG + OCR Text + Název)
                  │(LM Studio, localhost)│
                  └──────────┬───────────┘
                             │
                  ┌──────────▼───────────┐
                  │     Merge Engine     │
                  │ (LLM vs Regex vs JS) │
                  └──────────┬───────────┘
                             │ (Při chybějících datech)
                  ┌──────────▼───────────┐
                  │   OS Fallback Dialog │◄── (osascript)
                  └──────────┬───────────┘
                             │
                  ┌──────────▼───────────┐
                  │  Sanitace & Přejmen. │◄── (macOS filesystem limits)
                  └──────────┬───────────┘
                             │
                  ┌──────────▼───────────┐
                  │   Transaction Logger │◄── (Atomický append do JSONL)
                  └──────────────────────┘
```

## 3. Technický Stack

- **Runtime:** Node.js 22+ (ESM)
- **OCR:** Swift + Apple Vision Framework (nativní macOS)
- **Inference:** LM Studio (localhost:1234), model Gemma-4 (nebo ekvivalent)
- **Komunikace:** `osascript` pro nativní macOS dialogy
- **Logování:** JSONL (Append-only) s rotací

## 4. Datové toky a Merge strategie

### Extrakce data (Priorita)

1. **LLM Output:** Primární zdroj sémantického pochopení.
2. **JS Regex Fallback:** Záloha pro případ, že LLM vrátí nevalidní formát.
3. **mtime Fallback:** Poslední záchrana z metadat souboru (označeno flagem v
   logu).

### Identifikace firmy (Priorita)

1. **REGISTRY (registry.json5):** Deterministické regexy (rychlé, 0 cost).
2. **LLM Proposal:** Návrh z AI analýzy.
3. **Uživatel (Dialog):** Ruční zadání, pokud automatika selže.

## 5. Bezpečnostní opatření

- **Localhost Validation:** Skript striktně kontroluje, zda `LM_STUDIO_URL`
  směřuje na 127.0.0.1 nebo localhost.
- **Safe Regex:** Validace uživatelských vzorů v `registry.json5` proti ReDoS
  útokům.
- **Path Sanitization:** Ochrana proti Path Traversal při sestavování názvu
  souboru.

## 6. Provozní limity

- **Image Limit:** Max 4 MB pro Base64 obraz do LLM (automatická degradace počtu
  stran).
- **Filename Limit:** 255 bytů (včetně kolizního sufixu).
- **Log Rotation:** Rotace při 10 MB, zachování max 3 historických logů.
