# Remix — le regole

Come `/remix` trasforma le timeline delle sessioni in un mix riproducibile. Questo è un riferimento
del comportamento così com'è costruito, non una proposta.

**Traduzione approssimativa.** La versione inglese (`docs/remix-rules.md`) è quella autorevole: in
caso di divergenza vale quella. Identificatori, nomi di categoria, percorsi e chiavi di
configurazione restano in inglese, perché sono ciò che compare nel codice.

---

## 1. Le tre cose coinvolte

Capire queste rende quasi tutte le regole inevitabili invece che arbitrarie.

| | che cos'è | punto chiave |
|---|---|---|
| **`AuthoredRule`** | il timing di un layer dentro una sezione di una sessione | porta **solo il tempo** — più l'elemento da cui viene. Nessun audio. |
| **`ArrTrack`** | una corsia del mix | porta **esattamente un campione** (`sample.path`) |
| **`TemplateRegion`** | una finestra sulla timeline | punta a un `trackId`. **Non esiste un campo per il campione.** |

La regione dice *quando*; la traccia dice *cosa*. La regione non può nominare il proprio audio
perché quel campo non esiste. La regola 3.4 discende direttamente da qui.

## 2. Costruire il pool

**2.1** Ogni `config/sessions/*.md` viene interpretato in regole. L'elemento arriva dal prefisso del
nome file (`water-session-layer-timeline.md` diventa `WATER`).

**2.2** Le intestazioni di sezione danno sia il tag sia la **finestra**. Ogni regola registra
l'inizio della finestra come `sectionStartSec`.

**2.3** Gli inizi delle finestre sono per elemento e non coincidono:

| elemento | Introduction | Deep Relaxation | Return |
|---|---|---|---|
| EARTH / WATER / FIRE / ETHER | 0:00–10:00 | 10:00–20:00 | 20:00–30:00 |
| **AIR** | 0:00–**9:30** | **9:30–19:00** | 20:00–**29:30** |

L'origine del rebase è quindi un dato scritto, mai un indice di sezione per 600.

**2.4** Tutti i tempi delle frasi sono **assoluti** sulla timeline 0–30:00. Una regola può avere più
frasi; righe ripetute per lo stesso layer in una sezione confluiscono in una sola regola.

**2.5** Il pool è ogni regola di ogni elemento. I nomi di layer sconosciuti vengono saltati con un
avviso; le righe tutte-trattini significano che il layer è assente in quella sezione.

**2.6 — I nomi dei layer sono normalizzati, quindi non devono coincidere fra elementi.** `mapLayer`
mappa un nome scritto su una `Category`, tollerando maiuscole e spazi. Due elementi che scrivono un
layer in modo diverso si incontrano comunque su una categoria, quindi **un timing non resta mai
orfano per via del nome**. Le cinque sessioni distribuite si interpretano oggi con **zero** avvisi.

**2.7 — `FX` e `DRONE` non possono comparire in un remix.** Sono categorie reali e distribuiscono un
campione in tutti e cinque gli elementi, ma nessuna delle due ha una voce in `mapLayer`, quindi
nessun nome scritto può produrre una regola. Sono lo specchio della lacuna 3.6: campioni senza
regole, invece che regole senza campioni.

## 3. Scegliere cosa suona

Due ambiti indipendenti restringono il pool prima di ogni estrazione, e una terza modalità fissa
l'audio invece di restringere:

| | |
|---|---|
| **Cross-element** (predefinita) | tutto il pool; il campione di ogni traccia segue la regola estratta |
| **Scoped**(el) | solo le regole di quell'elemento, e i suoi campioni |
| **Borrowed timings**(el) | tutto il pool per il **tempo**, e i campioni di **el** per ogni traccia |
| **Full session** (predefinita) | l'intera timeline di 30 minuti |
| **Section**(s) | solo le regole di quella sezione |

Poi, per ogni categoria coperta dal pool ristretto:

**3.1 — Una corsia per categoria, per elemento.** `id = category·ELEMENT`. **Una categoria estratta è
esattamente una corsia**, sull'elemento su cui è caduto il suo lead. Una categoria contiene più
corsie solo quando la prendi in mano tu. L'id porta l'elemento anche quando la corsia è una sola: un
id che cambiasse forma all'apparire di un fratello perderebbe lo stato di mute e farebbe ricaricare
la corsia a metà sessione.

