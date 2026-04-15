import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// ORTHOGRAPHIC COMPLEXITY ANALYZER
// Based on the Psycholinguistic Grain Size Theory (Ziegler & Goswami, 2005)
// Analyzes grapheme-to-phoneme consistency, not just syllable counts
// ═══════════════════════════════════════════════════════════════════════════════

// ─── LANGUAGE-SPECIFIC NLP ENGINES ───────────────────────────────────────────

const LANGUAGE_CONFIGS = {
  english: {
    name: "English",
    flag: "🇬🇧",
    description: "Deep orthography — highly inconsistent G-P mappings",
    opacity: 0.87, // Orthographic depth (0=transparent, 1=opaque)
    defaultText: `The knight knew that the colonel's daughter had a cough, though she thought it was through a draught from the ancient plough shed. Their neighbour's yacht was moored by the quay, where foreign psychologists were studying the subtle phenomenon of dyslexia. The researchers measured each participant's ability to decipher words with ambiguous orthographic patterns. Preliminary results suggested that individuals with developmental reading difficulties experienced heightened interference when encountering graphemically opaque vocabulary, particularly those containing silent consonant clusters and irregular vowel digraphs.`,
  },
  french: {
    name: "Français",
    flag: "🇫🇷",
    description: "Deep orthography — complex vowel digraphs & silent endings",
    opacity: 0.78,
    defaultText: `Les chercheurs ont examiné comment les enfants dyslexiques traitent les mots contenant des graphèmes complexes. Le pharmacien consciencieux a prescrit un médicament pour le patient souffrant de rhumatismes chroniques. Beaucoup de gens trouvent que l'orthographe française est particulièrement difficile à cause des lettres muettes et des liaisons imprévisibles. Les oiseaux chantaient dans les châtaigniers pendant que le sculpteur travaillait tranquillement.`,
  },
  german: {
    name: "Deutsch",
    flag: "🇩🇪",
    description: "Medium orthography — mostly regular but long compounds",
    opacity: 0.35,
    defaultText: `Die Grundschullehrerin untersuchte die Rechtschreibfähigkeiten der Schüler mit Entwicklungsdyslexie. Das Bundesverfassungsgericht entschied über die Gleichberechtigung aller Bürger. Die Schmetterlinge flatterten durch den wunderschönen Frühlingsgarten. Wissenschaftliche Untersuchungen zeigen, dass die deutsche Orthographie zwar regelmäßiger ist als die englische, aber zusammengesetzte Wörter besondere Schwierigkeiten bereiten.`,
  },
  finnish: {
    name: "Suomi",
    flag: "🇫🇮",
    description: "Shallow orthography — nearly 1:1 grapheme-phoneme mapping",
    opacity: 0.08,
    defaultText: `Tutkijat selvittivät kehityksellisen lukemishäiriön vaikutuksia suomenkielisten lasten oikeinkirjoitustaitoihin. Yliopiston professori luennoi epäsäännöllisistä sanahahmoista. Kaksikielisyys vaikuttaa positiivisesti fonologiseen tietoisuuteen. Suomen kielen ortografia on erittäin säännönmukainen, mikä helpottaa lukemaan oppimista verrattuna syviin ortografioihin.`,
  },
};

// ─── ENGLISH NLP ENGINE ─────────────────────────────────────────────────────
// Comprehensive grapheme-to-phoneme analysis using whole-word evaluation

