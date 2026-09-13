/** Static US reference data for the wizard selects (pure). */
export const US_STATES: ReadonlyArray<{ value: string; label: string }> = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"],
  ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"],
  ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([value, label]) => ({ value, label }));

export const US_TIMEZONES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Puerto_Rico", label: "Atlantic (Puerto Rico)" },
];

/** Rough state → timezone default so the select is usually right before the owner touches it. */
export const STATE_TIMEZONE: Record<string, string> = {
  CT: "America/New_York", DE: "America/New_York", DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", IN: "America/New_York",
  ME: "America/New_York", MD: "America/New_York", MA: "America/New_York", MI: "America/New_York", NH: "America/New_York", NJ: "America/New_York",
  NY: "America/New_York", NC: "America/New_York", OH: "America/New_York", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York",
  VT: "America/New_York", VA: "America/New_York", WV: "America/New_York", KY: "America/New_York", TN: "America/Chicago",
  AL: "America/Chicago", AR: "America/Chicago", IL: "America/Chicago", IA: "America/Chicago", KS: "America/Chicago", LA: "America/Chicago",
  MN: "America/Chicago", MS: "America/Chicago", MO: "America/Chicago", NE: "America/Chicago", ND: "America/Chicago", OK: "America/Chicago",
  SD: "America/Chicago", TX: "America/Chicago", WI: "America/Chicago",
  CO: "America/Denver", ID: "America/Denver", MT: "America/Denver", NM: "America/Denver", UT: "America/Denver", WY: "America/Denver", AZ: "America/Phoenix",
  CA: "America/Los_Angeles", NV: "America/Los_Angeles", OR: "America/Los_Angeles", WA: "America/Los_Angeles", AK: "America/Anchorage", HI: "Pacific/Honolulu",
};

export const SERVICE_PRESETS: Record<string, string[]> = {
  hvac: ["AC repair", "AC replacement", "Furnace repair", "Furnace install", "Heat pump", "Tune-up / maintenance", "Thermostat", "Duct cleaning", "Indoor air quality", "Mini-split install"],
  plumbing: ["Drain cleaning", "Leak repair", "Water heater repair", "Water heater install", "Toilet repair", "Faucet / fixture", "Sewer line", "Repiping", "Sump pump", "Gas line"],
  electrical: ["Panel upgrade", "Outlet / switch", "Lighting install", "Ceiling fan", "EV charger install", "Generator install", "Troubleshooting", "Whole-home surge", "Rewiring", "Smart home"],
  other: ["Repair", "Installation", "Maintenance", "Estimate / quote", "Emergency service"],
};

export const NEVER_SAY_PRESETS: string[] = [
  "Don't quote a firm price — say a tech will confirm on site",
  "Don't promise a same-day slot",
  "Don't give DIY repair instructions",
  "Don't diagnose over text — just gather details",
  "Don't mention competitors",
];

export const TONE_SAMPLES: Record<string, { label: string; blurb: string; sample: string }> = {
  friendly: { label: "Friendly", blurb: "Warm, a little casual, empathetic.", sample: "Hi! Sorry we missed you — what's going on with your AC today? We'll get you sorted." },
  professional: { label: "Professional", blurb: "Courteous, concise, no slang.", sample: "Thank you for calling. We're sorry we missed you. Please describe the issue and we'll follow up promptly." },
  plain: { label: "Plain-spoken", blurb: "Direct, like a contractor texts.", sample: "Missed your call. What's the problem and what's the address? I'll get a tech lined up." },
};
