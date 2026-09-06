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
 * Acute-symptom / crisis patterns. Deliberately specific so ordinary training
 * talk ("chest workout", "breathing during squats", "out of breath after
 * cardio") does not trip it, while clinical phrasings do.
 */
const EMERGENCY_PATTERNS: RegExp[] = [
  // Cardiac
  /\bchest\s+(pain|pains|pressure|tightness|tight|heaviness)\b/i,
  /\b(pain|pressure|tightness)\s+in\s+(my\s+)?chest\b/i,
  /\bcrushing\s+(pain|pressure|feeling)\b/i,
  /\bpain\s+(radiating|spreading|shooting)\s+(to|down|into)\s+(my\s+)?(left\s+)?(arm|jaw|shoulder)\b/i,
  // Breathing
  /\b(can'?t|cannot|can\s+not|unable\s+to|struggling\s+to|hard\s+to)\s+breathe\b/i,
  /\b(trouble|difficulty|difficulties)\s+breathing\b/i,
  /\bshortness\s+of\s+breath\b/i,
  /\bgasping\s+for\s+(air|breath)\b/i,
  /\bchoking\b/i,
  // Loss of consciousness
  /\b(fainted|fainting|feel\s+faint|going\s+to\s+faint|about\s+to\s+faint)\b/i,
  /\b(passed|passing|pass|black|blacked|blacking)\s+out\b/i,
  /\blost\s+consciousness\b/i,
  // Bleeding
  /\bsevere\s+bleeding\b/i,
  /\bbleeding\s+(heavily|a\s+lot|badly|won'?t\s+stop|that\s+won'?t\s+stop)\b/i,
  /\bcan'?t\s+stop\s+(the\s+)?bleeding\b/i,
  /\bcoughing\s+(up\s+)?blood\b/i,
  // Stroke signs
  /\b(having|had|think\s+it'?s|maybe)\s+a\s+stroke\b/i,
  /\bstroke\s+(symptoms?|signs?)\b/i,
  /\bmini[-\s]?stroke\b/i,
  /\bface\s+(is\s+)?droop/i,
  /\bslurr(ed|ing)\s+(my\s+)?(speech|words)\b/i,
  /\b(numb|numbness|weak|weakness)\s+(on|down)\s+one\s+side\b/i,
  /\bone\s+side\s+of\s+my\s+(face|body)\s+(is\s+)?(numb|weak|droop)/i,
  /\bsudden\s+confusion\b/i,
  // Self-harm / suicidal ideation
  /\bsuicid/i,
  /\bkill\s+myself\b/i,
  /\bend\s+(my\s+life|it\s+all)\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+(live|be\s+alive|be\s+here|wake\s+up)\b/i,
  /\bnot\s+worth\s+living\b/i,
  /\bself[-\s]?harm/i,
  /\b(hurt|hurting|cut|cutting)\s+myself\b/i,
  // Overdose / poisoning
  /\boverdos(e|ed|ing)\b/i,
  /\btook\s+(too\s+many|a\s+lot\s+of|all\s+(the|my))\s+(pills|tablets)\b/i,
  /\bswallowed\s+(a\s+bunch\s+of|too\s+many|all\s+the)\s+(pills|tablets)\b/i,
  // Anaphylaxis
  /\ballergic\s+reaction\b/i,
  /\banaphyla/i,
  /\b(throat|tongue|lips?|face)\s+(is\s+|are\s+)?(swelling|swollen|closing)\b/i,
  /\bepi[-\s]?pen\b/i,
  // Explicit emergency asks
  /\bcall\s+(911|999|112|an?\s+ambulance)\b/i,
  /\b911\b/,
  /\bambulance\b/i,
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
 * sentence, the cost of a miss is dosing advice without one.
 */
const MEDICAL_PATTERNS: RegExp[] = [
  // Labs / markers
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
  // Medication / dosing
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
  // Symptoms
  /\bpain(s|ful)?\b/i,
  /\bach(e|es|ing|y)\b/i,
  /\bhurt(s|ing)?\b/i,
  /\bdizz(y|iness)\b/i,
  /\blight[-\s]?headed/i,
  /\bnause(a|ous|ated)\b/i,
  /\bvomit|\bthrow(ing)?\s+up\b/i,
  /\bpalpitation/i,
  /\b(racing|irregular|skipping|pounding)\s+heart(beat)?\b/i,
  /\bheart\s+(is\s+)?(racing|pounding|skipping)\b/i,
  /\barrhythm/i,
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
  /\bsymptom/i,
  /\bdiagnos/i,
  /\bdoctor\b|\bphysician\b|\bclinician\b/i,
];

/** Lab / medication / symptom question → general guidance only + doctor cue (§8 GUARDRAILS). */
export function isMedicalAsk(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return MEDICAL_PATTERNS.some((re) => re.test(t));
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

const HAS_BOLD = /\*\*[^*\n][^*]*\*\*/;
/** Sentence terminator that is followed by whitespace — so "1.5 lb" or "e.g" mid-token never splits. */
const TERMINATOR_BEFORE_SPACE = /[.!?]+(?=\s)/g;

/**
 * If the reply has no **bold** span, bold its last sentence so the UI can
 * always surface "the one action". Leaves replies that already contain bold
 * untouched.
 */
export function ensureBoldAction(text: string): string {
  const t = (text ?? '').trimEnd();
  if (!t) return t;
  if (HAS_BOLD.test(t)) return t;

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

/** 'sk-ant-api03-…AbCd' → 'sk-ant-…AbCd'. Never renders more than the last 4 characters. */
export function maskKey(key?: string): string {
  const k = (key ?? '').trim();
  if (!k) return '';
  if (k.length <= 8) return '••••';
  const prefix = k.startsWith('sk-ant-') ? 'sk-ant-' : k.slice(0, 3);
  return `${prefix}…${k.slice(-4)}`;
}
