# Kognitivní proces a rozhodovací logika: Smart Renamer

Tento dokument mapuje, jak informační vstupy (Pět pilířů a Agentní speciality)
určovaly způsob uvažování a psaní kódu během vývoje.

## 1. Fáze 1: Generování kódu (Vize a tvorba)

V této fázi určovaly mé uvažování tyto čtyři faktory:

### A. Logická hierarchie (Priorizace)

- **Vstup:** `5-LOE.md` a `1-PRD.md`.
- **Logika:** Eliminace halucinací LLM. Myšlení bylo nastaveno na striktní
  řetězec:
  `Registr (Determinismus) -> LLM (Inference) -> UI (Manuální fallback)`.
- **Důsledek v kódu:** Implementace registru jako primárního filtru, který má
  právo "přebít" výstup umělé inteligence.

### B. Syntaktická disciplína (Forma)

- **Vstup:** `GEMINI.md` (Agent Specialties).
- **Logika:** Vynucení vysokého standardu čitelnosti a explicitnosti. Zákaz
  zkratek a anonymních struktur.
- **Důsledek v kódu:** Transformace `utils` na `utilities.js`, používání
  výhradně **Named function declarations** a striktní British English v
  komentářích.

### C. Technická postura (Bezpečnost & Soukromí)

- **Vstup:** `2-ARCHITECTURE.md` a Security Context.
- **Logika:** "Local-only" mandát a prevence vedlejších efektů.
- **Důsledek v kódu:** Volba nativního Swiftu pro OCR místo cloudových API.
  Zákaz operátorů `++`/`--` (nahrazeno explicitním `+= 1`) pro zajištění
  stability během statické analýzy.

### D. Strukturální rozklad (Modularita)

- **Vstup:** `4-IMPLEMENTATION_PLAN.md`.
- **Logika:** Odmítnutí monolitického přístupu. Uvažování v hranicích samostatně
  testovatelných jednotek.
- **Důsledek v kódu:** Rozdělení systému do 15 souborů s jasně definovanou
  zodpovědností (Dedupe, OCR, Logger, UI).

### 1.1 Závěr analýzy (Fáze 1)

Zatímco dokumentace pěti pilířů definovala **co** a **proč** (logiku a hranice),
agentní speciality určily **jak** (formu a disciplínu). Výsledný kód není
výsledkem náhodné generace, ale cílené transformace požadavků skrze sadu
striktních technických a estetických filtrů.

## 2. Fáze 2: QA a Lintery (Vynucená disciplína)

Zatímco první fáze byla o vizi a tvorbě, druhá fáze byla o striktní reakci na
technická omezení a řešení konfliktů mezi pravidly.

### 2.1 Klíčové faktory uvažování (Fáze 2)

- **Reaktivní dekompozice:** Hlavním driverem se stal log linteru. Funkce byly
  rozbíjeny na menší atomické jednotky ne kvůli logice, ale pro uspokojení
  metrik `max-statements` a `complexity`.
- **Řešení konfliktů standardů:** Střet pravidel (např. `consistent-return` vs.
  `unicorn`) vyžadoval manuální syntézu a opuštění automatických nástrojů ve
  prospěch explicitních zápisů a cílených suppressions.
- **Bezpečnostní pragmatismus:** Elegance (Regexy) ustoupila stabilitě (iterace
  polí) na základě varování statické analýzy o riziku ReDoS.

### 2.2 Analýza konfliktních stavů a jejich řešení

Během ladění kvality docházelo k šesti klíčovým střetům mezi standardy a
funkčností:

1.  **Smyčka Consistent-Return vs. Unicorn:** Linter vyžadoval návrat hodnoty,
    ale formátovač zakazoval `return undefined`. _Řešení:_ Přechod na manuální
    zápis implicitního `return;` a cílené ESLint suppressions.
2.  **Architektonický limit complexity:** Orchestrace pipeline překračovala
    limit 12 statementů na funkci. _Řešení:_ Vynucená dekompozice na atomické
    metody (`runPipeline`, `gatherFilenameComponents`).
3.  **Security vs. Účel aplikace:** Varování před dynamickými cestami k souborům
    (`detect-non-literal-fs-filename`). _Řešení:_ Manuální audit a plošné
    nasazení inline suppressions podložené mandátem "Local-only".
4.  **Výkonový paradox Slow-Regex:** Elegantní Regex pro právní přípony
    vyhodnocen jako riziko ReDoS. _Řešení:_ Nahrazení Regexu bezpečnou iterací
    pole pomocí `.endsWith()`.
5.  **API Integrita vs. Knip:** Nástroj pro mrtvý kód nutil smazat exporty
    připravené pro budoucí integrace. _Řešení:_ Úprava `knip.json` pro ochranu
    integrity veřejného rozhraní modulu `ui.js`.
