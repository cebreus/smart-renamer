# PRD — Smart Renamer

**Produkt:** Smart Renamer\
**Verze dokumentu:** 1.1\
**Datum:** 2026-04-25\
**Stav:** Draft k review

---

## 0. Metadata

| Pole      | Hodnota                                                                    |
| --------- | -------------------------------------------------------------------------- |
| Platforma | macOS (Quick Actions / CLI)                                                |
| Runtime   | Node.js 22+ (ESM)                                                          |
| OCR modul | Swift (inline, Apple Vision Framework)                                     |
| Inference | LM Studio 0.4+, macOS 14+                                                  |
| Model     | Vision-capable LLM (výchozí: `google_gemma-4-e2b-it@bf16` nebo ekvivalent) |

---

### 0.1 AI Collaborator Insights (Historie dialogu)

Tento dokument vznikl kolaborativním procesem ("Vibe Coding").

- **Klíčový vhled AI:** Původní předpoklad, že LLM zvládne vše, byl nahrazen
  víceúrovňovou strategií (REGISTRY → LLM → Dialog), protože modely mají
  tendenci halucinovat u nečitelného textu.
- **Identifikované úzké hrdlo:** 35s inference vyžaduje agresivní UI zpětnou
  vazbu, aby uživatel neukončil proces předčasně.

---

## 1. Cíl

Skript přejmenuje soubor (PDF, obrázek, sken) do konzistentního,
prohledávatelného formátu. Zobrazujeme pouze informace, které skutečně máme —
žádné zástupné hodnoty.

---

### 1.1 Filosofie a "Vibe" (Archivační záměr)