**3.2 — Una regola per sezione, in una sessione intera.** Una traccia prende una regola da ogni
sezione scritta dal suo elemento. Un'estrazione di sezione prende **esattamente una regola**.

**3.3 — L'assenza è ammessa e non viene mai riparata.** Nulla viene sostituito per riempire un vuoto.

**3.4 — Ogni regola di una corsia viene da un solo elemento, a meno che il campione sia fissato.**
Il motivo è la sezione 1: una traccia suona un solo file. Se l'Intro venisse da Fire e il Return da
Water, uno dei due campioni dovrebbe vincere e la regola perdente non porterebbe altro che orari. Il
missaggio fra elementi avviene quindi **fra tracce**, mai dentro una. **Borrowed timings** fissa il
campione a mano e il vincolo si dissolve: una regola torna a essere ciò che è sempre stata sulla
carta, puro tempo.

**3.5 — Il campione segue l'elemento, quello estratto o quello scelto.** L'audio di una traccia è
`manifest[element][category]`, estratto a caso da quella lista.

**3.5a — PLANET suona ogni campione che il suo elemento distribuisce.** Una categoria è esente
dall'estrazione casuale: `PLANET` prende **entrambi** i file invece di uno, come due corsie sullo
stesso tempo. I suoi campioni sono corpi celesti distinti, scritti per essere ascoltati insieme,
quindi estrarne uno zittiva metà libreria. L'id di una corsia che si sdoppia porta il campione.

**3.6 — Nessun campione, nessun lead.** Una regola può suonare solo attraverso un elemento che
distribuisce un campione per la sua categoria, e **l'estrazione non sceglie un lead che non potrebbe
suonare**. Una categoria viene saltata, con un avviso, solo quando ogni candidato è morto.
`ELEMENT_SUB` è l'unica lacuna del materiale distribuito.

**3.7 — Gli elementi vengono estratti in proporzione al numero di regole.** Un elemento con più
varianti scritte vince la categoria più spesso.

**3.8 — Le tracce sono ordinate dalla grammatica verticale** (`STACK_ORDER`).

**3.9 — Deterministico e locale.** Stesso pool, manifest, seed, elemento, sezione, lock e scelte
manuali danno la stessa estrazione. Ogni corsia possiede il **proprio flusso casuale**, così una
modifica non può disturbare ciò che un'altra corsia ha già scelto.

**3.9a — Il lock congela l'estrazione di una categoria.** Un lock registra il seed corrente in quel
momento; da lì quella categoria estrae dal seed registrato mentre Regenerate fa avanzare quello di
tutte le altre. Resta **estratta**, ed è questo che distingue un lock dal prendere in mano una
traccia.

## 4. Disporre sulla timeline

**4.1 — Sessione intera:** i tempi delle frasi si usano **come scritti**, assoluti.

**4.2 — Estrazione di sezione:** ogni frase viene ribasata sul proprio `sectionStartSec`.

**4.3 — Taglio.** Dopo il rebase, una frase che finisce oltre la timeline viene tagliata; una che
inizia alla fine o oltre viene scartata.

**4.4 — Le dissolvenze sono limitate alla larghezza superstite**, così una clip tagliata dissolve
comunque per intero.

**4.5 — Una regione per frase.** Una regola con più frasi produce più regioni sulla sua traccia.

## 5. Riproduzione ed export

**5.1 — I campioni vanno in loop sotto il loro intervallo.** `loop = true` in tutti e tre i percorsi.

**5.2 — Le giunzioni del loop sono tagli netti.** Non c'è crossfade al punto di ripartenza.

**5.3 — Ogni frase suona.** Lo scheduler trova la regione che contiene la testina, quindi anche le
frasi successive di una regola con più frasi si sentono.

**5.4 — Le dissolvenze si applicano per regione**, ai bordi dell'intervallo.

**5.5 — L'export rispecchia la riproduzione.** Il renderer offline riproduce gli stessi loop,
inviluppi e guadagno master.

**5.6 — Il mute fa parte del mix.** Una traccia mutata è silenziata dal vivo e assente dall'export.

**5.7 — L'export rispecchia la riproduzione musicalmente, non byte per byte.** Dal vivo i trigger
cadono sui bordi dei frame, offline sono campione-esatti.

## 5a. Mandate degli effetti