const ENGLISH_ENGINE = {
  // Complex multi-letter graphemes (context-dependent mappings)
  complexGraphemes: [
    "ough", "augh", "eigh", "tion", "sion", "cian", "tial", "cial",
    "ious", "eous", "ight", "ough", "ould", "tion", "ence", "ance",
    "ture", "sure", "tch", "dge", "kn", "wr", "gn", "pn", "ps",
    "ph", "gh", "wh", "ck", "qu", "th", "sh", "ch", "ng", "nk",
    "igh", "eigh", "ough", "augh", "ew", "aw", "ow", "ou", "oi",
    "oy", "au", "ei", "ie", "ea", "oo", "ai", "ay", "ey",
    "oe", "ue", "ui",
  ],

  // Silent letter patterns
  silentPatterns: [
    { pattern: /\bkn/i, desc: "silent k" },
    { pattern: /\bwr/i, desc: "silent w" },
    { pattern: /\bgn/i, desc: "silent g" },
    { pattern: /\bpn/i, desc: "silent p" },
    { pattern: /\bps/i, desc: "silent p" },
    { pattern: /mb\b/i, desc: "silent b" },
    { pattern: /mn\b/i, desc: "silent n" },
    { pattern: /ght/i, desc: "silent gh" },
    { pattern: /(?:^|\s)h(?=o)/i, desc: "silent h" },
    { pattern: /stl/i, desc: "silent t" },
    { pattern: /lk\b/i, desc: "sometimes silent l" },
    { pattern: /lm\b/i, desc: "sometimes silent l" },
  ],

  // Vowel inconsistency patterns — the SAME grapheme producing DIFFERENT phonemes
  vowelInconsistencies: {
    ea: { sounds: ["/iː/", "/ɛ/", "/eɪ/"], examples: ["beat", "bread", "break"] },
    oo: { sounds: ["/uː/", "/ʊ/"], examples: ["food", "good"] },
    ou: { sounds: ["/aʊ/", "/uː/", "/ʌ/", "/ɔː/"], examples: ["out", "you", "touch", "four"] },
    ow: { sounds: ["/aʊ/", "/oʊ/"], examples: ["cow", "show"] },
    ough: { sounds: ["/ʌf/", "/ɔː/", "/oʊ/", "/uː/", "/ɒf/", "/aʊ/"], examples: ["tough", "thought", "though", "through", "cough", "bough"] },
    ie: { sounds: ["/iː/", "/aɪ/"], examples: ["field", "pie"] },
    ei: { sounds: ["/iː/", "/eɪ/", "/aɪ/"], examples: ["receive", "vein", "height"] },
  },

  // Irregular words — the most common exceptions
  irregularWords: new Set([
    "the", "of", "to", "do", "does", "was", "were", "are", "have", "said",
    "one", "two", "once", "eye", "their", "there", "they", "been", "come",
    "some", "done", "gone", "none", "love", "move", "prove", "give", "live",
    "above", "dove", "shove", "glove", "whom", "who", "whose", "whole",
    "would", "could", "should", "through", "though", "thought", "thorough",
    "enough", "rough", "tough", "cough", "bough", "dough", "bought",
    "brought", "caught", "taught", "daughter", "slaughter", "laughter",
    "knight", "knife", "know", "knee", "knot", "knit", "knock",
    "write", "wrong", "wrist", "wreck", "wrap", "wren",
    "island", "isle", "aisle", "corps", "ballet", "depot",
    "colonel", "lieutenant", "sergeant", "guarantee", "guard",
    "guide", "build", "built", "guilt", "circuit", "biscuit",
    "yacht", "quay", "queue", "bouquet", "technique", "unique",
    "antique", "boutique", "fatigue", "intrigue", "mystique",
    "foreign", "sovereign", "reign", "feign", "deign",
    "sign", "design", "resign", "assign", "align",
    "paradigm", "phlegm", "diaphragm",
    "pneumonia", "psalm", "psychology", "psychiatry", "pseudonym",
    "subtle", "debt", "doubt", "receipt", "indict",
    "salmon", "almond", "calm", "palm", "half", "calf",
    "talk", "walk", "chalk", "stalk", "folk", "yolk",
    "hour", "honour", "honest", "heir", "herb",
    "rhythm", "myth", "gym", "system", "symbol", "mystery",
    "women", "bury", "busy", "business", "minute",
    "ocean", "special", "ancient", "sufficient", "efficient",
    "conscience", "conscious", "science", "scissors",
    "muscle", "fascinate", "scene", "scent",
    "beautiful", "because", "friend", "people", "leopard",
    "jeopardy", "jealous", "weapon", "measure", "pleasure",
    "treasure", "creature", "feature", "nature", "mature",
    "picture", "culture", "future", "adventure", "furniture",
    "temperature", "literature", "architecture", "manufacture",
    "phenomenon", "catastrophe", "epitome", "hyperbole",
    "cliche", "naive", "fiance", "cafe", "resume",
    "draught", "plough", "neighbour", "although",
    "decipher", "participant", "ambiguous", "preliminary",
    "graphemically", "interference", "developmental",
    "particularly", "irregular", "heightened",
  ]),

  // Phonetic respelling dictionary (Merriam-Webster / Oxford style)
  phoneticDict: {
    knight: { phonetic: "NYTE", ipa: "/naɪt/" },
    knew: { phonetic: "NOO", ipa: "/njuː/" },
    colonel: { phonetic: "KUR-nuhl", ipa: "/ˈkɜːrnəl/" },
    daughter: { phonetic: "DAW-tur", ipa: "/ˈdɔːtər/" },
    cough: { phonetic: "KAWF", ipa: "/kɒf/" },
    though: { phonetic: "THOH", ipa: "/ðoʊ/" },
    thought: { phonetic: "THAWT", ipa: "/θɔːt/" },
    through: { phonetic: "THROO", ipa: "/θruː/" },
    draught: { phonetic: "DRAFT", ipa: "/drɑːft/" },
    plough: { phonetic: "PLOW", ipa: "/plaʊ/" },
    ancient: { phonetic: "AYN-shunt", ipa: "/ˈeɪnʃənt/" },
    neighbour: { phonetic: "NAY-bur", ipa: "/ˈneɪbər/" },
    yacht: { phonetic: "YOT", ipa: "/jɒt/" },
    quay: { phonetic: "KEE", ipa: "/kiː/" },
    foreign: { phonetic: "FOR-in", ipa: "/ˈfɒrɪn/" },
    psychologists: { phonetic: "sy-KOL-uh-jists", ipa: "/saɪˈkɒlədʒɪsts/" },
    subtle: { phonetic: "SUT-uhl", ipa: "/ˈsʌtl/" },
    phenomenon: { phonetic: "fuh-NOM-uh-non", ipa: "/fəˈnɒmɪnən/" },
    dyslexia: { phonetic: "dis-LEK-see-uh", ipa: "/dɪsˈlɛksiə/" },
    researchers: { phonetic: "ree-SUR-churz", ipa: "/rɪˈsɜːrtʃərz/" },
    measured: { phonetic: "MEZH-urd", ipa: "/ˈmɛʒərd/" },
    participant: { phonetic: "par-TIS-uh-puhnt", ipa: "/pɑːrˈtɪsɪpənt/" },
    ability: { phonetic: "uh-BIL-uh-tee", ipa: "/əˈbɪlɪti/" },
    decipher: { phonetic: "dih-SY-fur", ipa: "/dɪˈsaɪfər/" },
    ambiguous: { phonetic: "am-BIG-yoo-us", ipa: "/æmˈbɪɡjuəs/" },
    orthographic: { phonetic: "or-thuh-GRAF-ik", ipa: "/ˌɔːrθəˈɡræfɪk/" },
    preliminary: { phonetic: "prih-LIM-uh-ner-ee", ipa: "/prɪˈlɪmɪnəri/" },
    suggested: { phonetic: "sug-JEST-id", ipa: "/səˈdʒɛstɪd/" },
    individuals: { phonetic: "in-duh-VIJ-oo-uhlz", ipa: "/ˌɪndɪˈvɪdʒuəlz/" },
    developmental: { phonetic: "dih-vel-up-MEN-tuhl", ipa: "/dɪˌvɛləpˈmɛntəl/" },
    difficulties: { phonetic: "DIF-ih-kuhl-teez", ipa: "/ˈdɪfɪkʌltiz/" },
    experienced: { phonetic: "ik-SPEER-ee-unst", ipa: "/ɪkˈspɪəriənst/" },
    heightened: { phonetic: "HY-tund", ipa: "/ˈhaɪtənd/" },
    interference: { phonetic: "in-tur-FEER-unts", ipa: "/ˌɪntərˈfɪərəns/" },
    encountering: { phonetic: "en-KOWN-tur-ing", ipa: "/ɪnˈkaʊntərɪŋ/" },
    vocabulary: { phonetic: "voh-KAB-yuh-ler-ee", ipa: "/voʊˈkæbjʊləri/" },
    particularly: { phonetic: "par-TIK-yuh-lur-lee", ipa: "/pərˈtɪkjʊlərli/" },
    consonant: { phonetic: "KON-suh-nuhnt", ipa: "/ˈkɒnsənənt/" },
    irregular: { phonetic: "ih-REG-yuh-lur", ipa: "/ɪˈrɛɡjʊlər/" },
    attention: { phonetic: "uh-TEN-shun", ipa: "/əˈtɛnʃən/" },
    beautiful: { phonetic: "BYOO-tuh-fuhl", ipa: "/ˈbjuːtɪfəl/" },
    because: { phonetic: "bih-KAWZ", ipa: "/bɪˈkɒz/" },
    enough: { phonetic: "ih-NUF", ipa: "/ɪˈnʌf/" },
    people: { phonetic: "PEE-puhl", ipa: "/ˈpiːpəl/" },
    science: { phonetic: "SY-unts", ipa: "/ˈsaɪəns/" },
    ocean: { phonetic: "OH-shun", ipa: "/ˈoʊʃən/" },
    special: { phonetic: "SPESH-uhl", ipa: "/ˈspɛʃəl/" },
    schedule: { phonetic: "SKED-jool", ipa: "/ˈskɛdʒuːl/" },
    wednesday: { phonetic: "WENZ-day", ipa: "/ˈwɛnzdeɪ/" },
    february: { phonetic: "FEB-roo-er-ee", ipa: "/ˈfɛbruəri/" },
    comfortable: { phonetic: "KUMF-tur-buhl", ipa: "/ˈkʌmftərbəl/" },
    temperature: { phonetic: "TEM-pruh-chur", ipa: "/ˈtɛmprətʃər/" },
    chocolate: { phonetic: "CHOK-luht", ipa: "/ˈtʃɒklɪt/" },
    restaurant: { phonetic: "RES-tuh-ront", ipa: "/ˈrɛstərɒnt/" },
    lieutenant: { phonetic: "loo-TEN-uhnt", ipa: "/luːˈtɛnənt/" },
    guarantee: { phonetic: "gar-un-TEE", ipa: "/ˌɡærənˈtiː/" },
    queue: { phonetic: "KYOO", ipa: "/kjuː/" },
    technique: { phonetic: "tek-NEEK", ipa: "/tɛkˈniːk/" },
    rhythm: { phonetic: "RITH-uhm", ipa: "/ˈrɪðəm/" },
    muscle: { phonetic: "MUS-uhl", ipa: "/ˈmʌsəl/" },
    island: { phonetic: "EYE-lund", ipa: "/ˈaɪlənd/" },
    receipt: { phonetic: "rih-SEET", ipa: "/rɪˈsiːt/" },
    salmon: { phonetic: "SAM-un", ipa: "/ˈsæmən/" },
    stomach: { phonetic: "STUM-uk", ipa: "/ˈstʌmək/" },
    women: { phonetic: "WIM-in", ipa: "/ˈwɪmɪn/" },
    busy: { phonetic: "BIZ-ee", ipa: "/ˈbɪzi/" },
    business: { phonetic: "BIZ-nis", ipa: "/ˈbɪznɪs/" },
    friend: { phonetic: "FREND", ipa: "/frɛnd/" },
    said: { phonetic: "SED", ipa: "/sɛd/" },
    would: { phonetic: "WOOD", ipa: "/wʊd/" },
    could: { phonetic: "KOOD", ipa: "/kʊd/" },
    should: { phonetic: "SHOOD", ipa: "/ʃʊd/" },
    walk: { phonetic: "WAWK", ipa: "/wɔːk/" },
    talk: { phonetic: "TAWK", ipa: "/tɔːk/" },
    listen: { phonetic: "LIS-un", ipa: "/ˈlɪsən/" },
    honest: { phonetic: "ON-ist", ipa: "/ˈɒnɪst/" },
    hour: { phonetic: "OW-ur", ipa: "/ˈaʊər/" },
    debt: { phonetic: "DET", ipa: "/dɛt/" },
    doubt: { phonetic: "DOWT", ipa: "/daʊt/" },
    leopard: { phonetic: "LEP-urd", ipa: "/ˈlɛpərd/" },
    conscience: { phonetic: "KON-shunts", ipa: "/ˈkɒnʃəns/" },
    conscious: { phonetic: "KON-shus", ipa: "/ˈkɒnʃəs/" },
    scissors: { phonetic: "SIZ-urz", ipa: "/ˈsɪzərz/" },
    thoroughly: { phonetic: "THUR-oh-lee", ipa: "/ˈθʌrəli/" },
    studying: { phonetic: "STUD-ee-ing", ipa: "/ˈstʌdiɪŋ/" },
    opaque: { phonetic: "oh-PAYK", ipa: "/oʊˈpeɪk/" },
    graphemically: { phonetic: "gruh-FEE-mik-lee", ipa: "/ɡræˈfiːmɪkli/" },
    digraphs: { phonetic: "DY-grafs", ipa: "/ˈdaɪɡrɑːfs/" },
    clusters: { phonetic: "KLUS-turz", ipa: "/ˈklʌstərz/" },
    containing: { phonetic: "kun-TAY-ning", ipa: "/kənˈteɪnɪŋ/" },
    results: { phonetic: "rih-ZULTS", ipa: "/rɪˈzʌlts/" },
    reading: { phonetic: "REE-ding", ipa: "/ˈriːdɪŋ/" },
    each: { phonetic: "EECH", ipa: "/iːtʃ/" },
    patterns: { phonetic: "PAT-urnz", ipa: "/ˈpætərnz/" },
    particularly: { phonetic: "par-TIK-yuh-lur-lee", ipa: "/pərˈtɪkjʊlərli/" },
    those: { phonetic: "THOHZ", ipa: "/ðoʊz/" },
    silent: { phonetic: "SY-lunt", ipa: "/ˈsaɪlənt/" },
    vowel: { phonetic: "VOW-ul", ipa: "/ˈvaʊəl/" },
    shed: { phonetic: "SHED", ipa: "/ʃɛd/" },
    moored: { phonetic: "MOORD", ipa: "/mʊərd/" },
    where: { phonetic: "WAIR", ipa: "/wɛər/" },
    were: { phonetic: "WUR", ipa: "/wɜːr/" },
    their: { phonetic: "THAIR", ipa: "/ðɛər/" },
  },

  // Synonym dictionary (context-aware, orthographically simpler alternatives)
  synonymDict: {
    knight: ["rider", "hero"],
    knew: ["was aware"],
    colonel: ["army leader"],
    daughter: ["child", "girl"],
    cough: ["hack"],
    though: ["but", "yet"],
    thought: ["felt", "held"],
    through: ["via", "past"],
    draught: ["draft", "wind"],
    plough: ["plow", "dig up"],
    ancient: ["old", "aged"],
    neighbour: ["person next door"],
    yacht: ["boat", "ship"],
    quay: ["dock", "pier"],
    foreign: ["from abroad", "external"],
    psychologists: ["mind experts"],
    subtle: ["slight", "mild"],
    phenomenon: ["event", "trend"],
    dyslexia: ["reading disorder"],
    researchers: ["experts", "analysts"],
    measured: ["tested", "rated"],
    participant: ["person tested", "subject"],
    ability: ["skill", "talent"],
    decipher: ["decode", "read"],
    ambiguous: ["unclear", "vague"],
    orthographic: ["spelling-based"],
    preliminary: ["initial", "first"],
    suggested: ["hinted", "implied"],
    individuals: ["persons", "people"],
    developmental: ["growing", "maturing"],
    difficulties: ["problems", "troubles"],
    experienced: ["felt", "had"],
    heightened: ["increased", "raised"],
    interference: ["disruption", "conflict"],
    encountering: ["meeting", "facing"],
    vocabulary: ["word set", "terms"],
    particularly: ["mainly", "mostly"],
    consonant: ["non-vowel"],
    irregular: ["not standard", "uneven"],
    beautiful: ["pretty", "lovely"],
    attention: ["awareness", "focus"],
    because: ["since", "as"],
    enough: ["plenty"],
    people: ["persons", "folks"],
    science: ["study", "field"],
    ocean: ["sea"],
    special: ["unique", "distinct"],
    schedule: ["plan", "timetable"],
    wednesday: ["midweek day"],
    comfortable: ["cozy", "at ease"],
    temperature: ["heat level"],
    technique: ["method", "way"],
    rhythm: ["beat", "tempo"],
    muscle: ["body tissue"],
    island: ["land mass"],
    receipt: ["proof of sale"],
    salmon: ["pink fish"],
    women: ["females", "ladies"],
    busy: ["active", "engaged"],
    business: ["trade", "firm"],
    friend: ["pal", "buddy"],
    would: ["was going to"],
    should: ["must", "need to"],
    walk: ["stroll", "step"],
    talk: ["speak", "chat"],
    listen: ["hear", "attend"],
    honest: ["frank", "open"],
    hour: ["60 minutes"],
    debt: ["sum due"],
    doubt: ["question", "unsure"],
    leopard: ["big cat"],
    conscience: ["inner voice"],
    conscious: ["aware", "alert"],
    scissors: ["cutters", "snips"],
    graphemically: ["in spelling form"],
    opaque: ["not clear", "murky"],
    digraphs: ["letter pairs"],
    studying: ["looking into", "examining"],
    reading: ["scanning", "looking at"],
    patterns: ["trends", "forms"],
    containing: ["holding", "with"],
    results: ["findings", "data"],
    moored: ["tied up", "docked"],
    thoroughly: ["fully", "deeply"],
  },

  // Whole-word orthographic complexity analysis
  analyzeWord(word) {
    const lower = word.toLowerCase().replace(/[^a-z'-]/g, "");
    if (lower.length <= 2) return { score: 0, reasons: [], level: "simple" };

    let score = 0;
    const reasons = [];
    const flaggedGraphemes = [];

    // 1. Check if it's a known irregular word
    if (this.irregularWords.has(lower)) {
      score += 30;
      reasons.push("Irregular word (unpredictable G→P mapping)");
    }

    // 2. Count complex multi-letter graphemes in the WHOLE word
    let complexCount = 0;
    const foundGraphemes = [];
    const checked = new Set();
    for (const g of this.complexGraphemes) {
      let idx = lower.indexOf(g);
      while (idx !== -1) {
        const key = `${idx}-${g}`;
        if (!checked.has(key)) {
          checked.add(key);
          complexCount++;
          foundGraphemes.push({ grapheme: g, position: idx });
          flaggedGraphemes.push({ text: g, start: idx, end: idx + g.length });
        }
        idx = lower.indexOf(g, idx + 1);
      }
    }
    if (complexCount > 0) {
      score += complexCount * 8;
      reasons.push(`${complexCount} complex grapheme(s): ${foundGraphemes.map((g) => `"${g.grapheme}"`).join(", ")}`);
    }

    // 3. Check for silent letter patterns
    let silentCount = 0;
    for (const sp of this.silentPatterns) {
      if (sp.pattern.test(lower)) {
        silentCount++;
        score += 15;
        reasons.push(`Silent letter: ${sp.desc}`);
      }
    }

    // 4. Vowel inconsistency — check if the word contains ambiguous vowel graphemes
    for (const [grapheme, info] of Object.entries(this.vowelInconsistencies)) {
      if (lower.includes(grapheme)) {
        score += info.sounds.length * 3;
        reasons.push(`Ambiguous vowel "${grapheme}" (${info.sounds.length} possible sounds)`);
      }
    }

    // 5. Grapheme-to-phoneme ratio (word length vs actual phoneme estimate)
    const estimatedPhonemes = estimatePhonemeCount(lower);
    const letterCount = lower.replace(/['-]/g, "").length;
    const gpRatio = letterCount / Math.max(estimatedPhonemes, 1);
    if (gpRatio > 1.5) {
      score += (gpRatio - 1.5) * 12;
      reasons.push(`High letter:phoneme ratio (${gpRatio.toFixed(2)}:1)`);
    }

    // 6. Morphological complexity (prefixes/suffixes that change pronunciation)
    const morphPenalty = checkMorphologicalComplexity(lower);
    if (morphPenalty > 0) {
      score += morphPenalty;
      reasons.push("Complex morphological structure");
    }

    // 7. Word frequency penalty (rare words are harder)
    const freqPenalty = getFrequencyPenalty(lower);
    if (freqPenalty > 0) {
      score += freqPenalty;
      reasons.push("Low-frequency word");
    }

    // Normalize score to 0-100
    score = Math.min(100, Math.max(0, score));

    let level = "simple";
    if (score >= 55) level = "hard";
    else if (score >= 30) level = "moderate";

    return { score, reasons, level, flaggedGraphemes };
  },
};

// ─── FRENCH NLP ENGINE ──────────────────────────────────────────────────────

const FRENCH_ENGINE = {
  complexGraphemes: [
    "eau", "aux", "eux", "oux", "tion", "sion", "ille", "aille",
    "eille", "ouille", "euil", "ueil", "oi", "ou", "ai", "ei",
    "au", "en", "an", "in", "un", "on", "gn", "ph", "ch", "qu",
    "gu", "ge", "ce", "ci", "ç",
  ],
  silentEndings: [/e\b/, /s\b/, /t\b/, /ent\b/, /x\b/, /d\b/, /p\b/],
  nasalVowels: ["an", "en", "in", "on", "un", "ain", "ein", "ien"],
  irregularWords: new Set([
    "oiseaux", "monsieur", "femme", "fils", "yeux", "œuf", "bœuf",
    "clef", "cerf", "porc", "tabac", "estomac", "sept", "automne",
    "sculpteur", "consciencieux", "pharmacien", "rhumatismes",
    "châtaigniers", "particulièrement", "imprévisibles",
  ]),

  phoneticDict: {
    oiseaux: { phonetic: "wa-ZOH", ipa: "/wa.zo/" },
    consciencieux: { phonetic: "kon-see-on-SYUH", ipa: "/kɔ̃.sjɑ̃.sjø/" },
    pharmacien: { phonetic: "far-ma-SYEN", ipa: "/faʁ.ma.sjɛ̃/" },
    rhumatismes: { phonetic: "roo-ma-TEEZM", ipa: "/ʁy.ma.tism/" },
    châtaigniers: { phonetic: "sha-ten-YAY", ipa: "/ʃɑ.tɛ.ɲje/" },
    particulièrement: { phonetic: "par-tee-koo-lyehr-MON", ipa: "/paʁ.ti.ky.ljɛʁ.mɑ̃/" },
    imprévisibles: { phonetic: "an-pray-vee-ZEEBL", ipa: "/ɛ̃.pʁe.vi.zibl/" },
    sculpteur: { phonetic: "skool-TUHR", ipa: "/skyl.tœʁ/" },
    tranquillement: { phonetic: "tron-keel-MON", ipa: "/tʁɑ̃.kil.mɑ̃/" },
    orthographe: { phonetic: "or-to-GRAF", ipa: "/ɔʁ.tɔ.ɡʁaf/" },
    graphèmes: { phonetic: "gra-FEM", ipa: "/ɡʁa.fɛm/" },
    dyslexiques: { phonetic: "dees-lek-SEEK", ipa: "/dis.lɛk.sik/" },
    médicament: { phonetic: "may-dee-ka-MON", ipa: "/me.di.ka.mɑ̃/" },
    beaucoup: { phonetic: "boh-KOO", ipa: "/bo.ku/" },
    muettes: { phonetic: "moo-ET", ipa: "/mɥɛt/" },
    liaisons: { phonetic: "lee-ay-ZON", ipa: "/ljɛ.zɔ̃/" },
    chercheurs: { phonetic: "shehr-SHUHR", ipa: "/ʃɛʁ.ʃœʁ/" },
    difficile: { phonetic: "dee-fee-SEEL", ipa: "/di.fi.sil/" },
    examiné: { phonetic: "eg-za-mee-NAY", ipa: "/ɛɡ.za.mi.ne/" },
    souffrant: { phonetic: "soo-FRON", ipa: "/su.fʁɑ̃/" },
    chroniques: { phonetic: "kro-NEEK", ipa: "/kʁɔ.nik/" },
    contenant: { phonetic: "kon-tuh-NON", ipa: "/kɔ̃.tə.nɑ̃/" },
    prescrit: { phonetic: "preh-SKREE", ipa: "/pʁɛs.kʁi/" },
    patient: { phonetic: "pa-SYON", ipa: "/pa.sjɑ̃/" },
    française: { phonetic: "fron-SEZ", ipa: "/fʁɑ̃.sɛz/" },
    lettres: { phonetic: "LET-ruh", ipa: "/lɛtʁ/" },
    chantaient: { phonetic: "shon-TAY", ipa: "/ʃɑ̃.tɛ/" },
    travaillait: { phonetic: "tra-va-YAY", ipa: "/tʁa.va.jɛ/" },
    pendant: { phonetic: "pon-DON", ipa: "/pɑ̃.dɑ̃/" },
  },
  synonymDict: {
    consciencieux: ["soigneux", "attentif"],
    pharmacien: ["vendeur de remèdes"],
    rhumatismes: ["douleurs"],
    particulièrement: ["surtout", "très"],
    imprévisibles: ["pas fixes"],
    sculpteur: ["artiste"],
    tranquillement: ["en calme"],
    difficile: ["dur", "dur à faire"],
    beaucoup: ["plein de", "très"],
    chercheurs: ["experts"],
    contenant: ["avec des"],
    dyslexiques: ["en mal de lire"],
    médicament: ["remède", "pilule"],
    châtaigniers: ["grands arbres"],
    orthographe: ["écriture"],
    graphèmes: ["groupes de lettres"],
    chroniques: ["de longue durée"],
    souffrant: ["en mal de"],
    prescrit: ["donné"],
    examiné: ["étudié", "regardé"],
    muettes: ["sans son"],
    liaisons: ["liens de son"],
    française: ["de France"],
    oiseaux: ["volatiles"],
    travaillait: ["faisait son art"],
    chantaient: ["faisaient du bruit"],
    pendant: ["lors de"],
    patient: ["malade"],
  },

  analyzeWord(word) {
    const lower = word.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüÿçœæ'-]/g, "");
    if (lower.length <= 2) return { score: 0, reasons: [], level: "simple" };

    let score = 0;
    const reasons = [];

    if (this.irregularWords.has(lower)) {
      score += 30;
      reasons.push("Mot irrégulier");
    }

    let complexCount = 0;
    for (const g of this.complexGraphemes) {
      if (lower.includes(g)) complexCount++;
    }
    if (complexCount > 0) {
      score += complexCount * 6;
      reasons.push(`${complexCount} graphème(s) complexe(s)`);
    }

    let silentCount = 0;
    for (const pat of this.silentEndings) {
      if (pat.test(lower)) silentCount++;
    }
    if (silentCount > 0) {
      score += silentCount * 5;
      reasons.push(`Lettres muettes en fin de mot`);
    }

    let nasalCount = 0;
    for (const nv of this.nasalVowels) {
      if (lower.includes(nv)) nasalCount++;
    }
    if (nasalCount > 0) {
      score += nasalCount * 4;
      reasons.push(`${nasalCount} voyelle(s) nasale(s)`);
    }

    if (lower.length > 10) {
      score += (lower.length - 10) * 2;
      reasons.push("Mot long avec morphologie complexe");
    }

    score = Math.min(100, Math.max(0, score));
    let level = "simple";
    if (score >= 50) level = "hard";
    else if (score >= 25) level = "moderate";

    return { score, reasons, level, flaggedGraphemes: [] };
  },
};

// ─── GERMAN NLP ENGINE ──────────────────────────────────────────────────────

const GERMAN_ENGINE = {
  complexGraphemes: [
    "sch", "tsch", "ch", "ck", "pf", "ph", "qu", "sp", "st",
    "ei", "ie", "eu", "äu", "au", "ä", "ö", "ü",
  ],
  irregularWords: new Set([
    "Psychologie", "Rhythmus", "Chrysantheme", "Sympathie",
    "Gleichberechtigung", "Bundesverfassungsgericht",
    "Schmetterlinge", "Wissenschaftliche", "Untersuchungen",
    "Rechtschreibfähigkeiten", "Entwicklungsdyslexie",
    "zusammengesetzte", "Schwierigkeiten", "regelmäßiger",
    "wunderschönen", "Frühlingsgarten",
  ]),

  phoneticDict: {
    gleichberechtigung: { phonetic: "GLYSH-buh-resh-tih-goong", ipa: "/ˈɡlaɪ̯çbəˌʁɛçtɪɡʊŋ/" },
    bundesverfassungsgericht: { phonetic: "BOON-des-fer-fass-oongs-guh-risht", ipa: "/ˈbʊndɛsfɛɐ̯ˌfasʊŋsɡəˌʁɪçt/" },
    schmetterlinge: { phonetic: "SHMET-er-ling-uh", ipa: "/ˈʃmɛtɐlɪŋə/" },
    wissenschaftliche: { phonetic: "VIS-en-shaft-lish-uh", ipa: "/ˈvɪsənʃaftlɪçə/" },
    rechtschreibfähigkeiten: { phonetic: "RESHT-shryb-fay-ish-ky-ten", ipa: "/ˈʁɛçtʃʁaɪ̯pˌfɛːɪçkaɪ̯tən/" },
    entwicklungsdyslexie: { phonetic: "ent-VIK-loongs-düs-lek-SEE", ipa: "/ɛntˈvɪklʊŋsdʏsˌlɛksiː/" },
    zusammengesetzte: { phonetic: "tsoo-ZAM-en-guh-zetst-uh", ipa: "/t͡suˈzamənɡəˌzɛt͡stə/" },
    schwierigkeiten: { phonetic: "SHVEE-rish-ky-ten", ipa: "/ˈʃviːʁɪçkaɪ̯tən/" },
    untersuchungen: { phonetic: "OON-ter-zoo-khoong-en", ipa: "/ˈʊntɐˌzuːxʊŋən/" },
    grundschullehrerin: { phonetic: "GROOND-shool-lay-reh-rin", ipa: "/ˈɡʁʊntʃuːlˌleːʁəʁɪn/" },
    orthographie: { phonetic: "or-to-gra-FEE", ipa: "/ɔʁtoɡʁaˈfiː/" },
    regelmäßiger: { phonetic: "RAY-gel-may-sig-er", ipa: "/ˈʁeːɡəlˌmɛːsɪɡɐ/" },
    wunderschönen: { phonetic: "VOON-der-shuh-nen", ipa: "/ˈvʊndɐˌʃøːnən/" },
    frühlingsgarten: { phonetic: "FROO-lings-gar-ten", ipa: "/ˈfʁyːlɪŋsˌɡaʁtən/" },
    bürger: { phonetic: "BOOR-ger", ipa: "/ˈbʏʁɡɐ/" },
    schüler: { phonetic: "SHOO-ler", ipa: "/ˈʃyːlɐ/" },
    flatterten: { phonetic: "FLAT-er-ten", ipa: "/ˈflatɐtən/" },
    besondere: { phonetic: "beh-ZON-deh-reh", ipa: "/bəˈzɔndəʁə/" },
    entschied: { phonetic: "ent-SHEED", ipa: "/ɛntˈʃiːt/" },
    bereiten: { phonetic: "beh-RY-ten", ipa: "/bəˈʁaɪ̯tən/" },
    untersuchte: { phonetic: "OON-ter-zookh-tuh", ipa: "/ˈʊntɐˌzuːxtə/" },
  },
  synonymDict: {
    gleichberechtigung: ["gleiche Rechte"],
    bundesverfassungsgericht: ["höchstes Gericht"],
    schmetterlinge: ["Falter"],
    wissenschaftliche: ["aus der Forschung"],
    rechtschreibfähigkeiten: ["Können im Schreiben"],
    entwicklungsdyslexie: ["Lese-Störung"],
    zusammengesetzte: ["aus Teilen"],
    schwierigkeiten: ["Probleme"],
    untersuchungen: ["Studien", "Tests"],
    grundschullehrerin: ["Lehrerin"],
    regelmäßiger: ["mit mehr Regeln"],
    wunderschönen: ["sehr schönen"],
    frühlingsgarten: ["Garten im Frühling"],
    orthographie: ["Schreibweise"],
    besondere: ["extra"],
    entschied: ["hat bestimmt"],
  },

  analyzeWord(word) {
    const lower = word.toLowerCase().replace(/[^a-zäöüß'-]/g, "");
    if (lower.length <= 2) return { score: 0, reasons: [], level: "simple" };

    let score = 0;
    const reasons = [];

    if (this.irregularWords.has(word) || this.irregularWords.has(lower)) {
      score += 25;
      reasons.push("Unregelmäßiges Wort");
    }

    let complexCount = 0;
    for (const g of this.complexGraphemes) {
      let idx = lower.indexOf(g);
      while (idx !== -1) {
        complexCount++;
        idx = lower.indexOf(g, idx + 1);
      }
    }
    if (complexCount > 0) {
      score += complexCount * 5;
      reasons.push(`${complexCount} komplexe Grapheme`);
    }

    // Compound word penalty (German speciality)
    if (lower.length > 12) {
      const compoundPenalty = Math.floor((lower.length - 12) * 1.5);
      score += compoundPenalty;
      reasons.push("Langes Kompositum");
    }

    score = Math.min(100, Math.max(0, score));
    let level = "simple";
    if (score >= 45) level = "hard";
    else if (score >= 22) level = "moderate";

    return { score, reasons, level, flaggedGraphemes: [] };
  },
};

// ─── FINNISH NLP ENGINE ─────────────────────────────────────────────────────

const FINNISH_ENGINE = {
  complexGraphemes: ["nk", "ng", "ts"],
  longWords: new Set([
    "lukemishäiriön", "oikeinkirjoitustaitoihin",
    "epäsäännöllisistä", "sanahahmoista", "kaksikielisyys",
    "fonologiseen", "tietoisuuteen", "säännönmukainen",
    "ortografia", "ortografioihin",
  ]),

  phoneticDict: {
    lukemishäiriön: { phonetic: "LOO-ke-mis-hai-ree-uhn", ipa: "/ˈlukemishæiɾiøn/" },
    oikeinkirjoitustaitoihin: { phonetic: "OY-kein-kir-yoy-tus-tai-toy-hin", ipa: "/ˈoi̯kei̯nˌkirjoi̯tusˌtɑi̯toi̯hin/" },
    epäsäännöllisistä: { phonetic: "E-pa-saan-nuhl-li-sis-ta", ipa: "/ˈepæˌsæːnːølːisistæ/" },
    kaksikielisyys: { phonetic: "KAK-si-kie-li-syys", ipa: "/ˈkɑksiˌkielisyːs/" },
    fonologiseen: { phonetic: "FO-no-lo-gi-seen", ipa: "/ˈfonoloɡiseːn/" },
    säännönmukainen: { phonetic: "SAAN-nuhn-moo-kai-nen", ipa: "/ˈsæːnːønˌmukɑi̯nen/" },
    ortografia: { phonetic: "OR-to-gra-fi-a", ipa: "/ˈortoɡrɑfiɑ/" },
    kehityksellisen: { phonetic: "KE-hi-tyk-sel-li-sen", ipa: "/ˈkehitykselːisen/" },
    selvittivät: { phonetic: "SEL-vit-ti-vat", ipa: "/ˈselvitːivæt/" },
    vaikutuksia: { phonetic: "VAI-ku-tuk-si-a", ipa: "/ˈvɑi̯kutuksiɑ/" },
    suomenkielisten: { phonetic: "SUO-men-kie-lis-ten", ipa: "/ˈsuomenkielisten/" },
    professori: { phonetic: "PRO-fes-so-ri", ipa: "/ˈprofesːori/" },
    positiivisesti: { phonetic: "PO-si-tii-vi-ses-ti", ipa: "/ˈpositiːvisesti/" },
    helpottaa: { phonetic: "HEL-pot-taa", ipa: "/ˈhelpotːɑː/" },
    verrattuna: { phonetic: "VER-rat-tu-na", ipa: "/ˈverːɑtːunɑ/" },
    tietoisuuteen: { phonetic: "TIE-toi-suu-teen", ipa: "/ˈtietoi̯suːteːn/" },
    sanahahmoista: { phonetic: "SA-na-hah-mois-ta", ipa: "/ˈsɑnɑˌhɑhmoi̯stɑ/" },
    luennoi: { phonetic: "LUEN-noi", ipa: "/ˈluenːoi̯/" },
    yliopiston: { phonetic: "Y-li-o-pis-ton", ipa: "/ˈyliˌopiston/" },
  },
  synonymDict: {
    lukemishäiriön: ["lukihäiriön"],
    oikeinkirjoitustaitoihin: ["kirjoitustaitoihin"],
    epäsäännöllisistä: ["poikkeavista"],
    kaksikielisyys: ["kaksi kieltä"],
    säännönmukainen: ["selkeä", "tasainen"],
    ortografia: ["kirjoitustapa"],
    kehityksellisen: ["kasvun"],
    vaikutuksia: ["seurauksia"],
    fonologiseen: ["äänteiden"],
    tietoisuuteen: ["tajuun"],
    professori: ["opettaja"],
    positiivisesti: ["hyvällä tavalla"],
  },

  analyzeWord(word) {
    const lower = word.toLowerCase().replace(/[^a-zäö'-]/g, "");
    if (lower.length <= 2) return { score: 0, reasons: [], level: "simple" };

    let score = 0;
    const reasons = [];

    // Finnish is highly transparent — complexity comes mainly from length
    if (this.longWords.has(lower)) {
      score += 20;
      reasons.push("Pitkä yhdyssana (long compound)");
    }

    if (lower.length > 14) {
      score += (lower.length - 14) * 2;
      reasons.push("Pitkä morfeemiketju (long morpheme chain)");
    }

    let complexCount = 0;
    for (const g of this.complexGraphemes) {
      if (lower.includes(g)) complexCount++;
    }
    if (complexCount > 0) {
      score += complexCount * 3;
      reasons.push(`${complexCount} consonant cluster(s)`);
    }

    // Finnish has double letters that are phonemically distinct
    const doubleLetters = lower.match(/(.)\1/g);
    if (doubleLetters && doubleLetters.length > 1) {
      score += doubleLetters.length * 2;
      reasons.push("Multiple geminate consonants/long vowels");
    }

    score = Math.min(100, Math.max(0, score));
    let level = "simple";
    if (score >= 35) level = "hard";
    else if (score >= 15) level = "moderate";

    return { score, reasons, level, flaggedGraphemes: [] };
  },
};

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

function estimatePhonemeCount(word) {
  let count = 0;
  const vowels = "aeiouy";
  let prevWasVowel = false;
  for (let i = 0; i < word.length; i++) {
    const isVowel = vowels.includes(word[i]);
    if (isVowel && !prevWasVowel) count++;
    prevWasVowel = isVowel;
  }
  // silent e
  if (word.endsWith("e") && count > 1) count--;
  // digraphs reduce count
  const digraphs = ["th", "sh", "ch", "ph", "wh", "ck", "ng", "nk"];
  for (const d of digraphs) {
    if (word.includes(d)) count = Math.max(count, count);
  }
  return Math.max(1, count);
}

function checkMorphologicalComplexity(word) {
  let penalty = 0;
  const prefixes = ["un", "re", "pre", "dis", "mis", "over", "under", "anti", "inter", "trans", "super"];
  const suffixes = ["tion", "sion", "ment", "ness", "ible", "able", "ical", "ious", "eous", "ful", "less", "ally", "ence", "ance"];
  for (const p of prefixes) if (word.startsWith(p) && word.length > p.length + 3) penalty += 3;
  for (const s of suffixes) if (word.endsWith(s)) penalty += 4;
  return penalty;
}

function getFrequencyPenalty(word) {
  const highFreq = new Set(["the", "is", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "it", "he", "she", "we", "they", "this", "that", "with", "from", "by", "was", "were", "are", "be", "been", "have", "has", "had", "do", "did", "will", "can", "not", "all", "if", "so", "up", "out", "no", "my", "me"]);
  if (highFreq.has(word)) return 0;
  if (word.length > 8) return 5;
  if (word.length > 12) return 10;
  return 0;
}

// ─── LANGUAGE ENGINE REGISTRY ───────────────────────────────────────────────

const ENGINES = {
  english: ENGLISH_ENGINE,
  french: FRENCH_ENGINE,
  german: GERMAN_ENGINE,
  finnish: FINNISH_ENGINE,
};

// ─── FULL TEXT ANALYSIS ─────────────────────────────────────────────────────

function analyzeText(text, language) {
  const engine = ENGINES[language];
  const config = LANGUAGE_CONFIGS[language];
  if (!engine || !config) return { words: [], overallScore: 0, stats: {} };

  const rawWords = text.split(/(\s+|(?=[.,;:!?"""''()\[\]{}—–-])|(?<=[.,;:!?"""''()\[\]{}—–-]))/);
  const analyzed = [];
  let totalScore = 0;
  let wordCount = 0;
  let hardCount = 0;
  let moderateCount = 0;
  let simpleCount = 0;

  for (const token of rawWords) {
    if (!token) continue;
    const stripped = token.replace(/[^a-zA-ZàâäéèêëïîôùûüÿçœæäöüßÄÖÜ'-]/g, "");
    if (stripped.length <= 1) {
      analyzed.push({ text: token, score: 0, level: "punctuation", reasons: [] });
      continue;
    }

    const result = engine.analyzeWord(stripped);
    const lower = stripped.toLowerCase();

    const phonetic = engine.phoneticDict?.[lower] || null;
    const synonyms = engine.synonymDict?.[lower] || null;

    analyzed.push({
      text: token,
      cleanText: stripped,
      lower,
      ...result,
      phonetic,
      synonyms,
    });

    if (result.level !== "punctuation") {
      totalScore += result.score;
      wordCount++;
      if (result.level === "hard") hardCount++;
      else if (result.level === "moderate") moderateCount++;
      else simpleCount++;
    }
  }

  const avgScore = wordCount > 0 ? totalScore / wordCount : 0;
  // Weight by language opacity
  const adjustedScore = avgScore * (1 + config.opacity * 0.5);
  const overallScore = Math.min(100, Math.round(adjustedScore));

  return {
    words: analyzed,
    overallScore,
    stats: {
      totalWords: wordCount,
      hardWords: hardCount,
      moderateWords: moderateCount,
      simpleWords: simpleCount,
      hardRatio: wordCount > 0 ? (hardCount / wordCount * 100).toFixed(1) : 0,
      avgWordScore: avgScore.toFixed(1),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REACT UI COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const FONT_LINK = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap";

export default function OrthographicAnalyzer() {
  const [language, setLanguage] = useState("english");
  const [inputText, setInputText] = useState(LANGUAGE_CONFIGS.english.defaultText);
  const [analysis, setAnalysis] = useState(null);
  const [hoveredWord, setHoveredWord] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [hasRun, setHasRun] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const tooltipRef = useRef(null);
  const textDisplayRef = useRef(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = FONT_LINK;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    setInputText(LANGUAGE_CONFIGS[language].defaultText);
    setAnalysis(null);
    setHasRun(false);
  }, [language]);

  const runAnalysis = useCallback(() => {
    const result = analyzeText(inputText, language);
    setAnalysis(result);
    setHasRun(true);
  }, [inputText, language]);

  const handleWordHover = useCallback((e, word) => {
    if (word.level === "punctuation" || word.score < 30) return;
    const rect = e.target.getBoundingClientRect();
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    setHoveredWord(word);
  }, []);

  const handleWordLeave = useCallback(() => {
    setHoveredWord(null);
  }, []);

  const getScoreColor = (score) => {
    if (score >= 70) return "#d62839";
    if (score >= 50) return "#e56b2c";
    if (score >= 30) return "#d4a017";
    return "var(--text-muted)";
  };

  const getScoreLabel = (score) => {
    if (score >= 75) return { text: "Extremely Opaque", color: "#d62839" };
    if (score >= 55) return { text: "Highly Complex", color: "#e56b2c" };
    if (score >= 35) return { text: "Moderately Complex", color: "#d4a017" };
    if (score >= 15) return { text: "Mildly Complex", color: "#6b8f71" };
    return { text: "Transparent", color: "#4a9e6b" };
  };

  const hardWords = useMemo(() => {
    if (!analysis) return [];
    return analysis.words
      .filter((w) => w.level === "hard")
      .sort((a, b) => b.score - a.score);
  }, [analysis]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.titleGroup}>
            <span style={styles.tagline}>Psycholinguistic Grain Size Theory</span>
            <h1 style={styles.title}>Orthographic Complexity Analyzer</h1>
            <p style={styles.subtitle}>
              Evaluates grapheme-to-phoneme consistency, vowel ambiguity, silent letters,
              and morphological opacity — not just syllable counts
            </p>
          </div>
        </div>
      </header>

      {/* Language Selector */}
      <div style={styles.langSection}>
        <div style={styles.langLabel}>Orthographic System</div>
        <div style={styles.langGrid}>
          {Object.entries(LANGUAGE_CONFIGS).map(([key, cfg]) => (
            <button
              key={key}
              style={{
                ...styles.langBtn,
                ...(language === key ? styles.langBtnActive : {}),
              }}
              onClick={() => setLanguage(key)}
            >
              <span style={styles.langFlag}>{cfg.flag}</span>
              <span style={styles.langName}>{cfg.name}</span>
              <span style={styles.langDesc}>{cfg.description}</span>
              <div style={styles.opacityBar}>
                <div
                  style={{
                    ...styles.opacityFill,
                    width: `${cfg.opacity * 100}%`,
                    background:
                      cfg.opacity > 0.6
                        ? "#d62839"
                        : cfg.opacity > 0.3
                        ? "#d4a017"
                        : "#4a9e6b",
                  }}
                />
              </div>
              <span style={styles.opacityLabel}>
                Opacity: {(cfg.opacity * 100).toFixed(0)}%
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={styles.inputSection}>
        <div style={styles.inputHeader}>
          <label style={styles.inputLabel}>Input Text</label>
          <span style={styles.wordCountLabel}>
            {inputText.split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
        <textarea
          style={styles.textarea}
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setHasRun(false);
          }}
          placeholder="Paste or type text to analyze..."
          rows={6}
        />
        <button style={styles.analyzeBtn} onClick={runAnalysis}>
          <span style={styles.analyzeBtnIcon}>◉</span>
          Run Orthographic Analysis
        </button>
      </div>

      {/* Results */}
      {analysis && hasRun && (
        <div style={styles.results}>
          {/* Score Dashboard */}
          <div style={styles.dashboard}>
            <div style={styles.scoreCard}>
              <div style={styles.scoreRing}>
                <svg viewBox="0 0 120 120" style={styles.scoreSvg}>
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke={getScoreColor(analysis.overallScore)}
                    strokeWidth="8"
                    strokeDasharray={`${(analysis.overallScore / 100) * 327} 327`}
                    strokeDashoffset="0"
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                    style={{ transition: "stroke-dasharray 1s ease" }}
                  />
                </svg>
                <div style={styles.scoreNumber}>
                  <span style={{ ...styles.scoreValue, color: getScoreColor(analysis.overallScore) }}>
                    {analysis.overallScore}
                  </span>
                  <span style={styles.scoreMax}>/100</span>
                </div>
              </div>
              <div
                style={{
                  ...styles.scoreLabel,
                  color: getScoreLabel(analysis.overallScore).color,
                }}
              >
                {getScoreLabel(analysis.overallScore).text}
              </div>
              <div style={styles.scoreSublabel}>
                Orthographic Complexity Score
              </div>
            </div>

            <div style={styles.statsGrid}>
              <div style={styles.statItem}>
                <span style={styles.statNum}>{analysis.stats.totalWords}</span>
                <span style={styles.statLabel}>Total Words</span>
              </div>
              <div style={styles.statItem}>
                <span style={{ ...styles.statNum, color: "#d62839" }}>
                  {analysis.stats.hardWords}
                </span>
                <span style={styles.statLabel}>Hard Words</span>
              </div>
              <div style={styles.statItem}>
                <span style={{ ...styles.statNum, color: "#d4a017" }}>
                  {analysis.stats.moderateWords}
                </span>
                <span style={styles.statLabel}>Moderate</span>
              </div>
              <div style={styles.statItem}>
                <span style={{ ...styles.statNum, color: "#4a9e6b" }}>
                  {analysis.stats.simpleWords}
                </span>
                <span style={styles.statLabel}>Simple</span>
              </div>
              <div style={styles.statItem}>
                <span style={{ ...styles.statNum, color: "#e56b2c" }}>
                  {analysis.stats.hardRatio}%
                </span>
                <span style={styles.statLabel}>Hard Ratio</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statNum}>
                  {analysis.stats.avgWordScore}
                </span>
                <span style={styles.statLabel}>Avg Score</span>
              </div>
            </div>
          </div>

          {/* Analyzed Text Display */}
          <div style={styles.textSection}>
            <div style={styles.textSectionHeader}>
              <h3 style={styles.sectionTitle}>Analyzed Text</h3>
              <p style={styles.sectionHint}>
                Hover over highlighted words to see phonetic respelling & simpler synonyms
              </p>
            </div>
            <div style={styles.textDisplay} ref={textDisplayRef}>
              {analysis.words.map((word, i) => {
                if (word.level === "punctuation") {
                  return (
                    <span key={i} style={styles.punctuation}>
                      {word.text}
                    </span>
                  );
                }

                const isHard = word.level === "hard";
                const isMod = word.level === "moderate";
                const hasInfo = word.score >= 30;

                return (
                  <span
                    key={i}
                    style={{
                      ...styles.word,
                      ...(isHard
                        ? styles.wordHard
                        : isMod
                        ? styles.wordModerate
                        : {}),
                      cursor: hasInfo ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => handleWordHover(e, word)}
                    onMouseLeave={handleWordLeave}
                  >
                    {word.text}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Tooltip */}
          {hoveredWord && (
            <div
              ref={tooltipRef}
              style={{
                ...styles.tooltip,
                left: tooltipPos.x,
                top: tooltipPos.y,
              }}
            >
              <div style={styles.tooltipArrow} />
              <div style={styles.tooltipWord}>{hoveredWord.cleanText}</div>
              <div style={styles.tooltipScore}>
                Complexity: {hoveredWord.score}/100
              </div>

              {hoveredWord.phonetic && (
                <div style={styles.tooltipSection}>
                  <div style={styles.tooltipLabel}>Phonetic Respelling</div>
                  <div style={styles.tooltipPhonetic}>
                    {hoveredWord.phonetic.phonetic}
                  </div>
                  <div style={styles.tooltipIpa}>{hoveredWord.phonetic.ipa}</div>
                </div>
              )}

              {hoveredWord.synonyms && hoveredWord.synonyms.length > 0 && (
                <div style={styles.tooltipSection}>
                  <div style={styles.tooltipLabel}>Simpler Alternatives</div>
                  <div style={styles.tooltipSynonyms}>
                    {hoveredWord.synonyms.map((s, i) => (
                      <span key={i} style={styles.synonymChip}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {hoveredWord.reasons.length > 0 && (
                <div style={styles.tooltipSection}>
                  <div style={styles.tooltipLabel}>Why it's complex</div>
                  {hoveredWord.reasons.map((r, i) => (
                    <div key={i} style={styles.tooltipReason}>
                      • {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hard Words Breakdown */}
          {hardWords.length > 0 && (
            <div style={styles.breakdownSection}>
              <button
                style={styles.breakdownToggle}
                onClick={() => setShowBreakdown(!showBreakdown)}
              >
                <span>
                  {showBreakdown ? "▼" : "▶"} Orthographic Bottleneck Words ({hardWords.length})
                </span>
              </button>
              {showBreakdown && (
                <div style={styles.breakdownList}>
                  {hardWords.map((w, i) => (
                    <div key={i} style={styles.breakdownItem}>
                      <div style={styles.breakdownWordRow}>
                        <span style={styles.breakdownWord}>{w.cleanText}</span>
                        <span
                          style={{
                            ...styles.breakdownScore,
                            color: getScoreColor(w.score),
                          }}
                        >
                          {w.score}
                        </span>
                      </div>
                      {w.phonetic && (
                        <div style={styles.breakdownPhonetic}>
                          {w.phonetic.phonetic}{" "}
                          <span style={styles.breakdownIpa}>
                            {w.phonetic.ipa}
                          </span>
                        </div>
                      )}
                      {w.synonyms && (
                        <div style={styles.breakdownSynonyms}>
                          → {w.synonyms.join(", ")}
                        </div>
                      )}
                      <div style={styles.breakdownReasons}>
                        {w.reasons.map((r, j) => (
                          <span key={j} style={styles.reasonTag}>
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Methodology Note */}
          <div style={styles.methodology}>
            <h4 style={styles.methodTitle}>Methodology</h4>
            <p style={styles.methodText}>
              This analyzer implements the Psycholinguistic Grain Size Theory
              (Ziegler & Goswami, 2005). Instead of classical readability metrics
              that count syllables and sentence length, it evaluates the
              consistency of grapheme-to-phoneme (G→P) mappings across the entire
              word. Factors include: multi-letter grapheme complexity, vowel
              digraph ambiguity, silent letter patterns, G→P ratio, morphological
              opacity, and language-specific orthographic depth. Each language
              engine uses custom NLP rules calibrated to its writing system's
              transparency.
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

const styles = {
  container: {
    fontFamily: "'DM Sans', sans-serif",
    maxWidth: 920,
    margin: "0 auto",
    padding: "0 20px 60px",
    color: "#e8e4df",
    background: "transparent",
    minHeight: "100vh",
  },
  header: {
    padding: "40px 0 24px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    marginBottom: 32,
  },
  headerInner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  titleGroup: {},
  tagline: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: "#9b8e7e",
    display: "block",
    marginBottom: 8,
  },
  title: {
    fontFamily: "'Instrument Serif', serif",
    fontSize: 38,
    fontWeight: 400,
    color: "#f5f0eb",
    margin: "0 0 8px",
    lineHeight: 1.1,
  },
  subtitle: {
    fontSize: 14,
    color: "#9b8e7e",
    margin: 0,
    maxWidth: 560,
    lineHeight: 1.5,
  },

  // Language selector
  langSection: {
    marginBottom: 28,
  },
  langLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#7a6f63",
    marginBottom: 12,
  },
  langGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
  },
  langBtn: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10,
    padding: "14px 12px",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.2s",
    color: "#c4bbb2",
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  langBtnActive: {
    background: "rgba(214, 160, 23, 0.08)",
    borderColor: "rgba(214, 160, 23, 0.35)",
    color: "#f5f0eb",
  },
  langFlag: { fontSize: 20 },
  langName: { fontWeight: 600, fontSize: 14 },
  langDesc: { fontSize: 10, color: "#8a7e72", lineHeight: 1.3 },
  opacityBar: {
    height: 3,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 2,
    marginTop: 6,
    overflow: "hidden",
  },
  opacityFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.4s",
  },
  opacityLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9,
    color: "#6b5f53",
    marginTop: 2,
  },

  // Input
  inputSection: {
    marginBottom: 28,
  },
  inputHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  inputLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#7a6f63",
  },
  wordCountLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#6b5f53",
  },
  textarea: {
    width: "100%",
    minHeight: 150,
    padding: 16,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#e8e4df",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    lineHeight: 1.7,
    resize: "vertical",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  analyzeBtn: {
    marginTop: 14,
    padding: "14px 32px",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #d4a017, #c4880c)",
    color: "#1a1714",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    transition: "transform 0.15s, box-shadow 0.15s",
  },
  analyzeBtnIcon: { fontSize: 16 },

  // Results
  results: {},
  dashboard: {
    display: "grid",
    gridTemplateColumns: "240px 1fr",
    gap: 24,
    marginBottom: 32,
    padding: 24,
    background: "rgba(255,255,255,0.02)",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.05)",
  },
  scoreCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreRing: {
    position: "relative",
    width: 120,
    height: 120,
  },
  scoreSvg: { width: "100%", height: "100%" },
  scoreNumber: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    textAlign: "center",
  },
  scoreValue: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 32,
    fontWeight: 500,
  },
  scoreMax: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 13,
    color: "#6b5f53",
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: 600,
    marginTop: 10,
  },
  scoreSublabel: {
    fontSize: 10,
    color: "#6b5f53",
    fontFamily: "'DM Mono', monospace",
    marginTop: 2,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    alignContent: "center",
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    padding: "12px 14px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.04)",
  },
  statNum: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 22,
    fontWeight: 500,
    color: "#e8e4df",
  },
  statLabel: {
    fontSize: 10,
    color: "#7a6f63",
    fontFamily: "'DM Mono', monospace",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    marginTop: 2,
  },

  // Text display
  textSection: {
    marginBottom: 28,
  },
  textSectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: "'Instrument Serif', serif",
    fontSize: 22,
    fontWeight: 400,
    color: "#f5f0eb",
    margin: "0 0 4px",
  },
  sectionHint: {
    fontSize: 12,
    color: "#7a6f63",
    margin: 0,
  },
  textDisplay: {
    padding: 24,
    background: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.05)",
    lineHeight: 2.2,
    fontSize: 15,
    position: "relative",
  },
  word: {
    transition: "all 0.15s",
    borderRadius: 3,
    padding: "2px 0",
  },
  wordHard: {
    color: "#ef5350",
    borderBottom: "2px solid rgba(239, 83, 80, 0.5)",
    fontWeight: 500,
    padding: "2px 1px",
  },
  wordModerate: {
    color: "#d4a017",
    borderBottom: "1px dashed rgba(212, 160, 23, 0.35)",
    padding: "2px 1px",
  },
  punctuation: {
    color: "#6b5f53",
  },

  // Tooltip
  tooltip: {
    position: "fixed",
    transform: "translate(-50%, -100%)",
    marginTop: -8,
    background: "#2a2520",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: "16px 18px",
    minWidth: 240,
    maxWidth: 340,
    zIndex: 1000,
    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
  },
  tooltipArrow: {
    position: "absolute",
    bottom: -6,
    left: "50%",
    transform: "translateX(-50%) rotate(45deg)",
    width: 12,
    height: 12,
    background: "#2a2520",
    border: "1px solid rgba(255,255,255,0.12)",
    borderTop: "none",
    borderLeft: "none",
  },
  tooltipWord: {
    fontFamily: "'Instrument Serif', serif",
    fontSize: 20,
    color: "#f5f0eb",
    marginBottom: 4,
  },
  tooltipScore: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#9b8e7e",
    marginBottom: 12,
  },
  tooltipSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  tooltipLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#6b5f53",
    marginBottom: 5,
  },
  tooltipPhonetic: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 15,
    color: "#d4a017",
    fontWeight: 500,
  },
  tooltipIpa: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    color: "#8a7e72",
    marginTop: 2,
  },
  tooltipSynonyms: {
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
  },
  synonymChip: {
    display: "inline-block",
    padding: "3px 10px",
    background: "rgba(74, 158, 107, 0.12)",
    border: "1px solid rgba(74, 158, 107, 0.25)",
    borderRadius: 20,
    fontSize: 12,
    color: "#6bc98f",
    fontWeight: 500,
  },
  tooltipReason: {
    fontSize: 11,
    color: "#9b8e7e",
    lineHeight: 1.5,
  },

  // Breakdown
  breakdownSection: {
    marginBottom: 28,
  },
  breakdownToggle: {
    width: "100%",
    padding: "14px 18px",
    background: "rgba(214, 40, 57, 0.06)",
    border: "1px solid rgba(214, 40, 57, 0.15)",
    borderRadius: 10,
    color: "#ef5350",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.2s",
  },
  breakdownList: {
    marginTop: 10,
    display: "grid",
    gap: 8,
  },
  breakdownItem: {
    padding: "14px 16px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.05)",
  },
  breakdownWordRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  breakdownWord: {
    fontFamily: "'Instrument Serif', serif",
    fontSize: 18,
    color: "#f5f0eb",
  },
  breakdownScore: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 16,
    fontWeight: 500,
  },
  breakdownPhonetic: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 13,
    color: "#d4a017",
    marginBottom: 4,
  },
  breakdownIpa: {
    color: "#8a7e72",
    fontSize: 11,
  },
  breakdownSynonyms: {
    fontSize: 12,
    color: "#6bc98f",
    marginBottom: 6,
  },
  breakdownReasons: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
  },
  reasonTag: {
    display: "inline-block",
    padding: "2px 8px",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 4,
    fontSize: 10,
    color: "#9b8e7e",
    fontFamily: "'DM Mono', monospace",
  },

  // Methodology
  methodology: {
    padding: "20px 22px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.04)",
  },
  methodTitle: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#7a6f63",
    margin: "0 0 8px",
  },
  methodText: {
    fontSize: 12,
    lineHeight: 1.7,
    color: "#8a7e72",
    margin: 0,
  },
};