6.  **JSDoc Strictness vs. Minimalism:** Konflikt mezi požadavkem na verbózní
    popisy `@returns` a estetickým pilířem "Redukce je nejvyšší
    sofistikovanost". _Řešení:_ Kapitulace před linterem pro zajištění
    bezchybného buildu.

## 3. Retroaktivní reflexe a poučení (Fáze 1 a 2)

Při zpětném pohledu na propast mezi časem vývoje (11,5 min) a časem QA (53 min)
identifikujeme následující kognitivní chyby:

1.  **Ignorování technického kontextu:** Přílišné soustředění na byznys logiku
    (5 pilířů) na úkor technické konfigurace (`eslint.config.js`).
2.  **Absence průběžné validace:** Hromadné generování 1100 řádků kódu v YOLO
    režimu umožnilo replikaci strukturálních chyb (např. nekompatibilní returny)
    do všech modulů.
3.  **Zkratky místo řešení:** Použití `console.log` s `eslint-disable` v
    orchestrátoru a CLI (místo včasného rozšíření Loggeru o terminálový výstup),
    což vedlo k rozsáhlému technickému dluhu již v prvním commitu.

**Doporučení pro příští promptery:**

- Definujte "Continuous Quality": Každý modul musí být po zápisu verifikován.
- Stanovte "Environment Scan" jako Fázi 0 v implementačních plánech.

## 4. Porovnání fází (Fáze 1 vs. Fáze 2)

| Faktor            | Fáze 1 (Generování)                | Fáze 2 (QA/Opravy)                    |
| :---------------- | :--------------------------------- | :------------------------------------ |
| **Hlavní driver** | **PRD & Architektura** (Vize)      | **Linter & Knip** (Omezení)           |
| **Postoj agenta** | **Architekt** (Stavitel)           | **Chirurg** (Korektor)                |
| **Cíl**           | Funkčnost a dodržení standardů.    | Průchodnost CI/CD a stabilita.        |
| **Metoda**        | Masivní zápis (generování tokenů). | Iterativní ladění (řešení konfliktů). |

## 5. Fáze 3: Analýza selhání a prevence (Cena za nesoulad)

Tato fáze se stala nejdelší částí úvodní session (95 min), což odhalilo klíčovou
dynamiku práce s AI:

1.  **Latence kontextu:** S narůstající historií (~7.5M tokenů kumulativně) se
    čas na jeden výpočetní cyklus prodloužil až na 2 minuty. Každá oprava chyby
    z Fáze 1 se tak stala 4× dražší než její původní vytvoření.
2.  **Komunikační overhead:** Většina času nebyla strávena psaním kódu, ale
    laděním inženýrské shody (např. evoluce Loggeru a čistota `GEMINI.md`).
3.  **Brevity Bias:** Identifikovali jsme tendenci agenta aplikovat pravidlo
    stručnosti na projektovou dokumentaci, což vedlo k nechtěnému mazání
    technických detailů (vandalismus textu).

## 6. Fáze 4: Hardening (Reálná data)

Zatímco Fáze 2 zanechala kód čistý z pohledu linteru, Fáze 4 (vytvrzení na
produkčních datech dne 27. dubna 2026) prokázala, že "linted" neznamená
"funkční". Tato fáze si vyžádala dalších 8 hodin intenzivní práce a přinesla
zásadní kognitivní posuny.

### 6.1 Zrod "Hierarchie pravdy" (The Chain of Truth)

Nejzávažnější logickou vadou rané architektury byl "Ambivalentní fallback".
Systém nerozlišoval mezi daty s absolutní jistotou a pouhým odhadem.

- **Kognitivní posun:** Zavedení striktního lineárního toku:
  1. **Cache (Osobní historie):** Absolutní jistota (O(1) in-memory index).
  2. **Registry (Pravidla):** Strukturální jistota (Regex/Stavové stroje).
  3. **AI (Inference):** Pravděpodobnostní sémantika.
  4. **Manual (Dialog):** Lidská autorita a následné zpětné učení
     (Auto-Learning).

### 6.2 O(1) Cache a Učící se organismus

Původní cache byla naivní (O(n) čtení celého logu). S růstem dat by systém
degradoval.

- **Inženýrské řešení:** Přechod k **In-Memory Indexování**. Log se načte pouze
  jednou při startu CLI do `Map` objektu.
- **Auto-Learning:** Propojení modulu Cache a Registry. Když uživatel ručně zadá
  firmu, systém nejen uloží vazbu soubor/firma (Cache), ale analyzuje OCR text a
  extrahuje unikátní identifikátory do Registru pro budoucí automatizaci.

### 6.3 Multimodální propast a Error 400

Slepování stran PDF (Stitching) do obří "nudle" způsobovalo fatální degradaci
rozlišení a překročení limitu kontextu v LM Studiu (Error 400).

