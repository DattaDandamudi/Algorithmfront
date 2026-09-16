/**
 * Top 40 US metros (Census MSAs by population) used by the programmatic city pages
 * `/for/[trade]/[city]` and by the content agent's local topics.
 *
 * Data policy: everything here is either public reference data (area codes, suburbs, time zones,
 * population bands, climate) or an explicitly labeled estimate. Ticket ranges come from the
 * product spec's sourced numbers (`docs/PRODUCT_SPEC.md` §1, `components/marketing/trades.ts`);
 * the per-metro adjustment is a labeled assumption (`costBand`) and the page copy says so.
 */

export type ClimateClass = "hot_humid" | "hot_dry" | "cold" | "mild" | "mixed";
export type CostBand = "high" | "mid" | "low";
export type PopulationBand = "5M+" | "2–5M" | "1–2M";

export type Metro = {
  slug: string;
  /** Principal city, e.g. "Houston" */
  city: string;
  /** Marketing label, e.g. "Houston, TX" or "Dallas–Fort Worth, TX" */
  label: string;
  state: string;
  stateName: string;
  timezone: string;
  populationBand: PopulationBand;
  areaCodes: string[];
  suburbs: string[];
  climate: ClimateClass;
  costBand: CostBand;
  /** In the launch ICP's Sun Belt list (TX, FL, AZ, GA, NC). */
  sunBelt: boolean;
  /** One metro-specific sentence about the local season and how it drives calls. */
  seasonNote: string;
};

const NY = "America/New_York";
const CHI = "America/Chicago";
const LA = "America/Los_Angeles";
const DEN = "America/Denver";

