/**
 * Coach guardrails (SPEC §4 "persistent medical disclaimer footer; escalation
 * cue on medical/diagnostic asks", §8 GUARDRAILS, AGENT_BRIEF "medical guardrail").
 *
 * Everything here is pure string logic shared by the Claude coach and the
 * offline coach:
 *   - detectEmergency: acute language stops advising and points to care.
 *   - isMedicalAsk:    lab / medication / symptom questions get the doctor cue.
 *   - checkLength:     the ≤120-word rule (a spec design choice, see CAVEATS).
 *   - ensureDoctorCue / ensureBoldAction: post-process a reply so it always
 *     satisfies §8 OUTPUT ("ending with the single action in **bold**").
 *   - maskKey:         never render a full API key in Settings.
 */

export const DISCLAIMER =
  'Wellness information only — not medical advice. Confirm labs, dosing and symptoms with your doctor.';

/** One calm sentence: stop advising, seek professional care now. */
export const EMERGENCY_MESSAGE =
  'This sounds like it needs urgent care — please stop here and contact emergency services (911) or a clinician right now rather than waiting on coaching.';

/**
 * Acute-symptom / crisis patterns (§8 GUARDRAILS "medical emergency or acute
 * symptoms → stop advising"). Two rules keep this honest (review R5-1 / R5-5):
 *   - Coverage: the canonical acute phrasings must fire (heart attack, chest
 *     hurts, seizure, not breathing, collapsed, unconscious, vomiting blood,
 *     can't feel/move a limb, stroke signs, concussion, overdose, anaphylaxis).
 *   - Context: words that also live in ordinary logging talk need their acute
 *     context — "call 911" not "911 kcal", "need an ambulance" not "drive an
 *     ambulance", "choking on" not "choking down shakes", "cutting myself" but
 *     not "cutting myself some slack", "passed out" but not "passed out on the
 *     couch". Bare "911" / "ambulance" / "allergic reaction" are gone.
 */