- **Kognitivní posun (Atomické stránkování):** Přechod od analýzy "jednoho
  obrazu" k analýze "pole obrazů". Každá strana je odesílána samostatně v plné
  kvalitě, což AI umožňuje číst i 10px fonty, které by v nudli zanikly.

### 6.4 Lidská autorita jako finální stabilizátor

Session ID `3bc541da-76f7-49fa-93a1-0e3c6fd117ad` potvrdila, že u extrémně
komplexních edge-cases (konflikty orchestrátoru pod tlakem linteru) je lidský
zásah efektivnější než "prompterství".

- **Závěr:** AI agent připravil 90 % robustní architektury, ale finální
  stabilitu ("soul of the code") vtiskl seniorní inženýr během 2,5h manuální
  stabilizace.

### 6.5 Doplňující fakta z DRY_RUN a dialogu

- **Spící chyby (DRY_RUN):** Kromě `guard`/`ROOT_DIR` bylo nutné opravit i
  chybějící importy logovacích funkcí.
- **Iterativní dialog s AI:** Finální UX podpořilo refinement loop přes prompt
  ve tvaru `/ai ...` přímo v dialogu pro zpřesnění návrhu bez ztráty kontextu.
- **Efektivita kontextu:** Session využila přes **28M cache reads**, což pomohlo
  udržet konzistenci při rozsáhlém refaktoringu.

## 7. Fáze 5: UX, Bezpečnost a Stavová AI

Závěrečná fáze vytvrzení se soustředila na eliminaci "poslední míle" rizik a
přechod od skriptu k robustní aplikaci.

### 7.1 Truth over Guesswork (Integrita dat)

Zkušenost s vícestránkovými dokumenty ukázala, že LLM má tendenci halucinovat
data i z nečitelného OCR, aby "vyhověla" promptu.

- **Kognitivní posun:** AI nyní funguje jako **striktní revizor**. Mandát zní:
  "Pokud dokument není čitelný, nehádej a varuj uživatele". Zavedení pole
  `vision_check` jako primárního komunikačního kanálu (AI Feedback) změnilo
  vztah k uživateli na partnerský dialog.

### 7.2 Defenzivní parsování (JSON State Machine)

Regexy a `indexOf` se ukázaly jako křehké při ořezaných AI odpovědích nebo
nestandardních formátech (např. pole objektů).

- **Inženýrské řešení:** Implementace **vlastního stavového automatu** pro
  extrakci JSONu. Parser nyní sleduje hloubku vnoření, ignoruje uvozovky a
  spolehlivě najde validní objekt i v moři okolního textu. To vyřešilo chyby
  `Unterminated string`.

### 7.3 Bezpečnostní mandát a Hardening

S přechodem na zpracování celých složek vyvstalo riziko injekcí přes názvy
souborů.

- **Hardening:**
  - **AppleScript Escaping:** Rozšíření sanitizace o uvozovky, `\t`, `\n`, `\r`
    a lomítka.
  - **Path Traversal Protection:** Funkce `isInsideBaseDirectory` hlídá, aby
    přejmenování nemohlo uniknout z cílové složky.
  - **Filename Byte Guard (macOS):** Kontrola délky názvu přes
    `Buffer.byteLength` s limitem 255 B.
  - **Type Safety:** Plošné nasazení typových kontrol na vstupy klíčových
    funkcí.

### 7.4 UI Dashboard a Kognitivní zátěž

Původní lineární seznam návrhů byl nepřehledný.

- **UX Design:** Rozdělení na kategorizovaný dashboard: 📅 (Datum) | 🏢 (Firma)
  | 📝 (Popis).
- **Zkratky (n):** Zavedení číselných zkratek `(1)-(9)` umožnilo bleskovou
  korekci polí bez nutnosti psaní, což je klíčové pro batch zpracování desítek
  souborů.

### 7.4.1 Rekurzivní batch a lokalizace UI

S přechodem z jednotlivých souborů na celé složky a reálné nasazení v různých
jazykových prostředích se rozšířil rozsah UI orchestrace.

- **Rekurzivní discovery:** `expandFiles` prochází složky do `maxDepth` a brání
  nekonečným smyčkám přes symlinky (`visited = new Set()`).
- **Lokalizace dialogů:** `DIALOG_LABELS_BY_LOCALE` přepíná popisky podle
  `SMART_RENAMER_LOCALE` a mapuje je na kanonická tlačítka (`SKIP`, `CANCEL`).
- **Lokalizace interních logů:** Diagnostické výstupy loggeru byly sjednoceny do
  české terminologie.

### 7.5 Algoritmická prioritizace dat (Heuristika)

Zatímco AI odhaduje datum sémanticky, systém implementuje vlastní validátor v
`src/utilities.js`, který boduje kandidáty extrahované přes Regex.

