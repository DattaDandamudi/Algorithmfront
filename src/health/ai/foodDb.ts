import type { FoodItem, FoodTag, Macros } from '../data/types';

/**
 * Local food database — the offline half of the §2/§9 natural-language logging
 * bar, and the fallback when Claude is unavailable.
 *
 * Every entry is per 100 g with *restaurant-style* priors for the takeaway
 * dishes the spec persona actually eats (Indian / Middle Eastern: yogurt-
 * marinated tandoori & tikka with moderate added oil, ghee-heavy biryani,
 * fatty shawarma with garlic sauce, carb-dense roti/naan) and label-style
 * values for home basics. Accuracy on restaurant food is inherently ~75–80 %
 * (spec §9 caveat), so every value is editable before save — these are priors,
 * not truth.
 *
 * `unitName`/`unitGrams` give the parser a natural counting unit ("2 rotis",
 * "a plate of biryani"); `defaultGrams` is the portion assumed when no
 * quantity is given. Tags feed the §3 frequency counters and §7 #13/#14 insights:
 * 'restaurant' marks typical takeaway dishes, 'home' marks basics.
 */

type Cuisine = NonNullable<FoodItem['cuisine']>;

interface ItemOpts {
  unit?: [name: string, grams: number];
  aliases?: string[];
  cuisine?: Cuisine;
  tags?: FoodTag[];
}

/** [kcal, protein, fat, carbs, fiber] per 100 g. */
type Per100 = [kc: number, p: number, f: number, c: number, fi: number];

function item(id: string, name: string, per: Per100, defaultGrams: number, o: ItemOpts = {}): FoodItem {
  const per100: Macros = { kc: per[0], p: per[1], f: per[2], c: per[3], fi: per[4] };
  const out: FoodItem = { id, name, per100, defaultGrams, aliases: o.aliases ?? [], cuisine: o.cuisine ?? 'generic', tags: o.tags ?? [] };
  if (o.unit) {
    out.unitName = o.unit[0];
    out.unitGrams = o.unit[1];
  }
  return out;
}

const IN: Cuisine = 'indian';
const ME: Cuisine = 'middle-eastern';
const W: Cuisine = 'western';