- **Intentional Minimalism:** Názvy souborů musí být co nejstručnější. Pokud
  popis přesahuje 6 slov nebo obsahuje redundantní výplňová slova (např. "Doklad
  o zaplacení faktury za..."), je to chyba.
- **Deterministická opatrnost:** Systém nesmí hádat. Pokud je logo firmy
  nečitelné nebo datum chybí, pole se raději vynechá (`null`), než aby vznikla
  faktická chyba (tzv. "No Hallucination Policy").
- **Konzistence nad dokonalostí:** Je lepší mít 100 souborů popsaných jako
  "Faktura za elektřinu", než 100 unikátních slohových cvičení.
- **Agresivní reaktivita (The Waiting Vibe):** Během 35sekundové inference (nebo
  pomalého OCR) uživatel nesmí mít pocit, že skript zamrzl. CLI výstup musí
  průběžně reportovat stav (`[1/3] Extrakce textu...`,
  `[2/3] Analýza modelem Gemma...`) a zachytit `SIGINT` (Ctrl+C) pro bezpečné
  ukončení.

---

## 2. Naming standard

### 2.1 Základní formát

```
YYYY-MM-DD (Firma) Popis.ext
```

### 2.2 Pravidla pro chybějící pole

**Kritické pravidlo: pokud pole neznáme, vynecháme ho celé — nezobrazujeme žádný
placeholder.**

| Dostupná data             | Výsledný název                                                       |
| ------------------------- | -------------------------------------------------------------------- |
| datum + firma + popis     | `2025-01-20 (O2) Vyúčtování VDSL.pdf`                                |
| firma + popis (bez data)  | `(O2) Vyúčtování VDSL.pdf`                                           |
| datum + popis (bez firmy) | `2025-01-20 Vyúčtování VDSL.pdf`                                     |
| pouze popis               | `Vyúčtování VDSL.pdf`                                                |
| screenshot                | `2025-01-20 at 14.30.22 Screenshot Popis.png`                        |
| všechna pole chybí        | `[Původní název].pdf` (ochrana před vznikem skrytého souboru `.pdf`) |

### 2.3 Pravidla pro jednotlivá pole

**Datum:**

- Formát `YYYY-MM-DD`; pro screenshoty navíc čas ve formátu `at HH.mm.ss` (za
  datem)
- Datum plnění nebo vystavení dokumentu; nikoli datum modifikace souboru (to je
  fallback)

**Firma:**

- Zkrácená, unifikovaná forma bez právních přípon (např. `s.r.o.`, `a.s.`,
  `inc.`, `ltd.`, `gmbh` — case-insensitive)
- Navrhuje REGISTRY nebo LLM; pokud ani jedno nedodá výsledek, pole se vynechá

**Popis:**

- Max 6 slov
- Bez SKU, sériových čísel, trademark/registered symbolů (™, ®, ©)
- Bez marketingových přídomků; pouze věcný popis
- **Neobsahuje datum ani časové období** (měsíc, rok, čtvrtletí) — datum je již
  součástí názvu souboru
- U faktur/paragonů: 2 nejdražší položky + zkrácená zmínka o zbytku (viz
  sekce 3)

**Přípona:**

- Vždy malými písmeny (`.PDF` → `.pdf`, `.JPG` → `.jpg`)

---

## 3. Typy dokumentů a pravidla pro popis

Systém detekuje typ dokumentu a podle něj sestavuje popis.

| Typ                | Detekce                                                                  | Pravidlo pro popis                                                          |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Faktura            | Slova: faktura, invoice, daňový doklad                                   | 2 nejdražší položky (bez technických kódů) + „a X dalších" pokud >2 položky |
| Paragon / účtenka  | Slova: paragon, receipt, účtenka                                         | stejné jako faktura                                                         |
| Potvrzení platby   | Slova: potvrzení platby, payment receipt, daňový doklad k přijaté platbě | `Potvrzení platby`                                                          |
| Smlouva            | Slova: smlouva, contract, agreement                                      | max 6 slov předmětu smlouvy                                                 |
| Výpis / vyúčtování | Slova: výpis, vyúčtování, statement                                      | typ služby (např. „Vyúčtování VDSL")                                        |
| Daňové přiznání    | Specifické vzory (viz VALUE_BLOCKLIST)                                   | název přiznání                                                              |
| Screenshot         | Detekce z názvu souboru nebo absence struktury                           | `Screenshot` + max 6 slov kontextu                                          |
| Ostatní            | —                                                                        | popis extrahovaný LLM, max 6 slov                                           |

---

## 4. Vstupní formáty

| Formát                             | Zpracování                                             |
| ---------------------------------- | ------------------------------------------------------ |
| PDF s textovou vrstvou             | OCR + PDFKit render                                    |
| PDF bez textové vrstvy (skenované) | OCR přes Apple Vision                                  |
| JPG, PNG (sken, foto dokumentu)    | OCR přes Apple Vision                                  |
| JPG, PNG (screenshot)              | Detekce z názvu souboru; čas z názvu souboru nebo EXIF |

---

## 5. Funkční požadavky

### FR-01 — Vstup a detekce typu souboru

- Skript přijímá jeden nebo více souborů jako argumenty
  (`process.argv.slice(2)`)
- Pro každý soubor se určí typ: PDF nebo obrázek (podle přípony)
- Původní název souboru je předán jako kontext do všech následujících kroků
- Screenshot se detekuje primárně z **původního názvu souboru** (vzory jako
  `Screenshot YYYY-MM-DD at HH.mm.ss`, `screen shot`, `snimek obrazovky`);
  sekundárně z absence strukturovaného textu v OCR

### FR-02 — Extrakce původního názvu souboru

- Původní název souboru (bez přípony) se normalizuje a předá LLM jako doplňkový
  kontext
- LLM ho může použít pro:
  - Datum/čas u screenshotů (macOS generuje název
    `Screenshot 2025-01-20 at 14.30.22`)
  - Záchytný bod pro firmu nebo typ dokumentu pokud OCR selhá
- Původní název **nepřepisuje** OCR text — je podřadný

### FR-03 — OCR pipeline

**PDF:**

- OCR přes **všechny stránky** pomocí `VNRecognizeTextRequest` (úroveň
  `accurate`)
- Texty ze všech stránek jsou concatenovány do jednoho řetězce; text každé
  strany je oddělen sémantickým oddělovačem (např. `\n\n--- STRANA X ---\n\n`)
  pro zamezení slévání slov napříč stránkami
- Stránky jsou renderovány pro LLM tak, aby jejich **nejdelší rozměr (šířka nebo
  výška podle orientace) nepřesáhl 2 000 px**
- Vertikální spojení stránek pro LLM je omezeno na **první 4 stránky**;
  zbývající stránky jsou zahrnuty pouze jako OCR text

**JPG/PNG:**

- Soubor použit přímo jako vstup pro `VNImageRequestHandler`; dočasná kopie se
  nevytváří

**Výstup OCR:**

- Prostý text (celý dokument)
- JPG pro LLM (dočasný soubor; smazán ihned po konverzi na base64)

**Práh kvality:**

- Pokud OCR vrátí < 30 znaků, systém stále zkusí REGISTRY matching (FR-07), ale
  přeskočí LLM a přejde přímo na fallback dialog.

**Error State / Alternative Path:**

- Co když Apple Vision selže (např. poškozený soubor)? → Loguje se jako
  `ocr_failed`, přeskočí se LLM analýza, použije se pouze původní název souboru
  a přejde se k fallback dialogu.

### FR-04 — Renderování pro LLM

- Parametry renderingu: **72 DPI**, JPG kvalita komprese: **80 %** (0.8)
- **Očekávaná velikost:** 1 stránka (2000px) při 80% kvalitě zabírá cca
  **500–900 KB**. Složenina 4 stránek tedy zabere zhruba **2.0–3.2 MB**.
- Limit velikosti obrazu pro LLM je stanoven na **4 MB** po kompresi jako
  bezpečný strop.
- **Graceful Image Degradation:** Pokud složený JPG (až 4 stránky) přesáhne 4
  MB, algoritmus postupně odebere vždy poslední stránku ze složeniny a zkusí
  kompresi znovu.
- Garantované minimum je **1 strana (titulní)**. Pokud i ta přesáhne limit,
  teprve tehdy se obraz přeskočí úplně a LLM dostane pouze OCR text.
- Při odebrání jakékoliv stránky nebo přeskočení obrazu se do logu zapíše důvod

### FR-05 — Extrakce datumu

Extrakce datumu je nejkritičtější a nejproblematičtější krok. Systém používá
víceúrovňovou strategii:

**Úroveň 1 — LLM (primární):**

- LLM dostane plný OCR text + obraz
- LLM je instruován hledat datum plnění nebo vystavení, nikoli datum splatnosti
  nebo objednávky
- LLM rozumí všem formátům: `20.1.2025`, `20/01/2025`, `20. ledna 2025`,
  `January 20, 2025`, `2025-01-20`
- LLM rozumí kontextu: `"v Praze dne 20.1.2025"` → datum `2025-01-20`
- LLM výstup: ISO formát `YYYY-MM-DD`

**Úroveň 2 — JS regex (záloha):**

- Spouští se pokud LLM nedodá datum nebo dodá nevalidní hodnotu.
- Extrahuje **všechny** kandidáty namísto prvního shody.
- Kandidáti jsou skórováni podle blízkosti klíčových slov (vystavení, plnění,
  zdanitelné plnění).
- Při shodě skóre vyhrává chronologicky nejstarší datum.
- Regex pokrývá formáty: `D.M.YYYY`, `D/M/YYYY`, `D. M. YYYY`, `YYYY-MM-DD`,
  `DD.MM.YY`.
- **Pivot year pro dvouciferné roky (YY):** pokud YY ≤ 50 → 20YY, jinak 19YY.
- Hodnoty z `VALUE_BLOCKLIST` jsou přeskočeny.

**Úroveň 3 — `mtime` souboru (fallback):**

- Použit pokud ani LLM ani regex datum nenajdou.
- Systém nastaví interní flag `mtime_used: true`.
- Pokud je tento flag aktivní, v transakčním logu je u záznamu o datu uvedena
  poznámka `(mtime fallback)`.
- V názvu souboru se toto datum použije, ale v budoucích verzích může být
  zobrazeno varování v UI.

**Error State / Alternative Path:**

- Co když je mtime v budoucnosti (poškozený soubor)? → Systém omezí fallback
  mtime maximálně na aktuální systémový čas (`Date.now()`). Jakékoliv datum v
  budoucnosti se ignoruje a pole `date` zůstane `null`.

**VALUE_BLOCKLIST:**

- Konfigurační pole v `CONFIG`; obsahuje konkrétní hodnoty (stringy) nebo regex
  vzory.
- Příklad: `['01.01.1990', /^\d{2}\.\d{2}\.\d{2}$/]` (pro ignorování dat
  narození apod.)
- Platí pro všechna pole (datum, firma, titulek).

### FR-06 — Identifikace firmy

**Prioritní pořadí:**

1. **REGISTRY** — deterministické vzory (regex → zkratka firmy)
2. **LLM návrh** — pokud REGISTRY nemá shodu, LLM navrhne firmu ze svého výstupu
3. **Dialog** — pokud LLM nic nenavrhl nebo uživatel chce opravit; uživatel zadá
   ručně

- **Vynechání** — pokud uživatel v dialogu nic nezadá, pole `(Firma)` se z názvu
  vynechá

**Prázdný REGISTRY je validní stav.** Systém funguje i bez jediného záznamu —
LLM navrhuje firmu pro každý dokument.

**Error State / Alternative Path:**

- Co když uživatel v dialogu zadá prázdný řetězec nebo dialog zavře/zruší
  (Escape)? → Dialog nepadne chybou. Skript to interpretuje jako úmyslné
  "Vynechání" pole `(Firma)` a pokračuje v plynulém sestavování názvu bez firmy.

### FR-07 — REGISTRY (Bezpečnost a validace)

- Deterministická sada vzorů: `pattern` (regex) → `company` (zkratka) +
  volitelně `title` (výchozí popis)
- Uložen jako **JSON soubor** (`registry.json5`) vedle skriptu; žádná editace JS
  souboru není potřeba.
- **Bezpečnostní validace při načtení:**
  - `JSON.parse` v try/catch bloku (při chybě pád zpět na zabudované vzory).
  - Limit velikosti souboru: **1 MB**.
  - Validace každého regex vzoru pomocí `safe-regex` (ochrana proti ReDoS).
  - Každý záznam musí mít neprázdný `pattern` a `company`.
- Formát záznamu:
  ```json
  {
    "pattern": "O2|Telefonica",
    "company": "O2",
    "title": "Vyúčtování"
  }
  ```
- **Merge order:** uživatelské vzory jsou aplikovány **před** zabudovanými vzory
  (umožňuje override).
- Po ručním zadání firmy v dialogu (FR-06) je uživatel dotázán, zda záznam
  přidat do `registry.json5`.

### FR-08 — Sestavení a sanitace názvu

1. **Sanitace vstupů:** odstranění path traversal (`../`, `./`, `/`) ze všech
   komponent (datum, firma, popis).
2. **Normalizace firmy:** odstranění právních přípon (word boundaries,
   case-insensitive).
3. **Normalizace popisu:** odstranění ™, ®, ©; komprese whitespace; zkrácení na
   6 slov.
4. **Sestavení:** podle pravidel ze sekce 2.2 — chybějící pole se vynechají.
5. **Vynucení macOS limitů:** nahrazení/odstranění zakázaných znaků (`/`, `:`,
   `\`, `|`, `"`, `?`, `*`, `NULL`).
6. Pokud by výsledný název přesáhl 255 bytů (macOS limit), název se zkrátí (před
   příponou, s ohledem na UTF-8 byte length).
7. **Řešení kolizí:** pokud soubor existuje, přidá se inkrementální sufix (např.
   ` (1)`, ` (2)`). Při kolizi se název v kroku 6 zkrátí o dostatečnou rezervu
   pro sufix.
8. Pokud je název po sanitaci prázdný nebo začíná tečkou (skrytý soubor),
   použije se prefix `Unnamed_`.

### FR-09 — Transaction log (Operační záruky)

- Každé přejmenování se zapíše do **JSONL** souboru `smart-renamer.log`.
- **Zápis musí být atomický** (např. přes dočasný soubor + rename) pro zamezení
  korupce JSONL formátu.
- **Log rotation:** při velikosti > 10 MB se log rotuje (`.log` → `.log.1`),
  udržují se max 3 rotace.
- Formát záznamu:
  ```json
  {
    "ts": "2025-01-20T14:30:22Z",
    "original_abs": "/cesta/abs/scan.pdf",
    "original_rel": "./scan.pdf",
    "renamed_abs": "/cesta/abs/2025...pdf",
    "status": "ok"
  }
  ```
- Pokud zápis do logu selže (např. disk full), operace přejmenování
  **pokračuje** s varováním do stderr.

### FR-10 — Dávkové zpracování (Deduplikace)

- Skript přijímá více souborů najednou.
- Příznak `--dedupe`: využívá **streaming SHA-256** (pro efektivní hashování
  velkých PDF bez načítání do RAM).
- Identické soubory jsou přeskočeny a zaznamenány do logu jako `skipped`.

### FR-11 — Fallback dialog a sanitace

- Spouštěn přes `osascript` pokud REGISTRY ani LLM nedodá firmu.
- **Povinná sanitace:** vstup od uživatele podléhá stejné sanitaci jako v FR-08
  (trim, délka max 50 znaků, odstranění zakázaných znaků).

---

## 6. Nefunkční požadavky

### NFR-01 — Výkon

| Metrika                                   | Cíl    |
| ----------------------------------------- | ------ |
| Celková doba (1 soubor, REGISTRY hit)     | < 10 s |
| Celková doba (1 soubor, LLM + vision)     | < 45 s |
| OCR (Swift Vision)                        | < 5 s  |
| LLM inference (lokální, doporučený model) | < 35 s |

> Reasoning modely (QwQ, DeepSeek-R1 apod.) mohou inference výrazně prodloužit.
> Je nutné nastavit timeout; po jeho překročení se přejde na fallback bez LLM.

### NFR-02 — Přesnost

| Metrika                              | Cíl                                       |
| ------------------------------------ | ----------------------------------------- |
| Firma — REGISTRY shoda               | Správně pro všechny nakonfigurované vzory |
| Datum — dokumenty s viditelným datem | ≥ 92 %                                    |
| Celkový výsledek bez ručního zásahu  | ≥ 85 %                                    |

### NFR-03 — Spolehlivost

- Skript nesmí crashovat (např. při chybě JSON.parse registru); každá chyba je
  zachycena, zaznamenána a aplikován fallback.
- Soubor zůstane nepřejmenován pouze při fatální chybě (např. nedostatečná
  oprávnění).

### NFR-04 — Privacy (Runtime validace)

- Veškerá inference probíhá na `localhost`.
- **Runtime kontrola:** skript před startem validuje, že `LM_STUDIO_URL` směřuje
  na localhost (127.0.0.1, ::1 nebo localhost) a při nesplnění odmítne start
  (ochrana proti úniku dat).

---

## 7. Technická architektura

### 7.1 Diagram zpracování

```
Soubor (PDF / JPG / PNG)
  │
  ├─ Detekce typu: PDF nebo obrázek
  ├─ Detekce screenshot: z názvu souboru
  ├─ Extrakce kontextu z původního názvu souboru
  │
  ▼
[FR-03 — Swift OCR Module]
  ├─ PDF: OCR všech stránek → text; render stránek 1–4 → JPG
  └─ JPG/PNG: VNImageRequestHandler přímo
  │
  ▼
[FR-07 — REGISTRY Matching]
  └─ Pattern test (safe-regex); první shoda → company + volitelně title
  │
  ▼ (pokud OCR < 30 znaků → přeskočit LLM)
[FR-04 — Komprese obrazu]
  └─ JPG > 4 MB → přeskočit obraz, poslat pouze text
  │
  ▼
[FR-05/FR-06 — LLM Inference]
  ├─ Vstup: OCR text + base64 JPG + původní název souboru
  └─ Výstup: { company?, title?, date?, doc_type? }
  │
  ▼
[Merge Engine]
  ├─ company:   REGISTRY > LLM > Dialog (sanitized) > (vynechat)
  ├─ title:     REGISTRY > LLM > (vynechat)
  └─ date:      LLM > JS Regex (pivot/scoring) > (vynechat / mtime flagged)
  │
  ▼
[FR-08 — Sestavení názvu (Sanitized)]
  └─ macOS filename rules; délka ≤ 255 znaků; collision resolution
  │
  ▼
[fs.renameSync]
  │
  ▼
[FR-09 — Transaction log (Atomic append / Rotation)]
```

### 7.2 Technická rozhodnutí

| Rozhodnutí                   | Důvod                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| Swift inline OCR             | `pdftotext` nefunguje pro skenovaná PDF; Apple Vision je zdarma a offline             |
| Text + obraz pro LLM         | Samotný OCR text ztrácí prostorový kontext tabulek                                    |
| LLM pro datum (primárně)     | Regex nedokáže spolehlivě rozlišit typ data (plnění vs. splatnost) v přirozeném textu |
| JS Regex pro datum (záloha)  | LLM občas datum vynechá nebo vrátí nevalidní formát                                   |
| Temperature 0.0              | Jakákoliv vyšší hodnota vnáší do archivních názvů nedeterminismus                     |
| REGISTRY jako JSON soubor    | Editovatelné bez znalosti JS; přidání záznamu < 2 minuty                              |
| Chybějící pole = vynechání   | Placeholder jako „Neznamy" kontaminuje archiv a komplikuje vyhledávání                |
| Timeout pro reasoning modely | Reasoning modely mohou trvat minuty; archivní úloha to nevyžaduje                     |
| JSONL transaction log        | Append-only; strojově parsovatelný; snadný revert                                     |

---

## 8. Konfigurace

```js
const CONFIG = {
  LM_STUDIO_URL: 'http://localhost:1234/v1/chat/completions', // Validováno na localhost
  MODEL: 'google_gemma-4-e2b-it@bf16',
  TEMPERATURE: 0.0,
  MAX_TOKENS: 300,
  LLM_TIMEOUT_MS: 35_000,
  TOKEN_LIMIT_CHARS: 6_000,
  IMAGE_MAX_BYTES: 4 * 1024 * 1024,
  RENDER_MAX_DIM_PX: 2_000,
  RENDER_DPI: 72,
  RENDER_MAX_PAGES: 4,
  JPG_QUALITY: 80,
  OCR_MIN_CHARS: 30,
  REGISTRY_FILE: '<script-dir>/registry.json5',
  LOG_FILE: '<script-dir>/smart-renamer.log',
  VALUE_BLOCKLIST: [], // Array; např. ['01.01.1990', /^\d{2}\.\d{2}\.\d{2}$/]
}
```

### 8.1 Nastavení prostředí (LM Studio)

Parametr **Context Length** musí být nastaven na **minimálně 8 192, ideálně 9
000+ tokenů**.

**Zdůvodnění:** Vision data (2000px) si berou **2 000 až 4 000 tokenů**, OCR
text až **1 500 tokenů**, režie promptu **300 tokenů**.

### 8.2 System prompt (cílový stav)

```
Jsi archivář. Analyzuj dokument (OCR text + obraz + původní název souboru) a vrať JSON:
```

```json
{
  "company": "Zkrácený název firmy bez právních přípon (např. s.r.o., a.s., Inc., Ltd., GmbH), nebo null",
  "doc_type": "invoice | receipt | payment | contract | statement | screenshot | other",
  "title": "Max 6 slov. Nepoužívej datum, měsíc, rok ani časové období — datum je v názvu souboru zvlášť. Pro faktury/paragony: 2 nejdražší položky + 'a N dalších' pokud >2. Bez SKU, sériových čísel, ™ ® ©. Nebo null pokud nelze určit.",
  "date": "YYYY-MM-DD — datum plnění nebo vystavení, nikoli splatnosti. Rozuměj všem formátům (20.1.2025, 20. ledna 2025, January 20 2025, v Praze dne...). Nebo null pokud datum není v dokumentu."
}
```

```
Pokud informaci nemáš, vrať null — nezkoušej odhadovat.
```

**Závazná negativní pravidla (Guardrails):**

1. **NEVYMÝŠLEJ SI:** Pokud si nejsi na 100 % jistý datem, firmou nebo popisem,
   vrať `null`. Zakazuji ti hádat nebo odvozovat z nepřímých indicií.
2. **ZÁKAZ REDUNDANCE:** V poli `title` nesmí být slova jako "Dne", "Roku",
   "Doklad", pokud to není nezbytně nutné.
3. **ŽÁDNÝ MARKETING:** Ignoruj reklamní slogany, slevové kódy a poděkování za
   nákup.

---

### 8.3 Golden Examples (Few-Shot pro LLM)

Následující příklady slouží jako primární vizualizace cílového stavu pro LLM:

1. **Vstup:** Faktura od "Alza.cz a.s.", 2 položky (iPhone 15, USB-C Kabel),
   datum plnění 24.12.2024.
   - _Výstup JSON:_
     `{"company": "Alza", "doc_type": "invoice", "title": "iPhone 15, USB-C Kabel", "date": "2024-12-24"}`
2. **Vstup:** Účtenka z "Lidl Česká republika s.r.o.", 15 položek,
   nejvýznamnější: Máslo, Plenky Pampers.
   - _Výstup JSON:_
     `{"company": "Lidl", "doc_type": "receipt", "title": "Máslo, Plenky Pampers a 13 dalších", "date": null}`
     (pokud datum nelze přečíst)
3. **Vstup:** Screenshot webu s logem ČEZ, původní název "Snímek obrazovky
   2025-01-01 v 10.00.00".
   - _Výstup JSON:_
     `{"company": "ČEZ", "doc_type": "screenshot", "title": "Screenshot", "date": "2025-01-01"}`

---

## 9. Akceptační kritéria

- \[ ] PDF i standalone JPG/PNG jsou přejmenován správně
- \[ ] Screenshot je detekován z názvu souboru; v názvu je datum + čas (formát
  `at HH.mm.ss`)
- \[ ] Chybějící firma, datum nebo popis jsou vynechány — žádný placeholder
- \[ ] Přípona výsledného souboru je vždy malými písmeny
- \[ ] Datum je extrahováno i z textu ve stylu „v Praze dne 20.1.2025"
- \[ ] Hodnoty z `VALUE_BLOCKLIST` nejsou ve výsledném názvu
- \[ ] REGISTRY funguje i jako prázdný soubor — LLM navrhne firmu
- \[ ] Po dialogu je uživatel dotázán na uložení do `registry.json5`
- \[ ] Každé přejmenování je zaznamenáno v `smart-renamer.log` s absolutní i
  relativní cestou
- \[ ] **Log rotation:** log se rotuje při překročení 10 MB (udržuje 3 kopie)
- \[ ] Právní přípony (s.r.o., a.s. atd.) jsou ve výsledném názvu odstraněny
- \[ ] **Sanitace:** zakázané znaky (`/`, `:`, `\`, `|` atd.) jsou z názvu
  odstraněny
- \[ ] **Kolize:** pokud cílový soubor existuje, přidá se inkrementální sufix
  `(1)`, `(2)` atd.
- \[ ] Pokud OCR < 30 znaků, LLM se nevolá; přejde se na dialog (po zkoušce
  REGISTRY)
- \[ ] Pokud JPG > 4 MB, obraz se přeskočí; skript pokračuje pouze s textem
- \[ ] LLM timeout (35 s) je zachycen; pokračuje se bez LLM
- \[ ] Výsledný název souboru nepřekračuje 255 bytů (včetně sufixu při kolizi)
- \[ ] V dávkovém režimu s `--dedupe` identický soubor neprojde dvakrát (použit
  streaming hash)

---

## 10. Závislosti a rizika

### 10.1 Závislosti

| Závislost                  | Dopad při výpadku                                  |
| -------------------------- | -------------------------------------------------- |
| LM Studio 0.4+ (localhost) | LLM nefunguje; pokračuje se přes REGISTRY a dialog |
| Apple Vision Framework     | OCR selže; skenovaná PDF a obrázky nelze zpracovat |
| Node.js 22+                | Skript nefunguje                                   |
| `osascript`                | Dialog nelze zobrazit; firma se vynechá            |

### 10.2 Rizika

| Riziko                                          | Pravděpodobnost | Dopad              | Mitigace                                                          |
| ----------------------------------------------- | --------------- | ------------------ | ----------------------------------------------------------------- |
| LLM vrátí datum splatnosti místo data vystavení | Střední         | Chybné datum       | System prompt explicitně rozlišuje typy dat; záloha JS regex      |
| LLM vrátí nevalidní JSON                        | Střední         | Chybný název       | Regex extrakce `{...}` z odpovědi; null fallback                  |
| Screenshot špatně klasifikován                  | Střední         | Chybná firma/čas   | Primární detekce z názvu souboru je spolehlivější než OCR detekce |
| Reasoning model překročí timeout                | Střední         | Fallback bez LLM   | Timeout 35 s je nastaven; loguje se jako `fallback`               |
| OCR ligatury (`ﬀ`, `ﬁ`)                         | Nízká           | REGISTRY neshoduje | NFKD normalizace OCR textu před pattern matchingem                |
| Vícestránkové PDF s různými datumy              | Střední         | LLM vybere špatné  | LLM je instruován vybrat datum plnění; kompromis                  |
| JPG stránek > 4 MB                              | Nízká–střední   | Obraz přeskočen    | Loguje se; pokračuje se s textem                                  |
| ReDoS útok přes uživatelský regex               | Nízká           | Hang procesu       | Validace vzorů v REGISTRY přes `safe-regex` (FR-07)               |

---

### 10.3 AI-Identified Pitfalls (Předvídané pasti z Vibe designu)

- **Past vícenásobného datumu:** Jízdenka na vlak obsahuje datum nákupu a datum
  odjezdu. LLM má tendenci brát to pozdější. _Mitigace:_ System prompt
  zdůrazňuje "datum plnění nebo vystavení".
- **ReDoS přes Registry:** Uživatelem vložený špatný regex v `registry.json5` by
  mohl způsobit nekonečnou smyčku při parsování. _Mitigace:_ Ochrana přes
  `safe-regex` (FR-07) je kritickou závislostí.
- **Skryté soubory:** Smazáním všech polí může vzniknout název `.pdf`, který se
  v macOS zneviditelní. _Mitigace:_ Záchytná síť ve FR-08, která přepíše prázdný
  název na `Unnamed_...`.

---

## 11. Otevřené otázky

| ID    | Otázka                                                                                          | Stav                                                                                |
| ----- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| OQ-01 | Jak přesně detekovat screenshot vs. fotografie dokumentu pokud název souboru není diagnostický? | Otevřeno                                                                            |
| OQ-02 | Má `registry.json5` plně nahradit inline vzory nebo existovat jako doplněk?                     | Otevřeno                                                                            |
| OQ-03 | Má few-shot learning z logu (úspěšná přejmenování) vstupovat do LLM promptu?                    | Vyřešeno: Zavedeno v sekci 8.3 (Golden Examples) jako statický baseline pro Fázi 1. |
| OQ-04 | Jak řešit `mtime` jako fallback — zobrazit datum s vizuální indikací že jde o odhad?            | Otevřeno                                                                            |
| OQ-05 | Formát záznamu v `registry.json5` — plain JSON nebo JSON5 (s komentáři)?                        | Otevřeno                                                                            |

---

## 12. Roadmap

### Fáze 1 — Základ

- Kompletní přepis skriptu podle tohoto PRD
- OCR pipeline (PDF + obrázky)
- LLM inference s vision
- Transaction log
- Prázdný REGISTRY jako výchozí stav

### Fáze 2 — Zpřesnění

- Pokročilá extrakce data (multi-pass: LLM → regex → dialog)
- Screenshot detekce a timestamp z názvu souboru / EXIF
- Uživatelský dialog pro uložení nové firmy do `registry.json5`

### Fáze 3 — Dávkové zpracování

- Multi-file podpora (`process.argv.slice(2)`)
- `--dedupe` příznak
- Výpis přehledu po dávce

## 13. Glosář

| Termín          | Definice                                                                    |
| --------------- | --------------------------------------------------------------------------- |
| REGISTRY        | JSON soubor se vzory (regex → firma + popis); první shoda vyhrává           |
| VALUE_BLOCKLIST | Konfigurační seznam hodnot ignorovaných při extrakci (data, řetězce, regex) |
| Transaction log | Append-only JSONL soubor s historií přejmenování; umožňuje revert           |
| Session hash    | SHA-256 hash (streaming) pro jeden dávkový běh; bez zápisu na disk          |
| OCR práh        | Minimální počet znaků z OCR (30); pod prahem se LLM nevolá                  |
| `mtime`         | Čas poslední modifikace souboru — fallback pro datum                        |
| NFKD            | Unicode normalizace pro rozklad ligatur (ﬀ → ff)                            |
| LLM timeout     | Maximální čekací doba na odpověď modelu (35 s výchozí)                      |
| doc_type        | Typ dokumentu detekovaný LLM; řídí pravidla pro sestavení popisu            |
| ReDoS           | Regular Expression Denial of Service — útok zneužívající složité regexy     |
