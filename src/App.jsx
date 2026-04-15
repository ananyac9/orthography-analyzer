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
      return { score: clamp(score), reasons, level: level(clamp(score), 55, 28) };
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
  sub: { fontSize: 13.5, color: "#847a6e", margin: 0, maxWidth: 620, lineHeight: 1.55 },
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
