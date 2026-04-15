import { useState, useRef, useEffect, useCallback, useMemo } from "react";

/*
 * ══════════════════════════════════════════════════════════════════════════════
 * ORTHOGRAPHIC COMPLEXITY ANALYZER v2
 * Based on Psycholinguistic Grain Size Theory (Ziegler & Goswami, 2005)
 *
 * Architecture:
 *   LAYER 1 — Rule-based orthographic scoring (algorithmic, instant)
 *             Evaluates G→P consistency, vowel ambiguity, silent patterns,
 *             morphological opacity across the WHOLE word
 *
 *   LAYER 2 — Claude API for dynamic NLP (no hardcoded dictionaries)
 *             Generates phonetic respellings, IPA, contextual synonyms,
 *             and linguistic explanations in any supported language
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ─── LANGUAGE CONFIGURATIONS ────────────────────────────────────────────────

const LANGUAGES = {
  english: {
    name: "English",
    flag: "🇬🇧",
    desc: "Deep orthography — highly inconsistent G→P mappings",
    opacity: 0.87,
    defaultText: `The knight knew that the colonel's daughter had a cough, though she thought it was through a draught from the ancient plough shed. Their neighbour's yacht was moored by the quay, where foreign psychologists were studying the subtle phenomenon of dyslexia. The researchers measured each participant's ability to decipher words with ambiguous orthographic patterns. Preliminary results suggested that individuals with developmental reading difficulties experienced heightened interference when encountering graphemically opaque vocabulary.`,
  },
  french: {
    name: "Français",
    flag: "🇫🇷",
    desc: "Deep orthography — silent endings, nasal vowels, complex digraphs",
    opacity: 0.78,
    defaultText: `Les chercheurs ont examiné comment les enfants dyslexiques traitent les mots contenant des graphèmes complexes. Le pharmacien consciencieux a prescrit un médicament pour le patient souffrant de rhumatismes chroniques. Beaucoup de gens trouvent que l'orthographe française est particulièrement difficile à cause des lettres muettes et des liaisons imprévisibles.`,
  },
  german: {
    name: "Deutsch",
    flag: "🇩🇪",
    desc: "Medium orthography — regular rules but extreme compounding",
    opacity: 0.35,
    defaultText: `Die Grundschullehrerin untersuchte die Rechtschreibfähigkeiten der Schüler mit Entwicklungsdyslexie. Das Bundesverfassungsgericht entschied über die Gleichberechtigung aller Bürger. Wissenschaftliche Untersuchungen zeigen, dass die deutsche Orthographie zwar regelmäßiger ist als die englische, aber zusammengesetzte Wörter besondere Schwierigkeiten bereiten.`,
  },
  finnish: {
    name: "Suomi",
    flag: "🇫🇮",
    desc: "Shallow orthography — nearly 1:1 grapheme-phoneme mapping",
    opacity: 0.08,
    defaultText: `Tutkijat selvittivät kehityksellisen lukemishäiriön vaikutuksia suomenkielisten lasten oikeinkirjoitustaitoihin. Yliopiston professori luennoi epäsäännöllisistä sanahahmoista. Suomen kielen ortografia on erittäin säännönmukainen, mikä helpottaa lukemaan oppimista verrattuna syviin ortografioihin.`,
  },
};

// ─── ORTHOGRAPHIC SCORING ENGINE (Layer 1 — Rule-based, per-language) ───────
// This is genuinely algorithmic work: pattern matching, entropy calculation,
// ratio math. Not something to delegate to an LLM.

const SCORING = {
  english: {
    // Multi-letter graphemes — context-dependent pronunciation units
    complexGraphemes: [
      "ough","augh","eigh","tion","sion","cian","tial","cial","ious","eous",
      "ight","ould","ence","ance","ture","sure","tch","dge","kn","wr","gn",
      "pn","ps","ph","gh","wh","ck","qu","th","sh","ch","ng","nk","igh",
      "ew","aw","ow","ou","oi","oy","au","ei","ie","ea","oo","ai","ay",
      "ey","oe","ue","ui",
    ],
    // Silent letter detection patterns
    silentPatterns: [
      { re: /\bkn/i, label: "silent k before n" },
      { re: /\bwr/i, label: "silent w before r" },
      { re: /\bgn\b/i, label: "silent g" },
      { re: /\bpn/i, label: "silent p before n" },
      { re: /\bps/i, label: "silent p before s" },
      { re: /mb\b/i, label: "silent b after m" },
      { re: /mn\b/i, label: "silent n after m" },
      { re: /ght/i, label: "silent gh" },
      { re: /stl/i, label: "silent t" },
      { re: /lk\b/i, label: "silent l before k" },
      { re: /lm\b/i, label: "silent l before m" },
    ],
    // Vowel graphemes that map to MULTIPLE phonemes (source of ambiguity)
    ambiguousVowels: {
      ea: 3, oo: 2, ou: 4, ow: 2, ough: 6, ie: 2, ei: 3, oe: 2,
    },
    // Known high-irregularity words (G→P completely unpredictable)
    irregulars: new Set([
      "colonel","lieutenant","yacht","quay","queue","knight","knife","know",
      "knee","knot","write","wrong","wrist","island","isle","aisle","corps",
      "ballet","depot","subtle","debt","doubt","receipt","indict","salmon",
      "almond","calm","palm","half","calf","talk","walk","chalk","folk",
      "yolk","hour","honour","honest","heir","women","bury","busy",
      "business","minute","ocean","special","ancient","conscience",
      "conscious","science","scissors","muscle","scene","scent","people",
      "leopard","foreign","sovereign","reign","feign","sign","design",
      "paradigm","phlegm","pneumonia","psalm","psychology","pseudonym",
      "rhythm","through","though","thought","thorough","enough","rough",
      "tough","cough","bough","dough","bought","brought","caught","taught",
      "daughter","slaughter","draught","plough","neighbour","beautiful",
      "phenomenon","catastrophe","epitome","hyperbole","decipher",
      "wednesday","february","comfortable","temperature","chocolate",
    ]),
    analyze(word) {
      const w = word.toLowerCase().replace(/[^a-z'-]/g, "");
      if (w.length <= 2) return { score: 0, reasons: [], level: "simple" };
      let score = 0;
      const reasons = [];

      // 1. Irregularity check
      if (this.irregulars.has(w)) {
        score += 28;
        reasons.push("Irregular word — unpredictable G→P mapping");
      }

      // 2. Complex grapheme density across the WHOLE word
      let cgCount = 0;
      const found = [];
      const seen = new Set();
      for (const g of this.complexGraphemes) {
        let idx = w.indexOf(g);
        while (idx !== -1) {
          const key = `${idx}:${g}`;
          if (!seen.has(key)) { seen.add(key); cgCount++; found.push(g); }
          idx = w.indexOf(g, idx + 1);
        }
      }
      if (cgCount > 0) {
        score += cgCount * 7;
        const unique = [...new Set(found)];
        reasons.push(`${cgCount} complex grapheme(s): ${unique.map(g => `⟨${g}⟩`).join(" ")}`);
      }

      // 3. Silent letters
      for (const sp of this.silentPatterns) {
        if (sp.re.test(w)) { score += 14; reasons.push(`Silent letter pattern: ${sp.label}`); }
      }

      // 4. Vowel ambiguity (entropy proxy)
      for (const [vg, nSounds] of Object.entries(this.ambiguousVowels)) {
        if (w.includes(vg)) {
          score += nSounds * 3;
          reasons.push(`Ambiguous vowel ⟨${vg}⟩ — ${nSounds} possible phoneme mappings`);
        }
      }

      // 5. Letter-to-phoneme ratio (whole word)
      const estPhonemes = estimatePhonemes(w);
      const ratio = w.length / Math.max(estPhonemes, 1);
      if (ratio > 1.5) {
        score += (ratio - 1.5) * 10;
        reasons.push(`High letter:phoneme ratio (${ratio.toFixed(1)}:1)`);
      }

      // 6. Morphological complexity
      const morp = morphScore(w);
      if (morp > 0) { score += morp; reasons.push("Complex morphological structure (affixes altering pronunciation)"); }

      score = clamp(score);
      return { score, reasons, level: scoreLevel(score, 55, 28) };
    },
  },

  french: {
    complexGraphemes: [
      "eau","aux","eux","oux","tion","sion","ille","aille","eille","ouille",
      "euil","ueil","oi","ou","ai","ei","au","en","an","in","un","on",
      "gn","ph","ch","qu","gu",
    ],
    silentEndings: [/e\b/, /s\b/, /t\b/, /ent\b/, /x\b/, /d\b/, /p\b/],
    nasals: ["an","en","in","on","un","ain","ein","ien"],
    analyze(word) {
      const w = word.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüÿçœæ'-]/g, "");
      if (w.length <= 2) return { score: 0, reasons: [], level: "simple" };
      let score = 0;
      const reasons = [];

      let cg = 0;
      for (const g of this.complexGraphemes) { if (w.includes(g)) cg++; }
      if (cg) { score += cg * 6; reasons.push(`${cg} complex grapheme(s)`); }

      let sl = 0;
      for (const p of this.silentEndings) { if (p.test(w)) sl++; }
      if (sl) { score += sl * 5; reasons.push("Silent ending letter(s)"); }

      let ns = 0;
      for (const n of this.nasals) { if (w.includes(n)) ns++; }
      if (ns) { score += ns * 4; reasons.push(`${ns} nasal vowel(s)`); }

      if (w.length > 10) { score += (w.length - 10) * 2; reasons.push("Long morphologically complex word"); }

      score = clamp(score);
      return { score, reasons, level: scoreLevel(score, 48, 24) };
    },
  },

  german: {
    complexGraphemes: ["sch","tsch","ch","ck","pf","ph","qu","sp","st","ei","ie","eu","äu","au"],
    analyze(word) {
      const w = word.toLowerCase().replace(/[^a-zäöüß'-]/g, "");
      if (w.length <= 2) return { score: 0, reasons: [], level: "simple" };
      let score = 0;
      const reasons = [];

      let cg = 0;
      for (const g of this.complexGraphemes) {
        let idx = w.indexOf(g);
        while (idx !== -1) { cg++; idx = w.indexOf(g, idx + 1); }
      }
      if (cg) { score += cg * 5; reasons.push(`${cg} complex grapheme(s)`); }

      if (w.length > 12) {
        score += Math.floor((w.length - 12) * 2.5);
        reasons.push("Long compound word (Kompositum)");
      }

      score = clamp(score);
      return { score, reasons, level: scoreLevel(score, 42, 20) };
    },
  },

  finnish: {
    analyze(word) {
      const w = word.toLowerCase().replace(/[^a-zäö'-]/g, "");
      if (w.length <= 2) return { score: 0, reasons: [], level: "simple" };
      let score = 0;
      const reasons = [];

      if (w.length > 14) {
        score += (w.length - 14) * 2.5;
        reasons.push("Long morpheme chain / compound word");
      }

      const geminates = w.match(/(.)\1/g);
      if (geminates && geminates.length > 1) {
        score += geminates.length * 2;
        reasons.push("Multiple geminate consonants / long vowels");
      }

      for (const g of ["nk", "ng", "ts"]) {
        if (w.includes(g)) { score += 3; reasons.push(`Consonant cluster ⟨${g}⟩`); }
      }

      score = clamp(score);
      return { score, reasons, level: scoreLevel(score, 32, 14) };
    },
  },
};

function estimatePhonemes(w) {
  let c = 0; let pv = false;
  for (const ch of w) {
    const v = "aeiouy".includes(ch);
    if (v && !pv) c++;
    pv = v;
  }
  if (w.endsWith("e") && c > 1) c--;
  return Math.max(1, c);
}

function morphScore(w) {
  let p = 0;
  for (const px of ["un","re","pre","dis","mis","over","under","anti","inter","trans","super"]) {
    if (w.startsWith(px) && w.length > px.length + 3) p += 3;
  }
  for (const sx of ["tion","sion","ment","ness","ible","able","ical","ious","eous","ence","ance","ally"]) {
    if (w.endsWith(sx)) p += 4;
  }
  return p;
}

function clamp(s) { return Math.min(100, Math.max(0, Math.round(s))); }
function scoreLevel(s, hard, mod) {
  if (s >= hard) return "hard";
  if (s >= mod) return "moderate";
  return "simple";
}

// ─── TEXT TOKENIZER ─────────────────────────────────────────────────────────

function tokenize(text) {
  // Split preserving whitespace and punctuation as separate tokens
  return text.split(/(\s+|(?=[.,;:!?"""''()\[\]{}—–\-])|(?<=[.,;:!?"""''()\[\]{}—–\-]))/).filter(Boolean);
}

function isWord(token) {
  return /[a-zA-ZàâäéèêëïîôùûüÿçœæäöüßÄÖÜ]{2,}/.test(token);
}

// ─── CLAUDE API INTEGRATION (Layer 2 — Dynamic NLP) ────────────────────────

async function fetchNLPData(words, fullText, language) {
  const langName = LANGUAGES[language].name;
  const wordList = words.map(w => w.text).join(", ");

  const prompt = `You are a computational linguistics engine. Analyze the following words IN CONTEXT of the full passage below.

LANGUAGE: ${langName}
FULL TEXT (for context): "${fullText}"
WORDS TO ANALYZE: [${wordList}]

For EACH word, provide:
1. **phonetic**: A simple phonetic respelling (Merriam-Webster/Oxford style for English, equivalent standard for other languages). Use CAPS for stressed syllables, hyphens between syllables.
2. **ipa**: IPA transcription
3. **synonyms**: 1-2 orthographically SIMPLER synonyms/alternatives that preserve meaning IN THIS CONTEXT. Choose words with more transparent/regular spelling. If no simpler alternative exists, return empty array.
4. **explanation**: One short sentence explaining WHY this word is orthographically difficult (what specific grapheme-phoneme inconsistencies, silent letters, or irregularities it contains).

Return ONLY a JSON object — no markdown, no backticks, no preamble. Format:
{"words": {"wordone": {"phonetic": "...", "ipa": "...", "synonyms": ["...", "..."], "explanation": "..."}, "wordtwo": {...}}}

Use lowercase keys matching the original words (lowercased). Be precise with IPA.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: "You are a precise computational linguistics engine. Return ONLY valid JSON. No markdown fences, no explanation text outside the JSON. Every response must be a single JSON object.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.map(b => b.type === "text" ? b.text : "").join("") || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return parsed.words || parsed;
  } catch (err) {
    console.error("NLP API error:", err);
    return null;
  }
}

// ─── MAIN ANALYSIS PIPELINE ────────────────────────────────────────────────

function runRuleBasedAnalysis(text, language) {
  const engine = SCORING[language];
  const tokens = tokenize(text);
  const analyzed = [];
  let totalScore = 0, wordCount = 0, hard = 0, moderate = 0, simple = 0;

  for (const token of tokens) {
    if (!isWord(token)) {
      analyzed.push({ text: token, type: "punct", score: 0, level: "punct", reasons: [] });
      continue;
    }

    const clean = token.replace(/[^a-zA-ZàâäéèêëïîôùûüÿçœæäöüßÄÖÜ'-]/g, "");
    const result = engine.analyze(clean);
    analyzed.push({
      text: token,
      clean,
      lower: clean.toLowerCase(),
      type: "word",
      ...result,
      nlp: null, // will be filled by API
    });
    totalScore += result.score;
    wordCount++;
    if (result.level === "hard") hard++;
    else if (result.level === "moderate") moderate++;
    else simple++;
  }

  const avg = wordCount > 0 ? totalScore / wordCount : 0;
  const langOpacity = LANGUAGES[language].opacity;
  const overall = clamp(avg * (1 + langOpacity * 0.5));

  return {
    words: analyzed,
    overall,
    stats: { total: wordCount, hard, moderate, simple, hardPct: wordCount ? (hard/wordCount*100).toFixed(1) : "0", avg: avg.toFixed(1) },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REACT UI
// ═══════════════════════════════════════════════════════════════════════════════

const FONTS = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,400&family=Sora:wght@300;400;500;600;700&display=swap";

export default function App() {
  const [lang, setLang] = useState("english");
  const [input, setInput] = useState(LANGUAGES.english.defaultText);
  const [analysis, setAnalysis] = useState(null);
  const [nlpData, setNlpData] = useState({});
  const [loading, setLoading] = useState(false);
  const [nlpLoading, setNlpLoading] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showList, setShowList] = useState(false);
  const [nlpProgress, setNlpProgress] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    const l = document.createElement("link");
    l.href = FONTS; l.rel = "stylesheet";
    document.head.appendChild(l);
  }, []);

  useEffect(() => {
    setInput(LANGUAGES[lang].defaultText);
    setAnalysis(null);
    setNlpData({});
  }, [lang]);

  const analyze = useCallback(async () => {
    setLoading(true);
    setNlpData({});
    setNlpProgress("");
    setShowList(false);

    // Step 1: Instant rule-based scoring
    const result = runRuleBasedAnalysis(input, lang);
    setAnalysis(result);
    setLoading(false);

    // Step 2: Fetch NLP data for complex words via Claude API
    const complexWords = result.words.filter(w => w.type === "word" && w.score >= 28);
    if (complexWords.length === 0) return;

    setNlpLoading(true);
    setNlpProgress(`Analyzing ${complexWords.length} complex words with NLP...`);

    // Batch in chunks of ~15 to stay within token limits
    const chunks = [];
    for (let i = 0; i < complexWords.length; i += 15) {
      chunks.push(complexWords.slice(i, i + 15));
    }

    const allNlp = {};
    for (let ci = 0; ci < chunks.length; ci++) {
      setNlpProgress(`NLP batch ${ci + 1}/${chunks.length} — phonetics, synonyms, analysis...`);
      const batchResult = await fetchNLPData(chunks[ci], input, lang);
      if (batchResult) {
        for (const [key, val] of Object.entries(batchResult)) {
          allNlp[key.toLowerCase()] = val;
        }
      }
      setNlpData(prev => ({ ...prev, ...allNlp }));
    }

    setNlpLoading(false);
    setNlpProgress("");
  }, [input, lang]);

  const handleHover = useCallback((e, word) => {
    if (word.type !== "word" || word.score < 28) return;
    const rect = e.target.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
    setTooltipPos({
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    });
    setHovered(word);
  }, []);

  const hardWords = useMemo(() => {
    if (!analysis) return [];
    return analysis.words.filter(w => w.level === "hard").sort((a, b) => b.score - a.score);
  }, [analysis]);

  const scoreColor = s => s >= 70 ? "#e53935" : s >= 50 ? "#e86a2c" : s >= 30 ? "#cfa01a" : "#7a9b7e";
  const scoreTag = s => {
    if (s >= 75) return { t: "Extremely Opaque", c: "#e53935" };
    if (s >= 55) return { t: "Highly Complex", c: "#e86a2c" };
    if (s >= 35) return { t: "Moderately Complex", c: "#cfa01a" };
    if (s >= 15) return { t: "Mildly Complex", c: "#7a9b7e" };
    return { t: "Transparent", c: "#5aab72" };
  };

  const getNlp = (word) => nlpData[word.lower] || null;

  return (
    <div ref={containerRef} style={S.root}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        .w-hard { color: #e53935; border-bottom: 2px solid rgba(229,57,53,0.45); font-weight: 500; cursor: pointer; transition: all 0.15s; border-radius: 2px; padding: 1px 2px; }
        .w-hard:hover { background: rgba(229,57,53,0.1); }
        .w-mod { color: #cfa01a; border-bottom: 1px dashed rgba(207,160,26,0.35); cursor: pointer; padding: 1px 2px; transition: all 0.15s; }
        .w-mod:hover { background: rgba(207,160,26,0.08); }
        .lang-btn { background: rgba(255,255,255,0.025); border: 1.5px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 13px; cursor: pointer; text-align: left; color: #b8b0a6; display: flex; flex-direction: column; gap: 4px; transition: all 0.2s; }
        .lang-btn:hover { border-color: rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); }
        .lang-btn.active { background: rgba(207,160,26,0.07); border-color: rgba(207,160,26,0.3); color: #f0ece6; }
        .analyze-btn { margin-top: 14px; padding: 15px 36px; border-radius: 8px; border: none; background: linear-gradient(135deg, #cfa01a 0%, #b8880e 100%); color: #141210; font-family: 'Sora', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 9px; transition: all 0.2s; letter-spacing: 0.01em; }
        .analyze-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(207,160,26,0.25); }
        .analyze-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        textarea:focus { border-color: rgba(207,160,26,0.3) !important; }
        .nlp-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; background: rgba(90,171,114,0.1); border: 1px solid rgba(90,171,114,0.2); border-radius: 20px; font-size: 10px; color: #5aab72; font-family: 'DM Mono', monospace; }
        .shimmer-bar { height: 12px; border-radius: 4px; background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
      `}</style>

      {/* ── HEADER ── */}
      <header style={S.header}>
        <div style={S.tag}>Psycholinguistic Grain Size Theory</div>
        <h1 style={S.title}>Orthographic Complexity Analyzer</h1>
        <p style={S.sub}>
          Evaluates grapheme-to-phoneme consistency, vowel ambiguity, silent letters & morphological opacity.
          Uses <strong>Claude NLP</strong> for dynamic phonetic respellings & context-aware synonym generation — no hardcoded dictionaries.
        </p>
      </header>

      {/* ── LANGUAGE PICKER ── */}
      <section style={{ marginBottom: 28 }}>
        <div style={S.label}>Orthographic System</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {Object.entries(LANGUAGES).map(([k, v]) => (
            <button key={k} className={`lang-btn ${lang === k ? "active" : ""}`} onClick={() => setLang(k)}>
              <span style={{ fontSize: 20 }}>{v.flag}</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{v.name}</span>
              <span style={{ fontSize: 10, color: "#847a6e", lineHeight: 1.3 }}>{v.desc}</span>
              <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 2, width: `${v.opacity * 100}%`, background: v.opacity > 0.6 ? "#e53935" : v.opacity > 0.3 ? "#cfa01a" : "#5aab72", transition: "width 0.4s" }} />
              </div>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#5e564c" }}>Depth: {(v.opacity * 100).toFixed(0)}%</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── INPUT ── */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={S.label}>Input Text</span>
          <span style={{ ...S.label, color: "#5e564c" }}>{input.split(/\s+/).filter(Boolean).length} words</span>
        </div>
        <textarea
          style={S.textarea}
          value={input}
          onChange={e => { setInput(e.target.value); setAnalysis(null); setNlpData({}); }}
          rows={6}
          placeholder="Paste or type text to analyze..."
        />
        <button className="analyze-btn" onClick={analyze} disabled={loading || !input.trim()}>
          <span style={{ fontSize: 16 }}>◉</span>
          {loading ? "Scoring..." : "Run Orthographic Analysis"}
        </button>
      </section>

      {/* ── RESULTS ── */}
      {analysis && (
        <div style={{ animation: "fadeUp 0.4s ease" }}>

          {/* NLP status */}
          {nlpLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, padding: "12px 16px", background: "rgba(90,171,114,0.06)", border: "1px solid rgba(90,171,114,0.12)", borderRadius: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#5aab72", animation: "pulse 1.2s infinite" }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#5aab72" }}>{nlpProgress}</span>
            </div>
          )}

          {/* Score dashboard */}
          <div style={S.dashboard}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "relative", width: 130, height: 130 }}>
                <svg viewBox="0 0 130 130" style={{ width: "100%", height: "100%" }}>
                  <circle cx="65" cy="65" r="56" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
                  <circle cx="65" cy="65" r="56" fill="none" stroke={scoreColor(analysis.overall)} strokeWidth="7"
                    strokeDasharray={`${(analysis.overall/100)*352} 352`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" style={{ transition: "stroke-dasharray 0.8s ease" }} />
                </svg>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 34, fontWeight: 500, color: scoreColor(analysis.overall) }}>{analysis.overall}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: "#5e564c" }}>/100</span>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10, color: scoreTag(analysis.overall).c }}>{scoreTag(analysis.overall).t}</div>
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
                  <span style={{ fontSize: 9, color: "#6b6258", fontFamily: "'DM Mono',monospace", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>{s.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Analyzed text */}
          <section style={{ marginBottom: 28 }}>
            <div style={{ marginBottom: 12 }}>
              <h3 style={S.sectionTitle}>Analyzed Text</h3>
              <p style={{ fontSize: 12, color: "#6b6258", margin: 0 }}>
                Hover over <span style={{ color: "#e53935", fontWeight: 500 }}>highlighted</span> words for phonetic respelling, synonyms & complexity breakdown
                {Object.keys(nlpData).length > 0 && <span className="nlp-badge" style={{ marginLeft: 8 }}>✦ NLP data loaded</span>}
              </p>
            </div>
            <div style={S.textBox}>
              {analysis.words.map((w, i) => {
                if (w.type === "punct") return <span key={i} style={{ color: "#5e564c" }}>{w.text}</span>;
                const cls = w.level === "hard" ? "w-hard" : w.level === "moderate" ? "w-mod" : "";
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
            return (
              <div style={{ ...S.tooltip, left: tooltipPos.x, top: tooltipPos.y }}>
                <div style={S.tooltipArrow} />
                <div style={{ fontFamily: "'Newsreader',serif", fontSize: 21, color: "#f0ece6", marginBottom: 2 }}>{hovered.clean}</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#847a6e", marginBottom: 10 }}>Complexity: {hovered.score}/100</div>

                {/* NLP-powered phonetics */}
                {nlp?.phonetic ? (
                  <div style={S.tSection}>
                    <div style={S.tLabel}>Phonetic Respelling <span className="nlp-badge" style={{marginLeft:4}}>NLP</span></div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 15, color: "#cfa01a", fontWeight: 500 }}>{nlp.phonetic}</div>
                    {nlp.ipa && <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#847a6e", marginTop: 2 }}>{nlp.ipa}</div>}
                  </div>
                ) : nlpLoading && hovered.score >= 28 ? (
                  <div style={S.tSection}>
                    <div style={S.tLabel}>Phonetic Respelling</div>
                    <div className="shimmer-bar" style={{ width: 140, marginTop: 4 }} />
                  </div>
                ) : null}

                {/* NLP-powered synonyms */}
                {nlp?.synonyms?.length > 0 ? (
                  <div style={S.tSection}>
                    <div style={S.tLabel}>Simpler Alternatives <span className="nlp-badge" style={{marginLeft:4}}>contextual</span></div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {nlp.synonyms.map((s, i) => (
                        <span key={i} style={S.chip}>{s}</span>
                      ))}
                    </div>
                  </div>
                ) : nlpLoading && hovered.score >= 28 ? (
                  <div style={S.tSection}>
                    <div style={S.tLabel}>Simpler Alternatives</div>
                    <div className="shimmer-bar" style={{ width: 100, marginTop: 4 }} />
                  </div>
                ) : null}

                {/* NLP explanation */}
                {nlp?.explanation && (
                  <div style={S.tSection}>
                    <div style={S.tLabel}>Linguistic Analysis <span className="nlp-badge" style={{marginLeft:4}}>NLP</span></div>
                    <div style={{ fontSize: 11, color: "#a89e92", lineHeight: 1.5 }}>{nlp.explanation}</div>
                  </div>
                )}

                {/* Rule-based reasons always shown */}
                {hovered.reasons.length > 0 && (
                  <div style={S.tSection}>
                    <div style={S.tLabel}>Orthographic Rules Triggered</div>
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
              <button onClick={() => setShowList(!showList)} style={S.listToggle}>
                <span>{showList ? "▾" : "▸"} Orthographic Bottleneck Words ({hardWords.length})</span>
              </button>
              {showList && (
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  {hardWords.map((w, i) => {
                    const nlp = getNlp(w);
                    return (
                      <div key={i} style={S.listItem}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "'Newsreader',serif", fontSize: 18, color: "#f0ece6" }}>{w.clean}</span>
                          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 15, fontWeight: 500, color: scoreColor(w.score) }}>{w.score}</span>
                        </div>
                        {nlp?.phonetic && (
                          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#cfa01a", marginTop: 3 }}>
                            {nlp.phonetic} <span style={{ color: "#6b6258" }}>{nlp.ipa}</span>
                          </div>
                        )}
                        {nlp?.synonyms?.length > 0 && (
                          <div style={{ fontSize: 12, color: "#5aab72", marginTop: 3 }}>→ {nlp.synonyms.join(", ")}</div>
                        )}
                        {nlp?.explanation && (
                          <div style={{ fontSize: 11, color: "#a89e92", marginTop: 3, fontStyle: "italic" }}>{nlp.explanation}</div>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                          {w.reasons.map((r, j) => (
                            <span key={j} style={S.tag2}>{r}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Methodology */}
          <div style={S.method}>
            <h4 style={{ ...S.label, margin: "0 0 8px", fontSize: 11 }}>Methodology</h4>
            <p style={{ fontSize: 12, lineHeight: 1.7, color: "#847a6e", margin: 0 }}>
              <strong>Layer 1 (Rule-based):</strong> Implements Psycholinguistic Grain Size Theory (Ziegler & Goswami, 2005).
              Evaluates G→P consistency across the entire word via complex grapheme density, vowel digraph ambiguity,
              silent letter patterns, letter:phoneme ratio, and morphological opacity. Each language engine has calibrated
              thresholds reflecting its orthographic depth.
              <br /><br />
              <strong>Layer 2 (NLP via Claude API):</strong> Complex words are sent to Claude with the full passage context.
              The model generates phonetic respellings (Merriam-Webster/Oxford standard), IPA transcriptions,
              context-aware orthographically simpler synonyms, and per-word linguistic explanations. No dictionaries are hardcoded —
              all lexical data is generated dynamically, enabling analysis of any word in any supported language.
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
  root: {
    fontFamily: "'Sora', sans-serif",
    maxWidth: 920,
    margin: "0 auto",
    padding: "0 20px 60px",
    color: "#e0dbd4",
    background: "transparent",
    minHeight: "100vh",
  },
  header: { padding: "40px 0 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", marginBottom: 30 },
  tag: { fontFamily: "'DM Mono',monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "#847a6e", marginBottom: 8 },
  title: { fontFamily: "'Newsreader',serif", fontSize: 36, fontWeight: 400, color: "#f0ece6", margin: "0 0 8px", lineHeight: 1.1 },
  sub: { fontSize: 13.5, color: "#847a6e", margin: 0, maxWidth: 600, lineHeight: 1.55 },
  label: { fontFamily: "'DM Mono',monospace", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b6258", marginBottom: 0 },
  textarea: {
    width: "100%", minHeight: 150, padding: 16, borderRadius: 10,
    border: "1.5px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.025)",
    color: "#e0dbd4", fontFamily: "'Sora',sans-serif", fontSize: 13.5, lineHeight: 1.75,
    resize: "vertical", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s",
  },
  dashboard: {
    display: "grid", gridTemplateColumns: "250px 1fr", gap: 24, marginBottom: 30,
    padding: 24, background: "rgba(255,255,255,0.018)", borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.04)",
  },
  stat: {
    display: "flex", flexDirection: "column", padding: "12px 14px",
    background: "rgba(255,255,255,0.018)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.03)",
  },
  sectionTitle: { fontFamily: "'Newsreader',serif", fontSize: 22, fontWeight: 400, color: "#f0ece6", margin: "0 0 4px" },
  textBox: {
    padding: 24, background: "rgba(255,255,255,0.018)", borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.04)", lineHeight: 2.3, fontSize: 14.5,
  },
  tooltip: {
    position: "fixed", transform: "translate(-50%,-100%)", marginTop: -8,
    background: "#272320", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
    padding: "16px 18px", minWidth: 260, maxWidth: 360, zIndex: 1000,
    boxShadow: "0 14px 44px rgba(0,0,0,0.55)",
  },
  tooltipArrow: {
    position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%) rotate(45deg)",
    width: 12, height: 12, background: "#272320", border: "1px solid rgba(255,255,255,0.1)",
    borderTop: "none", borderLeft: "none",
  },
  tSection: { marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" },
  tLabel: { fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5e564c", marginBottom: 5, display: "flex", alignItems: "center" },
  chip: {
    display: "inline-block", padding: "3px 10px", background: "rgba(90,171,114,0.1)",
    border: "1px solid rgba(90,171,114,0.2)", borderRadius: 20, fontSize: 12,
    color: "#6bc98f", fontWeight: 500,
  },
  listToggle: {
    width: "100%", padding: "14px 18px", background: "rgba(229,57,53,0.05)",
    border: "1px solid rgba(229,57,53,0.12)", borderRadius: 10, color: "#e53935",
    fontFamily: "'Sora',sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left",
  },
  listItem: {
    padding: "14px 16px", background: "rgba(255,255,255,0.018)", borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.04)",
  },
  tag2: {
    display: "inline-block", padding: "2px 8px", background: "rgba(255,255,255,0.03)",
    borderRadius: 4, fontSize: 10, color: "#847a6e", fontFamily: "'DM Mono',monospace",
  },
  method: {
    padding: "20px 22px", background: "rgba(255,255,255,0.018)", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.03)",
  },
};