// prettier-ignore
export const FOOD_DB: FoodItem[] = [
  // ---- Indian — restaurant mains -------------------------------------------------------------------
  item('chicken-tikka', 'Chicken tikka', [165, 25, 6, 3, 0.5], 200, { unit: ['piece', 35], aliases: ['tikka', 'murgh tikka', 'chicken tikka kebab'], cuisine: IN, tags: ['poultry', 'restaurant'] }),
  item('tandoori-chicken', 'Tandoori chicken', [190, 26, 8, 3, 0.3], 250, { unit: ['piece', 125], aliases: ['tandoori murgh', 'tandoori', 'tandoori chicken leg'], cuisine: IN, tags: ['poultry', 'restaurant'] }),
  item('butter-chicken', 'Butter chicken', [180, 14, 12, 5, 0.8], 250, { unit: ['bowl', 250], aliases: ['murgh makhani', 'chicken makhani', 'chicken tikka masala', 'tikka masala'], cuisine: IN, tags: ['poultry', 'dairy', 'restaurant'] }),
  item('chicken-curry', 'Chicken curry', [150, 15, 8, 5, 1], 250, { unit: ['bowl', 250], aliases: ['chicken masala', 'chicken gravy', 'kadai chicken', 'chicken korma', 'chicken karahi'], cuisine: IN, tags: ['poultry', 'restaurant'] }),
  item('chicken-biryani', 'Chicken biryani', [180, 9, 7, 20, 1], 350, { unit: ['plate', 350], aliases: ['biryani', 'murgh biryani', 'biriyani'], cuisine: IN, tags: ['poultry', 'grain', 'restaurant'] }),
  item('mutton-biryani', 'Mutton biryani', [200, 10, 9, 20, 1], 350, { unit: ['plate', 350], aliases: ['lamb biryani', 'goat biryani', 'gosht biryani'], cuisine: IN, tags: ['red-meat', 'grain', 'restaurant'] }),
  item('veg-biryani', 'Veg biryani', [160, 4, 6, 24, 2], 350, { unit: ['plate', 350], aliases: ['vegetable biryani', 'veggie biryani'], cuisine: IN, tags: ['veg', 'grain', 'restaurant'] }),
  item('mutton-curry', 'Mutton curry', [200, 18, 13, 4, 1], 250, { unit: ['bowl', 250], aliases: ['lamb curry', 'goat curry', 'gosht', 'mutton masala', 'rogan josh'], cuisine: IN, tags: ['red-meat', 'restaurant'] }),
  item('keema', 'Keema', [210, 17, 14, 5, 1], 200, { unit: ['bowl', 200], aliases: ['kheema', 'mince curry', 'keema matar', 'mutton keema'], cuisine: IN, tags: ['red-meat', 'restaurant'] }),
  item('seekh-kebab', 'Seekh kebab', [240, 18, 17, 4, 1], 150, { unit: ['skewer', 75], aliases: ['seekh', 'kabab', 'seekh kabab', 'mutton seekh'], cuisine: IN, tags: ['red-meat', 'restaurant'] }),
  item('chicken-seekh-kebab', 'Chicken seekh kebab', [190, 20, 11, 3, 0.5], 150, { unit: ['skewer', 75], aliases: ['chicken seekh', 'chicken kabab'], cuisine: IN, tags: ['poultry', 'restaurant'] }),
  item('tandoori-prawns', 'Tandoori prawns', [120, 20, 3.5, 2, 0.3], 150, { unit: ['prawn', 20], aliases: ['tandoori shrimp', 'prawns', 'tandoori jhinga', 'grilled prawns'], cuisine: IN, tags: ['seafood', 'restaurant'] }),
  item('fish-curry', 'Fish curry', [140, 15, 8, 4, 1], 250, { unit: ['bowl', 250], aliases: ['fish masala', 'goan fish curry', 'machli curry'], cuisine: IN, tags: ['fish', 'restaurant'] }),
  item('fish-tikka', 'Fish tikka', [150, 22, 6, 2, 0.3], 150, { unit: ['piece', 40], aliases: ['tandoori fish', 'fish tandoori'], cuisine: IN, tags: ['fish', 'restaurant'] }),
  item('egg-curry', 'Egg curry', [150, 9, 10, 6, 1], 200, { unit: ['bowl', 200], aliases: ['anda curry'], cuisine: IN, tags: ['egg', 'home'] }),
  // ---- Indian — veg & sides ---------------------------------------------------------------------
  item('dal-tadka', 'Dal tadka', [110, 6, 4, 13, 4], 200, { unit: ['bowl', 200], aliases: ['dal', 'daal', 'dal fry', 'yellow dal', 'tadka dal', 'lentils'], cuisine: IN, tags: ['legume', 'veg', 'home'] }),
  item('dal-makhani', 'Dal makhani', [150, 7, 8, 14, 4], 200, { unit: ['bowl', 200], aliases: ['black dal', 'makhani dal'], cuisine: IN, tags: ['legume', 'veg', 'restaurant'] }),
  item('chana-masala', 'Chana masala', [140, 7, 5, 18, 6], 200, { unit: ['bowl', 200], aliases: ['chole', 'chana', 'chickpea curry', 'chole masala'], cuisine: IN, tags: ['legume', 'veg', 'home'] }),
  item('rajma', 'Rajma', [120, 6, 3, 18, 6], 200, { unit: ['bowl', 200], aliases: ['kidney bean curry', 'rajma masala'], cuisine: IN, tags: ['legume', 'veg', 'home'] }),
  item('palak-paneer', 'Palak paneer', [170, 9, 12, 7, 2], 200, { unit: ['bowl', 200], aliases: ['saag paneer', 'spinach paneer'], cuisine: IN, tags: ['dairy', 'veg', 'restaurant'] }),
  item('paneer-tikka', 'Paneer tikka', [220, 16, 15, 6, 1], 150, { unit: ['piece', 30], aliases: ['tikka paneer'], cuisine: IN, tags: ['dairy', 'veg', 'restaurant'] }),
  item('paneer-butter-masala', 'Paneer butter masala', [210, 10, 16, 8, 1], 250, { unit: ['bowl', 250], aliases: ['paneer makhani', 'shahi paneer', 'paneer masala'], cuisine: IN, tags: ['dairy', 'veg', 'restaurant'] }),
  item('aloo-gobi', 'Aloo gobi', [110, 2.5, 6, 13, 3], 150, { unit: ['bowl', 150], aliases: ['gobi', 'potato cauliflower'], cuisine: IN, tags: ['veg', 'home'] }),
  item('mixed-veg-curry', 'Mixed veg curry', [100, 3, 5, 12, 3], 200, { unit: ['bowl', 200], aliases: ['veg curry', 'sabzi', 'mixed veg', 'vegetable curry', 'sabji'], cuisine: IN, tags: ['veg', 'home'] }),
  item('raita', 'Raita', [70, 3.5, 3, 6, 0.5], 100, { unit: ['bowl', 100], aliases: ['dahi', 'yogurt raita', 'boondi raita', 'cucumber raita'], cuisine: IN, tags: ['dairy', 'veg'] }),
  item('samosa', 'Samosa', [260, 5, 14, 30, 2], 100, { unit: ['samosa', 50], aliases: ['veg samosa', 'aloo samosa'], cuisine: IN, tags: ['veg', 'restaurant'] }),
  item('gulab-jamun', 'Gulab jamun', [320, 4, 10, 55, 0], 80, { unit: ['piece', 40], aliases: ['jamun'], cuisine: IN, tags: ['sweet', 'dairy', 'restaurant'] }),
  // ---- Indian — breads, rice, breakfast, drinks ---------------------------------------------------
  item('roti', 'Roti', [300, 9, 6, 52, 6], 40, { unit: ['roti', 40], aliases: ['chapati', 'phulka', 'tawa roti', 'chapathi'], cuisine: IN, tags: ['grain', 'home'] }),
  item('naan', 'Naan', [310, 9, 8, 50, 2], 90, { unit: ['naan', 90], aliases: ['plain naan', 'butter naan'], cuisine: IN, tags: ['grain', 'restaurant'] }),
  item('garlic-naan', 'Garlic naan', [320, 9, 10, 49, 2], 95, { unit: ['naan', 95], aliases: ['garlic butter naan'], cuisine: IN, tags: ['grain', 'restaurant'] }),
  item('paratha', 'Paratha', [330, 7, 14, 44, 4], 80, { unit: ['paratha', 80], aliases: ['plain paratha', 'lachha paratha', 'aloo paratha', 'parotta'], cuisine: IN, tags: ['grain', 'home'] }),
  item('rice-cooked', 'Basmati rice (cooked)', [130, 2.7, 0.3, 28, 0.4], 150, { unit: ['cup', 160], aliases: ['rice', 'white rice', 'steamed rice', 'basmati', 'plain rice', 'basmati rice'], cuisine: IN, tags: ['grain', 'home'] }),
  item('jeera-rice', 'Jeera rice', [160, 3, 4, 29, 0.5], 150, { unit: ['cup', 160], aliases: ['cumin rice', 'zeera rice'], cuisine: IN, tags: ['grain', 'restaurant'] }),
  item('idli', 'Idli', [130, 4, 0.5, 28, 1], 120, { unit: ['idli', 40], aliases: ['idly'], cuisine: IN, tags: ['grain', 'veg', 'home'] }),
  item('sambar', 'Sambar', [60, 3, 1.5, 9, 2.5], 150, { unit: ['bowl', 150], aliases: ['sambhar', 'sambar dal'], cuisine: IN, tags: ['legume', 'veg', 'home'] }),
  item('dosa', 'Dosa', [170, 4, 5, 28, 1.5], 120, { unit: ['dosa', 120], aliases: ['plain dosa', 'masala dosa'], cuisine: IN, tags: ['grain', 'veg', 'restaurant'] }),
  item('upma', 'Upma', [150, 4, 5, 24, 2], 200, { unit: ['bowl', 200], aliases: ['rava upma'], cuisine: IN, tags: ['grain', 'veg', 'home'] }),
  item('poha', 'Poha', [150, 3, 4, 28, 1.5], 200, { unit: ['bowl', 200], aliases: ['kanda poha', 'pohe'], cuisine: IN, tags: ['grain', 'veg', 'home'] }),
  item('masala-omelette', 'Masala omelette', [180, 12, 13, 3, 0.5], 120, { unit: ['egg', 60], aliases: ['omelette', 'omelet', 'egg omelette'], cuisine: IN, tags: ['egg', 'home'] }),
  item('chai', 'Chai', [55, 2, 2, 8, 0], 150, { unit: ['cup', 150], aliases: ['masala chai', 'tea', 'milk tea', 'chai tea', 'cutting chai'], cuisine: IN, tags: ['caffeine', 'dairy', 'sweet', 'home'] }),
  // ---- Middle Eastern -------------------------------------------------------------------------------
  item('chicken-shawarma-wrap', 'Chicken shawarma wrap', [210, 15, 10, 17, 1.5], 300, { unit: ['wrap', 300], aliases: ['chicken shawarma', 'shawarma', 'shawarma wrap', 'chicken shawarma sandwich', 'shawarma sandwich'], cuisine: ME, tags: ['poultry', 'grain', 'restaurant'] }),
  item('beef-shawarma-wrap', 'Beef shawarma wrap', [230, 15, 13, 16, 1.5], 300, { unit: ['wrap', 300], aliases: ['beef shawarma', 'beef shawarma sandwich'], cuisine: ME, tags: ['red-meat', 'grain', 'restaurant'] }),
  item('lamb-shawarma-wrap', 'Lamb shawarma wrap', [240, 15, 14, 16, 1.5], 300, { unit: ['wrap', 300], aliases: ['lamb shawarma', 'lamb shawarma sandwich'], cuisine: ME, tags: ['red-meat', 'grain', 'restaurant'] }),
  item('chicken-shawarma-plate', 'Chicken shawarma plate', [180, 17, 9, 9, 1], 400, { unit: ['plate', 400], aliases: ['shawarma plate', 'chicken shawarma platter', 'shawarma platter'], cuisine: ME, tags: ['poultry', 'restaurant'] }),
  item('beef-shawarma-plate', 'Beef shawarma plate', [200, 16, 12, 8, 1], 400, { unit: ['plate', 400], aliases: ['beef shawarma platter'], cuisine: ME, tags: ['red-meat', 'restaurant'] }),
  item('lamb-shawarma-plate', 'Lamb shawarma plate', [210, 16, 13, 8, 1], 400, { unit: ['plate', 400], aliases: ['lamb shawarma platter'], cuisine: ME, tags: ['red-meat', 'restaurant'] }),
  item('falafel', 'Falafel', [330, 13, 18, 32, 6], 90, { unit: ['piece', 30], aliases: ['falafel balls', 'falafels'], cuisine: ME, tags: ['legume', 'veg', 'restaurant'] }),
  item('falafel-wrap', 'Falafel wrap', [260, 9, 11, 33, 5], 300, { unit: ['wrap', 300], aliases: ['falafel sandwich', 'falafel roll'], cuisine: ME, tags: ['legume', 'veg', 'grain', 'restaurant'] }),
  item('hummus', 'Hummus', [170, 8, 10, 14, 6], 80, { unit: ['tbsp', 15], aliases: ['hummous', 'houmous', 'hommus'], cuisine: ME, tags: ['legume', 'veg'] }),
  item('tabbouleh', 'Tabbouleh', [120, 3, 7, 13, 3], 120, { unit: ['bowl', 120], aliases: ['tabouli', 'tabbouli', 'tabouleh'], cuisine: ME, tags: ['veg', 'grain'] }),
  item('fattoush', 'Fattoush', [110, 2, 7, 10, 2], 150, { unit: ['bowl', 150], aliases: ['fattoush salad', 'fatoush'], cuisine: ME, tags: ['veg'] }),
  item('lamb-chops', 'Lamb chops', [290, 24, 21, 0, 0], 180, { unit: ['chop', 60], aliases: ['lamb chop', 'mutton chops', 'grilled lamb chops'], cuisine: ME, tags: ['red-meat', 'restaurant'] }),
  item('kofta', 'Kofta', [250, 17, 18, 5, 1], 150, { unit: ['piece', 50], aliases: ['kofta kebab', 'kefta', 'beef kofta', 'lamb kofta', 'kafta'], cuisine: ME, tags: ['red-meat', 'restaurant'] }),
  item('shish-tawook', 'Shish tawook', [170, 24, 7, 2, 0.3], 200, { unit: ['skewer', 100], aliases: ['shish taouk', 'tawook', 'chicken shish', 'taouk'], cuisine: ME, tags: ['poultry', 'restaurant'] }),
  item('kebab-plate', 'Mixed kebab plate', [220, 16, 12, 14, 1.5], 450, { unit: ['plate', 450], aliases: ['kebab plate', 'mixed grill', 'kebab platter', 'mixed grill plate', 'grill plate'], cuisine: ME, tags: ['red-meat', 'poultry', 'restaurant'] }),
  item('grilled-chicken-thigh', 'Grilled chicken thigh', [210, 24, 12, 0, 0], 150, { unit: ['piece', 75], aliases: ['grilled chicken', 'chicken thigh', 'farrouj', 'charcoal chicken'], cuisine: ME, tags: ['poultry', 'restaurant'] }),
  item('mandi', 'Chicken mandi', [190, 11, 7, 22, 1], 400, { unit: ['plate', 400], aliases: ['mandi', 'lamb mandi', 'mandi rice', 'mandi plate'], cuisine: ME, tags: ['poultry', 'grain', 'restaurant'] }),
  item('kabsa', 'Kabsa', [190, 10, 7, 23, 1], 400, { unit: ['plate', 400], aliases: ['kabsah', 'chicken kabsa', 'machboos', 'majboos'], cuisine: ME, tags: ['poultry', 'grain', 'restaurant'] }),
  item('pita', 'Pita', [275, 9, 1.2, 55, 2], 60, { unit: ['pita', 60], aliases: ['pita bread', 'khubz', 'arabic bread', 'kuboos'], cuisine: ME, tags: ['grain'] }),
  item('labneh', 'Labneh', [150, 8, 11, 5, 0], 60, { unit: ['tbsp', 20], aliases: ['labne', 'strained yogurt'], cuisine: ME, tags: ['dairy'] }),
  item('garlic-sauce', 'Garlic sauce (toum)', [350, 1, 36, 6, 0], 30, { unit: ['tbsp', 15], aliases: ['toum', 'garlic dip', 'garlic mayo'], cuisine: ME, tags: ['restaurant'] }),
  item('baba-ghanoush', 'Baba ghanoush', [130, 2, 10, 9, 3], 80, { unit: ['tbsp', 15], aliases: ['baba ganoush', 'moutabal', 'mutabal'], cuisine: ME, tags: ['veg'] }),
  item('lentil-soup', 'Lentil soup', [90, 6, 2, 14, 4], 250, { unit: ['bowl', 250], aliases: ['shorba', 'adas', 'lentil shorba', 'shorbat adas'], cuisine: ME, tags: ['legume', 'veg'] }),
  // ---- Basics — protein ---------------------------------------------------------------------------
  item('eggs', 'Eggs', [143, 13, 10, 1, 0], 100, { unit: ['egg', 50], aliases: ['egg', 'boiled egg', 'fried egg', 'scrambled eggs', 'whole egg', 'boiled eggs'], cuisine: W, tags: ['egg', 'home'] }),
  item('egg-whites', 'Egg whites', [52, 11, 0.2, 0.7, 0], 100, { unit: ['egg white', 33], aliases: ['egg white', 'whites'], cuisine: W, tags: ['egg', 'home'] }),
  item('whey-protein', 'Whey protein', [380, 78, 5, 8, 1], 30, { unit: ['scoop', 30], aliases: ['whey', 'protein shake', 'protein powder', 'whey scoop', 'protein scoop', 'shake'], cuisine: W, tags: ['dairy', 'home'] }),
  item('greek-yogurt', 'Greek yogurt', [60, 10, 0.4, 4, 0], 170, { unit: ['cup', 170], aliases: ['greek yoghurt', 'skyr', 'yogurt', 'yoghurt', 'curd'], cuisine: W, tags: ['dairy', 'home'] }),
  item('chicken-breast', 'Chicken breast', [165, 31, 3.6, 0, 0], 200, { unit: ['piece', 150], aliases: ['grilled chicken breast', 'chicken breast cooked', 'breast', 'boiled chicken'], cuisine: W, tags: ['poultry', 'home'] }),
  item('salmon', 'Salmon', [208, 20, 13, 0, 0], 150, { unit: ['fillet', 150], aliases: ['salmon fillet', 'grilled salmon', 'baked salmon'], cuisine: W, tags: ['fish', 'home'] }),
  item('tuna', 'Tuna (canned)', [116, 26, 1, 0, 0], 120, { unit: ['can', 120], aliases: ['tuna', 'canned tuna', 'tuna can', 'tuna in water'], cuisine: W, tags: ['fish', 'home'] }),
  item('beef-mince', 'Beef mince (cooked)', [250, 26, 17, 0, 0], 150, { aliases: ['ground beef', 'minced beef', 'mince', 'beef mince', 'lean mince'], cuisine: W, tags: ['red-meat', 'home'] }),
  item('paneer', 'Paneer', [290, 18, 22, 4, 0], 100, { unit: ['cube', 15], aliases: ['paneer cubes', 'raw paneer'], cuisine: IN, tags: ['dairy', 'home'] }),
  item('protein-bar', 'Protein bar', [380, 32, 12, 38, 6], 60, { unit: ['bar', 60], aliases: ['quest bar', 'protein bars'], cuisine: W, tags: ['sweet', 'dairy'] }),
  // ---- Basics — carbs, fruit, fats -----------------------------------------------------------------
  item('oats', 'Oats', [380, 13, 7, 66, 10], 50, { unit: ['cup', 80], aliases: ['oatmeal', 'rolled oats', 'porridge oats', 'porridge'], cuisine: W, tags: ['grain', 'home'] }),
  item('bread', 'Bread', [265, 9, 3.2, 49, 2.7], 30, { unit: ['slice', 30], aliases: ['toast', 'white bread', 'brown bread', 'whole wheat bread', 'slice of bread'], cuisine: W, tags: ['grain', 'home'] }),
  item('rice-cake', 'Rice cake', [390, 8, 3, 82, 2], 9, { unit: ['cake', 9], aliases: ['rice cakes'], cuisine: W, tags: ['grain', 'home'] }),
  item('banana', 'Banana', [89, 1.1, 0.3, 23, 2.6], 120, { unit: ['banana', 120], aliases: ['bananas'], cuisine: W, tags: ['veg', 'home'] }),
  item('apple', 'Apple', [52, 0.3, 0.2, 14, 2.4], 180, { unit: ['apple', 180], aliases: ['apples'], cuisine: W, tags: ['veg', 'home'] }),
  item('avocado', 'Avocado', [160, 2, 15, 9, 7], 100, { unit: ['avocado', 150], aliases: ['avocados', 'half avocado'], cuisine: W, tags: ['veg', 'home'] }),
  item('almonds', 'Almonds', [580, 21, 50, 22, 12], 30, { unit: ['handful', 30], aliases: ['almond', 'badam'], cuisine: W, tags: ['home'] }),
  item('peanut-butter', 'Peanut butter', [590, 25, 50, 20, 6], 32, { unit: ['tbsp', 16], aliases: ['pb', 'pnb'], cuisine: W, tags: ['home'] }),
  item('olive-oil', 'Olive oil', [884, 0, 100, 0, 0], 14, { unit: ['tbsp', 14], aliases: ['evoo', 'extra virgin olive oil', 'oil'], cuisine: W, tags: ['home'] }),
  item('ghee', 'Ghee', [900, 0, 100, 0, 0], 14, { unit: ['tbsp', 14], aliases: ['clarified butter', 'desi ghee'], cuisine: IN, tags: ['dairy', 'home'] }),
  item('butter', 'Butter', [717, 0.9, 81, 0.1, 0], 14, { unit: ['tbsp', 14], aliases: ['salted butter', 'unsalted butter'], cuisine: W, tags: ['dairy', 'home'] }),
  // ---- Basics — drinks -----------------------------------------------------------------------------
  item('milk', 'Milk (whole)', [62, 3.3, 3.5, 4.8, 0], 250, { unit: ['glass', 250], aliases: ['milk', 'whole milk', 'full fat milk', 'cow milk', 'doodh'], cuisine: W, tags: ['dairy', 'home'] }),
  item('skim-milk', 'Milk (skim)', [35, 3.4, 0.1, 5, 0], 250, { unit: ['glass', 250], aliases: ['skim milk', 'skimmed milk', 'fat free milk', 'low fat milk'], cuisine: W, tags: ['dairy', 'home'] }),
  item('black-coffee', 'Black coffee', [0, 0, 0, 0, 0], 250, { unit: ['cup', 250], aliases: ['coffee', 'americano', 'espresso', 'filter coffee', 'long black'], cuisine: W, tags: ['caffeine', 'home'] }),
  item('latte', 'Latte', [55, 3, 2.8, 4.5, 0], 300, { unit: ['cup', 300], aliases: ['cafe latte', 'flat white', 'cappuccino', 'milk coffee', 'coffee with milk'], cuisine: W, tags: ['caffeine', 'dairy'] }),
  item('cola', 'Cola', [42, 0, 0, 10.6, 0], 330, { unit: ['can', 330], aliases: ['coke', 'pepsi', 'soda', 'soft drink', 'coca cola'], cuisine: W, tags: ['sweet', 'caffeine'] }),
  item('diet-cola', 'Diet cola', [0, 0, 0, 0, 0], 330, { unit: ['can', 330], aliases: ['diet coke', 'coke zero', 'zero sugar cola', 'pepsi max', 'diet soda'], cuisine: W, tags: ['caffeine'] }),
];

