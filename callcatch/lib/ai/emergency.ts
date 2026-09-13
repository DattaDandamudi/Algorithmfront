/**
 * Hard-coded emergency detection (runs BEFORE the model, never depends on it).
 * Spec §4.4: gas smell, sparks, smoke, flooding, sewage backup, CO alarm,
 * "no heat" with an infant/elderly person in the home.
 */
export type EmergencyKind =
  | "gas"
  | "sparks"
  | "smoke_fire"
  | "flooding"
  | "sewage"
  | "co_alarm"
  | "no_heat_vulnerable"
  | "shock"
  | "other";

export type EmergencyMatch = { isEmergency: true; kind: EmergencyKind; matched: string } | { isEmergency: false };

const VULNERABLE = /\b(baby|babies|infant|newborn|toddler|elderly|grandma|grandpa|grandmother|grandfather|senior|oxygen|disabled|medical|hospice|pregnant)\b/i;

const RULES: Array<{ kind: EmergencyKind; test: (t: string) => string | null }> = [
  {
    kind: "gas",
    test: (t) => {
      const m = /\b(smell(s|ing)?\s+(of\s+)?gas|gas\s+(smell|odor|leak|leaking|hiss(ing)?)|rotten\s+egg|propane\s+(smell|leak))\b/i.exec(t);
      return m ? m[0] : null;
    },
  },
  {
    kind: "co_alarm",
    test: (t) => {
      const m = /\b(co\s*(alarm|detector|monitor)|carbon\s+monoxide)\b/i.exec(t);
      return m ? m[0] : null;
    },
  },
  {
    kind: "sparks",
    test: (t) => {
      const m = /\b(spark(s|ing|ed)?|arcing|arc\s+flash|breaker\s+(is\s+)?(smoking|on\s+fire|hot))\b/i.exec(t);
      return m ? m[0] : null;
    },
  },
  {
    kind: "smoke_fire",
    test: (t) => {
      const m = /\b(smoke|smoking|burning\s+(smell|odor|plastic|wire)|on\s+fire|caught\s+fire|flames?)\b/i.exec(t);
      return m ? m[0] : null;
    },
  },
  {
    kind: "flooding",
    test: (t) => {
      const m = /\b(flood(s|ed|ing)?|water\s+(is\s+)?(everywhere|pouring|gushing|coming\s+through)|burst\s+pipe|pipe\s+burst|ceiling\s+(is\s+)?(leaking|dripping)\s+(badly|a\s+lot))\b/i.exec(t);
      return m ? m[0] : null;
    },
  },
  {
    kind: "sewage",
    test: (t) => {
      const m = /\b(sewage|sewer\s+(backup|backing\s+up|overflow)|raw\s+sewage|backing\s+up\s+into)\b/i.exec(t);
      return m ? m[0] : null;
    },
  },
  {
    kind: "shock",
    test: (t) => {
      const m = /\b(got\s+shocked|electric(al)?\s+shock|shocked\s+me|electrocut)/i.exec(t);
      return m ? m[0] : null;
    },
  },
  {
    kind: "no_heat_vulnerable",
    test: (t) => {
      const noHeat = /\b(no\s+heat|heat(er|ing)?\s+(is\s+)?(out|dead|not\s+working|quit|stopped)|furnace\s+(is\s+)?(out|dead|not\s+working|quit)|no\s+(ac|a\/c|air)\b.*\b(9\d|1\d\d)\s*(degrees|°)?)\b/i.exec(t);
      if (!noHeat) return null;
      const v = VULNERABLE.exec(t);
      return v ? `${noHeat[0]} + ${v[0]}` : null;
    },
  },
];

export function detectEmergency(text: string | null | undefined): EmergencyMatch {
  if (!text) return { isEmergency: false };
  const t = text.replace(/\s+/g, " ");
  for (const rule of RULES) {
    const hit = rule.test(t);
    if (hit) return { isEmergency: true, kind: rule.kind, matched: hit };
  }
  return { isEmergency: false };
}

/** Safety line spoken/texted for each kind. Short, non-diagnostic, points to 911/utility. */
export function safetyLine(kind: EmergencyKind): string {
  switch (kind) {
    case "gas":
      return "If you smell gas, please leave the building now, don't flip any switches, and call 911 or your gas utility from outside.";
    case "co_alarm":
      return "If a CO alarm is sounding, get everyone outside to fresh air right away and call 911.";
    case "sparks":
    case "shock":
      return "If you see sparks or someone was shocked, please switch off the main breaker if it's safe to reach and call 911 if anyone is hurt.";
    case "smoke_fire":
      return "If there's smoke or fire, get everyone out and call 911 first.";
    case "flooding":
      return "If water is actively flooding, shut off the main water valve if you can reach it safely.";
    case "sewage":
      return "Please keep everyone away from the affected area and avoid running water until we arrive.";
    case "no_heat_vulnerable":
      return "Please keep everyone warm and safe; if anyone is in medical distress call 911.";
    case "other":
      return "If anyone is in danger, call 911 first.";
  }
}