**5a.1 — Due mandate per corsia**, riverbero e delay, 0–100%. MELODY parte bagnata (riverbero 75%,
delay 30%); ogni altra categoria parte asciutta. Sono memorizzate per corsia ma comandate per
categoria: il solo controllo è sulla riga del pool, che è una categoria.

**5a.2 — Le mandate sono post-fader.** Una frase che finisce continua a risuonare.

**5a.3 — Le mandate sono stato di mix a runtime.** Non vengono salvate con un arrangiamento.

**5a.4 — Un export prosegue oltre la fine della timeline** della lunghezza della coda, così l'ultimo
decadimento si completa invece di essere tagliato.

**5a.5 — L'export di una sessione concatenata somma le sovrapposizioni.** La coda di un modulo
risuona sotto l'apertura del successivo invece di diventare un vuoto.

**5a.6 — Gli effetti non addolciscono le giunzioni del loop.** Una coda non può scavalcare una
giunzione in un segnale che non si è mai fermato.

**5a.7 — Dove parte una traccia, prima che tu la tocchi.** Una traccia appena estratta sta a
`defaultTrackDb`, cioè unità, salvo che la sua categoria compaia in `audio.volume.categoryDb`.
`NOISE` parte a **meno 20 dB**: è un letto e sta sotto il resto fin dalla prima battuta. Il cursore
per traccia va da **meno 30 a più 20 dB**, più profondo che alto.

## 6. Adattare gli intervalli a loop interi

**Attivo per impostazione predefinita.** Ogni intervallo viene ridimensionato perché contenga un
numero intero di loop e nessun campione sia tagliato a metà passaggio. Togli la spunta per sentire
gli intervalli esattamente come scritti.

**6.1** `loops = round(intervalLength / sampleLength)`: da mezzo in su arrotonda per eccesso.

**6.2** Il minimo è **un loop intero**. L'arrotondamento non raggiunge mai lo zero, quindi non può
mai cancellare una traccia.

**6.3** Arrotonda **per difetto** quando per eccesso supererebbe la fine della sessione o
l'intervallo successivo della stessa traccia.

**6.4** Un intervallo senza spazio nemmeno per un loop intero resta **esattamente come scritto**.

**6.5** Gli inizi degli intervalli **non si spostano mai**, solo la fine.

**6.6** L'adattamento serve allo stesso modo la riproduzione e l'export.

## 6a. I campioni lunghi suonano una sola volta

**Non è una casella.** A differenza della sezione 6 vale sempre: è un fatto sul materiale, non una
preferenza sulle giunzioni.

**6a.1 — Un campione lungo suona esattamente un passaggio per intervallo.** Oltre
`audio.remix.longSampleSec` un file smette di essere un loop e diventa un passaggio composto;
sentito due volte di fila si legge come una ripetizione, non come un letto.

**6a.2 — I letti sono esenti.** Le categorie in `audio.remix.alwaysLoopCategories`, cioè `NOISE` e
`BASS`, continuano a ciclare per quanto lungo sia il loro file.

**6a.3 — Solo più corto, mai più lungo.** L'inizio non si sposta e le dissolvenze si limitano alla
larghezza superstite.

**6a.4 — Applicato dopo l'adattamento a loop interi**, così quello non può riportare un campione
lungo a due passaggi.

## 7. Cosa mostra l'interfaccia

Le righe del pool sono per **categoria**, non per corsia. Una riga elenca ogni candidato della
categoria e accende quelli estratti; una categoria può contenere più corsie e la riga le comanda
tutte insieme. Volume, riverbero e delay scrivono su ogni corsia della categoria; il mute è per
corsia. Passando il mouse su una riga si accendono le corsie che governa, e viceversa.

## 8. Cliccare un chip: le regole governano l'estrazione, non te

Il primo clic su una categoria **congela ciò che stava già suonando** e prende la categoria in mano.
Da quel momento il generatore non la estrae più e le sue regole non le si applicano: ciò che è
acceso è esattamente ciò che suona. Spegnere ogni chip la fa tacere, ed è una cosa legittima da
volere; il pulsante auto la restituisce al generatore.

## 9. Deliberatamente non fatto

Nessuna riparazione delle lacune, nessuna sostituzione automatica dei campioni mancanti, nessun
crossfade sulle giunzioni dei loop.