// ---------------------------------------------------------------------------
// Fuzzy lookup
// ---------------------------------------------------------------------------

export interface FoodMatch {
  item: FoodItem;
  /** 0–1: 1 = exact name/alias, ≥0.8 strong, 0.4–0.8 weak, <0.4 not returned. */
  score: number;
}

/** Filler words that never distinguish one food from another. */
const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'some', 'my', 'and', 'with', 'in', 'from', 'style', 'cooked', 'fresh', 'x']);

/** Cheap English singulariser applied to both query and index so "rotis" ⇔ "roti", "prawns" ⇔ "prawn". */
export function singularize(t: string): string {
  if (t.length <= 3) return t;
  if (t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (/(sses|shes|ches|xes|oes)$/.test(t)) return t.slice(0, -2);
  if (/(ss|us)$/.test(t)) return t;
  if (t.endsWith('s')) return t.slice(0, -1);
  return t;
}

/** Lower-case, strip punctuation (keeping digits, '.', '/', unicode fractions), split glued numbers ("200g"). */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9½¼¾⅓⅔./\s]+/g, ' ')
    .replace(/(\d)([a-z½¼¾⅓⅔])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalised, singularised, stopword-free tokens. */
export function tokens(s: string): string[] {
  return normalise(s)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t))
    .map(singularize);
}