export const METROS: readonly Metro[] = [
  { slug: "new-york", city: "New York", label: "New York, NY", state: "NY", stateName: "New York", timezone: NY, populationBand: "5M+", areaCodes: ["212", "718", "917", "347", "646", "929"], suburbs: ["Brooklyn", "Queens", "the Bronx", "Staten Island", "Yonkers", "Long Island"], climate: "cold", costBand: "high", sunBelt: false, seasonNote: "New York swings from July heat waves in brick walk-ups to January no-heat calls on steam and hot-water boilers, and the phone rings hardest on the first day of each." },
  { slug: "los-angeles", city: "Los Angeles", label: "Los Angeles, CA", state: "CA", stateName: "California", timezone: LA, populationBand: "5M+", areaCodes: ["213", "323", "310", "818", "626", "562"], suburbs: ["Long Beach", "Pasadena", "Glendale", "Torrance", "Santa Clarita", "Anaheim"], climate: "mild", costBand: "high", sunBelt: false, seasonNote: "Los Angeles is mild most of the year, so the calls pile up on the September heat waves in the Valley and the Inland side, when every shop is already booked." },
  { slug: "chicago", city: "Chicago", label: "Chicago, IL", state: "IL", stateName: "Illinois", timezone: CHI, populationBand: "5M+", areaCodes: ["312", "773", "708", "847", "630"], suburbs: ["Naperville", "Aurora", "Joliet", "Evanston", "Schaumburg", "Oak Park"], climate: "cold", costBand: "mid", sunBelt: false, seasonNote: "Chicago's first sub-zero week in January and first 90°F week in June each produce a month of calls in about three days." },
  { slug: "dallas", city: "Dallas", label: "Dallas–Fort Worth, TX", state: "TX", stateName: "Texas", timezone: CHI, populationBand: "5M+", areaCodes: ["214", "972", "469", "817", "682"], suburbs: ["Fort Worth", "Plano", "Arlington", "Frisco", "Irving", "McKinney"], climate: "hot_humid", costBand: "mid", sunBelt: true, seasonNote: "Dallas–Fort Worth runs AC from April into October, with 100°F stretches in July and August, and an occasional ice storm that turns plumbers' phones into a fire hose for a week." },
  { slug: "houston", city: "Houston", label: "Houston, TX", state: "TX", stateName: "Texas", timezone: CHI, populationBand: "5M+", areaCodes: ["713", "281", "832", "346"], suburbs: ["Katy", "Sugar Land", "The Woodlands", "Pearland", "Cypress", "Pasadena"], climate: "hot_humid", costBand: "low", sunBelt: true, seasonNote: "Houston runs air conditioning nine months a year, and with the humidity a dead condenser is an emergency by noon." },
  { slug: "atlanta", city: "Atlanta", label: "Atlanta, GA", state: "GA", stateName: "Georgia", timezone: NY, populationBand: "5M+", areaCodes: ["404", "770", "678", "470"], suburbs: ["Marietta", "Alpharetta", "Roswell", "Decatur", "Sandy Springs", "Lawrenceville"], climate: "hot_humid", costBand: "mid", sunBelt: true, seasonNote: "Atlanta's cooling season runs May through September and the heating season is short but real, so most shops see two rushes and a long spring of tune-ups and changeouts." },
  { slug: "washington-dc", city: "Washington", label: "Washington, DC", state: "DC", stateName: "District of Columbia", timezone: NY, populationBand: "5M+", areaCodes: ["202", "703", "571", "301", "240"], suburbs: ["Arlington", "Alexandria", "Bethesda", "Silver Spring", "Fairfax", "Rockville"], climate: "mixed", costBand: "high", sunBelt: false, seasonNote: "The DC area gets humid 95°F summers and a few hard freezes a winter, and the row-house and townhome stock keeps panel, boiler and heat-pump work steady in the shoulders." },
  { slug: "philadelphia", city: "Philadelphia", label: "Philadelphia, PA", state: "PA", stateName: "Pennsylvania", timezone: NY, populationBand: "5M+", areaCodes: ["215", "267", "445", "610", "484"], suburbs: ["King of Prussia", "Cherry Hill", "Norristown", "Media", "Doylestown", "Wilmington"], climate: "cold", costBand: "mid", sunBelt: false, seasonNote: "Philadelphia's old row homes mean boiler and oil-to-gas conversions in fall, AC calls on the first July heat wave, and frozen pipes every January." },
  { slug: "miami", city: "Miami", label: "Miami–Fort Lauderdale, FL", state: "FL", stateName: "Florida", timezone: NY, populationBand: "5M+", areaCodes: ["305", "786", "954", "561"], suburbs: ["Fort Lauderdale", "Hialeah", "Hollywood", "Coral Gables", "Boca Raton", "West Palm Beach"], climate: "hot_humid", costBand: "mid", sunBelt: true, seasonNote: "Miami is cooling season twelve months a year; hurricane season (June–November) adds generator, surge and post-storm electrical calls on top of it." },
  { slug: "phoenix", city: "Phoenix", label: "Phoenix, AZ", state: "AZ", stateName: "Arizona", timezone: "America/Phoenix", populationBand: "5M+", areaCodes: ["602", "480", "623"], suburbs: ["Mesa", "Scottsdale", "Chandler", "Gilbert", "Glendale", "Tempe"], climate: "hot_dry", costBand: "mid", sunBelt: true, seasonNote: "Phoenix hits 110°F, and a condenser that quits in July is a same-day emergency — the calls come in bunches on the hottest afternoons, exactly when every tech is on a roof." },
  { slug: "boston", city: "Boston", label: "Boston, MA", state: "MA", stateName: "Massachusetts", timezone: NY, populationBand: "2–5M", areaCodes: ["617", "857", "781", "339", "508"], suburbs: ["Cambridge", "Quincy", "Newton", "Somerville", "Brookline", "Waltham"], climate: "cold", costBand: "high", sunBelt: false, seasonNote: "Boston's heating season runs October to April on boilers and oil, with a short but intense AC window and heat-pump conversions booking year-round." },
  { slug: "riverside", city: "Riverside", label: "Riverside–San Bernardino, CA", state: "CA", stateName: "California", timezone: LA, populationBand: "2–5M", areaCodes: ["951", "909", "760"], suburbs: ["San Bernardino", "Ontario", "Corona", "Temecula", "Moreno Valley", "Fontana"], climate: "hot_dry", costBand: "mid", sunBelt: false, seasonNote: "The Inland Empire runs hotter and longer than the coast, so AC calls start in May and keep coming through October." },
  { slug: "san-francisco", city: "San Francisco", label: "San Francisco Bay Area, CA", state: "CA", stateName: "California", timezone: LA, populationBand: "2–5M", areaCodes: ["415", "628", "510", "650"], suburbs: ["Oakland", "Berkeley", "Daly City", "San Mateo", "Fremont", "Walnut Creek"], climate: "mild", costBand: "high", sunBelt: false, seasonNote: "The Bay Area is mild on the coast and hot in the East Bay, so HVAC calls cluster inland while plumbing and electrical work on older housing stock runs all year." },
  { slug: "detroit", city: "Detroit", label: "Detroit, MI", state: "MI", stateName: "Michigan", timezone: "America/Detroit", populationBand: "2–5M", areaCodes: ["313", "248", "586", "734"], suburbs: ["Dearborn", "Warren", "Troy", "Livonia", "Sterling Heights", "Ann Arbor"], climate: "cold", costBand: "mid", sunBelt: false, seasonNote: "Detroit winters put furnaces and frozen pipes at the top of the call list from December through February, with a real AC season in July." },
  { slug: "seattle", city: "Seattle", label: "Seattle–Tacoma, WA", state: "WA", stateName: "Washington", timezone: LA, populationBand: "2–5M", areaCodes: ["206", "425", "253"], suburbs: ["Bellevue", "Tacoma", "Everett", "Kent", "Redmond", "Renton"], climate: "mild", costBand: "high", sunBelt: false, seasonNote: "Seattle has few extreme days, so the rare heat dome or cold snap floods every shop at once — and heat-pump installs book steadily the rest of the year." },
  { slug: "minneapolis", city: "Minneapolis", label: "Minneapolis–St. Paul, MN", state: "MN", stateName: "Minnesota", timezone: CHI, populationBand: "2–5M", areaCodes: ["612", "651", "763", "952"], suburbs: ["St. Paul", "Bloomington", "Eden Prairie", "Plymouth", "Maple Grove", "Woodbury"], climate: "cold", costBand: "mid", sunBelt: false, seasonNote: "In the Twin Cities a furnace that fails at -10°F is an emergency within hours, and the first week of real cold each year is the busiest week of the year." },
  { slug: "tampa", city: "Tampa", label: "Tampa–St. Petersburg, FL", state: "FL", stateName: "Florida", timezone: NY, populationBand: "2–5M", areaCodes: ["813", "727", "941"], suburbs: ["St. Petersburg", "Clearwater", "Brandon", "Wesley Chapel", "Largo", "Lakeland"], climate: "hot_humid", costBand: "mid", sunBelt: true, seasonNote: "Tampa Bay is AC season from April to November, with afternoon storms and hurricane season adding electrical and generator calls." },
  { slug: "san-diego", city: "San Diego", label: "San Diego, CA", state: "CA", stateName: "California", timezone: LA, populationBand: "2–5M", areaCodes: ["619", "858", "760"], suburbs: ["Chula Vista", "Oceanside", "Escondido", "Carlsbad", "El Cajon", "La Mesa"], climate: "mild", costBand: "high", sunBelt: false, seasonNote: "San Diego is mild at the coast and hot inland, so the East County heat waves drive HVAC calls while water heaters and repipes run year-round." },
  { slug: "denver", city: "Denver", label: "Denver, CO", state: "CO", stateName: "Colorado", timezone: DEN, populationBand: "2–5M", areaCodes: ["303", "720"], suburbs: ["Aurora", "Lakewood", "Littleton", "Arvada", "Westminster", "Boulder"], climate: "cold", costBand: "high", sunBelt: false, seasonNote: "Denver can swing 50 degrees in a day, which means furnace and AC calls in the same week and hail-season electrical work every summer." },
  { slug: "baltimore", city: "Baltimore", label: "Baltimore, MD", state: "MD", stateName: "Maryland", timezone: NY, populationBand: "2–5M", areaCodes: ["410", "443", "667"], suburbs: ["Towson", "Columbia", "Glen Burnie", "Ellicott City", "Catonsville", "Annapolis"], climate: "mixed", costBand: "mid", sunBelt: false, seasonNote: "Baltimore's humid summers and freezing Januaries give HVAC two rushes a year, and the row-house stock keeps plumbing and panel work steady." },
  { slug: "orlando", city: "Orlando", label: "Orlando, FL", state: "FL", stateName: "Florida", timezone: NY, populationBand: "2–5M", areaCodes: ["407", "321", "689"], suburbs: ["Kissimmee", "Sanford", "Winter Park", "Altamonte Springs", "Apopka", "Clermont"], climate: "hot_humid", costBand: "mid", sunBelt: true, seasonNote: "Orlando runs AC nearly all year, and fast-growing subdivisions mean a steady stream of new-homeowner calls on top of the summer no-cool rush." },
  { slug: "charlotte", city: "Charlotte", label: "Charlotte, NC", state: "NC", stateName: "North Carolina", timezone: NY, populationBand: "2–5M", areaCodes: ["704", "980"], suburbs: ["Concord", "Huntersville", "Matthews", "Gastonia", "Rock Hill", "Mooresville"], climate: "mixed", costBand: "mid", sunBelt: true, seasonNote: "Charlotte gets humid 95°F summers and enough winter to keep heat pumps busy, and the growth in the suburbs keeps install calls coming all year." },
  { slug: "st-louis", city: "St. Louis", label: "St. Louis, MO", state: "MO", stateName: "Missouri", timezone: CHI, populationBand: "2–5M", areaCodes: ["314", "636", "618"], suburbs: ["Chesterfield", "St. Charles", "Florissant", "Kirkwood", "Belleville", "O'Fallon"], climate: "mixed", costBand: "low", sunBelt: false, seasonNote: "St. Louis has real summers and real winters, so the phone spikes in July and January and the shoulders fill with tune-ups and changeouts." },
  { slug: "san-antonio", city: "San Antonio", label: "San Antonio, TX", state: "TX", stateName: "Texas", timezone: CHI, populationBand: "2–5M", areaCodes: ["210", "726"], suburbs: ["New Braunfels", "Schertz", "Boerne", "Helotes", "Converse", "Seguin"], climate: "hot_humid", costBand: "low", sunBelt: true, seasonNote: "San Antonio runs AC from March to November, and the rare hard freeze (February 2021) is the week every plumber in town misses more calls than they take." },
  { slug: "portland", city: "Portland", label: "Portland, OR", state: "OR", stateName: "Oregon", timezone: LA, populationBand: "2–5M", areaCodes: ["503", "971"], suburbs: ["Beaverton", "Hillsboro", "Gresham", "Tigard", "Lake Oswego", "Vancouver, WA"], climate: "mild", costBand: "high", sunBelt: false, seasonNote: "Portland is mild until it isn't: the summer heat domes and winter ice storms each bring a week where nobody's phone stops ringing." },
  { slug: "austin", city: "Austin", label: "Austin, TX", state: "TX", stateName: "Texas", timezone: CHI, populationBand: "2–5M", areaCodes: ["512", "737"], suburbs: ["Round Rock", "Cedar Park", "Pflugerville", "Georgetown", "Kyle", "Leander"], climate: "hot_humid", costBand: "mid", sunBelt: true, seasonNote: "Austin's 100°F summers run from June into September, and the fast-growing suburbs keep new-construction and changeout calls coming in the shoulders." },
  { slug: "pittsburgh", city: "Pittsburgh", label: "Pittsburgh, PA", state: "PA", stateName: "Pennsylvania", timezone: NY, populationBand: "2–5M", areaCodes: ["412", "724", "878"], suburbs: ["Cranberry Township", "Monroeville", "Bethel Park", "Mt. Lebanon", "Ross Township", "Washington"], climate: "cold", costBand: "low", sunBelt: false, seasonNote: "Pittsburgh's older housing stock means boilers, furnaces and knob-and-tube upgrades, with the winter no-heat rush as the busiest stretch of the year." },
  { slug: "sacramento", city: "Sacramento", label: "Sacramento, CA", state: "CA", stateName: "California", timezone: LA, populationBand: "2–5M", areaCodes: ["916", "279", "530"], suburbs: ["Roseville", "Elk Grove", "Folsom", "Citrus Heights", "Rancho Cordova", "Davis"], climate: "hot_dry", costBand: "mid", sunBelt: false, seasonNote: "Sacramento summers run 100°F for weeks, so AC calls dominate June through September while water heaters and panel work fill the rest of the year." },
  { slug: "las-vegas", city: "Las Vegas", label: "Las Vegas, NV", state: "NV", stateName: "Nevada", timezone: LA, populationBand: "2–5M", areaCodes: ["702", "725"], suburbs: ["Henderson", "North Las Vegas", "Summerlin", "Boulder City", "Enterprise", "Spring Valley"], climate: "hot_dry", costBand: "mid", sunBelt: false, seasonNote: "Las Vegas runs 105°F+ for most of the summer, and rooftop package units failing in July make no-cool calls the emergency of the season." },
  { slug: "cincinnati", city: "Cincinnati", label: "Cincinnati, OH", state: "OH", stateName: "Ohio", timezone: NY, populationBand: "2–5M", areaCodes: ["513", "859"], suburbs: ["Mason", "West Chester", "Florence", "Covington", "Hamilton", "Fairfield"], climate: "mixed", costBand: "low", sunBelt: false, seasonNote: "Cincinnati gets humid summers and freezing winters, so HVAC has two rushes and plumbers see frozen pipes every January." },
  { slug: "kansas-city", city: "Kansas City", label: "Kansas City, MO", state: "MO", stateName: "Missouri", timezone: CHI, populationBand: "2–5M", areaCodes: ["816", "913"], suburbs: ["Overland Park", "Olathe", "Independence", "Lee's Summit", "Lenexa", "Shawnee"], climate: "mixed", costBand: "low", sunBelt: false, seasonNote: "Kansas City sees 100°F Julys and single-digit Januaries, so the same shops are slammed twice a year and quiet in between." },
  { slug: "columbus", city: "Columbus", label: "Columbus, OH", state: "OH", stateName: "Ohio", timezone: NY, populationBand: "2–5M", areaCodes: ["614", "380"], suburbs: ["Dublin", "Westerville", "Hilliard", "Grove City", "Gahanna", "Reynoldsburg"], climate: "cold", costBand: "low", sunBelt: false, seasonNote: "Columbus is growing fast, with new-build suburbs adding install calls to the winter no-heat and summer no-cool rushes." },
  { slug: "cleveland", city: "Cleveland", label: "Cleveland, OH", state: "OH", stateName: "Ohio", timezone: NY, populationBand: "2–5M", areaCodes: ["216", "440", "330"], suburbs: ["Parma", "Lakewood", "Strongsville", "Mentor", "Westlake", "Akron"], climate: "cold", costBand: "low", sunBelt: false, seasonNote: "Cleveland's lake-effect winters make December through February the furnace and frozen-pipe season, with a short but busy AC window in July." },
  { slug: "indianapolis", city: "Indianapolis", label: "Indianapolis, IN", state: "IN", stateName: "Indiana", timezone: "America/Indiana/Indianapolis", populationBand: "2–5M", areaCodes: ["317", "463"], suburbs: ["Carmel", "Fishers", "Greenwood", "Noblesville", "Avon", "Plainfield"], climate: "mixed", costBand: "low", sunBelt: false, seasonNote: "Indianapolis has humid summers and cold winters, so HVAC shops see two rushes a year and the fast-growing north suburbs add install work in between." },
  { slug: "nashville", city: "Nashville", label: "Nashville, TN", state: "TN", stateName: "Tennessee", timezone: CHI, populationBand: "2–5M", areaCodes: ["615", "629"], suburbs: ["Franklin", "Murfreesboro", "Hendersonville", "Brentwood", "Mt. Juliet", "Smyrna"], climate: "hot_humid", costBand: "mid", sunBelt: false, seasonNote: "Nashville's humid summers run May through September, and the building boom in Williamson and Rutherford counties keeps install and panel calls coming all year." },
  { slug: "san-jose", city: "San Jose", label: "San Jose, CA", state: "CA", stateName: "California", timezone: LA, populationBand: "1–2M", areaCodes: ["408", "669"], suburbs: ["Sunnyvale", "Santa Clara", "Milpitas", "Cupertino", "Mountain View", "Morgan Hill"], climate: "mild", costBand: "high", sunBelt: false, seasonNote: "The South Bay is mild, so calls cluster on the handful of heat waves a year, while EV chargers, heat pumps and panel upgrades book steadily." },
  { slug: "virginia-beach", city: "Virginia Beach", label: "Virginia Beach–Norfolk, VA", state: "VA", stateName: "Virginia", timezone: NY, populationBand: "1–2M", areaCodes: ["757", "948"], suburbs: ["Norfolk", "Chesapeake", "Newport News", "Hampton", "Suffolk", "Portsmouth"], climate: "mixed", costBand: "mid", sunBelt: false, seasonNote: "Hampton Roads gets humid summers, a few hard freezes and coastal storms, and the military moves mean a steady stream of new-homeowner calls." },
  { slug: "jacksonville", city: "Jacksonville", label: "Jacksonville, FL", state: "FL", stateName: "Florida", timezone: NY, populationBand: "1–2M", areaCodes: ["904", "324"], suburbs: ["Orange Park", "St. Augustine", "Fernandina Beach", "Ponte Vedra", "Middleburg", "Fleming Island"], climate: "hot_humid", costBand: "low", sunBelt: true, seasonNote: "Jacksonville runs AC from April through October with a short heating season, and the sprawling service area means long drives between calls." },
  { slug: "providence", city: "Providence", label: "Providence, RI", state: "RI", stateName: "Rhode Island", timezone: NY, populationBand: "1–2M", areaCodes: ["401"], suburbs: ["Warwick", "Cranston", "Pawtucket", "East Providence", "Woonsocket", "Fall River, MA"], climate: "cold", costBand: "mid", sunBelt: false, seasonNote: "Providence heats with oil and gas boilers from October to April, and the older housing stock keeps electrical and plumbing calls steady year-round." },
  { slug: "milwaukee", city: "Milwaukee", label: "Milwaukee, WI", state: "WI", stateName: "Wisconsin", timezone: CHI, populationBand: "1–2M", areaCodes: ["414", "262"], suburbs: ["Waukesha", "West Allis", "Wauwatosa", "Brookfield", "New Berlin", "Oak Creek"], climate: "cold", costBand: "low", sunBelt: false, seasonNote: "Milwaukee winters make December through February furnace season, with frozen pipes on every cold snap and a short AC window in July." },
] as const;

