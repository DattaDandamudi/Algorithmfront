import type { MenuItemSeed } from './menu.seed';

/**
 * Catalog extension: Godavari (Jersey City), added on request — the
 * pattern for bringing any missing restaurant into TrueFare. Menu and
 * prices are authored estimates like the rest of the demo catalog; live
 * menus arrive through the QuoteProvider seam, not by hand-editing.
 */
export const GODAVARI_SEED: MenuItemSeed[] = [
  {
    id: 'godavari:ghee-roast-dosa',
    restaurantId: 'godavari',
    name: 'Ghee Roast Dosa',
    description:
      'Crisp rice-and-lentil crepe brushed with ghee, potato masala, sambar and three chutneys.',
    glyph: 'wrap',
    basePriceCents: 1495,
    tags: ['south indian', 'dosa', 'crispy', 'potato', 'ghee'],
    dietary: ['vegetarian'],
    mealPeriods: ['breakfast', 'lunch', 'dinner'],
    popularity: 0.92,
  },
  {
    id: 'godavari:mysore-masala-dosa',
    restaurantId: 'godavari',
    name: 'Mysore Masala Dosa',
    description:
      'The classic with a swipe of fiery red garlic chutney under the potato masala.',
    glyph: 'wrap',
    basePriceCents: 1595,
    tags: ['south indian', 'dosa', 'spicy', 'garlic'],
    dietary: ['vegetarian'],
    mealPeriods: ['breakfast', 'lunch', 'dinner'],
    popularity: 0.78,
  },
  {
    id: 'godavari:idli-sambar',
    restaurantId: 'godavari',
    name: 'Idli Sambar (4)',
    description:
      'Steamed rice cakes floated in hot sambar with coconut and tomato chutneys.',
    glyph: 'dumpling',
    basePriceCents: 899,
    tags: ['south indian', 'idli', 'steamed', 'comfort'],
    dietary: ['vegetarian', 'vegan', 'gluten-free'],
    mealPeriods: ['breakfast', 'snack'],
    popularity: 0.7,
  },
  {
    id: 'godavari:medu-vada',
    restaurantId: 'godavari',
    name: 'Medu Vada (3)',
    description:
      'Crisp-edged urad dal doughnuts with peppercorn and curry leaf, served with sambar.',
    glyph: 'donut',
    basePriceCents: 949,
    tags: ['south indian', 'vada', 'crispy', 'lentil'],
    dietary: ['vegetarian', 'vegan', 'gluten-free'],
    mealPeriods: ['breakfast', 'snack'],
    popularity: 0.61,
  },
  {
    id: 'godavari:hyderabadi-chicken-biryani',
    restaurantId: 'godavari',
    name: 'Hyderabadi Chicken Dum Biryani',
    description:
      'Long-grain basmati steamed over marinated chicken, with mirchi ka salan and raita.',
    glyph: 'bowl',
    basePriceCents: 1795,
    tags: ['south indian', 'biryani', 'spicy', 'chicken', 'basmati'],
    dietary: [],
    mealPeriods: ['lunch', 'dinner'],
    popularity: 0.9,
  },
  {
    id: 'godavari:goat-biryani',
    restaurantId: 'godavari',
    name: 'Goat Dum Biryani',
    description:
      'Bone-in goat slow-steamed under saffron rice; the pot arrives sealed.',
    glyph: 'bowl',
    basePriceCents: 1995,
    tags: ['south indian', 'biryani', 'goat', 'saffron'],
    dietary: [],
    mealPeriods: ['lunch', 'dinner'],
    popularity: 0.72,
  },
  {
    id: 'godavari:andhra-chicken-curry',
    restaurantId: 'godavari',
    name: 'Andhra Chicken Curry',
    description:
      'Home-style curry with guntur chilli heat and curry leaves; pairs with ghee rice.',
    glyph: 'curry',
    basePriceCents: 1695,
    tags: ['south indian', 'curry', 'spicy', 'chicken', 'andhra'],
    dietary: [],
    mealPeriods: ['lunch', 'dinner'],
    popularity: 0.65,
  },
  {
    id: 'godavari:gongura-paneer',
    restaurantId: 'godavari',
    name: 'Gongura Paneer',
    description:
      'Paneer simmered in tangy sorrel-leaf gravy — the Andhra signature, vegetarian edition.',
    glyph: 'curry',
    basePriceCents: 1595,
    tags: ['south indian', 'curry', 'paneer', 'gongura', 'tangy'],
    dietary: ['vegetarian', 'gluten-free'],
    mealPeriods: ['lunch', 'dinner'],
    popularity: 0.48,
  },
  {
    id: 'godavari:chilli-gobi',
    restaurantId: 'godavari',
    name: 'Chilli Gobi',
    description:
      'Cauliflower florets fried crisp and tossed with peppers, soy and green chilli.',
    glyph: 'wings',
    basePriceCents: 1195,
    tags: ['south indian', 'indo-chinese', 'cauliflower', 'spicy', 'crispy'],
    dietary: ['vegetarian', 'vegan'],
    mealPeriods: ['snack', 'dinner'],
    popularity: 0.55,
  },
  {
    id: 'godavari:curd-rice',
    restaurantId: 'godavari',
    name: 'Curd Rice',
    description:
      'Cooling yogurt rice tempered with mustard seed, ginger and curry leaf; pomegranate on top.',
    glyph: 'bowl',
    basePriceCents: 995,
    tags: ['south indian', 'rice', 'yogurt', 'cooling', 'comfort'],
    dietary: ['vegetarian', 'gluten-free'],
    mealPeriods: ['lunch', 'latenight'],
    popularity: 0.3,
  },
  {
    id: 'godavari:madras-filter-coffee',
    restaurantId: 'godavari',
    name: 'Madras Filter Coffee',
    description:
      'Strong decoction pulled with hot milk between tumbler and davara until it foams.',
    glyph: 'coffee',
    basePriceCents: 449,
    tags: ['south indian', 'coffee', 'drink', 'filter'],
    dietary: ['vegetarian', 'gluten-free'],
    mealPeriods: ['breakfast', 'snack'],
    popularity: 0.66,
  },
  {
    id: 'godavari:rose-milk',
    restaurantId: 'godavari',
    name: 'Rose Milk',
    description: 'Chilled milk with rose syrup and a spoon of soaked sabja seeds.',
    glyph: 'boba',
    basePriceCents: 499,
    tags: ['south indian', 'drink', 'rose', 'sweet'],
    dietary: ['vegetarian', 'gluten-free'],
    mealPeriods: ['snack', 'dinner'],
    popularity: 0.35,
  },
];