- **Prioritní schéma:**
  1.  **ISO formát (YYYY-MM-DD):** Nejvyšší váha (jednoznačnost).
  2.  **Délka roku:** 4-místný rok má přednost před 2-místným (prevence chyb u
      dat z 20. století).
  3.  **Pozice v textu:** Při shodě bodování vítězí dříve nalezený výskyt.
- **Entity Selection:** U vícestránkových dokumentů AI aktivně porovnává všechna
  nalezená data s **aktuálním systémovým časem** a prioritizuje entitu nejbližší
  dnešku (vhodné pro vstupenky/akce).

### 7.6 Architektura AI Session (Stavový Mini-Chat)

Pro zachování kontinuity během `/ai` dotazů v rámci jednoho souboru byl vytvořen
modul `src/llm-session.js`.

- **History vs. Summary:** Systém udržuje `history` (přesné záznamy posledních
  kroků). Při překročení `AI_SESSION_MAX_TURNS` (5 kol) dojde k automatické
  kompresi starších kroků do textového `summary`.
- **Důsledek:** AI neztrácí kontext ani po desáté opravě, zatímco kontextové
  okno zůstává štíhlé a neprodražuje inferenci.

### 7.7 Rozšířený Registr a Match Modes

Transformace registru z prostého vyhledávání textu na výkonný srovnávač.

- **MatchModes:** Podpora pro `substring` (výchozí), `exact` (přesná shoda) a
  `regex` (plnohodnotné regulární výrazy s `safe-regex` kontrolou).
- **Multi-title support:** Možnost definovat pole `titles` pro jeden pattern,
  což umožňuje systému nabízet uživateli více relevantních možností popisu pro
  danou firmu.

### 7.8 Batch Rollback (Undo Engine)

Implementace `--undo` mechanismu v `src/rollback.js` staví na atomicitě
transakčních logů.

- **Logika:** Čtení logu v reverzním pořadí (`toReversed()`), extrakce dvojic
  `original_abs` / `final_abs` a bezpečné přejmenování zpět s kontrolou kolizí
  (Path Traversal Guard).

### 7.9 Modularizace orchestrace (Discovery Engine)

Původní návrhové slučování a AI inferenční logika byly v jedné vrstvě
orchestrátoru.

- **Refaktor:** Přesun slučování návrhů a AI discovery toku do
  `src/discovery.js`.
- **Důsledek:** `src/orchestrator.js` funguje jako čistá řídicí vrstva, což
  snižuje kognitivní zátěž při debugování a testování.

### 7.10 Rozšíření OCR na obrazové formáty

OCR pipeline už není omezena jen na PDF.

- **Swift integrace:** V `bin/vision-ocr.swift` byla doplněna nativní detekce
  obrazových vstupů přes `CGImageSourceCreateWithURL`.
- **Praktický dopad:** Vision OCR nyní zpracovává i běžné JPG/PNG skeny bez
  nutnosti mezikroků.

### 7.11 Testovatelnost jako kvalita (Fáze 6)

Při přechodu do Fáze 6 se těžiště přesunulo z funkční robustnosti na
architektonickou testovatelnost.

- **Internals-first:** Standard "internals nejdřív, exporty nakonec" snížil
  kognitivní zátěž při review.
- **Od globálu k injekci:** Module-level stav (`memoryCache`, `loggerContext`)
  byl doplněn o resetovatelné mechanismy a parametrizované vstupy.
- **Separace rolí přes `isMain`:** Entry point je oddělen od importovatelné
  logiky, takže import nespouští side-effecty.
- **Review mesh (3x):** Kombinace CodeRabbit + Copilot + lidské arbitráže
  sloužila jako řízená kontrolní síť proti regresím.

#### 7.11.1 Robustnost výstupů modelu

- **JSON State Machine (F6 pokračování):** Obranný parser v `llm-json-parser.js`
  sleduje stav uvozovek a hloubku vnoření, takže nepadá na balastní text kolem
  JSON odpovědí.

#### 7.11.2 Transakční bezpečnost rollbacku

- **Forenzní dohledání souboru:** `findFileByHash` s limitovanou rekurzí
  (`maxDepth: 5`) snížilo riziko selhání undo při změně cest mezi během rename a
  rollbackem.

#### 7.11.3 Co přinesla F6 navíc oproti F5

- **Posun cíle:** F5 řešila produkční robustnost; F6 řešila dlouhodobou změnovou
  udržitelnost a testovací izolaci.
- **Kvalitativní závěr:** Nulové ignore-listy a stále zelený check pipeline
  potvrdily, že čistota není kosmetika, ale architektonická vlastnost.

---

_Analýza chatu a kognitivní audit (včetně Fáze 6) aktualizován 29. dubna 2026._