const BY_SLUG: Record<string, Metro> = Object.fromEntries(METROS.map((m) => [m.slug, m]));

export function getMetro(slug: string): Metro | null {
  return BY_SLUG[slug] ?? null;
}

export function isMetroSlug(slug: string): boolean {
  return slug in BY_SLUG;
}

export const METRO_SLUGS: readonly string[] = METROS.map((m) => m.slug);

/** Human label for the quiet-hours time zone, e.g. "Central time". */
export function timezoneLabel(tz: string): string {
  if (tz === "America/Phoenix") return "Mountain time (Arizona, no daylight saving)";
  if (tz === "America/Denver") return "Mountain time";
  if (tz === "America/Chicago") return "Central time";
  if (tz === "America/Los_Angeles") return "Pacific time";
  return "Eastern time";
}

/** Nearby metros for internal linking: same state first, then same time zone, then the rest. */
export function nearbyMetros(metro: Metro, limit = 6): Metro[] {
  const score = (m: Metro) => (m.state === metro.state ? 0 : m.timezone === metro.timezone ? 1 : m.climate === metro.climate ? 2 : 3);
  return METROS.filter((m) => m.slug !== metro.slug)
    .map((m) => ({ m, s: score(m) }))
    .sort((a, b) => a.s - b.s || METROS.indexOf(a.m) - METROS.indexOf(b.m))
    .slice(0, limit)
    .map((x) => x.m);
}
