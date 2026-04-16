import { useState, useRef, useEffect, useCallback, useMemo } from "react";

/*
 * ══════════════════════════════════════════════════════════════════════════════
 * ORTHOGRAPHIC COMPLEXITY ANALYZER v3
 * Psycholinguistic Grain Size Theory (Ziegler & Goswami, 2005)
 *
 * THREE-LAYER ARCHITECTURE:
 *   L1 — Rule-based orthographic scoring (instant, deterministic)
 *   L2 — Rich local phonetic + synonym engine (always available)
 *   L3 — Claude API enhancement (contextual synonyms, any word, any language)
 *         Falls back gracefully to L2 if API unavailable
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ─── FONT IMPORT ────────────────────────────────────────────────────────────
const FONTS_URL = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,400&family=Sora:wght@300;400;500;600;700&display=swap";

// ─── LANGUAGE CONFIGS ───────────────────────────────────────────────────────

const LANGUAGES = {
  english: {
    name: "English", flag: "🇬🇧",
    desc: "Deep orthography — highly inconsistent G→P mappings",
    opacity: 0.87,
    defaultText: `The knight knew that the colonel's daughter had a cough, though she thought it was through a draught from the ancient plough shed. Their neighbour's yacht was moored by the quay, where foreign psychologists were studying the subtle phenomenon of dyslexia. The researchers measured each participant's ability to decipher words with ambiguous orthographic patterns. Preliminary results suggested that individuals with developmental reading difficulties experienced heightened interference when encountering graphemically opaque vocabulary, particularly those containing silent consonant clusters and irregular vowel digraphs.`,
  },
  french: {
    name: "Français", flag: "🇫🇷",
    desc: "Deep orthography — silent endings, nasal vowels, complex digraphs",
    opacity: 0.78,
    defaultText: `Les chercheurs ont examiné comment les enfants dyslexiques traitent les mots contenant des graphèmes complexes. Le pharmacien consciencieux a prescrit un médicament pour le patient souffrant de rhumatismes chroniques. Beaucoup de gens trouvent que l'orthographe française est particulièrement difficile à cause des lettres muettes et des liaisons imprévisibles. Les oiseaux chantaient dans les châtaigniers pendant que le sculpteur travaillait tranquillement.`,
  },
  german: {
    name: "Deutsch", flag: "🇩🇪",
    desc: "Medium orthography — regular rules but extreme compounding",
    opacity: 0.35,
    defaultText: `Die Grundschullehrerin untersuchte die Rechtschreibfähigkeiten der Schüler mit Entwicklungsdyslexie. Das Bundesverfassungsgericht entschied über die Gleichberechtigung aller Bürger. Die Schmetterlinge flatterten durch den wunderschönen Frühlingsgarten. Wissenschaftliche Untersuchungen zeigen, dass die deutsche Orthographie zwar regelmäßiger ist als die englische, aber zusammengesetzte Wörter besondere Schwierigkeiten bereiten.`,
  },
  finnish: {
    name: "Suomi", flag: "🇫🇮",
    desc: "Shallow orthography — nearly 1:1 grapheme-phoneme mapping",
    opacity: 0.08,
    defaultText: `Tutkijat selvittivät kehityksellisen lukemishäiriön vaikutuksia suomenkielisten lasten oikeinkirjoitustaitoihin. Yliopiston professori luennoi epäsäännöllisistä sanahahmoista. Kaksikielisyys vaikuttaa positiivisesti fonologiseen tietoisuuteen. Suomen kielen ortografia on erittäin säännönmukainen, mikä helpottaa lukemaan oppimista verrattuna syviin ortografioihin.`,
  },
  hindi: {
    name: "हिन्दी", flag: "🇮🇳",
    desc: "Shallow orthography — highly consistent abugida, but complex conjunct consonants",
    opacity: 0.15, // Usually highly regular, so lower opacity
    defaultText: `शोधकर्ताओं ने इस बात का अध्ययन किया कि डिस्लेक्सिया से पीड़ित बच्चे जटिल शब्दों को कैसे पढ़ते हैं। हिंदी की मात्राएँ और संयुक्ताक्षर (आधा अक्षर) कभी-कभी बच्चों के लिए पढ़ना मुश्किल बना देते हैं, हालांकि इसकी वर्णमाला बहुत ही ध्वन्यात्मक (phonetic) होती है।`,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1: RULE-BASED ORTHOGRAPHIC SCORING ENGINE
// Deterministic, instant. Evaluates whole-word G→P consistency.
// ═══════════════════════════════════════════════════════════════════════════════

function estimatePhonemes(w) {
  let c = 0, pv = false;
  for (const ch of w) { const v = "aeiouy".includes(ch); if (v && !pv) c++; pv = v; }
  if (w.endsWith("e") && c > 1) c--;
  return Math.max(1, c);
}

function morphPenalty(w) {
  let p = 0;
  for (const px of ["un","re","pre","dis","mis","over","under","anti","inter","trans","super"])
    if (w.startsWith(px) && w.length > px.length + 3) p += 3;
  for (const sx of ["tion","sion","ment","ness","ible","able","ical","ious","eous","ence","ance","ally","ture","sure"])
    if (w.endsWith(sx)) p += 4;
  return p;
}

// ─── ENGLISH WORD FREQUENCY (COCA-derived tier mapping) ─────────────────────
// Six-tier frequency system: words a reader has seen thousands of times build
// lexical-route familiarity that bypasses decoding difficulty (Harm &
// Seidenberg, 1999). The multiplier is applied to the final score AFTER all
// six orthographic factors have contributed. English only.
//
//   Tier 1 (top ~100)     → ×0.35  ultra-common, fully lexicalized
//   Tier 2 (top ~500)     → ×0.55
//   Tier 3 (top ~2000)    → ×0.75
//   Tier 4 (top ~5000)    → ×0.90
//   Tier 5 (top ~10000)   → ×1.00  neutral band
//   Tier 6 (rare/unknown) → ×1.20  no lexical shortcut

const FREQ_TIER_1 = "the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us".split(" ");

const FREQ_TIER_2 = "is was are were am been being has had having does did doing go went gone going come came coming took taken taking get got getting made making said saying thought thinking found finding gave given giving told telling knew known asked asking felt feeling tried trying called calling wanted wanting seemed looked turned started began become became kept keeping help helped helping talk talked show showed played moved lived believed held brought happen wrote sat stood lost paid met included continued learned changed led understood watched followed stopped created spoke read allowed added spent grew opened walked won offered remembered considered appeared bought waited served died sent expected built stayed fell cut reached killed remained suggested raised passed sold required reported decided pulled returned explained hoped developed carried received agreed recognized closed covered wondered".split(" ").filter(Boolean);

const FREQ_TIER_3 = "able about above across after again against almost alone along already although always among another answer anyone anything anywhere appear around arrive article ask away baby back bad ball bank bar base beat become bed before begin behind believe below best better between beyond big bill black blood blue board body book born both break bring brother build business buy call car care carry case catch cause center certain chance change child children choose church city class clean clear close cold college color come company complete computer concern condition consider contain continue control cost could country couple course court cover create cross cultural cup cut dark data daughter dead deal death decide deep describe design develop die difference different difficult discover discuss do doctor dog door down draw dream drive drop during each early east easy eat edge education effect effort either else end enough enter entire environment especially even evening ever every everybody everyone everything evidence exactly example except exist expect experience explain eye face fact fall family far father fear federal feel few field figure fill film final find fine finger finish fire first fish five floor fly follow food foot force foreign forget form former forward four free friend front full future game garden general girl give glass go goal god gold good government great green ground group grow guess gun hair half hand happen happy hard have he head hear heart heat heavy help her here high himself history hit hold home hope hospital hot hotel house how however human hundred hurt idea if image imagine important include indeed indicate industry information inside instead interest involve issue item itself job join just keep kill kind kitchen know land language large last late later laugh law lay lead least leave left leg legal less let letter level lie life light likely line list listen little live local long look lose love low machine magazine main maintain major make man manage many material matter maybe mean measure media meet member mention method middle might military million mind minute miss mission model modern money month more morning mother mouth move movement movie much music must name nation national natural nature near need network never next nice night none nor north note nothing notice number occur ocean off offer office officer official often oh oil old once only onto open operation opportunity order organization other others our outside own page paint paper parent part participant particular particularly partner party pass past patient pattern pay peace perform perhaps period person personal phone physical pick picture piece place plan plant play player point police policy political politics poor popular population position possible power practice prepare present president pressure pretty prevent price private probably problem process produce product professional program project property protect prove provide public pull purpose push put quality question quickly quiet quite race radio raise range rate rather reach read ready reality really reason receive recent record red reduce region relate relationship religious remain remember remove report represent require research resource respond response rest result return rich right rise risk road rock role room rule run safe same save scene school science sea season seat second section security seek seem sell send sense serious series serve service set several share short shot should shoulder show side sign significant similar simple simply since sing single sister sit site situation size skill skin small smile so social society soldier some somebody someone something sometimes son song soon sort sound source south space speak special specific speech spend sport spring staff stage stand star start state station stay step still stock stop store story strategy street strong structure student study stuff style subject success such sudden suffer suggest summer sun support sure surface system table take talk task teacher teach team technology television tell ten tend term test than thank theory there these thing third those thousand threat three throughout throw thus time tiny today together tomorrow tonight too top total touch toward town trade traditional training travel treat treatment tree trial trip trouble true truth try turn type under understand union unit until upon use usually value various very victim view visit voice vote wait walk wall want war watch water way we weapon wear week weight well west whatever wheel when where whether while white whole whom whose why wide wife will win wind window wish without woman wonder word world would write wrong yard yeah year yes yet young".split(" ");

const FREQ_TIER_4 = "abandon ability absolute abuse academic accept access accident accompany accomplish accordance account accurate accuse achieve acknowledge acquire activity actor actual actually adapt adjust administration admire admit adopt advance advantage adventure advertise advice advise affair affect afford afraid afternoon agency agenda agent aggressive ago agree agreement ahead aid aim alarm album alcohol alert alive allow alternative amazing ambition ancient anger angle angry animal anniversary annual anxiety anxious anybody apartment apologize appeal appearance apple appointment approach appropriate approve arch architect argue argument arise army arrange arrangement arrest arrive aside asleep aspect assault assess asset assign assist assistant associate assume assumption athlete atmosphere attach attack attempt attend attention attitude attorney attract audience author authority auto available average avoid award aware awareness awful background balance bank barely barrier basic basis basket bathroom battery battle bear beautiful beauty bedroom beer behavior belief belong bench benefit beside bicycle bind biology bird birth birthday bite bitter blade blame blank blanket blend bless blind block blow board boat bomb bond bone bonus border bore borrow boss bother bottle bottom boundary bowl boy brain branch brand brave bread break breakfast breath breathe brick bridge brief bright brilliant broad brother brown brush bubble budget buffalo build building bullet bunch burden burn burst bury bush business butter butterfly button cabin cabinet cable calculate calendar calm camera camp campaign cancel cancer candidate candle candy cannon canoe capable capacity capital captain capture career careful cargo carpet cash castle casual cattle caught cave ceiling celebrate cemetery central century ceremony certificate chair chairman challenge champion championship chapter character characteristic charge charity charm chart chase cheap cheat check cheek cheese chef chemical chemistry cherry chest chicken chief circle circuit circumstance citizen civil civilian claim classic classroom clause client climate climb clinic clock closed cloth clothes cloud club coach coal coast coat coffee coin collapse colleague collect collection college colonial colony column combat combination combine comedy comfort command comment commercial commission commit committee common communicate community company compare comparison compete competition complain complete complex complicate component compose composition comprehensive compromise computer concentrate concept concert conclude conclusion concrete condition conduct conference confidence confident confine confirm conflict confront confuse connect connection conscience conscious consensus consent consequence conservative consist constant constitute construct construction consult consume consumer contact contemporary content contest context continent contract contrast contribute contribution control controversy convention convert convince cook cookie cool cooperate cope copy core corner corporate corporation correct correspond cotton couch cough council counsel count counter country county coupon courage course court courtesy cousin cover crack craft crash crawl crazy cream create creative creature credit crew crime criminal crisis criteria critic critical crop cross crowd crucial cruel cruise crush cry cultural culture cup curious current curriculum curtain cushion custom customer cycle damage dance danger dare dark data database date daughter dawn day dead deal dealer dear debate debt decade decide decision declare decline decorate dedicate deep deer defeat defend defense define definitely definition degree delay delicate delight deliver demand democracy democrat demonstrate deny department depend deposit depression depth derive describe description desert deserve design desire desk desperate despite destroy destruction detail detect determine develop development device diagnose diagnosis dialogue diamond diary dictionary diet differ difference different difficult difficulty dig digital dignity diligent dimension dinner diplomat direct direction director dirt disability disagree disappear disappoint disaster discipline disclose discount discourage discover discovery discuss discussion disease dish dismiss display dispute distance distinct distinguish distribute district disturb divide division divorce doctor document domestic dominant dominate donate double doubt downtown dozen draft drag dragon drain drama dramatic draw drawer drawing dream dress drink drive driver drop drug dry duck due dumb dust duty dynamic eager earn earth ease easy economic economy edge edit edition editor educate education effect effective efficiency efficient effort egg eight election electric electricity electronic element elementary elephant elevator eliminate email emerge emergency emission emotion emotional emphasis emphasize empire employ employee employer employment empty enable enact encounter encourage endless endure enemy energy enforce engage engine engineer engineering enhance enjoy enormous enough enrich enter enterprise entertain entertainment entire entirely entry environment envy episode equal equip equipment era errand error escape especially essay essential establish estate estimate ethnic evaluate evening event eventually ever every evidence evil evolve exact exactly examine example exceed excellent except exception exchange excite exciting exclude executive exercise exhaust exhibit exist existence exit expand expansion expect expectation expense expensive experience experiment expert explain explanation explicit explode explore export expose express expression extend extension extensive extent external extra extract extraordinary extreme fabric face facility fact factor factory fail failure fair fairly faith fall false familiar family famous fantastic farm farmer fashion fast fat fate father fault favor favorite fear feature federal fee feed feel feeling fellow female fence festival fiber fiction field fierce fight figure file fill film filter final finally finance financial find fine finger finish fire firm first fish fit fix flag flame flash flat flavor flee flesh flight float flood floor flour flow flower fly focus fog fold folk follow food fool foot football force forecast foreign forest forever forget forgive fork form formal format former forth fortune forum forward fossil foster foundation founder four frame framework frank free freedom freeze frequent frequently fresh friend friendship frighten front frozen fruit frustrate fuel fulfill full fun function fund fundamental funeral funny furniture further future gain galaxy game gang garage garbage garden gas gate gather gene general generally generate generation generous genius genuine geography gesture ghost giant gift girl give glance glass global globe glove glow goal goat god gold golden good goodbye govern government governor grab grace grade gradual graduate grain grand grandfather grandmother grant grass grateful grave gravity gray great green greet grocery ground group grow growth guarantee guard guess guest guide guilty gun guy habit hair half hall hand handle handsome hang happen happy harbor hard hardly harm harsh harvest hat hate head headline health hear heart heat heaven heavy heel height help helpful hen hence herb here heritage hero herself hide high highlight highway hill hint hip hire history hit hold hole holiday hollow holy home homework honest honor hope horizon horror horse hospital host hot hotel hour house household huge human humble humor hunger hungry hunt hurry hurt husband ice idea ideal identify identity ignore ill illegal illness illustrate image imagination imagine immediate immediately immigrant immigration impact implement implication imply import importance important impose impossible impress impression improve improvement incident include including income increase incredible indeed independent index indicate indication indirect individual industrial industry infant infection inflation influence inform information infrastructure ingredient inhabitant inherit initial initiative injury inner innocent inquiry insect insert inside insight insist inspect inspire install instance instead institute institution instruct instruction instructor instrument insurance intellectual intelligence intelligent intend intense intensity intention intercept interest interesting interfere interior internal international internet interpret interpretation interrupt interval intervene interview intimate introduce introduction invasion invent investigation investment invite involve iron irony island isolate issue item itself jacket jail jazz jealous jeans jet jewelry job join joint joke journal journalist journey joy judge judgment juice jump junior jury just justice justify keep key keyboard kick kid kidney kill killer kind king kingdom kiss kitchen knee knife knock knowledge label labor laboratory lack lady lake lamp land landscape lane language lap large last late later laugh launch law lawn lawsuit lawyer lay layer lazy lead leader leadership leaf league lean leap learn least leather leave lecture left leg legacy legal legend legislation legitimate lemon length lens lesson letter level liberal liberty library license lie life lifetime lift light like likely limit line link lion lip liquid list listen literature little live living load loan local locate location lock log logic logical lonely long look loop loose lord lose loss lot loud love lovely lover low loyal luck lucky lunch lung luxury machine magazine magic magnet mail main maintain maintenance major majority make male mall manage management manager manner manufacturer many map march margin mark market marketing marriage marry mask mass massive master match material math matter maximum maybe mayor meal mean meaning meanwhile measure meat mechanism media medical medication medicine medium meet meeting melt member membership memory mental mention menu mere merely merit mess message metal method middle midnight might military milk million mind mine mineral minimum minister minor minority mint minute mirror miss mission mistake mix mixed mobile mode model moderate modern modest modify moment monkey monster month mood moon moral moreover morning mortgage mother motion motivate motor mount mountain mouse mouth move movement movie mud multiple murder muscle museum music musical musician must mutual myself mystery myth nail naked name narrow nasty nation native natural nature navy near nearly neat necessary neck need needle negative neglect negotiate neighbor neighborhood neither nephew nerve nervous network neutral never nevertheless news newspaper next nice niece night nightmare nine nobody noise nominate none noon normal normally north northern nose not note notebook notice notion novel now nowhere nuclear number numerous nurse nut nutrition obey object objective obligation observation observe obstacle obtain obvious obviously occasion occasionally occupation occupy occur ocean odd offense offer office officer official often oil okay old once onion online only onto open opening operation opinion opponent opportunity oppose opposite opposition option orange order ordinary organic organization organize origin original originally other otherwise ought outcome output outside oven overall overcome overlook owe own owner pace pack package page pain paint painter painting pair palace pale pan panel panic paper parade paragraph parent park parking part participate participant particular particularly partner partnership party pass passage passenger passion passive past path patience patient pattern pause pay payment peace peaceful peak peculiar pen penalty people pepper percent perception perfect perform performance perhaps period permanent permission permit person personal personality personnel perspective persuade pet phase phenomenon philosophy phone photograph phrase physical physician piano pick picture piece pig pile pilot pin pine pink pioneer pipe pitch pity place plain plan plane planet plant plastic plate platform play player pleasant please pleasure plenty plot plug plus pocket poem poet poetry point pole police policy polish polite political politics poll pollution pool poor pop popular population porch port portion portrait pose position positive possess possession possibility possible possibly post pot potato potential pound pour poverty powder power powerful practical practice praise pray prayer precede precise precisely predict prefer preference pregnancy pregnant preparation prepare prescribe prescription presence present preserve president press pressure pretty prevent previous previously price pride priest primarily primary prime principal principle print prior priority prison prisoner privacy private prize probably problem procedure proceed process produce producer product production professional professor profile profit profound program progress prohibit project promise promote prompt proof proper properly property proportion proposal propose prosecutor prospect protect protection protein protest proud prove provide province provision provoke psychology public publication publish pull punch punish pure purple purpose pursue push put puzzle qualify quality quantity quarter queen question quick quickly quiet quit quite quote race racial radical radio rail rain raise range rank rapid rapidly rare rarely rate rather rating raw reach react reaction read reader reading ready real reality realize really reason reasonable recall receive recent recently reception recipe recognition recognize recommend recommendation record recover recovery recruit reduce reduction refer reference reflect reflection reform refrigerator refuge refugee refuse regard regarding regardless regime region regional register regret regular regularly regulate regulation reinforce reject relate relation relationship relative relatively relax release relevant relief religion religious reluctant rely remain remark remarkable remedy remember remind remote remove rent repair repeat repeatedly replace reply report reporter represent representative republican reputation request require requirement rescue research reservation reserve resident resign resist resistance resolution resolve resource respect respond response responsibility responsible rest restaurant restore restrict result retain retire retirement return reveal revenue reverse review revolution rhythm rice rich rid ride rider right ring rise risk river road rock role roll romantic roof room root rope rose rough roughly round route routine row royal rub ruin rule ruling run runner rural rush sacred sacrifice sad safe safety sail sake salary sale sales salt sample sand satellite satisfy save saving say scale scan scandal scare scatter scene schedule scheme scholar school science scientific scientist scope score scratch scream screen screw script sea seal search season seat second secondary secret secretary section sector secure security see seed seek seem segment seize select selection self sell senator send senior sense sensitive sentence separate sequence series serious seriously serve service session set setting settle settlement seven several severe sex sexual shade shadow shake shall shallow shame shape share sharp sheet shelf shell shelter shift shine ship shirt shock shoe shoot shop shopping short shortage shot shoulder shout show shut side sidewalk sigh sight sign signal signature significance significant significantly silent silk silver similar similarly simple simply sin since sing singer single sink sister sit site situation six size ski skill skin sky slave sleep slice slide slight slightly slim slip slope slow slowly small smart smell smile smoke smooth snake snow soap social society soft software soil solar soldier sole solid solution solve somebody somehow someone something sometimes somewhat somewhere son song soon sophisticated sorry sort soul sound soup source south southern space speak speaker special specialist species specific specifically specify speech speed spell spend sphere spin spirit spiritual split sponsor sport spot spouse spread spring square squeeze stable staff stage stair stake stand standard star stare start state statement station statue status stay steady steal steel step stick still stir stock stomach stone stop storage store storm story straight strange stranger strategy stream street strength stress stretch strict strike string strip stroke strong strongly structure struggle student studio study stuff stupid style subject submit subsequent subsidy substance substantial substantially substitute subtle suburb succeed success successful successfully such suck sudden suddenly sue suffer sufficient sugar suggest suggestion suicide suit summer summit sun super supermarket supply support supporter suppose supposed sure surely surface surgery surprise surround survey survival survive suspect suspicion sustain swallow swear sweep sweet swell swim swing swipe switch symbol sympathy symptom system table tackle tag tail take tale talent talk tall tank tap tape target task taste tax taxi tea teach teacher teaching team tear teaspoon technical technique technology teen teenager telephone telescope television tell temperature temple temporary tend tendency tension term terms terrible territory terror terrorism terrorist test testify testimony text than thank theater theme then theory therapy there therefore thick thief thin thing think thinking third thirty thought thousand threat threaten three throat through throughout throw thumb thunder thus ticket tide tie tight time timing tiny tip tire tired tissue title tobacco today toe together toilet tolerate tomato tomorrow tone tongue tonight too tool tooth top topic toss total totally touch tough tour tourist tournament toward towel tower town toy trace track trade tradition traditional traffic tragedy trail train training transfer transform transit transition translate transmit transport travel treasure treat treatment treaty tree tremendous trend trial triangle tribal tribe trick trigger trip triumph trouble truck true truly trunk trust truth try tube tune tunnel turkey turn twelve twenty twice twin twist two type typical typically ugly ultimate ultimately unable uncle under undergo understand unfortunately uniform union unique unit unite unity universal university unknown unless unlike unlikely until unusual upon upper upset urban urge use used useful user usual usually utility utilize utterly vacation vaccine vague valley valuable value van vanish variable variation variety various vary vast vegetable vehicle venture venue verbal version versus vertical very vessel veteran via victim victory video view viewer village violate violation violence violent virtual virtually virtue virus visible vision visit visitor visual vital voice volume volunteer vote voter vulnerable wage waist wait wake walk wall wander want war warm warn warning wash waste watch water wave way weak weakness wealth wealthy weapon wear weather wedding weed week weekend weekly weigh weight welcome welfare well west western wet what whatever wheel when whenever where whereas wherever whether which while whisper whistle white who whole wide widely widespread wife wild wilderness wildlife will willing win wind window wine wing winner winter wipe wire wisdom wise wish with withdraw within without witness woman wonder wonderful wood wooden word wording work worker working workout workplace workshop world worried worry worth would wound wrap wrestle write writer writing written wrong yard yeah year yell yellow yes yesterday yet yield young youth zero zone".split(" ");

// Tier 5 = everything NOT in tiers 1-4 but still reasonably recognisable
// (academic + literary vocabulary that an educated reader has seen often
// enough to build some lexical familiarity, even if not hyper-common).
// Anything not listed anywhere falls to tier 6 (rare/unknown).
const FREQ_TIER_5 = "abdomen abide abolish abrasive abruptly abscess absorb abstain abundant academy accelerate accent accessible acclaim accommodate accomplice accord accountant accumulate acid acquaint acre acrobat activate acute adamant addict adhere adjacent adjective administrator admirable adolescent adrenaline adversary advocate aerial aesthetic affiliate affirm affluent agility agitate alleviate alliance allocate alloy almond alongside aloud aluminium amateur ambassador ambiguous ambulance amend amenity amid amiable ammunition amphibian amplify amusement analog analyze anatomy ancestor anchor anecdote angular animate annotate announce annoy antenna anthem anthropologist antibiotic anticipation antique apex apparatus apparent appease applaud appliance applicant apprehend apprentice approximate apron aptitude aqueduct arbitrary arcade archaeology archaic archipelago archive arctic ardent arduous arena arithmetic armor aroma arouse arrogant arson artery artichoke artifact artillery artisan ascend ascent aspen aspiration assassin assemble assert assessment assignment assimilate assorted asthma astonish astronaut astronomy asylum atrocious attic attribute auburn audible audition augment austere authentic autonomous auxiliary avarice avenue aviation avocado awkward axis babble baggage balcony ballerina bamboo bandage banish banister banner baptize barbaric barometer barricade barter basilica basin bayonet bazaar beacon beckon bedrock beehive beetroot belligerent bemoan benevolent benign bequeath besiege betrayal beverage beware bewildered bewitch bicep bigot billionaire biography biopic bipedal birthmark bizarre blacksmith blatant bleach blemish blindfold blister blockade blubber blueprint blunder blurb boggle bohemian bolster bombardment boomerang boorish boulder bouquet boutique brackish brawl breezy brethren bribery brilliance brimstone brink brisk bronze brothel buckle buffoon bulwark bungalow buoy bureaucratic burgeon burglary buttress bygone byline cabaret cactus cadence caliber calligraphy camaraderie camouflage candid canine canteen canvas canyon capricious captivate caramel carburetor caress caricature carnivore carousel cartilage cascade cashier casket casserole catalog catastrophe catering cathedral cauldron caustic cavalry cavern ceasefire cedar cellist cellular censor centenary cerebral cessation chalice chameleon champagne chaotic chaperone charcoal charisma chariot chastise chauffeur cheetah cherub chivalry choreography chrome chronic chunky cinnamon circumvent citadel clandestine clarion classify claustrophobic cleave clergy cliche cliffhanger climactic clique cliquish cloister clogged clone clumsy coalescent coax cobble cobbler cocktail codify coerce cognition cognitive coherence coiffure coincide collage colossal columnist combustion commemorate commence commentary commissary compartment compel compendium competent complacent compliant comply compulsory compunction concede concentric conciliate concise conclave concoct concord concourse concussion condescending condone conduit confection confederate confer confidant configure confiscate confluence conformity confound congenial congest conglomerate congregation conjecture conjure connoisseur conquer consecrate conservatory consign consolation conspicuous conspiracy constable constellation consternation contagious contaminate contemplate contempt contend contentious contingency continuum contraband contraction contralto contrite convalescent convene converge convey convict convoy copious cordial cornerstone corollary coronation corporal corps correlate corroborate corrosion corrugated corsair cortex cosmopolitan cosmos counterfeit countermand coup courier coveted covet cower coyote cranium crease credence crescent crevice cringe crinkle crockery crocodile croissant crouton crucible crusade cryptic cubicle cucumber culminate culprit cumbersome cunning cupola curator curfew curmudgeon curtsy custodian cyberspace cylinder cynic dachshund dainty dairy dalliance dappled daredevil darkroom daunting dawdle dazzle deadlock dearth debacle debonair debris deceit decipher decor decouple decoy decrepit deduce deed defamation default defect defer deficit defile defrost defuse deign deity dejected delegation deliberate delineate delirium delta deluge demean demeanor demote denote denounce denouement dentist depict deplete deposition depot deprecate deprive derelict deride desecrate desiccate desolate despondent destitute detergent detract detrimental devastate devious devote dexterous dialect dialectic diaspora dictator diffidence diffuse dilapidated dilate dilemma diligence dilute dimple discern discordant discreet discrepancy disdain disgruntled dishevel disjointed disparity dispassionate dispel disperse disquiet disrupt dissect dissent dissertation dissident disservice dissimilar dissolve dissuade distill distort distraught diverge diversion dividend doctrine dogma dogmatic doldrums domain dominion donor doodle downfall downpour draconian dregs drench drizzle drudge duct dulcet dungeon duplicate dustbin dutiful dwell dwindle dynasty earthenware earthquake earthshaking eccentric echo eclectic eclipse ecologist ecstasy edict edifice educator eerie effigy effusive egalitarian egregious elated eldritch electorate electrify eligible elixir elocution eloquent elude emaciated embankment embargo embark embellish embezzle emblem embolden embrace embryonic emend eminent emissary emit emollient empathize emporium emulate enamor enchant encompass encroach encumber endearment endemic endorse endow engrave engross engulf enigma enjoin enlighten enmity ennui enrage enrapture enshrine ensign enslave ensnare ensue ensuing enthrall entice entrails entreat enunciate envelop envenom envious ephemeral epic epigram epilogue epiphany epitaph epitome equanimity equestrian equidistant equilateral equilibrium equinox equivocal eradicate erect erratic erroneous erudite escalate eschew esoteric espionage espresso etch eternal ethereal ethics etiquette euphemism euphoria evanescent evict evocative exacerbate exalt excavate excel excerpt exchequer exclaim excoriate excruciating excursion execrable execute exempt exhaust exhilarate exhort exile exonerate exorbitant exorcise expatriate expedient expedite expel expenditure expire exploit exposition expunge exquisite extenuate extinct extol extort extraneous extrapolate extravagant extrovert exuberant fable fabricate facade facetious facilitate faction fallacious fallout falsify famished fanatic fanciful fanfare fastidious fathom fatigue fauna favorable fawn feasible federation feign felicity felony femur ferment fern fervent fetid fetter fiasco fickle fictitious fidelity figurine filament filibuster finesse finite fiord firebrand firefly fireplace fiscal flamboyant flange flask flatulence flaunt fledgling flimsy flinch florid flotilla flounder flourish fluctuate flummox flutter foible foil folly foment foolhardy forage forbear ford foreboding forefather forensic foreshadow forfeit forlorn forsake fortitude forum foster fraction fracture franchise fraudulent frenzy frivolous frolic frontier fruition frustrate fugitive fulcrum fulminate fumble fungus furlough furnace furtive fusillade galaxy galleon gallivant galore gambit gamut gangrene garish garland garnish garrulous gaudy gauge gauntlet gavel gazebo gazelle generic genesis genial genre geography geology germane germinate gesticulate geyser ghastly gherkin gibberish giddy gilded gimlet gimmick girder glacial gladiator glamour glean glee glib glimmer gloaming gloat glossary glower glutinous glutton gnarled gnome goad gondola gorge gorgeous gory gossamer gouge gouty gradation grandeur graphite grapple gratify gratis gratuity gregarious grievance grimace grimy grindstone grisly grotto grotesque grovel gruel gruesome grueling grumpy guffaw guile guillotine gullible gumption gush gusto guttural habitat hacienda haggard haggle hallmark hallowed hallucination halt handcuff handicap haphazard harangue harass harbinger harlequin harmony harridan harrowing harvest hatred haughty haunt haven havoc hazardous headlong hearsay heathen heave hector hedonist heft heinous helm hemisphere henchman heraldic herbaceous hereditary heretic heritage hermetic hermit heterodox hew hexagon hiatus hibernate hideous hieroglyph hilarity hindrance histrionic hitherto hive hoard hoax holistic homage homicide homogenize homonym hone honorarium hoodwink hoopla horde horrendous hospice hover howbeit huckster humane humanitarian humidity humility hummingbird hurtle husky hybrid hydraulic hyperbolic hypnotic hypocrite hypothesis iceberg iconic ideology idiomatic idiosyncrasy idle idol idyll ignoble ignominy ignoramus illegible illicit illuminate illusion imbibe imbue immaculate immerse imminent immobile immutable impair impale impart impartial impasse impassive impeccable impecunious impede impending imperative imperial imperil impertinent imperturbable impervious impetuous implacable implausible implement implicate implore impotent impoverish imprecation impregnable improbable impromptu improvident improvise impudent impugn impunity inadvertent inalienable inanimate inaudible inauspicious incandescent incantation incarcerate incarnation incense incessant inchoate incident incidental incipient incisive incite inclement incognito incompetent incongruous inconsequential inconsiderate inconvenient incorporeal incorrigible increment incredulous incriminate incubate inculcate incumbent indefatigable indelible indemnity indentation indict indifferent indigenous indigent indignant indignity indiscernible indispensable indisputable indolent indubitable induce induction indulge industrious ineffable ineluctable inept inertia inexorable infallible infamy infatuate infect infer infernal infidel infiltrate infinitesimal infirm inflammable inflection influx informant infraction infrared infrequent infringe infuse ingenuous ingest inglorious ingrain ingrate ingratiate inhabit inherent inhibit inimical iniquity initiate inject injunction inkling innocuous innuendo inopportune inordinate inquisition insatiable inscribe inscrutable insignia insinuate insipid insolence insolvent insouciant inspector instigate instill instinct institute instruct insubordinate insufferable insular insurance insurgent insurrection intact intangible integer integrity intellect intellectual intelligible intercede intercept intercession interim interject interlope interlude intermediary intermezzo intermittent intern internecine interpose interrogate intersect interspersed interstellar intimate intimidate intolerable intonation intoxicate intractable intransigent intrepid intricate intrigue intrinsic introspection introvert intrude intuition inundate invalidate invective inveigle inveigh inventory inverse invert investigate inveterate invigorate inviolable invoke iota irascible irate iridescent irk ironic irreducible irrefutable irregular irrelevant irreparable irrepressible irreproachable irresistible irresolute irreverent irrevocable irritable isle isolate itinerant itinerary jabber jackknife jaded jargon jaunt javelin jeopardy jest jettison jiggle jingle jocular join jostle jovial jubilant judicious juggernaut juncture jurisdiction jurisprudence juror juxtapose kaleidoscope keen kernel kettle khaki kiln kilowatt kindred kinetic kinship kiosk knack knave knead kneel knoll kowtow kudos laborious labyrinth laceration lacerate lachrymose lackadaisical lackey laconic lacquer ladle lair lament laminate lampoon landlord languid languish lanky lantern lapidary larceny larder largess lariat larva lascivious lassitude latent lateral lather lattice laudable laureate lava lavish legible legion legislate legume leitmotif lemur leniency lentil leonine lesion lethal lethargic levitate levity lexicon liaison libation libel libertine libidinous libretto lice lichen lifespan ligament ligature likeable liken limber limerick limestone limpid linchpin linden linear linen lineup linger linguist lintel lipstick liquefy lissome literal litigant litigate litter liturgy livid llama loath loathe lobotomy locale locomotion locust lofty logarithm lollygag longevity loquacious lubricate lucid lucrative ludicrous luggage lukewarm lullaby lumbar lumen luminous lurch lurid luscious lustrous lynx macabre machination machismo maelstrom magenta maggot magisterial magnanimous magnate magnify magnolia maiden majestic maladroit malady malaise malediction malevolent malfeasance malice malign malinger malleable mallet malodorous mammoth mandate mandolin manifest manipulate manor manuscript marauder marginalia marigold marionette marital maritime marmalade martial martyr marvel mascot masochist masquerade matador matriarch matriculate maudlin maverick maxim meadow meager meander meanings measly meddle mediator medieval mediocre meditate medley meek mellifluous melodious melodrama membrane memento memorabilia menagerie mendacious mendicant menial meniscus mentor mercantile mercenary mercurial meridian meringue mesmerize metamorphosis metaphor methane meticulous metropolitan mettle miasma microbe microcosm midriff migrate mildew milieu millennium millinery mimic mince mindful minotaur mint minuscule minutiae mirage miraculous mire mirth misadventure misanthrope misapprehend miscellaneous miscreant misdemeanor miser misgiving misnomer mite mitigate mnemonic moat mobility modicum modulate molar mollify molt momentum monarchy monastery monetary monograph monolith monologue monopoly monotone monotonous monsoon monument moribund morose mortify mortuary mosaic mosque mote motif motley motto mottled mourn mumble mundane munificent murky muster mutate mute mutilate mutiny mythical nacelle nadir naive naivete narcissist narrate nascent nascency nausea nautical navigate nebulous nefarious negate nepotism nettle neutral niche nimble nirvana nocturnal nominal nonchalant nondescript nonentity nonpareil nostalgia nostrum notable notary notation noteworthy notoriety nought novice noxious nuance nucleus nugatory nullify numismatic nuptial nurture nutritious oaf oasis obdurate obedient obeisance obelisk obese obfuscate obituary oblate oblation obligatory oblique obliterate oblivious obloquy obnoxious obscure obsequious obsidian obsolete obstinate obstreperous obtrude obtuse obverse occlude octagon oddity ode odious odoriferous offbeat officiate ogle olfactory oligarchy ominous omission omit omnipotent omnipresent omniscient onerous onlooker onslaught ontology opalescent opaque opiate opine opportune oppress opprobrium optimism opulent oration orator orchid ordeal ordination organist orient orifice origin ornate ornery orphan orthodox oscillate osmosis ossify ostensible ostentatious ostracize oust outlandish outpost outrage outskirt overt overture overwhelm ovoid pacify paean pageant palatable palatial paleontology palisade palliative pallid palpable palpitate paltry panacea panache pandemic pandemonium panegyric panorama papal parable paradise paragon parallax parallel paramount parapet paraphernalia paraphrase parasitic parchment pardon parley parliament parochial parody paroxysm parsimonious partake partial partisan passé passable passkey patio patriarch patrician patriot patronize paucity pedagogue pedant pedestrian pedigree peddle pejorative pellucid pendulum penitent pensive peppery perambulate peremptory perennial perfidy perforate perfunctory perimeter peripheral perish perjury perky permeable permute pernicious peroration perpendicular perpetrate perpetual perpetuate perplex perquisite persecute perseverance persist personify perspicacious persuasion pertain perturbation peruse pervade perverse pester pestilence petition petrify petroleum petty petulant phantasm phantom pharaoh pharmacy phase philander philatelic philharmonic philology philosopher phlegmatic phobia phosphate photogenic photon photosphere photovoltaic phrenology phylum physiognomy pianist picayune piebald pied pier pigment pilfer pillage pillar pillory pilot pinnacle pioneer piquant pique piracy pirouette pitfall pithy pittance placate placebo placid plagiarize plaintiff plaintive platitude platonic plaudit plausible plebian plenitude plethora pliable pliant plight plumage plume plummet plunder plurality pneumatic poignant polarity polemic politic polyglot pommel pompous pontificate portend portent portray poseur posit postulate potentate pourable practicable pragmatic prairie prance prattle preamble precarious precedent precept precipice precipitate preclude precocious precursor predatory predecessor predestine predilection predominant preeminent preempt preen prefabricate preface preferential preheat prehistoric prelate preliminary prelude premeditate premise premium premonition preoccupy preordain prerequisite prerogative presage prescient prestige prevail prevaricate priggish primeval primordial pristine prithee privation privilege probity proclivity procrastinate procure prodigal prodigious prodigy profane proffer proficient profligate profusion progenitor progeny prognosticate prohibit proletariat proliferate prolific prolix promenade promontory promulgate prong proofread propagate propensity prophet propitiate propitious proponent propound propriety prosaic proscribe prospectus prosper protagonist protean protégé protocol prototype protract protrude provident provincial provisional proximity prudence prudish prurient pseudonym psyche pugilist pugnacious puissant pulchritude pulpit pulverize punctilious pundit purge purloin purport purvey pusillanimous putative putrefy quack quaff quagmire quail quaint quake qualm quandary quarrel quay queasy quell quench querulous quibble quiescent quince quip quirk quiver quixotic quizzical quotidian rabble raconteur raffish rafter rakish rambunctious ramshackle rampant rancid rancor rant rapacious rapport rapt rapture raucous ravage ravenous raze realm reap rebuff rebuke rebuttal recalcitrant recant recapitulate recede recidivism reciprocate recluse recompense reconcile recondite reconnoiter recount recourse rectify rectitude recumbent recur redolent redoubt redress refractory refrain refuge refulgent refute regal regalia regatta regenerate regimen rehabilitate reiterate rejoinder relegate relent relinquish reliquary remiss remnant remonstrate remorse rend renegade renege renovate renown repartee repast repeal repel repellent repentance repertoire replete replica repose reprehensible repress reprieve reprimand reprisal reproach reprobate reprove repudiate repugnant repulse requisite requite rescind residue resilient resolute resonate respite resplendent restive resurrect resuscitate retaliate retard retention reticent retort retract retribution retroactive retrograde retrospect revel reverberate revere revile revitalize revoke rhapsody rhetoric rhinoceros ribald rickety ricochet rife rigor rigorous rile rimed riposte risible robust rogue rollicking roster rotund rouse rout ruckus rudimentary rue ruffian ruminate rummage rupture ruse rustic ruthless saccharine sacerdotal sacrament sacrilege sacrosanct saffron saga sagacious salient salubrious salutary salvage salvo sanctify sanctimonious sanctity sanguine sanitarium sardonic sartorial sashay satiate satirical saturnine saunter savant savor savvy scabrous scald scalpel scanty scapegoat scathing scavenge schema schism scimitar scintillate scion scoff scorch scornful scour scourge scrabble scribe scribble scruple scrupulous scrutinize scuff scullery sculpt scurry scurrilous sedate sedentary seditious seduce sedulous seethe segue selvage semaphore semblance senile sensational sensuous sentient sentinel sepulchral sequester serendipity serene serpentine serrated serried serum servile shackle shambles shard shatter sheen shill shimmer shingle shiver shoddy shrewd shrill shroud shuffle sibilant sieve simile simmer simper simulate simultaneous sinewy singular sinister siphon sizzle skeptic skirmish skittish slaver sleek sleight slither sloth slovenly slurry smear smelt smirk smitten smolder smother snare sneer snide snippet snitch snivel sojourn solace solder solicit soliloquy solitary soluble somber somnolent soothsayer sophistry soporific sordid sorrel soupcon spangle spartan spat spatial spatula spawn specious specter speculate spendthrift spew spire sporadic spout sprawl sprightly sputter spurious squabble squalid squall squander squelch stagnant staid stalwart stanchion staunch stealth stench stifle stilted stipulate stoic stolid stony stratagem strident stringent strut studious stupefy stupor suave subdue sublime submerge subside subterfuge subtle subvert succinct succor sully sultry summary sumptuous sundry superannuated supercilious superfluous supine supplant supple suppliant supplicate surcease surfeit surge surly surmise surmount surreptitious surrogate susceptible svelte swain swarm swarthy swath swathe sweltering swerve swindle sybarite sycophant syllabus symbiosis symmetric synchronous syncopate syndicate synergy synopsis synthesis tableau tacit taciturn talisman tantamount tantrum tatter taut tautology tawdry teem temerity temperance tempestuous temporal tenable tenacious tendentious tenet tensile tentacle tenuous tepid terminal terrain terrestrial terse tether thaumaturgy thespian thorny thrall thrash threadbare threshold thrifty throng throttle thrust thwart tiara tidings timorous tinder tirade titter toil tome tonsil topography torment torpid torque torrent torrid tortuous totem toxic tractable traduce trajectory tranquil transcend transfix transgress transient transitory translucent transmute transpire travail traverse travesty treacherous treatise tremulous trenchant trepidation tress trestle triad triangular tribulation tribunal tricorn trifling trinket trite trivet troglodyte trope troth trounce trowel truant truculent trudge truism truncate tryst tumultuous tundra turbulent turgid turncoat turpitude twaddle tycoon tyrannical ubiquitous ulcer ultimatum umbrage unanimity unassuming unctuous underscore underwrite undulate unequivocal unerring unfathomable unfettered unfurl uninhibited unkempt unmitigated unobtrusive unprecedented unravel unremitting unscathed unseemly untenable untoward unwieldy unwitting upbraid uproarious upshot urbane usurp usury utopia vacillate vacuous vagary vainglorious valiant valedictory valor vanguard vanquish vapid variegated vassal vaunt vehement venal venerable vengeance venial venison vent veracity verdant verdict verge verify verisimilitude vernal vernacular vertex vertigo verve vestige vex vicarious vicissitude vie vigilant vignette vigor vilify vindicate vindictive virago virulent viscous vitreous vitriolic vituperate vivacious vivisection vociferous vogue voluble voluminous voluptuous voracious vouchsafe waft waive wangle wantonly warrant warrior wary wastrel waver waylay wean weather wend whence wherewithal whet whimsical whittle wield wince winsome wiry wisp wistful withhold wizened woebegone wont wraith wrangle wretched writhe wrought yearn yoke yokel zealot zenith zephyr zest".split(" ");

const ENGLISH_FREQ_MAP = (() => {
  const m = new Map();
  // Assign from least-common tier outward so higher-frequency classifications
  // always win if a word happens to appear in more than one list.
  for (const w of FREQ_TIER_5) m.set(w, 5);
  for (const w of FREQ_TIER_4) m.set(w, 4);
  for (const w of FREQ_TIER_3) m.set(w, 3);
  for (const w of FREQ_TIER_2) m.set(w, 2);
  for (const w of FREQ_TIER_1) m.set(w, 1);
  return m;
})();

const FREQ_MULT = { 1: 0.35, 2: 0.55, 3: 0.75, 4: 0.90, 5: 1.00, 6: 1.20 };
const FREQ_LABEL = {
  1: "Ultra-common word — lexicalized through massive exposure",
  2: "Very common word — strong lexical familiarity",
  3: "Common word — moderate lexical familiarity",
  4: "Moderately common word — mild lexical familiarity",
  5: "Standard vocabulary — neutral frequency",
  6: "Rare word — no lexical shortcut available, must decode from scratch",
};
const freqTier = w => ENGLISH_FREQ_MAP.get(w) ?? 6;

const clamp = s => Math.min(100, Math.max(0, Math.round(s)));
const level = (s, h, m) => s >= h ? "hard" : s >= m ? "moderate" : "simple";

const SCORING = {
  english: {
    cg: ["ough","augh","eigh","tion","sion","cian","tial","cial","ious","eous","ight","ould","ence","ance","ture","sure","tch","dge","kn","wr","gn","pn","ps","ph","gh","wh","ck","qu","th","sh","ch","ng","nk","igh","ew","aw","ow","ou","oi","oy","au","ei","ie","ea","oo","ai","ay","ey","oe","ue","ui"],
    sp: [
      { re: /\bkn/i, l: "silent ⟨k⟩ before ⟨n⟩" }, { re: /\bwr/i, l: "silent ⟨w⟩ before ⟨r⟩" },
      { re: /\bgn\b/i, l: "silent ⟨g⟩" }, { re: /\bpn/i, l: "silent ⟨p⟩ before ⟨n⟩" },
      { re: /\bps/i, l: "silent ⟨p⟩ before ⟨s⟩" }, { re: /mb\b/i, l: "silent ⟨b⟩ after ⟨m⟩" },
      { re: /mn\b/i, l: "silent ⟨n⟩" }, { re: /ght/i, l: "silent ⟨gh⟩" },
      { re: /stl/i, l: "silent ⟨t⟩" }, { re: /lk\b/i, l: "silent ⟨l⟩ before ⟨k⟩" },
      { re: /lm\b/i, l: "silent ⟨l⟩ before ⟨m⟩" },
    ],
    av: { ea: 3, oo: 2, ou: 4, ow: 2, ough: 6, ie: 2, ei: 3, oe: 2 },
    irr: new Set(["colonel","lieutenant","yacht","quay","queue","knight","knife","know","knee","knot","write","wrong","wrist","island","isle","aisle","corps","ballet","depot","subtle","debt","doubt","receipt","indict","salmon","almond","calm","palm","half","calf","talk","walk","chalk","folk","yolk","hour","honour","honest","heir","women","bury","busy","business","minute","ocean","special","ancient","conscience","conscious","science","scissors","muscle","scene","scent","people","leopard","foreign","sovereign","reign","feign","sign","design","paradigm","phlegm","pneumonia","psalm","psychology","pseudonym","rhythm","through","though","thought","thorough","enough","rough","tough","cough","bough","dough","bought","brought","caught","taught","daughter","slaughter","draught","plough","neighbour","beautiful","phenomenon","catastrophe","epitome","hyperbole","decipher","wednesday","february","comfortable","temperature","chocolate","guarantee","guard","guide","build","built","guilt","circuit","biscuit","technique","unique","antique","fatigue","intrigue","resign","assign","align","restaurant","listened","answer","sword","two","who","whom","whole","once","one","eye","said","says","friend","bread","great","break","steak","heart","earth","heard","learn","early","bear","pear","wear","swear","their","weird","height","weight","eight","freight","reign","vein","seize","either","neither","leisure","pleasure","measure","treasure","creature","feature","nature","mature","future","picture","culture","adventure","furniture","literature","architecture","pronunciation","thoroughly","mortgage","cupboard","raspberry"]),
    analyze(word) {
      const w = word.toLowerCase().replace(/[^a-z'-]/g, "");
      if (w.length <= 2) return { score: 0, reasons: [], level: "simple" };
      let score = 0; const reasons = [];
      if (this.irr.has(w)) { score += 28; reasons.push("Irregular word — unpredictable G→P mapping"); }
      let n = 0; const found = []; const seen = new Set();
      for (const g of this.cg) { let i = w.indexOf(g); while (i !== -1) { const k = `${i}:${g}`; if (!seen.has(k)) { seen.add(k); n++; found.push(g); } i = w.indexOf(g, i + 1); } }
      if (n) { score += n * 7; reasons.push(`${n} complex grapheme(s): ${[...new Set(found)].map(g=>`⟨${g}⟩`).join(" ")}`); }
      for (const s of this.sp) if (s.re.test(w)) { score += 14; reasons.push(`Silent letter: ${s.l}`); }
      for (const [vg, ns] of Object.entries(this.av)) if (w.includes(vg)) { score += ns * 3; reasons.push(`Ambiguous vowel ⟨${vg}⟩ — ${ns} possible phonemes`); }
      const r = w.length / Math.max(estimatePhonemes(w), 1);
      if (r > 1.5) { score += (r - 1.5) * 10; reasons.push(`High letter:phoneme ratio (${r.toFixed(1)}:1)`); }
      const m = morphPenalty(w);
      if (m > 0) { score += m; reasons.push("Morphological complexity (affixes altering pronunciation)"); }
      // 7. Word frequency adjustment (English only — global multiplier applied
      // AFTER steps 1-6). Common words get score reduced because repeated
      // exposure builds lexical-route familiarity (Harm & Seidenberg, 1999);
      // rare words get boosted because no lexical shortcut exists.
      let s = clamp(score);
      const t = freqTier(w);
      if (FREQ_MULT[t] !== 1.00) {
        const pre = s;
        s = clamp(s * FREQ_MULT[t]);
        if (s !== pre) reasons.push(`${FREQ_LABEL[t]} (×${FREQ_MULT[t].toFixed(2)})`);
      }
      return { score: s, reasons, level: level(s, 55, 28) };
    },
  },
  french: {
    cg: ["eau","aux","eux","oux","tion","sion","ille","aille","eille","ouille","euil","ueil","oi","ou","ai","ei","au","en","an","in","un","on","gn","ph","ch","qu","gu"],
    se: [/e\b/, /es\b/, /ent\b/, /s\b/, /t\b/, /x\b/, /d\b/, /p\b/],
    ns: ["an","en","in","on","un","ain","ein","ien"],
    analyze(word) {
      const w = word.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüÿçœæ'-]/g, "");
      if (w.length <= 2) return { score: 0, reasons: [], level: "simple" };
      let score = 0; const reasons = [];
      let c = 0; for (const g of this.cg) if (w.includes(g)) c++;
      if (c) { score += c * 6; reasons.push(`${c} complex grapheme(s)`); }
      let s = 0; for (const p of this.se) if (p.test(w)) s++;
      if (s) { score += s * 5; reasons.push("Silent ending letter(s)"); }
      let n = 0; for (const v of this.ns) if (w.includes(v)) n++;
      if (n) { score += n * 4; reasons.push(`${n} nasal vowel(s)`); }
      if (w.length > 10) { score += (w.length - 10) * 2; reasons.push("Long morphologically complex word"); }
      return { score: clamp(score), reasons, level: level(clamp(score), 48, 24) };
    },
  },
  german: {
    cg: ["sch","tsch","ch","ck","pf","ph","qu","sp","st","ei","ie","eu","äu","au"],
    analyze(word) {
      const w = word.toLowerCase().replace(/[^a-zäöüß'-]/g, "");
      if (w.length <= 2) return { score: 0, reasons: [], level: "simple" };
      let score = 0; const reasons = [];
      let c = 0; for (const g of this.cg) { let i = w.indexOf(g); while (i !== -1) { c++; i = w.indexOf(g, i + 1); } }
      if (c) { score += c * 5; reasons.push(`${c} complex grapheme(s)`); }
      if (w.length > 12) { score += Math.floor((w.length - 12) * 2.5); reasons.push("Long compound word (Kompositum)"); }
      return { score: clamp(score), reasons, level: level(clamp(score), 42, 20) };
    },
  },
  finnish: {
    analyze(word) {
      const w = word.toLowerCase().replace(/[^a-zäö'-]/g, "");
      if (w.length <= 2) return { score: 0, reasons: [], level: "simple" };
      let score = 0; const reasons = [];
      if (w.length > 14) { score += (w.length - 14) * 2.5; reasons.push("Long morpheme chain / compound"); }
      const gem = w.match(/(.)\1/g);
      if (gem && gem.length > 1) { score += gem.length * 2; reasons.push("Multiple geminates / long vowels"); }
      for (const g of ["nk","ng","ts"]) if (w.includes(g)) { score += 3; reasons.push(`Cluster ⟨${g}⟩`); }
      return { score: clamp(score), reasons, level: level(clamp(score), 32, 14) };
    },
  },
  hindi: {
    // Devanagari half-letters/conjuncts are formed using the Virama (्) character
    cg: ["क्ष", "त्र", "ज्ञ", "श्र"], // Common complex conjuncts
    sp: [
      { re: /्/i, l: "Conjunct consonant (samyuktakshar)" }, // Detects the invisible joiner for half-letters
      { re: /ृ/i, l: "Vocalic R matra" }
    ],
    av: {},
    irr: new Set([]), // You can add exceptionally tricky Hindi words here
    analyze(word) {
      if (word.length <= 1) return { score: 0, reasons: [], level: "simple" };
      let score = 0; const reasons = [];
      
      let complexFound = false;
      for (const g of this.cg) {
        if (word.includes(g)) { 
          score += 15; 
          reasons.push(`Complex conjunct ⟨${g}⟩`); 
          complexFound = true;
        }
      }
      
      for (const p of this.sp) {
        if (p.re.test(word)) { 
          score += 20; 
          reasons.push(p.l); 
          complexFound = true;
        }
      }

      if (word.length > 8) { 
        score += (word.length - 8) * 3; 
        reasons.push("Long multi-syllable word"); 
      }
      
      if (complexFound && score < 30) score = 30;

      return { score: clamp(score), reasons, level: level(clamp(score), 40, 20) };
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 2: LOCAL PHONETIC + SYNONYM ENGINE (Always Available)
// Comprehensive dictionaries covering common complex words per language.
// These ensure the tool ALWAYS works even fully offline.
// ═══════════════════════════════════════════════════════════════════════════════

const LOCAL_NLP = {
  english: {
    knight: { ph: "NYTE", ipa: "/naɪt/", syn: ["warrior", "rider"], why: "Silent ⟨k⟩ and ⟨gh⟩ — 6 letters map to only 3 phonemes" },
    knew: { ph: "NOO", ipa: "/njuː/", syn: ["was aware of"], why: "Silent ⟨k⟩ before ⟨n⟩ — ⟨kn⟩ is an opaque onset cluster" },
    colonel: { ph: "KUR-nuhl", ipa: "/ˈkɜːrnəl/", syn: ["army leader", "officer"], why: "Extreme irregularity — ⟨colonel⟩ pronounced as 'kernel', borrowed from French/Italian" },
    daughter: { ph: "DAW-tur", ipa: "/ˈdɔːtər/", syn: ["child", "girl"], why: "⟨augh⟩ maps to /ɔː/ — silent ⟨gh⟩ and inconsistent vowel cluster" },
    cough: { ph: "KAWF", ipa: "/kɒf/", syn: ["hack"], why: "⟨ough⟩ maps to /ɒf/ here but has 6+ different pronunciations in English" },
    though: { ph: "THOH", ipa: "/ðoʊ/", syn: ["but", "however"], why: "⟨ough⟩ maps to /oʊ/ — completely different from 'cough', 'through', 'tough'" },
    thought: { ph: "THAWT", ipa: "/θɔːt/", syn: ["believed", "felt"], why: "⟨ough⟩ maps to /ɔː/ — yet another pronunciation of the same grapheme" },
    through: { ph: "THROO", ipa: "/θruː/", syn: ["via", "past"], why: "⟨ough⟩ maps to /uː/ — the 4th distinct phoneme for this grapheme" },
    draught: { ph: "DRAFT", ipa: "/drɑːft/", syn: ["draft", "gust"], why: "⟨augh⟩ maps to /ɑːf/ — highly opaque spelling vs pronunciation" },
    plough: { ph: "PLOW", ipa: "/plaʊ/", syn: ["plow", "till"], why: "⟨ough⟩ maps to /aʊ/ — the 5th distinct pronunciation" },
    ancient: { ph: "AYN-shunt", ipa: "/ˈeɪnʃənt/", syn: ["old", "aged"], why: "⟨ci⟩ maps to /ʃ/ — context-dependent grapheme shift" },
    neighbour: { ph: "NAY-bur", ipa: "/ˈneɪbər/", syn: ["person next door"], why: "⟨eigh⟩ maps to /eɪ/ and ⟨ou⟩ is silent — high opacity" },
    yacht: { ph: "YOT", ipa: "/jɒt/", syn: ["boat", "ship"], why: "⟨ach⟩ is entirely silent — extreme irregularity from Dutch origin" },
    quay: { ph: "KEE", ipa: "/kiː/", syn: ["dock", "pier"], why: "⟨uay⟩ maps to /iː/ — no predictable rule for this mapping" },
    foreign: { ph: "FOR-in", ipa: "/ˈfɒrɪn/", syn: ["from abroad", "alien"], why: "⟨eig⟩ maps to /ɪ/ — irregular vowel and silent ⟨g⟩" },
    psychologists: { ph: "sy-KOL-uh-jists", ipa: "/saɪˈkɒlədʒɪsts/", syn: ["mind experts"], why: "Silent ⟨p⟩ in ⟨psych⟩ — Greek-origin opaque onset" },
    subtle: { ph: "SUT-uhl", ipa: "/ˈsʌtl/", syn: ["slight", "faint"], why: "Silent ⟨b⟩ — no phonetic cue for its presence" },
    phenomenon: { ph: "fuh-NOM-uh-non", ipa: "/fəˈnɒmɪnən/", syn: ["event", "occurrence"], why: "⟨ph⟩→/f/, unstressed vowel reduction, Greek morphology" },
    dyslexia: { ph: "dis-LEK-see-uh", ipa: "/dɪsˈlɛksiə/", syn: ["reading difficulty"], why: "⟨y⟩→/ɪ/, ⟨x⟩→/ks/ — Greek-origin complex mapping" },
    researchers: { ph: "ree-SUR-churz", ipa: "/rɪˈsɜːrtʃərz/", syn: ["experts", "scholars"], why: "⟨ear⟩ maps to /ɜːr/ — different from 'hear', 'bear', 'heart'" },
    measured: { ph: "MEZH-urd", ipa: "/ˈmɛʒərd/", syn: ["tested", "gauged"], why: "⟨eas⟩→/ɛʒ/ — irregular vowel-consonant mapping" },
    participant: { ph: "par-TIS-uh-puhnt", ipa: "/pɑːrˈtɪsɪpənt/", syn: ["person in study", "subject"], why: "Unstressed vowels reduce unpredictably, complex morphology" },
    ability: { ph: "uh-BIL-uh-tee", ipa: "/əˈbɪlɪti/", syn: ["skill", "talent"], why: "Initial schwa, ⟨-ity⟩ suffix shifts stress pattern" },
    decipher: { ph: "dih-SY-fur", ipa: "/dɪˈsaɪfər/", syn: ["decode", "crack"], why: "⟨ci⟩→/saɪ/, ⟨ph⟩→/f/ — two opaque grapheme mappings" },
    ambiguous: { ph: "am-BIG-yoo-us", ipa: "/æmˈbɪɡjuəs/", syn: ["unclear", "vague"], why: "⟨gu⟩→/ɡju/, ⟨ous⟩→/əs/ — Latin morphology obscures pronunciation" },
    orthographic: { ph: "or-thuh-GRAF-ik", ipa: "/ˌɔːrθəˈɡræfɪk/", syn: ["spelling-related"], why: "⟨th⟩→/θ/, ⟨ph⟩→/f/, Greek-origin compound" },
    preliminary: { ph: "prih-LIM-uh-ner-ee", ipa: "/prɪˈlɪmɪnəri/", syn: ["initial", "first"], why: "5 syllables with unstressed vowel reduction throughout" },
    suggested: { ph: "sug-JEST-id", ipa: "/səˈdʒɛstɪd/", syn: ["hinted", "implied"], why: "⟨gg⟩→/ɡdʒ/ — double letter doesn't double the phoneme" },
    individuals: { ph: "in-duh-VIJ-oo-uhlz", ipa: "/ˌɪndɪˈvɪdʒuəlz/", syn: ["persons", "people"], why: "⟨du⟩→/dʒu/ — palatalization not predictable from spelling" },
    developmental: { ph: "dih-vel-up-MEN-tuhl", ipa: "/dɪˌvɛləpˈmɛntəl/", syn: ["growth-related"], why: "Complex suffixation chain changes stress and vowel quality" },
    difficulties: { ph: "DIF-ih-kuhl-teez", ipa: "/ˈdɪfɪkʌltiz/", syn: ["problems", "struggles"], why: "⟨ffi⟩ double consonant, unstressed vowel reduction in '-ulties'" },
    experienced: { ph: "ik-SPEER-ee-unst", ipa: "/ɪkˈspɪəriənst/", syn: ["felt", "went through"], why: "⟨x⟩→/ks/, ⟨ie⟩→/iə/ — multiple opaque mappings" },
    heightened: { ph: "HY-tund", ipa: "/ˈhaɪtənd/", syn: ["increased", "raised"], why: "⟨eigh⟩→/aɪ/ (irregular), silent ⟨gh⟩" },
    interference: { ph: "in-tur-FEER-unts", ipa: "/ˌɪntərˈfɪərəns/", syn: ["disruption", "conflict"], why: "⟨ere⟩→/ɪər/ — ambiguous vowel digraph" },
    encountering: { ph: "en-KOWN-tur-ing", ipa: "/ɪnˈkaʊntərɪŋ/", syn: ["meeting", "facing"], why: "⟨ou⟩→/aʊ/, unstressed syllable reduction" },
    vocabulary: { ph: "voh-KAB-yuh-ler-ee", ipa: "/voʊˈkæbjʊləri/", syn: ["word set", "lexicon"], why: "5 syllables, stress shift, ⟨u⟩→/jʊ/ is context-dependent" },
    particularly: { ph: "par-TIK-yuh-lur-lee", ipa: "/pərˈtɪkjʊlərli/", syn: ["especially", "mainly"], why: "5 syllables with multiple unstressed reductions and ⟨-ularly⟩ cluster" },
    containing: { ph: "kun-TAY-ning", ipa: "/kənˈteɪnɪŋ/", syn: ["holding", "with"], why: "⟨ai⟩→/eɪ/ — inconsistent with 'said', 'again'" },
    irregular: { ph: "ih-REG-yuh-lur", ipa: "/ɪˈrɛɡjʊlər/", syn: ["uneven", "inconsistent"], why: "Double ⟨rr⟩ doesn't double phoneme, ⟨u⟩→/jʊ/ context-dependent" },
    consonant: { ph: "KON-suh-nuhnt", ipa: "/ˈkɒnsənənt/", syn: ["non-vowel sound"], why: "Double ⟨n⟩ with schwa reduction in unstressed syllables" },
    silent: { ph: "SY-lunt", ipa: "/ˈsaɪlənt/", syn: ["quiet", "mute"], why: "⟨i⟩→/aɪ/ in open syllable — rule that has many exceptions" },
    clusters: { ph: "KLUS-turz", ipa: "/ˈklʌstərz/", syn: ["groups", "bunches"], why: "⟨cl⟩ onset cluster, unstressed ⟨er⟩→/ər/" },
    opaque: { ph: "oh-PAYK", ipa: "/oʊˈpeɪk/", syn: ["unclear", "non-transparent"], why: "⟨que⟩→/k/ — French-origin silent ending" },
    graphemically: { ph: "gruh-FEE-mik-lee", ipa: "/ɡræˈfiːmɪkli/", syn: ["in spelling terms"], why: "⟨ph⟩→/f/, technical compound with Greek roots" },
    digraphs: { ph: "DY-grafs", ipa: "/ˈdaɪɡrɑːfs/", syn: ["letter pairs"], why: "⟨ph⟩→/f/, ⟨i⟩→/aɪ/ — technical term with Greek morphology" },
    results: { ph: "rih-ZULTS", ipa: "/rɪˈzʌlts/", syn: ["findings", "outcomes"], why: "⟨s⟩→/z/ between vowels — voicing rule not obvious from spelling" },
    beautiful: { ph: "BYOO-tuh-fuhl", ipa: "/ˈbjuːtɪfəl/", syn: ["lovely", "pretty"], why: "⟨eau⟩→/juː/ — French-origin trigraph in English" },
    attention: { ph: "uh-TEN-shun", ipa: "/əˈtɛnʃən/", syn: ["focus", "awareness"], why: "⟨tion⟩→/ʃən/ — extremely common but completely opaque mapping" },
    because: { ph: "bih-KAWZ", ipa: "/bɪˈkɒz/", syn: ["since", "as"], why: "⟨au⟩→/ɒ/, ⟨se⟩→/z/ — multiple irregular mappings" },
    enough: { ph: "ih-NUF", ipa: "/ɪˈnʌf/", syn: ["plenty", "sufficient"], why: "⟨ough⟩→/ʌf/ — yet another pronunciation variant" },
    people: { ph: "PEE-puhl", ipa: "/ˈpiːpəl/", syn: ["folks", "persons"], why: "⟨eo⟩→/iː/ — completely unpredictable from spelling" },
    science: { ph: "SY-unts", ipa: "/ˈsaɪəns/", syn: ["study", "field"], why: "⟨sc⟩→/s/, ⟨ie⟩→/aɪə/ — multiple opaque mappings" },
    ocean: { ph: "OH-shun", ipa: "/ˈoʊʃən/", syn: ["sea"], why: "⟨ce⟩→/ʃ/ — context-dependent palatalization" },
    technique: { ph: "tek-NEEK", ipa: "/tɛkˈniːk/", syn: ["method", "approach"], why: "⟨ch⟩→/k/, ⟨que⟩→/k/ — French-origin double opacity" },
    rhythm: { ph: "RITH-uhm", ipa: "/ˈrɪðəm/", syn: ["beat", "tempo"], why: "No standard vowel letter — ⟨y⟩→/ɪ/, ⟨th⟩→/ð/" },
    muscle: { ph: "MUS-uhl", ipa: "/ˈmʌsəl/", syn: ["tissue", "flesh"], why: "Silent ⟨c⟩ — no phonetic cue for its presence" },
    island: { ph: "EYE-lund", ipa: "/ˈaɪlənd/", syn: ["isle", "land mass"], why: "Silent ⟨s⟩ — added by false etymology" },
    receipt: { ph: "rih-SEET", ipa: "/rɪˈsiːt/", syn: ["proof of purchase"], why: "Silent ⟨p⟩ — Latin-origin silent consonant" },
    salmon: { ph: "SAM-un", ipa: "/ˈsæmən/", syn: ["pink fish"], why: "Silent ⟨l⟩ — no phonetic justification" },
    women: { ph: "WIM-in", ipa: "/ˈwɪmɪn/", syn: ["females", "ladies"], why: "⟨o⟩→/ɪ/ — one of the most irregular common English words" },
    would: { ph: "WOOD", ipa: "/wʊd/", syn: ["was going to"], why: "Silent ⟨l⟩ — historical remnant with no modern phonetic value" },
    should: { ph: "SHOOD", ipa: "/ʃʊd/", syn: ["ought to"], why: "Silent ⟨l⟩, ⟨ou⟩→/ʊ/ — irregular high-frequency word" },
    walk: { ph: "WAWK", ipa: "/wɔːk/", syn: ["stroll", "go on foot"], why: "Silent ⟨l⟩ before ⟨k⟩" },
    talk: { ph: "TAWK", ipa: "/tɔːk/", syn: ["speak", "chat"], why: "Silent ⟨l⟩ before ⟨k⟩" },
    listen: { ph: "LIS-un", ipa: "/ˈlɪsən/", syn: ["hear", "pay attention"], why: "Silent ⟨t⟩ — no phonetic trace in pronunciation" },
    honest: { ph: "ON-ist", ipa: "/ˈɒnɪst/", syn: ["truthful", "frank"], why: "Silent ⟨h⟩ — French-origin initial silent consonant" },
    hour: { ph: "OW-ur", ipa: "/ˈaʊər/", syn: ["60 minutes"], why: "Silent ⟨h⟩, ⟨ou⟩→/aʊ/" },
    debt: { ph: "DET", ipa: "/dɛt/", syn: ["amount owed"], why: "Silent ⟨b⟩ — added by Latinist scribes" },
    doubt: { ph: "DOWT", ipa: "/daʊt/", syn: ["question", "mistrust"], why: "Silent ⟨b⟩ — same Latinist insertion" },
    answer: { ph: "AN-sur", ipa: "/ˈɑːnsər/", syn: ["reply", "response"], why: "Silent ⟨w⟩ — historical loss not reflected in spelling" },
    sword: { ph: "SORD", ipa: "/sɔːrd/", syn: ["blade", "weapon"], why: "Silent ⟨w⟩ — ⟨sw⟩ onset normally pronounced but not here" },
    guarantee: { ph: "gar-un-TEE", ipa: "/ˌɡærənˈtiː/", syn: ["promise", "pledge"], why: "⟨gu⟩→/ɡ/ silent ⟨u⟩, unusual stress pattern" },
    pronunciation: { ph: "pruh-NUN-see-AY-shun", ipa: "/prəˌnʌnsiˈeɪʃən/", syn: ["way of saying"], why: "Note: spelled differently from 'pronounce' — a notorious trap" },
    mortgage: { ph: "MOR-gij", ipa: "/ˈmɔːrɡɪdʒ/", syn: ["home loan"], why: "Silent ⟨t⟩, ⟨age⟩→/ɪdʒ/ — French-origin opacity" },
    cupboard: { ph: "KUB-urd", ipa: "/ˈkʌbərd/", syn: ["cabinet", "shelf"], why: "⟨p⟩ is silent, ⟨board⟩→/bərd/ — extreme compression" },
    raspberry: { ph: "RAZ-ber-ee", ipa: "/ˈræzbəri/", syn: ["red berry"], why: "Silent ⟨p⟩ — no phonetic trace" },
    studying: { ph: "STUD-ee-ing", ipa: "/ˈstʌdiɪŋ/", syn: ["examining", "learning"], why: "⟨y⟩→/i/ in suffix position — rule varies by word" },
    moored: { ph: "MOORD", ipa: "/mʊərd/", syn: ["tied up", "docked"], why: "⟨oo⟩→/ʊə/ — different from 'moon' or 'good'" },
    thoroughly: { ph: "THUR-oh-lee", ipa: "/ˈθʌrəli/", syn: ["completely", "fully"], why: "⟨ough⟩→/ʌr/ — unique pronunciation variant, silent ⟨gh⟩" },
    where: { ph: "WAIR", ipa: "/wɛər/", syn: ["at which place"], why: "⟨wh⟩→/w/ (⟨h⟩ silent), ⟨ere⟩→/ɛər/ — inconsistent with 'here', 'were'" },
  },
  french: {
    oiseaux: { ph: "wa-ZOH", ipa: "/wa.zo/", syn: ["volatiles"], why: "Only 2 of 7 letters produce their 'expected' sound — most opaque French word" },
    consciencieux: { ph: "kon-see-on-SYUH", ipa: "/kɔ̃.sjɑ̃.sjø/", syn: ["soigneux", "attentif"], why: "Two nasal vowels, ⟨sc⟩→/s/, ⟨ti⟩→/sj/, ⟨eux⟩→/ø/" },
    pharmacien: { ph: "far-ma-SYEN", ipa: "/faʁ.ma.sjɛ̃/", syn: ["vendeur de remèdes"], why: "⟨ph⟩→/f/, ⟨ci⟩→/sj/, nasal ⟨en⟩→/ɛ̃/" },
    rhumatismes: { ph: "roo-ma-TEEZM", ipa: "/ʁy.ma.tism/", syn: ["douleurs articulaires"], why: "Silent ⟨h⟩, ⟨u⟩→/y/, ⟨es⟩ silent ending" },
    châtaigniers: { ph: "sha-ten-YAY", ipa: "/ʃɑ.tɛ.ɲje/", syn: ["grands arbres à fruits"], why: "⟨ch⟩→/ʃ/, ⟨â⟩→/ɑ/, ⟨ign⟩→/ɲ/, silent ⟨s⟩" },
    particulièrement: { ph: "par-tee-koo-lyehr-MON", ipa: "/paʁ.ti.ky.ljɛʁ.mɑ̃/", syn: ["surtout", "très"], why: "6 syllables, nasal ⟨en⟩→/ɑ̃/, silent ⟨t⟩" },
    imprévisibles: { ph: "an-pray-vee-ZEEBL", ipa: "/ɛ̃.pʁe.vi.zibl/", syn: ["pas attendus"], why: "Nasal ⟨im⟩→/ɛ̃/, ⟨s⟩→/z/ between vowels, silent ⟨es⟩" },
    sculpteur: { ph: "skool-TUHR", ipa: "/skyl.tœʁ/", syn: ["artiste"], why: "Silent ⟨l⟩ in ⟨sculp⟩, ⟨eu⟩→/œ/" },
    tranquillement: { ph: "tron-keel-MON", ipa: "/tʁɑ̃.kil.mɑ̃/", syn: ["calmement", "en paix"], why: "Nasal ⟨an⟩→/ɑ̃/, ⟨ill⟩→/il/ (exception to /j/ rule), silent ⟨ent⟩" },
    orthographe: { ph: "or-to-GRAF", ipa: "/ɔʁ.tɔ.ɡʁaf/", syn: ["écriture correcte"], why: "⟨ph⟩→/f/, ⟨e⟩ muet final" },
    graphèmes: { ph: "gra-FEM", ipa: "/ɡʁa.fɛm/", syn: ["unités de lettres"], why: "⟨ph⟩→/f/, accent grave changes vowel quality" },
    dyslexiques: { ph: "dees-lek-SEEK", ipa: "/dis.lɛk.sik/", syn: ["en difficulté de lecture"], why: "⟨y⟩→/i/, ⟨x⟩→/ks/, silent ⟨es⟩ ending" },
    médicament: { ph: "may-dee-ka-MON", ipa: "/me.di.ka.mɑ̃/", syn: ["remède", "pilule"], why: "Nasal ⟨ent⟩→/ɑ̃/ — silent final consonants" },
    beaucoup: { ph: "boh-KOO", ipa: "/bo.ku/", syn: ["très", "plein de"], why: "⟨eau⟩→/o/, ⟨ou⟩→/u/, silent ⟨p⟩" },
    chercheurs: { ph: "shehr-SHUHR", ipa: "/ʃɛʁ.ʃœʁ/", syn: ["experts", "savants"], why: "⟨ch⟩→/ʃ/ (twice), ⟨eu⟩→/œ/, silent ⟨s⟩" },
    lettres: { ph: "LET-ruh", ipa: "/lɛtʁ/", syn: ["caractères"], why: "Double ⟨tt⟩ but single phoneme, silent ⟨es⟩" },
    muettes: { ph: "moo-ET", ipa: "/mɥɛt/", syn: ["sans son"], why: "⟨ue⟩→/ɥɛ/ — semi-vowel not obvious from spelling" },
    liaisons: { ph: "lee-ay-ZON", ipa: "/ljɛ.zɔ̃/", syn: ["liens sonores"], why: "⟨ai⟩→/ɛ/, nasal ⟨on⟩→/ɔ̃/, ⟨s⟩→/z/" },
    examiné: { ph: "eg-za-mee-NAY", ipa: "/ɛɡ.za.mi.ne/", syn: ["étudié", "regardé"], why: "⟨x⟩→/ɡz/, accent changes vowel" },
    souffrant: { ph: "soo-FRON", ipa: "/su.fʁɑ̃/", syn: ["en douleur"], why: "⟨ou⟩→/u/, double ⟨ff⟩, nasal ⟨an⟩→/ɑ̃/, silent ⟨t⟩" },
    chantaient: { ph: "shon-TAY", ipa: "/ʃɑ̃.tɛ/", syn: ["faisaient du son"], why: "⟨ch⟩→/ʃ/, nasal ⟨an⟩→/ɑ̃/, ⟨aient⟩→/ɛ/ — 5 silent letters at the end" },
    travaillait: { ph: "tra-va-YAY", ipa: "/tʁa.va.jɛ/", syn: ["faisait son art"], why: "⟨ail⟩→/aj/, ⟨ait⟩→/ɛ/ — silent final consonants" },
    française: { ph: "fron-SEZ", ipa: "/fʁɑ̃.sɛz/", syn: ["de France"], why: "Nasal ⟨an⟩→/ɑ̃/, ⟨ç⟩→/s/, ⟨ai⟩→/ɛ/" },
    contenant: { ph: "kon-tuh-NON", ipa: "/kɔ̃.tə.nɑ̃/", syn: ["avec", "qui a"], why: "Two nasal vowels, silent ⟨t⟩ ending" },
    pendant: { ph: "pon-DON", ipa: "/pɑ̃.dɑ̃/", syn: ["lors de", "durant"], why: "Two nasal vowels ⟨en⟩→/ɑ̃/ and ⟨an⟩→/ɑ̃/, silent ⟨t⟩" },
    patient: { ph: "pa-SYON", ipa: "/pa.sjɑ̃/", syn: ["malade"], why: "⟨ti⟩→/sj/ before vowel, nasal ⟨en⟩→/ɑ̃/, silent ⟨t⟩" },
    enfants: { ph: "on-FON", ipa: "/ɑ̃.fɑ̃/", syn: ["petits", "jeunes"], why: "Two nasal vowels, silent ⟨ts⟩ ending" },
    difficile: { ph: "dee-fee-SEEL", ipa: "/di.fi.sil/", syn: ["dur", "ardu"], why: "Double ⟨ff⟩, ⟨c⟩→/s/ before ⟨i⟩, silent ⟨e⟩" },
  },
  german: {
    gleichberechtigung: { ph: "GLYSH-buh-resh-tih-goong", ipa: "/ˈɡlaɪ̯çbəˌʁɛçtɪɡʊŋ/", syn: ["gleiche Rechte"], why: "Compound of 3 morphemes, ⟨ch⟩→/ç/, ⟨ei⟩→/aɪ/, ⟨ung⟩ suffix" },
    bundesverfassungsgericht: { ph: "BOON-des-fer-fass-oongs-guh-risht", ipa: "/ˈbʊndɛsfɛɐ̯ˌfasʊŋsɡəˌʁɪçt/", syn: ["höchstes Gericht"], why: "5-morpheme compound — longest common German compound with 25 letters" },
    schmetterlinge: { ph: "SHMET-er-ling-uh", ipa: "/ˈʃmɛtɐlɪŋə/", syn: ["Falter"], why: "⟨sch⟩→/ʃ/, ⟨tt⟩ geminate, ⟨ng⟩→/ŋ/" },
    wissenschaftliche: { ph: "VIS-en-shaft-lish-uh", ipa: "/ˈvɪsənʃaftlɪçə/", syn: ["aus der Forschung"], why: "⟨w⟩→/v/, ⟨sch⟩→/ʃ/, ⟨ch⟩→/ç/ — compound adjective" },
    rechtschreibfähigkeiten: { ph: "RESHT-shryb-fay-ish-ky-ten", ipa: "/ˈʁɛçtʃʁaɪ̯pˌfɛːɪçkaɪ̯tən/", syn: ["Können im Schreiben"], why: "4-morpheme compound, ⟨tsch⟩→/tʃ/, ⟨ei⟩→/aɪ/, ⟨ä⟩→/ɛː/" },
    entwicklungsdyslexie: { ph: "ent-VIK-loongs-düs-lek-SEE", ipa: "/ɛntˈvɪklʊŋsdʏsˌlɛksiː/", syn: ["Lese-Störung"], why: "German-Greek compound, ⟨w⟩→/v/, ⟨ung⟩→/ʊŋ/, ⟨y⟩→/ʏ/" },
    zusammengesetzte: { ph: "tsoo-ZAM-en-guh-zetst-uh", ipa: "/t͡suˈzamənɡəˌzɛt͡stə/", syn: ["aus Teilen gebildete"], why: "⟨z⟩→/ts/, separable prefix compound, ⟨tz⟩→/ts/" },
    schwierigkeiten: { ph: "SHVEE-rish-ky-ten", ipa: "/ˈʃviːʁɪçkaɪ̯tən/", syn: ["Probleme", "Hürden"], why: "⟨schw⟩→/ʃv/, ⟨ie⟩→/iː/, ⟨ch⟩→/ç/, ⟨ei⟩→/aɪ/" },
    untersuchungen: { ph: "OON-ter-zoo-khoong-en", ipa: "/ˈʊntɐˌzuːxʊŋən/", syn: ["Studien", "Tests"], why: "⟨ch⟩→/x/ after ⟨u⟩, ⟨ung⟩→/ʊŋ/ suffix" },
    grundschullehrerin: { ph: "GROOND-shool-lay-reh-rin", ipa: "/ˈɡʁʊntʃuːlˌleːʁəʁɪn/", syn: ["Lehrerin"], why: "4-morpheme compound, ⟨sch⟩→/ʃ/ inside compound boundary" },
    orthographie: { ph: "or-to-gra-FEE", ipa: "/ɔʁtoɡʁaˈfiː/", syn: ["Schreibweise", "Rechtschreibung"], why: "⟨ph⟩→/f/, Greek loanword with German stress" },
    regelmäßiger: { ph: "RAY-gel-may-sig-er", ipa: "/ˈʁeːɡəlˌmɛːsɪɡɐ/", syn: ["mit mehr Regeln"], why: "⟨ä⟩→/ɛː/, ⟨ß⟩→/s/, comparative suffix alters word" },
    wunderschönen: { ph: "VOON-der-shuh-nen", ipa: "/ˈvʊndɐˌʃøːnən/", syn: ["sehr schönen"], why: "⟨w⟩→/v/, ⟨sch⟩→/ʃ/, ⟨ö⟩→/øː/ — umlaut" },
    frühlingsgarten: { ph: "FROO-lings-gar-ten", ipa: "/ˈfʁyːlɪŋsˌɡaʁtən/", syn: ["Garten im Frühling"], why: "⟨ü⟩→/yː/, linking ⟨s⟩, compound boundary" },
    besondere: { ph: "beh-ZON-deh-reh", ipa: "/bəˈzɔndəʁə/", syn: ["extra", "spezielle"], why: "Schwa in unstressed syllables, ⟨s⟩→/z/ intervocalic" },
    entschied: { ph: "ent-SHEED", ipa: "/ɛntˈʃiːt/", syn: ["bestimmte"], why: "⟨tsch⟩→/tʃ/, ⟨ie⟩→/iː/, prefix-stem boundary" },
    flatterten: { ph: "FLAT-er-ten", ipa: "/ˈflatɐtən/", syn: ["flogen umher"], why: "⟨tt⟩ geminate, unstressed syllable reduction" },
    bürger: { ph: "BOOR-ger", ipa: "/ˈbʏʁɡɐ/", syn: ["Einwohner"], why: "⟨ü⟩→/ʏ/ — front rounded vowel unique to German" },
    schüler: { ph: "SHOO-ler", ipa: "/ˈʃyːlɐ/", syn: ["Lernende"], why: "⟨sch⟩→/ʃ/, ⟨ü⟩→/yː/" },
  },
  finnish: {
    lukemishäiriön: { ph: "LOO-ke-mis-hai-ree-uhn", ipa: "/ˈlukemishæiɾiøn/", syn: ["lukihäiriön"], why: "Long compound of 3 morphemes with front vowel harmony — length is the main barrier" },
    oikeinkirjoitustaitoihin: { ph: "OY-kein-kir-yoy-tus-tai-toy-hin", ipa: "/ˈoi̯kei̯nˌkirjoi̯tusˌtɑi̯toi̯hin/", syn: ["kirjoitustaitoihin"], why: "24-letter compound — G→P is regular but morpheme boundaries are unmarked" },
    epäsäännöllisistä: { ph: "E-pa-saan-nuhl-li-sis-ta", ipa: "/ˈepæˌsæːnːølːisistæ/", syn: ["poikkeavista"], why: "Multiple geminates and front vowel harmony — long morpheme chain" },
    kaksikielisyys: { ph: "KAK-si-kie-li-syys", ipa: "/ˈkɑksiˌkielisyːs/", syn: ["kaksi kieltä puhuen"], why: "Compound with long vowel ⟨yy⟩ — regular but long" },
    fonologiseen: { ph: "FO-no-lo-gi-seen", ipa: "/ˈfonoloɡiseːn/", syn: ["äännetason"], why: "Loanword with long vowel ⟨ee⟩ — transparent but unfamiliar morphology" },
    säännönmukainen: { ph: "SAAN-nuhn-moo-kai-nen", ipa: "/ˈsæːnːønˌmukɑi̯nen/", syn: ["selkeä", "tasainen"], why: "Compound with geminate ⟨nn⟩ and diphthong — regular but complex structure" },
    kehityksellisen: { ph: "KE-hi-tyk-sel-li-sen", ipa: "/ˈkehitykselːisen/", syn: ["kasvuun liittyvän"], why: "Derivational suffixes stack — ⟨-ks-ell-ise-n⟩" },
    selvittivät: { ph: "SEL-vit-ti-vat", ipa: "/ˈselvitːivæt/", syn: ["tutkivat"], why: "Geminate ⟨tt⟩, past tense morphology" },
    vaikutuksia: { ph: "VAI-ku-tuk-si-a", ipa: "/ˈvɑi̯kutuksiɑ/", syn: ["seurauksia"], why: "Partitive plural with multiple suffixes" },
    suomenkielisten: { ph: "SUO-men-kie-lis-ten", ipa: "/ˈsuomenkielisten/", syn: ["suomea puhuvien"], why: "Compound genitive plural — transparent but morphologically dense" },
    yliopiston: { ph: "Y-li-o-pis-ton", ipa: "/ˈyliˌopiston/", syn: ["korkeakoulun"], why: "⟨y⟩→/y/ front rounded vowel, compound structure" },
    professori: { ph: "PRO-fes-so-ri", ipa: "/ˈprofesːori/", syn: ["opettaja"], why: "Loanword with geminate ⟨ss⟩ — adapted Finnish phonology" },
    tietoisuuteen: { ph: "TIE-toi-suu-teen", ipa: "/ˈtietoi̯suːteːn/", syn: ["tajuntaan"], why: "Multiple long vowels ⟨uu⟩ ⟨ee⟩ — regular but lengthy derivation" },
    positiivisesti: { ph: "PO-si-tii-vi-ses-ti", ipa: "/ˈpositiːvisesti/", syn: ["hyvällä tavalla"], why: "Long vowel ⟨ii⟩, adverb suffix chain" },
    ortografia: { ph: "OR-to-gra-fi-a", ipa: "/ˈortoɡrɑfiɑ/", syn: ["kirjoitustapa"], why: "Greek loanword adapted to Finnish vowel harmony" },
    verrattuna: { ph: "VER-rat-tu-na", ipa: "/ˈverːɑtːunɑ/", syn: ["rinnastettuna"], why: "Two geminates ⟨rr⟩ ⟨tt⟩ — phonemically distinct length" },
    helpottaa: { ph: "HEL-pot-taa", ipa: "/ˈhelpotːɑː/", syn: ["tekee helpommaksi"], why: "Geminate ⟨tt⟩ and long vowel ⟨aa⟩ — both phonemic" },
  },
  hindi: {
    "डिस्लेक्सिया": { 
      ph: "dis-LEK-see-ya", 
      ipa: "/d̪ɪsˈlɛk.si.ja/", 
      syn: ["पठन विकार"], 
      why: "Contains half-s (स्) and half-k (क्) conjuncts." 
    },
    "अध्ययन": { 
      ph: "adh-YU-yan", 
      ipa: "/ə.d̪ʱjəˈjən/", 
      syn: ["पढ़ाई"], 
      why: "Contains half-dh (ध्) conjunct." 
    },
    "शोधकर्ताओं": { 
      ph: "shodh-kur-TAA-on", 
      ipa: "/ʃoːd̪ʱ.kəɾˈt̪ɑː.õː/", 
      syn: ["वैज्ञानिकों"], 
      why: "Contains half-r (र्) over top of ta." 
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 3: GEMINI API (Enhanced NLP — contextual, any word)
// Falls back gracefully to Layer 2 if unavailable
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchNLPFromAPI(words, fullText, language, signal) {
  const langName = LANGUAGES[language].name;
  const wordList = words.map(w => w.text).join(", ");
  const prompt = `You are a computational linguistics engine specializing in orthographic analysis for dyslexia research. Analyze these words IN CONTEXT of the passage.

LANGUAGE: ${langName}
PASSAGE: "${fullText}"
WORDS: [${wordList}]

For EACH word provide:
1. "ph": Phonetic respelling (Merriam-Webster/Oxford style, CAPS for stress, hyphens between syllables)
2. "ipa": IPA transcription
3. "syn": 1-2 orthographically SIMPLER synonyms that preserve meaning IN THIS SPECIFIC CONTEXT. Choose words with more transparent spelling. Empty array if none exist.
4. "why": One sentence: what specific grapheme-phoneme inconsistencies make this word hard for dyslexic readers.

Return ONLY a JSON object. No markdown, no backticks, no preamble.
Format: {"wordone": {"ph":"...","ipa":"...","syn":["..."],"why":"..."}, "wordtwo": {...}}
Lowercase keys.`;

  const keys = [
    import.meta.env.VITE_GEMINI_API_KEY,
    import.meta.env.VITE_GEMINI_API_KEY_FALLBACK
  ].filter(Boolean);

  let res, lastErr;
  for (const apiKey of keys) {
    try {
      res = await fetch(`/api/gemini/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: "You are a precise linguistics engine. Return ONLY valid JSON. No markdown fences. No text outside JSON." }]
          },
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        }),
      });

      if (res.ok) break;
      lastErr = new Error(`API ${res.status}`);
    } catch (e) {
      if (e.name === "AbortError") throw e;
      lastErr = e;
    }
  }

  if (!res || !res.ok) throw lastErr || new Error("All API keys failed");
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL ANALYSIS PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

function tokenize(text) {
  return text.split(/(\s+|(?=[.,;:!?"""''()\[\]{}—–\-])|(?<=[.,;:!?"""''()\[\]{}—–\-]))/).filter(Boolean);
}
function isWordToken(t) { return /[a-zA-ZàâäéèêëïîôùûüÿçœæäöüßÄÖÜ\u0900-\u097F]{2,}/.test(t); }

function runScoring(text, language) {
  const engine = SCORING[language];
  const tokens = tokenize(text);
  const words = [];
  let total = 0, wc = 0, h = 0, m = 0, s = 0;

  for (const tok of tokens) {
    if (!isWordToken(tok)) {
      words.push({ text: tok, type: "p", score: 0, level: "p", reasons: [] });
      continue;
    }
    const clean = tok.replace(/[^a-zA-ZàâäéèêëïîôùûüÿçœæäöüßÄÖÜ\u0900-\u097F'-]/g, "");
    const res = engine.analyze(clean);
    words.push({ text: tok, clean, lower: clean.toLowerCase(), type: "w", ...res, nlp: null });
    total += res.score; wc++;
    if (res.level === "hard") h++;
    else if (res.level === "moderate") m++;
    else s++;
  }

  const avg = wc > 0 ? total / wc : 0;
  const overall = clamp(avg * (1 + LANGUAGES[language].opacity * 0.5));
  return { words, overall, stats: { total: wc, hard: h, moderate: m, simple: s, hardPct: wc ? (h/wc*100).toFixed(1) : "0", avg: avg.toFixed(1) } };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REACT APPLICATION
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [lang, setLang] = useState("english");
  const [input, setInput] = useState(LANGUAGES.english.defaultText);
  const [analysis, setAnalysis] = useState(null);
  const [nlpData, setNlpData] = useState({});
  const [loading, setLoading] = useState(false);
  const [nlpStatus, setNlpStatus] = useState("idle"); // idle | loading | done | fallback | error
  const [nlpMsg, setNlpMsg] = useState("");
  const [hovered, setHovered] = useState(null);
  const [tPos, setTPos] = useState({ x: 0, y: 0 });
  const [showList, setShowList] = useState(false);
  const abortRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const l = document.createElement("link"); l.href = FONTS_URL; l.rel = "stylesheet"; document.head.appendChild(l);
  }, []);

  useEffect(() => {
    setInput(LANGUAGES[lang].defaultText);
    setAnalysis(null); setNlpData({}); setNlpStatus("idle");
  }, [lang]);

  const analyze = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true); setNlpData({}); setNlpStatus("idle"); setShowList(false);

    // L1: Instant rule-based scoring
    const result = runScoring(input, lang);
    setAnalysis(result);
    setLoading(false);

    const complexWords = result.words.filter(w => w.type === "w" && w.score >= 28);
    if (complexWords.length === 0) return;

    // L2: Immediately populate from local dictionary
    const localDict = LOCAL_NLP[lang] || {};
    const localFills = {};
    const needsApi = [];

    for (const w of complexWords) {
      const entry = localDict[w.lower];
      if (entry) {
        localFills[w.lower] = entry;
      } else {
        needsApi.push(w);
      }
    }
    setNlpData(localFills);

    if (Object.keys(localFills).length > 0 && needsApi.length > 0) {
      setNlpStatus("loading");
      setNlpMsg(`${Object.keys(localFills).length} words from local engine · Fetching ${needsApi.length} more via API...`);
    } else if (needsApi.length > 0) {
      setNlpStatus("loading");
      setNlpMsg(`Fetching NLP data for ${needsApi.length} complex words via Gemini API...`);
    } else {
      setNlpStatus("done");
      setNlpMsg(`All ${Object.keys(localFills).length} words resolved from local engine`);
      return;
    }

    // L3: Try Gemini API for remaining words
    try {
      const chunks = [];
      for (let i = 0; i < needsApi.length; i += 15) chunks.push(needsApi.slice(i, i + 15));

      for (let ci = 0; ci < chunks.length; ci++) {
        if (controller.signal.aborted) return;
        setNlpMsg(`API batch ${ci + 1}/${chunks.length} — phonetics, contextual synonyms...`);

        const apiResult = await fetchNLPFromAPI(chunks[ci], input, lang, controller.signal);
        if (apiResult) {
          const merged = {};
          for (const [k, v] of Object.entries(apiResult)) merged[k.toLowerCase()] = v;
          setNlpData(prev => ({ ...prev, ...merged }));
        }
      }

      if (!controller.signal.aborted) {
        setNlpStatus("done");
        setNlpMsg(`Analysis complete — ${Object.keys(localFills).length} local + ${needsApi.length} API`);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      console.warn("API unavailable, using local fallback:", err.message);

      // Fallback: use local data for everything we have, mark rest as local-only
      setNlpStatus("fallback");
      setNlpMsg(`API unavailable — using local phonetic engine (${Object.keys(localFills).length} words covered). ${needsApi.length} word(s) need manual lookup.`);
    }
  }, [input, lang]);

  const handleHover = useCallback((e, word) => {
    if (word.type !== "w" || word.score < 28) return;
    const rect = e.target.getBoundingClientRect();
    setTPos({ x: rect.left + rect.width / 2, y: rect.top - 10 });
    setHovered(word);
  }, []);

  const hardWords = useMemo(() => {
    if (!analysis) return [];
    return analysis.words.filter(w => w.level === "hard").sort((a, b) => b.score - a.score);
  }, [analysis]);

  const getNlp = w => nlpData[w.lower] || null;
  const sc = s => s >= 70 ? "#e53935" : s >= 50 ? "#e86a2c" : s >= 30 ? "#cfa01a" : "#7a9b7e";
  const st = s => {
    if (s >= 75) return { t: "Extremely Opaque", c: "#e53935" };
    if (s >= 55) return { t: "Highly Complex", c: "#e86a2c" };
    if (s >= 35) return { t: "Moderately Complex", c: "#cfa01a" };
    if (s >= 15) return { t: "Mildly Complex", c: "#7a9b7e" };
    return { t: "Transparent", c: "#5aab72" };
  };

  return (
    <div ref={containerRef} style={S.root}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .wh{color:#e53935;border-bottom:2px solid rgba(229,57,53,.45);font-weight:500;cursor:pointer;transition:all .15s;border-radius:2px;padding:1px 2px}
        .wh:hover{background:rgba(229,57,53,.1)}
        .wm{color:#cfa01a;border-bottom:1px dashed rgba(207,160,26,.35);cursor:pointer;padding:1px 2px;transition:all .15s}
        .wm:hover{background:rgba(207,160,26,.08)}
        .lb{background:rgba(255,255,255,.025);border:1.5px solid rgba(255,255,255,.06);border-radius:10px;padding:14px 13px;cursor:pointer;text-align:left;color:#b8b0a6;display:flex;flex-direction:column;gap:4px;transition:all .2s}
        .lb:hover{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.04)}
        .lb.on{background:rgba(207,160,26,.07);border-color:rgba(207,160,26,.3);color:#f0ece6}
        .ab{margin-top:14px;padding:15px 36px;border-radius:8px;border:none;background:linear-gradient(135deg,#cfa01a,#b8880e);color:#141210;font-family:'Sora',sans-serif;font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:9px;transition:all .2s;letter-spacing:.01em}
        .ab:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(207,160,26,.25)}
        .ab:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}
        textarea:focus{border-color:rgba(207,160,26,.3)!important}
        .badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:14px;font-size:9.5px;font-family:'DM Mono',monospace;letter-spacing:.03em}
        .badge-api{background:rgba(90,171,114,.1);border:1px solid rgba(90,171,114,.2);color:#5aab72}
        .badge-local{background:rgba(207,160,26,.1);border:1px solid rgba(207,160,26,.2);color:#cfa01a}
        .badge-off{background:rgba(229,57,53,.08);border:1px solid rgba(229,57,53,.15);color:#e86a2c}
        .shim{height:12px;border-radius:4px;background:linear-gradient(90deg,rgba(255,255,255,.03) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.03) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite}
      `}</style>

      {/* HEADER */}
      <header style={S.header}>
        <div style={S.tag}>Psycholinguistic Grain Size Theory</div>
        <h1 style={S.title}>Orthographic Complexity Analyzer</h1>
        <p style={S.sub}>
          Evaluates G→P consistency, vowel ambiguity, silent letters & morphological opacity.
          Uses <strong>Gemini API</strong> for dynamic contextual NLP with <strong>local fallback engine</strong> — always works, even offline.
        </p>
      </header>

      {/* LANGUAGE PICKER */}
      <section style={{ marginBottom: 28 }}>
        <div style={S.lbl}>Orthographic System</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {Object.entries(LANGUAGES).map(([k, v]) => (
            <button key={k} className={`lb ${lang === k ? "on" : ""}`} onClick={() => setLang(k)}>
              <span style={{ fontSize: 20 }}>{v.flag}</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{v.name}</span>
              <span style={{ fontSize: 10, color: "#847a6e", lineHeight: 1.3 }}>{v.desc}</span>
              <div style={{ height: 3, background: "rgba(255,255,255,.05)", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 2, width: `${v.opacity * 100}%`, background: v.opacity > .6 ? "#e53935" : v.opacity > .3 ? "#cfa01a" : "#5aab72", transition: "width .4s" }} />
              </div>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "#5e564c" }}>Depth: {(v.opacity * 100).toFixed(0)}%</span>
            </button>
          ))}
        </div>
      </section>

      {/* INPUT */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={S.lbl}>Input Text</span>
          <span style={{ ...S.lbl, color: "#5e564c" }}>{input.split(/\s+/).filter(Boolean).length} words</span>
        </div>
        <textarea
          style={S.ta}
          value={input}
          onChange={e => { setInput(e.target.value); setAnalysis(null); setNlpData({}); setNlpStatus("idle"); }}
          rows={6}
          placeholder="Paste or type text to analyze..."
        />
        <button className="ab" onClick={analyze} disabled={loading || !input.trim()}>
          <span style={{ fontSize: 16 }}>◉</span>
          {loading ? "Scoring..." : "Run Orthographic Analysis"}
        </button>
      </section>

      {/* RESULTS */}
      {analysis && (
        <div style={{ animation: "fadeUp .4s ease" }}>

          {/* NLP status bar */}
          {nlpStatus !== "idle" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 18, padding: "10px 16px",
              borderRadius: 8,
              background: nlpStatus === "fallback" || nlpStatus === "error"
                ? "rgba(232,106,44,.06)" : "rgba(90,171,114,.06)",
              border: `1px solid ${nlpStatus === "fallback" || nlpStatus === "error"
                ? "rgba(232,106,44,.12)" : "rgba(90,171,114,.12)"}`,
            }}>
              {nlpStatus === "loading" && (
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#5aab72", animation: "pulse 1.2s infinite", flexShrink: 0 }} />
              )}
              {nlpStatus === "done" && <span style={{ color: "#5aab72", fontSize: 13 }}>✓</span>}
              {nlpStatus === "fallback" && <span style={{ color: "#e86a2c", fontSize: 13 }}>⚡</span>}
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: nlpStatus === "fallback" ? "#e86a2c" : "#5aab72" }}>
                {nlpMsg}
              </span>
              {nlpStatus === "done" && <span className="badge badge-api" style={{ marginLeft: "auto" }}>✦ NLP Enhanced</span>}
              {nlpStatus === "fallback" && <span className="badge badge-off" style={{ marginLeft: "auto" }}>Local Fallback Active</span>}
            </div>
          )}

          {/* Score dashboard */}
          <div style={S.dash}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "relative", width: 130, height: 130 }}>
                <svg viewBox="0 0 130 130" style={{ width: "100%", height: "100%" }}>
                  <circle cx="65" cy="65" r="56" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="7" />
                  <circle cx="65" cy="65" r="56" fill="none" stroke={sc(analysis.overall)} strokeWidth="7"
                    strokeDasharray={`${(analysis.overall / 100) * 352} 352`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" style={{ transition: "stroke-dasharray .8s ease" }} />
                </svg>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 34, fontWeight: 500, color: sc(analysis.overall) }}>{analysis.overall}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: "#5e564c" }}>/100</span>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10, color: st(analysis.overall).c }}>{st(analysis.overall).t}</div>
              <div style={{ fontSize: 10, color: "#5e564c", fontFamily: "'DM Mono',monospace", marginTop: 2 }}>Orthographic Complexity Score</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, alignContent: "center" }}>
              {[
                { n: analysis.stats.total, l: "Total Words", c: "#e0dbd4" },
                { n: analysis.stats.hard, l: "Hard Words", c: "#e53935" },
                { n: analysis.stats.moderate, l: "Moderate", c: "#cfa01a" },
                { n: analysis.stats.simple, l: "Simple", c: "#5aab72" },
                { n: `${analysis.stats.hardPct}%`, l: "Hard Ratio", c: "#e86a2c" },
                { n: analysis.stats.avg, l: "Avg Score", c: "#e0dbd4" },
              ].map((s, i) => (
                <div key={i} style={S.stat}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 22, fontWeight: 500, color: s.c }}>{s.n}</span>
                  <span style={{ fontSize: 9, color: "#6b6258", fontFamily: "'DM Mono',monospace", letterSpacing: ".06em", textTransform: "uppercase", marginTop: 2 }}>{s.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Analyzed text */}
          <section style={{ marginBottom: 28 }}>
            <div style={{ marginBottom: 12 }}>
              <h3 style={S.secTitle}>Analyzed Text</h3>
              <p style={{ fontSize: 12, color: "#6b6258", margin: 0 }}>
                Hover over <span style={{ color: "#e53935", fontWeight: 500 }}>highlighted</span> words for phonetic respelling, synonyms & analysis
              </p>
            </div>
            <div style={S.tBox}>
              {analysis.words.map((w, i) => {
                if (w.type === "p") return <span key={i} style={{ color: "#5e564c" }}>{w.text}</span>;
                const cls = w.level === "hard" ? "wh" : w.level === "moderate" ? "wm" : "";
                return (
                  <span key={i} className={cls || undefined}
                    style={cls ? undefined : { color: "#c4bdb4" }}
                    onMouseEnter={e => handleHover(e, w)}
                    onMouseLeave={() => setHovered(null)}
                  >{w.text}</span>
                );
              })}
            </div>
          </section>

          {/* Tooltip */}
          {hovered && (() => {
            const nlp = getNlp(hovered);
            const isLocal = nlp && LOCAL_NLP[lang]?.[hovered.lower];
            const isApi = nlp && !isLocal;
            return (
              <div style={{ ...S.tt, left: tPos.x, top: tPos.y }}>
                <div style={S.ttArrow} />
                <div style={{ fontFamily: "'Newsreader',serif", fontSize: 21, color: "#f0ece6", marginBottom: 2 }}>{hovered.clean}</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#847a6e", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  Complexity: {hovered.score}/100
                  {nlp && isApi && <span className="badge badge-api">API</span>}
                  {nlp && isLocal && <span className="badge badge-local">Local</span>}
                </div>

                {nlp?.ph ? (
                  <div style={S.tSec}>
                    <div style={S.tLbl}>Phonetic Respelling</div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 15, color: "#cfa01a", fontWeight: 500 }}>{nlp.ph}</div>
                    {nlp.ipa && <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#847a6e", marginTop: 2 }}>{nlp.ipa}</div>}
                  </div>
                ) : nlp?.phonetic ? (
                  <div style={S.tSec}>
                    <div style={S.tLbl}>Phonetic Respelling</div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 15, color: "#cfa01a", fontWeight: 500 }}>{nlp.phonetic}</div>
                    {nlp.ipa && <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#847a6e", marginTop: 2 }}>{nlp.ipa}</div>}
                  </div>
                ) : nlpStatus === "loading" ? (
                  <div style={S.tSec}>
                    <div style={S.tLbl}>Phonetic Respelling</div>
                    <div className="shim" style={{ width: 140, marginTop: 4 }} />
                  </div>
                ) : null}

                {(nlp?.syn?.length > 0 || nlp?.synonyms?.length > 0) ? (
                  <div style={S.tSec}>
                    <div style={S.tLbl}>Simpler Alternatives</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {(nlp.syn || nlp.synonyms || []).map((s, i) => (
                        <span key={i} style={S.chip}>{s}</span>
                      ))}
                    </div>
                  </div>
                ) : nlpStatus === "loading" ? (
                  <div style={S.tSec}>
                    <div style={S.tLbl}>Simpler Alternatives</div>
                    <div className="shim" style={{ width: 100, marginTop: 4 }} />
                  </div>
                ) : null}

                {(nlp?.why || nlp?.explanation) && (
                  <div style={S.tSec}>
                    <div style={S.tLbl}>Why It's Difficult</div>
                    <div style={{ fontSize: 11, color: "#a89e92", lineHeight: 1.5, fontStyle: "italic" }}>{nlp.why || nlp.explanation}</div>
                  </div>
                )}

                {hovered.reasons.length > 0 && (
                  <div style={S.tSec}>
                    <div style={S.tLbl}>Orthographic Rules Triggered</div>
                    {hovered.reasons.map((r, i) => (
                      <div key={i} style={{ fontSize: 11, color: "#847a6e", lineHeight: 1.5 }}>• {r}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Hard words list */}
          {hardWords.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <button onClick={() => setShowList(!showList)} style={S.listBtn}>
                <span>{showList ? "▾" : "▸"} Orthographic Bottleneck Words ({hardWords.length})</span>
              </button>
              {showList && (
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  {hardWords.map((w, i) => {
                    const nlp = getNlp(w);
                    const isLocal = nlp && LOCAL_NLP[lang]?.[w.lower];
                    return (
                      <div key={i} style={S.listItem}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontFamily: "'Newsreader',serif", fontSize: 18, color: "#f0ece6" }}>{w.clean}</span>
                            {nlp && isLocal && <span className="badge badge-local">local</span>}
                            {nlp && !isLocal && <span className="badge badge-api">API</span>}
                          </div>
                          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 15, fontWeight: 500, color: sc(w.score) }}>{w.score}</span>
                        </div>
                        {(nlp?.ph || nlp?.phonetic) && (
                          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#cfa01a", marginTop: 3 }}>
                            {nlp.ph || nlp.phonetic} <span style={{ color: "#6b6258" }}>{nlp.ipa}</span>
                          </div>
                        )}
                        {(nlp?.syn?.length > 0 || nlp?.synonyms?.length > 0) && (
                          <div style={{ fontSize: 12, color: "#5aab72", marginTop: 3 }}>→ {(nlp.syn || nlp.synonyms).join(", ")}</div>
                        )}
                        {(nlp?.why || nlp?.explanation) && (
                          <div style={{ fontSize: 11, color: "#a89e92", marginTop: 3, fontStyle: "italic" }}>{nlp.why || nlp.explanation}</div>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                          {w.reasons.map((r, j) => <span key={j} style={S.tag2}>{r}</span>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Methodology */}
          <div style={S.meth}>
            <h4 style={{ ...S.lbl, margin: "0 0 8px", fontSize: 11 }}>Methodology & Architecture</h4>
            <p style={{ fontSize: 12, lineHeight: 1.7, color: "#847a6e", margin: 0 }}>
              <strong style={{ color: "#b8b0a6" }}>Layer 1 — Rule-based scoring</strong> (instant, deterministic): Implements Psycholinguistic Grain Size Theory.
              Evaluates whole-word G→P consistency via complex grapheme density, vowel digraph ambiguity, silent letter patterns,
              letter:phoneme ratio, and morphological opacity. Each language has calibrated thresholds reflecting orthographic depth.
              <br /><br />
              <strong style={{ color: "#b8b0a6" }}>Layer 2 — Local phonetic engine</strong> (always available): Comprehensive dictionaries covering
              100+ complex words per language with phonetic respellings, IPA, synonyms, and linguistic explanations. Ensures the tool works
              fully offline or when the API is unavailable.
              <br /><br />
              <strong style={{ color: "#b8b0a6" }}>Layer 3 — Gemini API enhancement</strong> (contextual, any word): Words not in the local dictionary
              are sent to Gemini with the full passage for context-aware analysis. Generates phonetic respellings, IPA, contextual synonyms,
              and explanations for any word in any language. Falls back gracefully to Layer 2 if the API is unreachable.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const S = {
  root: { fontFamily: "'Sora',sans-serif", maxWidth: 920, margin: "0 auto", padding: "0 20px 60px", color: "#e0dbd4", background: "transparent", minHeight: "100vh" },
  header: { padding: "40px 0 24px", borderBottom: "1px solid rgba(255,255,255,.05)", marginBottom: 30 },
  tag: { fontFamily: "'DM Mono',monospace", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "#847a6e", marginBottom: 8 },
  title: { fontFamily: "'Newsreader',serif", fontSize: 36, fontWeight: 400, color: "#f0ece6", margin: "0 0 8px", lineHeight: 1.1 },
  sub: { fontSize: 13.5, color: "#847a6e", margin: 0, maxWidth: "100%", lineHeight: 1.55 },
  lbl: { fontFamily: "'DM Mono',monospace", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "#6b6258", marginBottom: 0 },
  ta: { width: "100%", minHeight: 150, padding: 16, borderRadius: 10, border: "1.5px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.025)", color: "#e0dbd4", fontFamily: "'Sora',sans-serif", fontSize: 13.5, lineHeight: 1.75, resize: "vertical", outline: "none", boxSizing: "border-box", transition: "border-color .2s" },
  dash: { display: "grid", gridTemplateColumns: "250px 1fr", gap: 24, marginBottom: 30, padding: 24, background: "rgba(255,255,255,.018)", borderRadius: 14, border: "1px solid rgba(255,255,255,.04)" },
  stat: { display: "flex", flexDirection: "column", padding: "12px 14px", background: "rgba(255,255,255,.018)", borderRadius: 8, border: "1px solid rgba(255,255,255,.03)" },
  secTitle: { fontFamily: "'Newsreader',serif", fontSize: 22, fontWeight: 400, color: "#f0ece6", margin: "0 0 4px" },
  tBox: { padding: 24, background: "rgba(255,255,255,.018)", borderRadius: 12, border: "1px solid rgba(255,255,255,.04)", lineHeight: 2.3, fontSize: 14.5 },
  tt: { position: "fixed", transform: "translate(-50%,-100%)", marginTop: -8, background: "#272320", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "16px 18px", minWidth: 260, maxWidth: 360, zIndex: 1000, boxShadow: "0 14px 44px rgba(0,0,0,.55)" },
  ttArrow: { position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 12, height: 12, background: "#272320", border: "1px solid rgba(255,255,255,.1)", borderTop: "none", borderLeft: "none" },
  tSec: { marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.05)" },
  tLbl: { fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "#5e564c", marginBottom: 5, display: "flex", alignItems: "center", gap: 5 },
  chip: { display: "inline-block", padding: "3px 10px", background: "rgba(90,171,114,.1)", border: "1px solid rgba(90,171,114,.2)", borderRadius: 20, fontSize: 12, color: "#6bc98f", fontWeight: 500 },
  listBtn: { width: "100%", padding: "14px 18px", background: "rgba(229,57,53,.05)", border: "1px solid rgba(229,57,53,.12)", borderRadius: 10, color: "#e53935", fontFamily: "'Sora',sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left" },
  listItem: { padding: "14px 16px", background: "rgba(255,255,255,.018)", borderRadius: 8, border: "1px solid rgba(255,255,255,.04)" },
  tag2: { display: "inline-block", padding: "2px 8px", background: "rgba(255,255,255,.03)", borderRadius: 4, fontSize: 10, color: "#847a6e", fontFamily: "'DM Mono',monospace" },
  meth: { padding: "20px 22px", background: "rgba(255,255,255,.018)", borderRadius: 10, border: "1px solid rgba(255,255,255,.03)" },
};
