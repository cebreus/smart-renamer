# Kognitivní proces a rozhodovací logika: Smart Renamer

Tento dokument mapuje, jak informační vstupy (Pět pilířů a Agentní speciality)
určovaly způsob uvažování a psaní kódu během vývoje.

## 1. Fáze 1: Initial Implementation (Vize a tvorba)

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

## 2. Fáze 2: QA a optimalizace (Vynucená disciplína)

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

## 3. Retroaktivní reflexe a poučení

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

## 4. Porovnání fází (Vývojové metriky)

| Faktor            | Fáze 1 (Generování)                | Fáze 2 (QA/Opravy)                    |
| :---------------- | :--------------------------------- | :------------------------------------ |
| **Hlavní driver** | **PRD & Architektura** (Vize)      | **Linter & Knip** (Omezení)           |
| **Postoj agenta** | **Architekt** (Stavitel)           | **Chirurg** (Korektor)                |
| **Cíl**           | Funkčnost a dodržení standardů.    | Průchodnost CI/CD a stabilita.        |
| **Metoda**        | Masivní zápis (generování tokenů). | Iterativní ladění (řešení konfliktů). |

## 5. Finální reflexe: Cena za nesoulad (Fáze 3)

Fáze 3 se stala nejdelší částí projektu (95 min), což odhalilo klíčovou dynamiku
práce s AI:

1.  **Latence kontextu:** S narůstající historií (~7.5M tokenů kumulativně) se
    čas na jeden výpočetní cyklus prodloužil až na 2 minuty. Každá oprava chyby
    z Fáze 1 se tak stala 4× dražší než její původní vytvoření.
2.  **Komunikační overhead:** Většina času nebyla strávena psaním kódu, ale
    laděním inženýrské shody (např. evoluce Loggeru a čistota `GEMINI.md`).
3.  **Brevity Bias:** Identifikovali jsme tendenci agenta aplikovat pravidlo
    stručnosti na projektovou dokumentaci, což vedlo k nechtěnému mazání
    technických detailů (vandalismus textu).

---

_Analýza chatu a kognitivní audit uzavřen 26. dubna 2026._