/** Levenshtein distance with an early exit once `max` is exceeded (tokens are short). */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Prefix ("shaw" → "shawarma") or near-typo ("biriyani" → "biryani") token match. */
function fuzzyToken(q: string, k: string): boolean {
  if (q.length >= 4 && (k.startsWith(q) || (k.length >= 4 && q.startsWith(k)))) return true;
  const minLen = Math.min(q.length, k.length);
  if (minLen >= 5 && editDistance(q, k, 1) <= 1) return true;
  return minLen >= 8 && editDistance(q, k, 2) <= 2;
}

/**
 * Score a query token list against one indexed key (name or alias):
 * 1.0 same token set; ~0.9 query ⊆ key ("biryani" → "chicken biryani");
 * ~0.8 key ⊆ query ("chicken tikka masala" → "chicken tikka");
 * otherwise a 0.35–0.8 overlap score where prefix/typo hits count 0.8 of an exact hit.
 */
export function scoreTokens(q: string[], k: string[]): number {
  if (!q.length || !k.length) return 0;
  const qs = new Set(q);
  const ks = new Set(k);
  if (qs.size === ks.size && [...qs].every((t) => ks.has(t))) return 1;
  let exact = 0;
  let fuzzy = 0;
  for (const t of qs) {
    if (ks.has(t)) exact++;
    else if ([...ks].some((kt) => fuzzyToken(t, kt))) fuzzy++;
  }
  const hits = exact + 0.8 * fuzzy;
  if (hits === 0) return 0;
  if (exact >= qs.size) return 0.85 + 0.1 * (qs.size / ks.size);
  if (exact >= ks.size) return 0.7 + 0.15 * (ks.size / qs.size);
  return 0.35 + 0.45 * (hits / Math.max(qs.size, ks.size));
}

