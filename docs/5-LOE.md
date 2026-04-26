# Level of Effort (LOE) Dokument: Smart Renamer

## Section 1: Přehled úkolu

Projekt Smart Renamer je lokální macOS nástroj (CLI a Quick Action) určený pro
deterministické a bezpečné přejmenovávání dokumentů. Systém využívá
víceúrovňovou strategii: REGISTRY (regulární výrazy), lokální LLM inferenci (LM
Studio) a manuální fallback dialog. Cílem je sjednocení názvů souborů do formátu
YYYY-MM-DD (Firma) Popis.ext při zachování stoprocentního soukromí dat.

Klíčové cíle:

- Automatizace archivace dokumentů.
- Eliminace halucinací pomocí validačních vrstev.
- Zajištění lokálního zpracování bez cloudu.

## Section 2: Business dopad

Hlavním přínosem je radikální snížení časové režie při správě digitálního
archivu a zvýšení jeho prohledávatelnosti.

Očekávané přínosy:

- Zvýšení produktivity uživatele při zpracování faktur a smluv.
- Konzistentní struktura archivu snižující kognitivní zátěž.
- Nulové riziko úniku citlivých finančních dat do cloudu.

Business rizika:

- Závislost na specifickém hardware (macOS) a externích nástrojích (LM Studio).
- Možnost chybného pojmenování při extrémně nízké kvalitě OCR.

## Section 3: Rozsah a výstupy

V rozsahu:

- Swift modul pro OCR (Apple Vision Framework).
- Node.js orchestrátor (ESM).
- Registry engine s podporou JSON5 a ReDoS ochranou.
- Integrace s LM Studio API (localhost).
- Nativní macOS dialogy přes osascript.
- Atomický transaction log s rotací.
- Sanitace názvů a řešení kolizí.

Mimo rozsah:

- Podpora jiných operačních systémů než macOS.
- Cloudové LLM služby.
- Hromadný undo příkaz.
- Distribuce předkompilovaných binárek.

## Section 4: Resource Requirements

Požadované role:

- Senior Node.js Engineer (orchestrace, streamy, bezpečnost).
- Swift Developer (Vision Framework, PDFKit).
- QA/Security Analyst (validace lokálního běhu a ReDoS).

Odhad počtu personálu: | Role | Počet | Alokace | | --- | --- | --- | | Senior
Software Engineer (Node.js/Swift) | 1 | 100% | | Security/QA Analyst | 1 | 25% |

Potřebné nástroje:

- macOS 14+ s Xcode 15+.
- Node.js 22+.
- LM Studio 0.4+.

## Section 5: Odhadované úsilí

Rozpis úkolů podle implementačních fází.

| Fáze                    | Popis                                                 | Úsilí (hodiny) | Komplexita |
| ----------------------- | ----------------------------------------------------- | -------------- | ---------- |
| Fáze 1: Inicializace    | Adresářová struktura, konfigurace, JSON5 registry.    | 8              | S          |
| Fáze 2: OCR a filtry    | Swift Vision modul, SHA-256 deduplikace.              | 16             | M          |
| Fáze 3: Business logika | Integrace LLM, prompt engineering, registry matching. | 24             | L          |
| Fáze 4: Fallback a UI   | osascript dialogy, sanitace názvů, logger.            | 16             | M          |
| Fáze 5: Orchestrace     | Propojení pipeline, CLI rozhraní, finální validace.   | 12             | M          |
| Rezerva                 | Ladění promptů a řešení nečekaných stavů OS.          | 12             | -          |
| Celkem                  |                                                       | 88             |            |

Celková klasifikace: Large (L) kvůli integraci dvou jazyků a lokální AI.

## Section 6: Závislosti

- Apple Vision Framework: Nezbytné pro OCR a analýzu obrazu.
- LM Studio: Musí běžet na localhost:1234 s Vision modelem.
- osascript: Engine pro zobrazování systémových dialogů.
- Node.js 22+: Vyžadováno pro moderní ESM a bezpečnostní funkce.

## Section 7: Rizika a mitigace

| Riziko            | Dopad   | Strategie mitigace                                         |
| ----------------- | ------- | ---------------------------------------------------------- |
| Halucinace modelu | Vysoký  | Priorita REGISTRY před LLM a striktní system prompt.       |
| Timeout inference | Střední | Hard timeout 35s s okamžitým přepnutím na fallback dialog. |
| ReDoS v registru  | Střední | Validace uživatelských vzorů pomocí safe-regex.            |
| Velikost obrazu   | Nízký   | Algoritmus pro automatickou degradaci stran (pod 4 MB).    |

## Section 8: Předpoklady a omezení

- Uživatel má Apple Silicon nebo výkonný Intel Mac pro běh lokálního LLM.
- LM Studio je správně nakonfigurováno (Context Length 9k+).
- Název souboru nesmí překročit 255 bytů (limit macOS).
- Data nikdy neopustí localhost (striktní architektonické omezení).

## Section 9: Závazná technická rozhodnutí

- **Formát registru:** Pro soubor `registry.json5` je použit formát **JSON5**,
  který umožňuje vkládání komentářů pro lepší správu pravidel.
- **Indikace mtime fallbacku:** Pokud systém použije datum z metadat souboru
  (mtime) namísto datumu z obsahu, bude toto datum v názvu indikováno vlnovkou
  (např. `~2025-01-20 (Firma) Popis.pdf`).
- **Správa historie:** Hromadná funkce "Undo" není součástí aktuální fáze
  implementace; uživatel se spoléhá na ruční opravu dle transakčního logu.
- **Nasazení Swift modulu:** Projekt neobsahuje předkompilované binárky; Swift
  modul pro OCR se kompiluje lokálně při instalaci/prvním spuštění na cílovém
  stroji.