const EMERGENCY_PATTERNS: RegExp[] = [
  // Cardiac
  /\bchest\s+(pain|pains|pressure|tightness|tight|heaviness|hurts?|hurting|aches?|aching|burning)\b/i,
  /\b(pain|pressure|tightness|burning)\s+in\s+(my\s+)?chest\b/i,
  /\bcrushing\s+(pain|pressure|feeling)\b/i,
  /\bpain\s+(radiating|spreading|shooting)\s+(to|down|into)\s+(my\s+)?(left\s+)?(arm|jaw|shoulder)\b/i,
  /\b(i'?m\s+having|am\s+i\s+having|having|is\s+this|think\s+it'?s|feels?\s+like|i\s+(just\s+)?had)\s+(a\s+)?heart\s+attack\b/i,
  /\bheart\s+attack\s+(symptoms?|signs?|right\s+now)\b/i,
  /\bcardiac\s+arrest\b/i,
  // Breathing
  /\b(can'?t|cannot|can\s+not|unable\s+to|struggling\s+to|hard\s+to)\s+breathe\b/i,
  /\b(trouble|difficulty|difficulties)\s+breathing\b/i,
  // "not breathing" / "stopped breathing", but not "not breathing properly during squats"
  /\b(is|isn'?t|not|stopped|barely)\s+breathing\b(?!\s+(?:properly|right|correctly|well|deeply|enough)?\s*(?:during|when|while|through|between|under|on|in)\b)/i,
  /\bshortness\s+of\s+breath\b/i,
  /\bgasping\s+for\s+(air|breath)\b/i,
  /\b(lips|face|fingers)\s+(are|is)\s+(turning\s+|going\s+)?blue\b/i,
  /\bchoking\s+on\b/i,
  /\b(i'?m|he'?s|she'?s|someone'?s|someone\s+is|is|am)\s+choking\b(?!\s+(down|back|it))/i,
  // Loss of consciousness
  /\b(fainted|fainting|feel\s+faint|going\s+to\s+faint|about\s+to\s+faint)\b/i,
  /\b(passed|passing|pass|black|blacked|blacking)\s+out\b(?!\s+(on|at|asleep|after|in\s+front|drunk|cold\s+on))/i,
  /\blost\s+consciousness\b/i,
  /\b(is|was|went|fell|became|still|found\s+(him|her|them|my\s+\w+))\s+unconscious\b/i,
  /\bunconscious\s+(on|in|for)\s+/i,
  /\b(is|was|he'?s|she'?s|they'?re|found\s+(him|her|them))\s+unresponsive\b/i,
  /\bwon'?t\s+wake\s+up\b/i,
  /\b(i|he|she|they|someone|my\s+(?:friend|dad|father|mum|mom|mother|wife|husband|partner|brother|sister|son|daughter|mate|buddy|colleague|coworker|roommate|flatmate|kid|child|girlfriend|boyfriend))\s+(?:just\s+|suddenly\s+)?collapsed\b/i,
  /\bseizures?\b/i,
  /\bconvuls/i,
  // Bleeding
  /\bsevere\s+bleeding\b/i,
  /\bbleeding\s+(heavily|a\s+lot|badly|won'?t\s+stop|that\s+won'?t\s+stop)\b/i,
  /\bcan'?t\s+stop\s+(the\s+)?bleeding\b/i,
  /\b(vomit(ed|ing|s)?|throw(ing|n)?\s+up|threw\s+up|puk(e|ed|ing)|spitting|spat|cough(ed|ing|s)?)\s+(up\s+)?blood\b/i,
  /\bblood\s+in\s+(my\s+)?(vomit|stool|poo|urine|pee)\b/i,
  // Stroke signs
  /\b(having|had|think\s+it'?s|maybe)\s+a\s+stroke\b/i,
  /\bstroke\s+(symptoms?|signs?)\b/i,
  /\bmini[-\s]?stroke\b/i,
  /\bface\s+(is\s+)?droop/i,
  /\bslurr(ed|ing)\s+(my\s+)?(speech|words)\b/i,
  /\bspeech\s+is\s+slurred\b/i,
  /\b(numb|numbness|weak|weakness)\s+(on|down)\s+one\s+side\b/i,
  /\bone\s+side\s+of\s+my\s+(face|body)\s+(is\s+)?(numb|weak|droop)/i,
  /\bsudden\s+confusion\b/i,
  /\bcan'?t\s+(feel|move)\s+(my\s+)?(legs?|arms?|hands?|feet|foot|face|fingers|toes|(left|right|one)\s+(side|arm|leg|hand))\b/i,
  /\b(no|lost|losing)\s+(all\s+)?(feeling|sensation)\s+in\s+(my\s+)?(legs?|arms?|hands?|feet|face)\b/i,
  /\bworst\s+headache\b/i,
  /\bsudden(ly)?\s+(severe|intense|blinding|excruciating)\s+headache\b/i,
  /\b(vision|sight)\s+(suddenly\s+)?(went|gone|going|has\s+gone)\s+(black|blurry|double)\b/i,
  /\bsudden(ly)?\s+(lost|loss\s+of|losing)\s+(my\s+)?(vision|sight)\b/i,
  // Head injury
  /\bconcuss/i,
  /\bhead\s+(injury|trauma)\b/i,
  /\b(got|was|been)\s+knocked\s+out\b/i,
  /\b(hit|banged|smacked|knocked)\s+(my\s+)?head\b.*\b(dizzy|dizziness|vomit|threw\s+up|confus|blur|memory|black|passed)/i,
  // Self-harm / suicidal ideation
  /\bsuicid/i,
  /\bkill\s+myself\b/i,
  /\bend\s+(my\s+life|it\s+all)\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+(live|be\s+alive|be\s+here|wake\s+up)\b/i,
  /\bnot\s+worth\s+living\b/i,
  /\bself[-\s]?harm/i,
  // "cutting myself" — but not "cutting myself down/some slack/off/a break"
  /\bcut(ting)?\s+myself\b(?!\s+(down|some|off|a\s+break|slack|short|out|loose|free))/i,
  /\b(hurt|harm|hurting|harming)\s+myself\s+(on\s+purpose|deliberately|intentionally)\b/i,
  /\bwant\s+to\s+(hurt|cut|harm)\s+myself\b/i,
  // Overdose / poisoning
  /\boverdos(e|ed|ing)\b/i,
  /\btook\s+(too\s+many|a\s+lot\s+of|all\s+(the|my))\s+(pills|tablets)\b/i,
  /\bswallowed\s+(a\s+bunch\s+of|too\s+many|all\s+the)\s+(pills|tablets)\b/i,
  // Anaphylaxis — a *severe* reaction or airway signs; "mild allergic reaction to peanuts" is a food question
  /\b(severe|bad|serious|major|scary|full[-\s]?blown|worst)\s+allergic\s+reaction\b/i,
  /\banaphyla/i,
  /\b(throat|tongue|lips?|face)\s+(is\s+|are\s+)?(swelling|swollen|closing)\b/i,
  /\bepi[-\s]?pen\b/i,
  // Explicit emergency asks
  /\b(call|calling|called|dial|ring|phone)\s+(911|999|112|an?\s+ambulance|emergency\s+services)\b/i,
  /\b(need|needs|get|getting)\s+(an?\s+)?ambulance\b/i,
  /\b(go|going|should\s+i\s+go)\s+to\s+(the\s+)?(er|a&e|emergency\s+room)\b/i,
  /\bmedical\s+emergency\b/i,
];

export interface EmergencyCheck {
  emergency: boolean;
  /** Empty when not an emergency. */
  message: string;
}

/** §8: "If input suggests a medical emergency or acute symptoms, stop advising and tell the user to seek professional care." */
export function detectEmergency(text: string): EmergencyCheck {
  const t = (text ?? '').trim();
  if (!t) return { emergency: false, message: '' };
  const emergency = EMERGENCY_PATTERNS.some((re) => re.test(t));
  return { emergency, message: emergency ? EMERGENCY_MESSAGE : '' };
}

/**
 * Labs, medication/dosing, symptoms. Matching is deliberately broad here —
 * the cost of a false positive is one extra "confirm with your doctor"
 * sentence, the cost of a miss is dosing advice without one. The groups are
 * kept apart so the offline coach can tell a *symptom* (hold training, R5-6)
 * from a lab or dosing question (lifestyle guidance + cue).
 */
const LAB_PATTERNS: RegExp[] = [
  /\bvit(amin)?[-\s]?d\b/i,
  /\bvitamins?\b/i,
  /\bferritin\b/i,
  /\bomega[-\s]?3\b/i,
  /\btestosterone\b/i,
  /\bzinc\b/i,
  /\biron\b/i,
  /\bmagnesium\b/i,
  /\bb12\b/i,
  /\b(blood|lab)[-\s]?(test|tests|work|results?|panel|values?|markers?)\b/i,
  /\blabs\b/i,
  /\bbloodwork\b/i,
  /\b(h|ha)?emoglobin\b/i,
  /\bcholesterol\b/i,
  /\b(ldl|hdl|hba1c|a1c|tsh)\b/i,
  /\btriglycerid/i,
  /\bglucose\b/i,
  /\bblood\s+(sugar|pressure)\b/i,
  /\bthyroid\b/i,
  /\bcortisol\b/i,
  /\bcreatinine\b/i,
  /\bdeficien(t|cy|cies)\b/i,
  // Lead — only in a lab/exposure sense, never "lead your next meal with…"
  /\blead\s+(level|levels|exposure|result|results|test|poisoning|is\s+(high|elevated))\b/i,
  /\b(elevated|high|blood)\s+lead\b/i,
  /\blead\s+in\s+my\s+blood\b/i,
];

const DOSING_PATTERNS: RegExp[] = [
  /\bmedication|\bmedicine|\bmeds\b/i,
  /\bdos(e|es|ed|age|ages|ing)\b/i,
  /\b\d+(\.\d+)?\s*(mg|mcg|µg|ug|iu|ml)\b/i,
  /\b(mg|mcg|iu)\b/i,
  /\bsupplement/i,
  /\bprescri(be|bed|ption|ptions)\b/i,
  /\b(pills?|tablets?|capsules?)\b/i,
  /\bdrugs?\b/i,
  /\bfish\s+oil\b/i,
  /\bibuprofen|\bparacetamol|\bacetaminophen|\baspirin|\bantibiotic/i,
  // R5-9: named supplements and gram-unit dosing ("take 5 g creatine daily").
  // "180 g protein a day" is a nutrition target, not a dose, so the verb is required.
  /\bcreatine\b|\bmelatonin\b|\bashwagandha\b|\bzma\b|\bbeta[-\s]?alanine\b|\bcitrulline\b|\btheanine\b|\btongkat\b|\bfenugreek\b|\bmultivitamin/i,
  /\bcaffeine\s+(pills?|tablets?|caps?|capsules?)\b/i,
  /\bpre[-\s]?workout\b/i,
  /\b(take|taking|took)\s+\d+(\.\d+)?\s*(g|grams?)\b/i,
];

const SYMPTOM_PATTERNS: RegExp[] = [
  /\bpain(s|ful)?\b/i,
  /\bach(e|es|ing|y)\b/i,
  /\bhurt(s|ing)?\b/i,
  /\bdizz(y|iness)\b/i,
  /\blight[-\s]?headed/i,
  /\bfaint(ed|ing|ness)?\b/i,
  /\bnause(a|ous|ated)\b/i,
  /\bvomit|\bthrow(ing)?\s+up\b/i,
  /\bpalpitation/i,
  /\b(racing|irregular|skipping|pounding)\s+heart(beat)?\b/i,
  /\bheart\s+(is\s+)?(racing|pounding|skipping)\b/i,
  /\barrhythm/i,
  /\bshort(ness)?\s+of\s+breath\b/i,
  /\bwheez/i,
  /\bfever|\bchills\b/i,
  /\bnumb|\btingl/i,
  /\bswell|\bswollen\b/i,
  /\brash\b|\bhives\b/i,
  /\bheadache|\bmigraine/i,
  /\binjur(y|ies|ed)\b/i,
  /\bbleed/i,
  /\binfect/i,
  /\bcough/i,
  /\bflu\b/i,
  /\bcramp/i,
  /\bblurr(y|ed)\s+vision\b/i,
  /\bfeel(ing|s)?\s+(sick|unwell|ill|weak|shaky)\b/i,
  /\bsymptom/i,
];

/** Asking about care itself ("should I see a doctor", "diagnose") also gets the cue. */
const CARE_PATTERNS: RegExp[] = [/\bdiagnos/i, /\bdoctor\b|\bphysician\b|\bclinician\b/i];

const MEDICAL_PATTERNS: RegExp[] = [...LAB_PATTERNS, ...DOSING_PATTERNS, ...SYMPTOM_PATTERNS, ...CARE_PATTERNS];

/** Lab / medication / symptom question → general guidance only + doctor cue (§8 GUARDRAILS). */
export function isMedicalAsk(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return MEDICAL_PATTERNS.some((re) => re.test(t));
}

/**
 * The symptom subset of isMedicalAsk (pain, dizziness, palpitations, …).
 * §8: acute symptoms mean the coach holds training rather than progressing it
 * (R5-6); lab and dosing questions are medical asks but not symptoms.
 */
export function isSymptomAsk(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return SYMPTOM_PATTERNS.some((re) => re.test(t));
}

/** §8 OUTPUT: ≤120 words. */
export const MAX_WORDS = 120;

/** Whitespace-separated tokens containing at least one letter or digit (so "—" and "**" alone don't count). */
export function wordCount(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter((tok) => /[\p{L}\p{N}]/u.test(tok)).length;
}

export function checkLength(text: string): { words: number; over: boolean } {
  const words = wordCount(text);
  return { words, over: words > MAX_WORDS };
}

const DOCTOR_CUE = 'Confirm dosing and any changes with your doctor.';
const HAS_DOCTOR = /\b(doctor|physician|clinician|gp)\b/i;
/** A trailing **bold** span, optionally followed by closing punctuation/whitespace. */
const TRAILING_BOLD = /(\*\*[^*]+\*\*)[\s.!?]*$/;

/**
 * For medical asks, make sure the reply defers to a clinician. The cue is
 * inserted *before* a trailing bold action so the reply still ends with the
 * single bold action (§8 OUTPUT); otherwise it is appended.
 */
export function ensureDoctorCue(text: string, medical: boolean): string {
  const t = (text ?? '').trimEnd();
  if (!medical || HAS_DOCTOR.test(t)) return t;
  if (!t) return DOCTOR_CUE;
  const m = TRAILING_BOLD.exec(t);
  if (m && m.index > 0) {
    const head = t.slice(0, m.index).trimEnd();
    const tail = t.slice(m.index);
    return `${head} ${DOCTOR_CUE} ${tail}`;
  }
  return `${t} ${DOCTOR_CUE}`;
}

/** A complete **bold** span (no nested/unmatched markers). */
const BOLD_SPAN = /\*\*[^*\n][^*]*\*\*/g;
/** Sentence terminator that is followed by whitespace — so "1.5 lb" or "e.g" mid-token never splits. */
const TERMINATOR_BEFORE_SPACE = /[.!?]+(?=\s)/g;

/** Wrap the last sentence of a bold-free string in **…**, adding a period when it has no terminator. */
function boldLastSentence(t: string): string {
  let start = 0;
  TERMINATOR_BEFORE_SPACE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TERMINATOR_BEFORE_SPACE.exec(t)) !== null) {
    const after = m.index + m[0].length;
    if (t.slice(after).trim().length > 0) start = after;
  }
  const rest = t.slice(start);
  const ws = /^\s*/.exec(rest)?.[0] ?? '';
  const last = rest.slice(ws.length).trim();
  if (!last) return t;
  const lastWithPunct = /[.!?]$/.test(last) ? last : `${last}.`;
  return `${t.slice(0, start)}${ws}**${lastWithPunct}**`;
}

/**
 * §8 OUTPUT / §4: exactly ONE **bold** span, and it is the final sentence, so
 * the UI can always surface "the one action". A reply that already satisfies
 * that is returned untouched. Anything else — no bold, several spans, a bold
 * label or number mid-reply ("**Verdict:** …"), an unmatched marker from a
 * cut-off stream — has every `**` stripped and its last sentence bolded (R5-7).
 */
export function ensureBoldAction(text: string): string {
  const t = (text ?? '').trimEnd();
  if (!t) return t;
  const spans = t.match(BOLD_SPAN) ?? [];
  const strayMarkers = t.replace(BOLD_SPAN, '').includes('**');
  if (spans.length === 1 && !strayMarkers && TRAILING_BOLD.test(t)) return t;
  const plain = t.replace(/\*\*/g, '').trimEnd();
  return boldLastSentence(plain);
}

/** 'sk-ant-api03-…AbCd' → 'sk-ant-…AbCd'. Never renders more than the last 4 characters. */
export function maskKey(key?: string): string {
  const k = (key ?? '').trim();
  if (!k) return '';
  if (k.length <= 8) return '••••';
  const prefix = k.startsWith('sk-ant-') ? 'sk-ant-' : k.slice(0, 3);
  return `${prefix}…${k.slice(-4)}`;
}