const MIN_SCORE = 0.4;

function keysOf(it: FoodItem): string[][] {
  return [it.name, ...(it.aliases ?? [])].map(tokens).filter((k) => k.length > 0);
}

/**
 * Rank foods for a free-text query. `extra` (favorites/recents) is searched
 * first and wins ties, so the user's own staples beat generic DB entries.
 * Results are de-duplicated by normalised name and sorted by score desc.
 */
export function findFood(query: string, extra: FoodItem[] = []): FoodMatch[] {
  const q = tokens(query);
  if (!q.length) return [];
  const seen = new Map<string, FoodMatch>();
  const consider = (it: FoodItem, boost: number) => {
    let best = 0;
    for (const k of keysOf(it)) best = Math.max(best, scoreTokens(q, k));
    if (best < MIN_SCORE) return;
    const score = Math.min(1, best + boost);
    const key = normalise(it.name);
    const prev = seen.get(key);
    if (!prev || score > prev.score) seen.set(key, { item: it, score });
  };
  // Favorites/recents get a hair of a boost so they outrank a same-score DB twin.
  for (const it of extra) consider(it, 0.02);
  for (const it of FOOD_DB) consider(it, 0);
  return [...seen.values()].sort((a, b) => b.score - a.score);
}

/** Exact id lookup across the DB and any extra list. */
export function getFood(id: string, extra: FoodItem[] = []): FoodItem | undefined {
  return extra.find((f) => f.id === id) ?? FOOD_DB.find((f) => f.id === id);
}
