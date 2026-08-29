import type { MealPeriod } from '../../../lib/time';
import type { Dietary, GlyphKey } from '../types';

export interface MenuItemSeed {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  glyph: GlyphKey;
  basePriceCents: number;
  tags: string[];
  dietary: Dietary[];
  mealPeriods: MealPeriod[];
  popularity: number;
}

export const MENU_SEED: MenuItemSeed[] = [
  {
    id: "goldhour:golden-buttermilk-stack",
    restaurantId: "goldhour",
    name: "Golden Buttermilk Stack",
    description: "Three griddled buttermilk pancakes with whipped maple butter, warm syrup, and a dusting of powdered sugar.",
    glyph: "pancakes",
    basePriceCents: 1350,
    tags: [
      "brunch",
      "pancakes",
      "maple",
      "griddle",
      "sweet"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "breakfast",
      "lunch"
    ],
    popularity: 0.92
  },
  {
    id: "goldhour:classic-eggs-benedict",
    restaurantId: "goldhour",
    name: "Classic Eggs Benedict",
    description: "Poached eggs and shaved ham on a toasted English muffin, draped in lemony hollandaise with crispy potatoes.",
    glyph: "egg",
    basePriceCents: 1595,
    tags: [
      "brunch",
      "eggs",
      "benedict",
      "hollandaise",
      "ham"
    ],
    dietary: [],
    mealPeriods: [
      "breakfast",
      "lunch"
    ],
    popularity: 0.88
  },
  {
    id: "goldhour:smoked-salmon-benedict",
    restaurantId: "goldhour",
    name: "Smoked Salmon Benedict",
    description: "Cold-smoked salmon, poached eggs, and dill hollandaise over a potato rosti with pickled shallots and capers.",
    glyph: "fish",
    basePriceCents: 1895,
    tags: [
      "brunch",
      "salmon",
      "benedict",
      "eggs",
      "seafood"
    ],
    dietary: [
      "gluten-free"
    ],
    mealPeriods: [
      "breakfast",
      "lunch"
    ],
    popularity: 0.74
  },
  {
    id: "goldhour:sunrise-avocado-toast",
    restaurantId: "goldhour",
    name: "Sunrise Avocado Toast",
    description: "Smashed avocado on grilled sourdough with two soft-fried eggs, chili crunch, radish, and flaky sea salt.",
    glyph: "toast",
    basePriceCents: 1275,
    tags: [
      "brunch",
      "avocado",
      "toast",
      "eggs",
      "spicy"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "breakfast",
      "lunch"
    ],
    popularity: 0.85
  },
  {
    id: "goldhour:brioche-french-toast",
    restaurantId: "goldhour",
    name: "Brioche French Toast",
    description: "Thick-cut brioche soaked in vanilla custard, griddled and topped with macerated berries and creme fraiche.",
    glyph: "toast",
    basePriceCents: 1450,
    tags: [
      "brunch",
      "french toast",
      "brioche",
      "berries",
      "sweet"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "breakfast",
      "lunch"
    ],
    popularity: 0.68
  },
  {
    id: "goldhour:chorizo-breakfast-burrito",
    restaurantId: "goldhour",
    name: "Chorizo Breakfast Burrito",
    description: "Scrambled eggs, crumbled chorizo, crispy potatoes, jack cheese, and salsa roja in a flour tortilla.",
    glyph: "burrito",
    basePriceCents: 1395,
    tags: [
      "brunch",
      "burrito",
      "chorizo",
      "eggs",
      "spicy"
    ],
    dietary: [],
    mealPeriods: [
      "breakfast",
      "lunch"
    ],
    popularity: 0.71
  },
  {
    id: "goldhour:fried-chicken-and-waffle-sandwich",
    restaurantId: "goldhour",
    name: "Fried Chicken & Waffle Sandwich",
    description: "Buttermilk fried chicken thigh between waffle halves with hot honey, pickles, and slaw.",
    glyph: "sandwich",
    basePriceCents: 1650,
    tags: [
      "brunch",
      "chicken",
      "waffle",
      "sandwich",
      "comfort"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "breakfast"
    ],
    popularity: 0.82
  },
  {
    id: "goldhour:garden-grain-bowl",
    restaurantId: "goldhour",
    name: "Garden Grain Bowl",
    description: "Warm farro with roasted squash, kale, marinated chickpeas, a jammy egg, and green tahini dressing.",
    glyph: "bowl",
    basePriceCents: 1350,
    tags: [
      "brunch",
      "grain bowl",
      "kale",
      "tahini",
      "healthy"
    ],
    dietary: [
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch"
    ],
    popularity: 0.46
  },
  {
    id: "goldhour:heirloom-tomato-soup-and-grilled-cheese",
    restaurantId: "goldhour",
    name: "Heirloom Tomato Soup & Grilled Cheese",
    description: "Slow-roasted heirloom tomato soup with basil oil, served with a sharp cheddar grilled cheese on sourdough.",
    glyph: "soup",
    basePriceCents: 1195,
    tags: [
      "brunch",
      "soup",
      "grilled cheese",
      "tomato",
      "comfort"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "lunch"
    ],
    popularity: 0.52
  },
  {
    id: "goldhour:crispy-breakfast-potatoes",
    restaurantId: "goldhour",
    name: "Crispy Breakfast Potatoes",
    description: "Twice-cooked potatoes tossed with rosemary salt and served with smoked paprika aioli.",
    glyph: "fries",
    basePriceCents: 595,
    tags: [
      "brunch",
      "potatoes",
      "side",
      "rosemary",
      "crispy"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "breakfast",
      "lunch",
      "snack"
    ],
    popularity: 0.58
  },
  {
    id: "goldhour:fresh-pressed-orange-juice",
    restaurantId: "goldhour",
    name: "Fresh-Pressed Orange Juice",
    description: "Valencia oranges pressed to order over ice, nothing added.",
    glyph: "boba",
    basePriceCents: 550,
    tags: [
      "brunch",
      "juice",
      "orange",
      "fresh",
      "drink"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "breakfast",
      "lunch",
      "snack"
    ],
    popularity: 0.63
  },
  {
    id: "goldhour:lemon-ricotta-hotcakes",
    restaurantId: "goldhour",
    name: "Lemon Ricotta Hotcakes",
    description: "Light ricotta hotcakes with lemon curd, toasted almonds, and a spoonful of blueberry compote.",
    glyph: "pancakes",
    basePriceCents: 1495,
    tags: [
      "brunch",
      "pancakes",
      "lemon",
      "ricotta",
      "blueberry"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "breakfast",
      "lunch"
    ],
    popularity: 0.31
  },
  {
    id: "driftwood-roasters:house-latte",
    restaurantId: "driftwood-roasters",
    name: "House Latte",
    description: "Double shot of our Driftwood espresso blend with silky steamed milk; oat or almond on request.",
    glyph: "coffee",
    basePriceCents: 525,
    tags: [
      "coffee",
      "latte",
      "espresso",
      "drink"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "breakfast",
      "snack"
    ],
    popularity: 0.93
  },
  {
    id: "driftwood-roasters:single-origin-pour-over",
    restaurantId: "driftwood-roasters",
    name: "Single-Origin Pour Over",
    description: "Rotating single-origin lot brewed to order on the V60; ask the bar for this week's Ethiopian or Colombian.",
    glyph: "coffee",
    basePriceCents: 650,
    tags: [
      "coffee",
      "pour over",
      "single origin",
      "drink"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "breakfast",
      "snack"
    ],
    popularity: 0.61
  },
  {
    id: "driftwood-roasters:cold-brew-tonic",
    restaurantId: "driftwood-roasters",
    name: "Cold Brew Tonic",
    description: "Slow-steeped cold brew over tonic water and ice with a strip of orange peel.",
    glyph: "boba",
    basePriceCents: 595,
    tags: [
      "coffee",
      "cold brew",
      "tonic",
      "citrus",
      "drink"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "snack",
      "lunch"
    ],
    popularity: 0.33
  },
  {
    id: "driftwood-roasters:butter-croissant",
    restaurantId: "driftwood-roasters",
    name: "Butter Croissant",
    description: "Twice-laminated with cultured French butter for a shattering crust and open, honeycombed crumb.",
    glyph: "croissant",
    basePriceCents: 475,
    tags: [
      "bakery",
      "croissant",
      "butter",
      "pastry",
      "coffee"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "breakfast",
      "snack"
    ],
    popularity: 0.89
  },
  {
    id: "driftwood-roasters:almond-croissant",
    restaurantId: "driftwood-roasters",
    name: "Almond Croissant",
    description: "Day-baked croissant filled with frangipane, topped with sliced almonds and powdered sugar.",
    glyph: "croissant",
    basePriceCents: 575,
    tags: [
      "bakery",
      "croissant",
      "almond",
      "frangipane",
      "pastry"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "breakfast",
      "snack"
    ],
    popularity: 0.76
  },
  {
    id: "driftwood-roasters:ham-and-gruyere-croissant",
    restaurantId: "driftwood-roasters",
    name: "Ham & Gruyere Croissant",
    description: "Laminated croissant baked with smoked ham, gruyere, and a swipe of dijon bechamel.",
    glyph: "croissant",
    basePriceCents: 725,
    tags: [
      "bakery",
      "croissant",
      "ham",
      "gruyere",
      "savory"
    ],
    dietary: [],
    mealPeriods: [
      "breakfast",
      "lunch"
    ],
    popularity: 0.67
  },
  {
    id: "driftwood-roasters:ricotta-and-honey-toast",
    restaurantId: "driftwood-roasters",
    name: "Ricotta & Honey Toast",
    description: "Thick country loaf with whipped ricotta, wildflower honey, cracked pepper, and thyme.",
    glyph: "toast",
    basePriceCents: 850,
    tags: [
      "toast",
      "ricotta",
      "honey",
      "bakery",
      "coffee"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "breakfast",
      "snack"
    ],
    popularity: 0.54
  },
  {
    id: "driftwood-roasters:smoked-trout-tartine",
    restaurantId: "driftwood-roasters",
    name: "Smoked Trout Tartine",
    description: "Open-faced rye tartine with smoked trout, herbed creme fraiche, cucumber, and pickled mustard seeds.",
    glyph: "fish",
    basePriceCents: 1395,
    tags: [
      "toast",
      "trout",
      "rye",
      "seafood",
      "coffee"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "breakfast"
    ],
    popularity: 0.29
  },
  {
    id: "driftwood-roasters:brown-butter-chocolate-chip-cookie",
    restaurantId: "driftwood-roasters",
    name: "Brown Butter Chocolate Chip Cookie",
    description: "Bittersweet chocolate and brown butter dough finished with flaky salt, baked in small batches all day.",
    glyph: "cookie",
    basePriceCents: 425,
    tags: [
      "bakery",
      "cookie",
      "chocolate",
      "sweet",
      "coffee"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "snack"
    ],
    popularity: 0.84
  },
  {
    id: "driftwood-roasters:cardamom-morning-bun",
    restaurantId: "driftwood-roasters",
    name: "Cardamom Morning Bun",
    description: "Croissant dough rolled with cardamom sugar, baked until caramelized at the edges.",
    glyph: "donut",
    basePriceCents: 545,
    tags: [
      "bakery",
      "bun",
      "cardamom",
      "pastry",
      "sweet"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "breakfast",
      "snack"
    ],
    popularity: 0.48
  },
  {
    id: "driftwood-roasters:seasonal-fruit-danish",
    restaurantId: "driftwood-roasters",
    name: "Seasonal Fruit Danish",
    description: "Laminated danish with vanilla pastry cream and roasted seasonal fruit; ask what's on the tray today.",
    glyph: "pie",
    basePriceCents: 595,
    tags: [
      "bakery",
      "danish",
      "fruit",
      "pastry",
      "sweet"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "breakfast",
      "snack"
    ],
    popularity: 0.27
  },
  {
    id: "patty-theory:the-proof",
    restaurantId: "patty-theory",
    name: "The Proof",
    description: "Double smashed beef, American cheese, griddled onions, pickles, Theory sauce on a toasted potato bun.",
    glyph: "burger",
    basePriceCents: 1295,
    tags: [
      "burger",
      "beef",
      "cheese",
      "smash",
      "comfort"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner",
      "latenight"
    ],
    popularity: 0.93
  },
  {
    id: "patty-theory:single-hypothesis",
    restaurantId: "patty-theory",
    name: "Single Hypothesis",
    description: "One crisp-edged smash patty, American cheese, shredded lettuce and Theory sauce on a soft bun.",
    glyph: "burger",
    basePriceCents: 895,
    tags: [
      "burger",
      "beef",
      "classic",
      "cheese"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.72
  },
  {
    id: "patty-theory:hot-take",
    restaurantId: "patty-theory",
    name: "Hot Take",
    description: "Double smash patties, pepper jack, charred jalapenos, chipotle mayo and pickled red onion.",
    glyph: "burger",
    basePriceCents: 1395,
    tags: [
      "burger",
      "spicy",
      "beef",
      "jalapeno"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner",
      "latenight"
    ],
    popularity: 0.68
  },
  {
    id: "patty-theory:field-study",
    restaurantId: "patty-theory",
    name: "Field Study",
    description: "Crispy fried portobello, smoked gouda, arugula and garlic aioli on a potato bun.",
    glyph: "burger",
    basePriceCents: 1195,
    tags: [
      "burger",
      "mushroom",
      "vegetarian",
      "fried"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.41
  },
  {
    id: "patty-theory:triple-axiom",
    restaurantId: "patty-theory",
    name: "Triple Axiom",
    description: "Three smash patties, triple American cheese, bacon jam, griddled onions and pickles. Bring napkins.",
    glyph: "burger",
    basePriceCents: 1595,
    tags: [
      "burger",
      "beef",
      "bacon",
      "stack",
      "indulgent"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.85
  },
  {
    id: "patty-theory:crinkle-fries",
    restaurantId: "patty-theory",
    name: "Crinkle Fries",
    description: "Deep-ridged crinkle cuts fried twice in beef tallow, dusted with fine sea salt.",
    glyph: "fries",
    basePriceCents: 475,
    tags: [
      "fries",
      "potato",
      "side",
      "crispy"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner",
      "latenight"
    ],
    popularity: 0.89
  },
  {
    id: "patty-theory:theory-loaded-fries",
    restaurantId: "patty-theory",
    name: "Theory Loaded Fries",
    description: "Crinkle fries under queso, chopped smash patty, pickled jalapenos and scallions.",
    glyph: "fries",
    basePriceCents: 975,
    tags: [
      "fries",
      "cheese",
      "beef",
      "loaded",
      "snack"
    ],
    dietary: [],
    mealPeriods: [
      "snack",
      "dinner",
      "latenight"
    ],
    popularity: 0.63
  },
  {
    id: "patty-theory:vanilla-bean-thick-shake",
    restaurantId: "patty-theory",
    name: "Vanilla Bean Thick Shake",
    description: "Madagascar vanilla custard spun thick enough to flip the cup, whipped cream on top.",
    glyph: "icecream",
    basePriceCents: 695,
    tags: [
      "shake",
      "vanilla",
      "dessert",
      "sweet"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner",
      "snack"
    ],
    popularity: 0.58
  },
  {
    id: "patty-theory:malted-chocolate-shake",
    restaurantId: "patty-theory",
    name: "Malted Chocolate Shake",
    description: "Dark chocolate custard with malt powder and a fudge-painted cup, finished with shaved chocolate.",
    glyph: "icecream",
    basePriceCents: 745,
    tags: [
      "shake",
      "chocolate",
      "malt",
      "dessert"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "snack",
      "dinner",
      "latenight"
    ],
    popularity: 0.52
  },
  {
    id: "patty-theory:crispy-chicken-corollary",
    restaurantId: "patty-theory",
    name: "Crispy Chicken Corollary",
    description: "Buttermilk-brined thigh fried crunchy, hot honey, dill pickles and slaw on a potato bun.",
    glyph: "sandwich",
    basePriceCents: 1250,
    tags: [
      "chicken",
      "sandwich",
      "fried",
      "hot honey"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.47
  },
  {
    id: "patty-theory:house-root-beer",
    restaurantId: "patty-theory",
    name: "House Root Beer",
    description: "Small-batch root beer with sarsaparilla and vanilla, poured over pebble ice.",
    glyph: "boba",
    basePriceCents: 395,
    tags: [
      "drink",
      "soda",
      "root beer",
      "classic"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner",
      "latenight"
    ],
    popularity: 0.28
  },
  {
    id: "wildflour-pizza:margherita-di-fuoco",
    restaurantId: "wildflour-pizza",
    name: "Margherita Di Fuoco",
    description: "48-hour sourdough crust, crushed San Marzanos, fior di latte, basil and Sicilian olive oil.",
    glyph: "pizza",
    basePriceCents: 1650,
    tags: [
      "pizza",
      "margherita",
      "tomato",
      "mozzarella",
      "wood-fired"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.91
  },
  {
    id: "wildflour-pizza:hot-soppressata",
    restaurantId: "wildflour-pizza",
    name: "Hot Soppressata",
    description: "Spicy soppressata cups, mozzarella, chili oil and a drizzle of local honey over blistered crust.",
    glyph: "pizza",
    basePriceCents: 1895,
    tags: [
      "pizza",
      "spicy",
      "pork",
      "honey",
      "soppressata"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.88
  },
  {
    id: "wildflour-pizza:forager",
    restaurantId: "wildflour-pizza",
    name: "Forager",
    description: "Roasted maitake and cremini, fontina, thyme and garlic cream on a charred sourdough base.",
    glyph: "pizza",
    basePriceCents: 1795,
    tags: [
      "pizza",
      "mushroom",
      "fontina",
      "earthy"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "dinner",
      "lunch"
    ],
    popularity: 0.56
  },
  {
    id: "wildflour-pizza:late-summer-corn-pie",
    restaurantId: "wildflour-pizza",
    name: "Late Summer Corn Pie",
    description: "Sweet corn, calabrian chili butter, ricotta, scallions and pecorino, off the wood fire.",
    glyph: "pizza",
    basePriceCents: 1750,
    tags: [
      "pizza",
      "corn",
      "seasonal",
      "ricotta",
      "spicy"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.44
  },
  {
    id: "wildflour-pizza:fennel-sausage-and-rapini",
    restaurantId: "wildflour-pizza",
    name: "Fennel Sausage & Rapini",
    description: "House fennel sausage, garlicky rapini, provolone and chili flake on naturally leavened crust.",
    glyph: "pizza",
    basePriceCents: 1950,
    tags: [
      "pizza",
      "sausage",
      "pork",
      "greens"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "lunch"
    ],
    popularity: 0.61
  },
  {
    id: "wildflour-pizza:white-anchovy-bianca",
    restaurantId: "wildflour-pizza",
    name: "White Anchovy Bianca",
    description: "Cantabrian anchovies, smoked mozzarella, lemon zest, capers and parsley, no red sauce.",
    glyph: "pizza",
    basePriceCents: 2350,
    tags: [
      "pizza",
      "anchovy",
      "seafood",
      "bianca",
      "premium"
    ],
    dietary: [],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.31
  },
  {
    id: "wildflour-pizza:wood-fired-meatballs",
    restaurantId: "wildflour-pizza",
    name: "Wood-Fired Meatballs",
    description: "Beef and pork meatballs baked in tomato sugo with pecorino, served with charred sourdough.",
    glyph: "bowl",
    basePriceCents: 1150,
    tags: [
      "starter",
      "meatballs",
      "beef",
      "tomato",
      "italian"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "lunch"
    ],
    popularity: 0.66
  },
  {
    id: "wildflour-pizza:charred-sourdough-and-whipped-ricotta",
    restaurantId: "wildflour-pizza",
    name: "Charred Sourdough & Whipped Ricotta",
    description: "Blistered 48-hour dough with whipped ricotta, wildflower honey and cracked pepper.",
    glyph: "toast",
    basePriceCents: 875,
    tags: [
      "starter",
      "bread",
      "ricotta",
      "honey",
      "snack"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "lunch",
      "dinner",
      "snack"
    ],
    popularity: 0.83
  },
  {
    id: "wildflour-pizza:little-gem-caesar",
    restaurantId: "wildflour-pizza",
    name: "Little Gem Caesar",
    description: "Little gem lettuce, anchovy dressing, sourdough crumbs and shaved parmigiano.",
    glyph: "salad",
    basePriceCents: 1050,
    tags: [
      "salad",
      "caesar",
      "anchovy",
      "fresh"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.49
  },
  {
    id: "wildflour-pizza:marinated-castelvetrano-olives",
    restaurantId: "wildflour-pizza",
    name: "Marinated Castelvetrano Olives",
    description: "Warm Castelvetrano olives with orange peel, fennel seed and rosemary from the oven's edge.",
    glyph: "bowl",
    basePriceCents: 650,
    tags: [
      "starter",
      "olives",
      "snack",
      "italian"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "snack",
      "dinner"
    ],
    popularity: 0.24
  },
  {
    id: "wildflour-pizza:basil-lime-soda",
    restaurantId: "wildflour-pizza",
    name: "Basil Lime Soda",
    description: "House soda of muddled basil, fresh lime and cane sugar over crushed ice.",
    glyph: "boba",
    basePriceCents: 450,
    tags: [
      "drink",
      "soda",
      "basil",
      "citrus"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.19
  },
  {
    id: "kaiyo-sushi:chef-s-nigiri-omakase-nine",
    restaurantId: "kaiyo-sushi",
    name: "Chef's Nigiri Omakase Nine",
    description: "Nine pieces cut to order: bluefin akami, kanpachi, hotate and the day's arrivals, each brushed with nikiri.",
    glyph: "sushi",
    basePriceCents: 3400,
    tags: [
      "sushi",
      "nigiri",
      "omakase",
      "japanese",
      "seafood"
    ],
    dietary: [],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.92
  },
  {
    id: "kaiyo-sushi:chirashi-kaiyo",
    restaurantId: "kaiyo-sushi",
    name: "Chirashi Kaiyo",
    description: "Twelve cuts of sashimi over warm akazu rice with ikura, tamago, shiso and pickled ginger.",
    glyph: "bowl",
    basePriceCents: 2895,
    tags: [
      "sushi",
      "chirashi",
      "rice",
      "japanese",
      "seafood"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.88
  },
  {
    id: "kaiyo-sushi:toro-takuan-handroll",
    restaurantId: "kaiyo-sushi",
    name: "Toro Takuan Handroll",
    description: "Chopped fatty bluefin with crunchy pickled daikon and scallion in crisp toasted nori.",
    glyph: "sushi",
    basePriceCents: 1650,
    tags: [
      "sushi",
      "handroll",
      "tuna",
      "japanese"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner",
      "latenight"
    ],
    popularity: 0.84
  },
  {
    id: "kaiyo-sushi:salmon-belly-nigiri-pair",
    restaurantId: "kaiyo-sushi",
    name: "Salmon Belly Nigiri Pair",
    description: "Two pieces of torched Ora King salmon belly over seasoned rice with yuzu zest and sea salt.",
    glyph: "sushi",
    basePriceCents: 1250,
    tags: [
      "sushi",
      "nigiri",
      "salmon",
      "japanese"
    ],
    dietary: [
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.76
  },
  {
    id: "kaiyo-sushi:hamachi-crudo",
    restaurantId: "kaiyo-sushi",
    name: "Hamachi Crudo",
    description: "Thin-sliced yellowtail with yuzu ponzu, serrano rounds, radish and a drop of smoked shoyu.",
    glyph: "fish",
    basePriceCents: 1895,
    tags: [
      "japanese",
      "yellowtail",
      "crudo",
      "citrus",
      "seafood"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.68
  },
  {
    id: "kaiyo-sushi:kaiyo-bento",
    restaurantId: "kaiyo-sushi",
    name: "Kaiyo Bento",
    description: "Lunch box of six nigiri, a tuna handroll, sesame spinach ohitashi and miso soup.",
    glyph: "bowl",
    basePriceCents: 2450,
    tags: [
      "sushi",
      "bento",
      "lunch",
      "japanese",
      "seafood"
    ],
    dietary: [],
    mealPeriods: [
      "lunch"
    ],
    popularity: 0.81
  },
  {
    id: "kaiyo-sushi:unagi-nigiri-pair",
    restaurantId: "kaiyo-sushi",
    name: "Unagi Nigiri Pair",
    description: "Freshwater eel glazed with house tare over warm rice, finished with sansho pepper.",
    glyph: "sushi",
    basePriceCents: 1495,
    tags: [
      "sushi",
      "nigiri",
      "eel",
      "japanese",
      "sweet"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.55
  },
  {
    id: "kaiyo-sushi:kappa-avocado-roll",
    restaurantId: "kaiyo-sushi",
    name: "Kappa Avocado Roll",
    description: "Cucumber and avocado rolled in nori with sesame and a touch of umeboshi paste.",
    glyph: "sushi",
    basePriceCents: 1200,
    tags: [
      "sushi",
      "roll",
      "vegetarian",
      "avocado",
      "japanese"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.42
  },
  {
    id: "kaiyo-sushi:miso-soup-with-wakame",
    restaurantId: "kaiyo-sushi",
    name: "Miso Soup With Wakame",
    description: "Awase miso in dashi with wakame, silken tofu and scallion, served steaming.",
    glyph: "soup",
    basePriceCents: 475,
    tags: [
      "japanese",
      "soup",
      "miso",
      "tofu"
    ],
    dietary: [
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner",
      "snack"
    ],
    popularity: 0.6
  },
  {
    id: "kaiyo-sushi:sencha-cold-brew",
    restaurantId: "kaiyo-sushi",
    name: "Sencha Cold Brew",
    description: "Uji sencha steeped cold for twelve hours; grassy, faintly sweet, served over one large cube.",
    glyph: "boba",
    basePriceCents: 550,
    tags: [
      "japanese",
      "tea",
      "drink",
      "cold"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner",
      "snack"
    ],
    popularity: 0.33
  },
  {
    id: "kaiyo-sushi:ankimo-with-ponzu",
    restaurantId: "kaiyo-sushi",
    name: "Ankimo With Ponzu",
    description: "Steamed monkfish liver, chilled and sliced, with momiji oroshi, ponzu and chives.",
    glyph: "fish",
    basePriceCents: 1675,
    tags: [
      "japanese",
      "seafood",
      "appetizer",
      "umami"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.24
  },
  {
    id: "kaiyo-sushi:kurogoma-ice-cream",
    restaurantId: "kaiyo-sushi",
    name: "Kurogoma Ice Cream",
    description: "Black sesame ice cream churned in-house, dusted with kinako and a pinch of salt.",
    glyph: "icecream",
    basePriceCents: 875,
    tags: [
      "japanese",
      "dessert",
      "sesame",
      "icecream"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "dinner",
      "snack"
    ],
    popularity: 0.3
  },
  {
    id: "baan-soi:pad-kaprao-moo",
    restaurantId: "baan-soi",
    name: "Pad Kaprao Moo",
    description: "Wok-charred minced pork with holy basil, bird's eye chili and garlic over rice, topped with a crispy fried egg.",
    glyph: "bowl",
    basePriceCents: 1450,
    tags: [
      "thai",
      "pork",
      "spicy",
      "basil",
      "rice"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner",
      "latenight"
    ],
    popularity: 0.93
  },
  {
    id: "baan-soi:khao-soi-gai",
    restaurantId: "baan-soi",
    name: "Khao Soi Gai",
    description: "Chiang Mai coconut curry noodles with braised chicken leg, crispy noodle nest, pickled mustard greens and lime.",
    glyph: "ramen",
    basePriceCents: 1595,
    tags: [
      "thai",
      "curry",
      "noodles",
      "chicken",
      "coconut"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.87
  },
  {
    id: "baan-soi:pad-thai-goong",
    restaurantId: "baan-soi",
    name: "Pad Thai Goong",
    description: "Rice noodles tossed with river prawns, tamarind, egg, tofu and chives; roasted peanuts on the side.",
    glyph: "noodles",
    basePriceCents: 1550,
    tags: [
      "thai",
      "noodles",
      "shrimp",
      "tamarind",
      "peanut"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.82
  },
  {
    id: "baan-soi:som-tum-thai",
    restaurantId: "baan-soi",
    name: "Som Tum Thai",
    description: "Green papaya pounded with lime, palm sugar, fish sauce, long beans, tomato and dried shrimp.",
    glyph: "salad",
    basePriceCents: 1150,
    tags: [
      "thai",
      "salad",
      "papaya",
      "spicy",
      "fresh"
    ],
    dietary: [
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner",
      "snack"
    ],
    popularity: 0.66
  },
  {
    id: "baan-soi:gaeng-keow-wan-nuea",
    restaurantId: "baan-soi",
    name: "Gaeng Keow Wan Nuea",
    description: "Green curry of slow-braised beef cheek, Thai eggplant, bamboo shoots and sweet basil in coconut cream.",
    glyph: "curry",
    basePriceCents: 1875,
    tags: [
      "thai",
      "curry",
      "beef",
      "coconut",
      "spicy"
    ],
    dietary: [
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.74
  },
  {
    id: "baan-soi:pad-see-ew-moo",
    restaurantId: "baan-soi",
    name: "Pad See Ew Moo",
    description: "Wide rice noodles seared in a hot wok with pork, egg, Chinese broccoli and sweet dark soy.",
    glyph: "noodles",
    basePriceCents: 1395,
    tags: [
      "thai",
      "noodles",
      "pork",
      "wok",
      "comfort"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner",
      "latenight"
    ],
    popularity: 0.58
  },
  {
    id: "baan-soi:tom-kha-hed",
    restaurantId: "baan-soi",
    name: "Tom Kha Hed",
    description: "Coconut galangal soup with oyster mushrooms, lemongrass, makrut lime leaf and cilantro.",
    glyph: "soup",
    basePriceCents: 1250,
    tags: [
      "thai",
      "soup",
      "coconut",
      "mushroom",
      "vegan"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.45
  },
  {
    id: "baan-soi:gai-yang-skewers",
    restaurantId: "baan-soi",
    name: "Gai Yang Skewers",
    description: "Lemongrass-marinated chicken thigh grilled over charcoal, served with jaew dipping sauce.",
    glyph: "skewer",
    basePriceCents: 1195,
    tags: [
      "thai",
      "chicken",
      "grilled",
      "skewer",
      "street food"
    ],
    dietary: [
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner",
      "snack"
    ],
    popularity: 0.52
  },
  {
    id: "baan-soi:khao-niew-sticky-rice",
    restaurantId: "baan-soi",
    name: "Khao Niew Sticky Rice",
    description: "Steamed Thai glutinous rice in a woven basket, the proper partner for som tum and gai yang.",
    glyph: "bowl",
    basePriceCents: 425,
    tags: [
      "thai",
      "rice",
      "side",
      "sticky rice"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.4
  },
  {
    id: "baan-soi:thai-iced-tea",
    restaurantId: "baan-soi",
    name: "Thai Iced Tea",
    description: "Strong-brewed Ceylon tea over ice with sweetened condensed milk, stirred to order.",
    glyph: "boba",
    basePriceCents: 495,
    tags: [
      "thai",
      "drink",
      "tea",
      "sweet"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "lunch",
      "snack",
      "dinner"
    ],
    popularity: 0.63
  },
  {
    id: "baan-soi:khao-niew-mamuang",
    restaurantId: "baan-soi",
    name: "Khao Niew Mamuang",
    description: "Ripe mango with warm coconut sticky rice, salted coconut cream and toasted mung beans.",
    glyph: "cake",
    basePriceCents: 950,
    tags: [
      "thai",
      "dessert",
      "mango",
      "coconut",
      "sweet"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "dinner",
      "snack"
    ],
    popularity: 0.31
  },
  {
    id: "masala-hour:butter-chicken",
    restaurantId: "masala-hour",
    name: "Butter Chicken",
    description: "Tandoor-charred chicken simmered in tomato-cashew gravy with kasuri methi and a swirl of cream.",
    glyph: "curry",
    basePriceCents: 1595,
    tags: [
      "indian",
      "chicken",
      "curry",
      "creamy",
      "comfort"
    ],
    dietary: [
      "gluten-free",
      "halal"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.93
  },
  {
    id: "masala-hour:lamb-rogan-josh",
    restaurantId: "masala-hour",
    name: "Lamb Rogan Josh",
    description: "Slow-braised lamb shoulder in Kashmiri chile gravy with black cardamom, fennel and whole cloves.",
    glyph: "curry",
    basePriceCents: 1895,
    tags: [
      "indian",
      "lamb",
      "curry",
      "spicy",
      "kashmiri"
    ],
    dietary: [
      "gluten-free",
      "halal",
      "dairy-free"
    ],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.68
  },
  {
    id: "masala-hour:grand-thali",
    restaurantId: "masala-hour",
    name: "Grand Thali",
    description: "Two curries of the day, dal tadka, basmati rice, raita, two rotis, papad, pickle and gulab jamun.",
    glyph: "bowl",
    basePriceCents: 2095,
    tags: [
      "indian",
      "thali",
      "curry",
      "combo",
      "dal"
    ],
    dietary: [
      "halal"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.86
  },
  {
    id: "masala-hour:chana-masala",
    restaurantId: "masala-hour",
    name: "Chana Masala",
    description: "Chickpeas cooked down with ginger, amchur and toasted cumin, finished with cilantro and lime.",
    glyph: "curry",
    basePriceCents: 1250,
    tags: [
      "indian",
      "chickpea",
      "curry",
      "vegan",
      "tangy"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.62
  },
  {
    id: "masala-hour:palak-paneer",
    restaurantId: "masala-hour",
    name: "Palak Paneer",
    description: "House-made paneer folded into slow-cooked spinach with garlic tadka and a touch of cream.",
    glyph: "curry",
    basePriceCents: 1395,
    tags: [
      "indian",
      "paneer",
      "spinach",
      "curry",
      "vegetarian"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.74
  },
  {
    id: "masala-hour:tandoori-chicken-half",
    restaurantId: "masala-hour",
    name: "Tandoori Chicken Half",
    description: "Yogurt-and-spice marinated half bird roasted in the clay oven, served with mint chutney and onions.",
    glyph: "drumstick",
    basePriceCents: 1475,
    tags: [
      "indian",
      "chicken",
      "tandoor",
      "smoky",
      "grilled"
    ],
    dietary: [
      "gluten-free",
      "halal"
    ],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.57
  },
  {
    id: "masala-hour:garlic-naan",
    restaurantId: "masala-hour",
    name: "Garlic Naan",
    description: "Hand-slapped naan blistered in the tandoor, brushed with garlic butter and chopped cilantro.",
    glyph: "toast",
    basePriceCents: 425,
    tags: [
      "indian",
      "bread",
      "tandoor",
      "garlic",
      "side"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.88
  },
  {
    id: "masala-hour:samosa-chaat",
    restaurantId: "masala-hour",
    name: "Samosa Chaat",
    description: "Two crushed potato samosas under chana, yogurt, tamarind and mint chutneys with sev and pomegranate.",
    glyph: "dumpling",
    basePriceCents: 895,
    tags: [
      "indian",
      "chaat",
      "snack",
      "potato",
      "tangy"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "snack",
      "lunch"
    ],
    popularity: 0.49
  },
  {
    id: "masala-hour:dal-makhani",
    restaurantId: "masala-hour",
    name: "Dal Makhani",
    description: "Black lentils simmered overnight with tomato, ginger and butter until silky, finished with cream.",
    glyph: "soup",
    basePriceCents: 1195,
    tags: [
      "indian",
      "lentils",
      "curry",
      "comfort",
      "creamy"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.33
  },
  {
    id: "masala-hour:mango-lassi",
    restaurantId: "masala-hour",
    name: "Mango Lassi",
    description: "Alphonso mango pulp blended with house yogurt and a pinch of cardamom, served chilled.",
    glyph: "boba",
    basePriceCents: 495,
    tags: [
      "indian",
      "mango",
      "yogurt",
      "drink",
      "sweet"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner",
      "snack"
    ],
    popularity: 0.71
  },
  {
    id: "masala-hour:kheer",
    restaurantId: "masala-hour",
    name: "Kheer",
    description: "Basmati rice pudding slow-thickened in milk with saffron, cardamom and toasted pistachios.",
    glyph: "icecream",
    basePriceCents: 550,
    tags: [
      "indian",
      "dessert",
      "rice",
      "saffron",
      "sweet"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.27
  },
  {
    id: "la-milpa:tacos-al-pastor",
    restaurantId: "la-milpa",
    name: "Tacos Al Pastor",
    description: "Trompo-shaved pork with charred pineapple, onion and cilantro on blue-corn tortillas, three per order.",
    glyph: "taco",
    basePriceCents: 1195,
    tags: [
      "mexican",
      "pork",
      "tacos",
      "al pastor",
      "pineapple"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner",
      "latenight"
    ],
    popularity: 0.94
  },
  {
    id: "la-milpa:carnitas-tacos",
    restaurantId: "la-milpa",
    name: "Carnitas Tacos",
    description: "Michoacan-style pork confit crisped on the plancha, with salsa verde cruda and pickled red onion.",
    glyph: "taco",
    basePriceCents: 1150,
    tags: [
      "mexican",
      "pork",
      "tacos",
      "carnitas",
      "crispy"
    ],
    dietary: [
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.72
  },
  {
    id: "la-milpa:hongos-y-rajas-tacos",
    restaurantId: "la-milpa",
    name: "Hongos Y Rajas Tacos",
    description: "Seared oyster mushrooms and roasted poblano strips with epazote on heirloom-corn tortillas.",
    glyph: "taco",
    basePriceCents: 1050,
    tags: [
      "mexican",
      "mushroom",
      "tacos",
      "vegan",
      "poblano"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.41
  },
  {
    id: "la-milpa:quesadilla-de-flor",
    restaurantId: "la-milpa",
    name: "Quesadilla De Flor",
    description: "Squash blossoms and Oaxaca cheese folded into a fresh masa tortilla, griddled until the edges crisp.",
    glyph: "wrap",
    basePriceCents: 950,
    tags: [
      "mexican",
      "cheese",
      "quesadilla",
      "squash blossom",
      "masa"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "lunch",
      "snack"
    ],
    popularity: 0.55
  },
  {
    id: "la-milpa:burrito-al-pastor",
    restaurantId: "la-milpa",
    name: "Burrito Al Pastor",
    description: "Flour tortilla packed with trompo pork, charro beans, rice, salsa roja and grilled pineapple.",
    glyph: "burrito",
    basePriceCents: 1350,
    tags: [
      "mexican",
      "pork",
      "burrito",
      "al pastor",
      "beans"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner",
      "latenight"
    ],
    popularity: 0.83
  },
  {
    id: "la-milpa:pozole-rojo",
    restaurantId: "la-milpa",
    name: "Pozole Rojo",
    description: "Guajillo pork broth with heirloom hominy, served with cabbage, radish, oregano and tostadas.",
    glyph: "soup",
    basePriceCents: 1395,
    tags: [
      "mexican",
      "pork",
      "soup",
      "hominy",
      "comfort"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.48
  },
  {
    id: "la-milpa:mole-negro-enchiladas",
    restaurantId: "la-milpa",
    name: "Mole Negro Enchiladas",
    description: "Chicken enchiladas draped in 28-ingredient Oaxacan mole negro with crema, queso fresco and sesame.",
    glyph: "curry",
    basePriceCents: 1495,
    tags: [
      "mexican",
      "chicken",
      "mole",
      "enchiladas",
      "oaxacan"
    ],
    dietary: [
      "gluten-free"
    ],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.66
  },
  {
    id: "la-milpa:elote-callejero",
    restaurantId: "la-milpa",
    name: "Elote Callejero",
    description: "Grilled corn on the cob rolled in mayo, cotija, chile-lime powder and a squeeze of key lime.",
    glyph: "skewer",
    basePriceCents: 550,
    tags: [
      "mexican",
      "corn",
      "street food",
      "snack",
      "cotija"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "snack",
      "latenight"
    ],
    popularity: 0.81
  },
  {
    id: "la-milpa:chips-y-salsa-trio",
    restaurantId: "la-milpa",
    name: "Chips Y Salsa Trio",
    description: "Fresh-fried tortilla chips with salsa verde, morita and charred habanero-pineapple salsas.",
    glyph: "fries",
    basePriceCents: 475,
    tags: [
      "mexican",
      "chips",
      "salsa",
      "snack",
      "spicy"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "snack",
      "latenight"
    ],
    popularity: 0.36
  },
  {
    id: "la-milpa:agua-de-jamaica",
    restaurantId: "la-milpa",
    name: "Agua De Jamaica",
    description: "Hibiscus flowers steeped and lightly sweetened with piloncillo, poured over ice with lime.",
    glyph: "boba",
    basePriceCents: 425,
    tags: [
      "mexican",
      "hibiscus",
      "drink",
      "agua fresca",
      "refreshing"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.59
  },
  {
    id: "la-milpa:horchata-de-coco",
    restaurantId: "la-milpa",
    name: "Horchata De Coco",
    description: "Rice and toasted coconut horchata with canela, blended in-house and served over crushed ice.",
    glyph: "boba",
    basePriceCents: 450,
    tags: [
      "mexican",
      "horchata",
      "coconut",
      "drink",
      "sweet"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "snack"
    ],
    popularity: 0.31
  },
  {
    id: "la-milpa:flan-de-cajeta",
    restaurantId: "la-milpa",
    name: "Flan De Cajeta",
    description: "Silky vanilla flan under goat-milk caramel, chilled overnight and topped with toasted pepitas.",
    glyph: "cake",
    basePriceCents: 625,
    tags: [
      "mexican",
      "dessert",
      "caramel",
      "custard",
      "sweet"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.24
  },
  {
    id: "olive-lark:charred-chicken-shawarma-bowl",
    restaurantId: "olive-lark",
    name: "Charred Chicken Shawarma Bowl",
    description: "Turmeric freekeh, fire-charred chicken thigh, pickled red onion, cucumber salad, garlic toum.",
    glyph: "bowl",
    basePriceCents: 1550,
    tags: [
      "mediterranean",
      "chicken",
      "grain bowl",
      "garlic",
      "charred"
    ],
    dietary: [
      "halal",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.92
  },
  {
    id: "olive-lark:lamb-kofta-skewers",
    restaurantId: "olive-lark",
    name: "Lamb Kofta Skewers",
    description: "Two grilled lamb skewers with smoked paprika, mint yogurt, warm pita and sumac onions.",
    glyph: "skewer",
    basePriceCents: 1795,
    tags: [
      "mediterranean",
      "lamb",
      "skewers",
      "grilled",
      "spiced"
    ],
    dietary: [
      "halal"
    ],
    mealPeriods: [
      "dinner",
      "lunch"
    ],
    popularity: 0.85
  },
  {
    id: "olive-lark:golden-falafel-mezze-plate",
    restaurantId: "olive-lark",
    name: "Golden Falafel Mezze Plate",
    description: "Six crisp herb falafel over lemon tahini, with pickled turnips, olives and grilled flatbread.",
    glyph: "salad",
    basePriceCents: 1395,
    tags: [
      "mediterranean",
      "falafel",
      "chickpea",
      "mezze",
      "herby"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.83
  },
  {
    id: "olive-lark:harissa-salmon-and-lemon-rice",
    restaurantId: "olive-lark",
    name: "Harissa Salmon & Lemon Rice",
    description: "Seared salmon glazed with harissa honey over dill lemon rice, charred broccolini, preserved lemon.",
    glyph: "fish",
    basePriceCents: 1850,
    tags: [
      "mediterranean",
      "salmon",
      "spicy",
      "rice",
      "premium"
    ],
    dietary: [
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.68
  },
  {
    id: "olive-lark:smoky-eggplant-baba-ghanoush",
    restaurantId: "olive-lark",
    name: "Smoky Eggplant Baba Ghanoush",
    description: "Flame-roasted eggplant whipped with tahini and lemon, pomegranate seeds, olive oil, pita chips.",
    glyph: "soup",
    basePriceCents: 1050,
    tags: [
      "mediterranean",
      "eggplant",
      "mezze",
      "smoky",
      "dip"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "snack",
      "dinner"
    ],
    popularity: 0.57
  },
  {
    id: "olive-lark:whipped-feta-and-hot-honey-toast",
    restaurantId: "olive-lark",
    name: "Whipped Feta & Hot Honey Toast",
    description: "Grilled sourdough with whipped feta, Aleppo hot honey, crushed pistachio and fresh oregano.",
    glyph: "toast",
    basePriceCents: 1150,
    tags: [
      "mediterranean",
      "feta",
      "toast",
      "sweet-savory",
      "pistachio"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "lunch",
      "snack"
    ],
    popularity: 0.61
  },
  {
    id: "olive-lark:chicken-souvlaki-pita-wrap",
    restaurantId: "olive-lark",
    name: "Chicken Souvlaki Pita Wrap",
    description: "Lemon-oregano chicken, tzatziki, tomato, shaved romaine and fries tucked in a griddled pita.",
    glyph: "wrap",
    basePriceCents: 1425,
    tags: [
      "mediterranean",
      "chicken",
      "wrap",
      "tzatziki",
      "greek"
    ],
    dietary: [
      "halal"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.88
  },
  {
    id: "olive-lark:za-atar-fries",
    restaurantId: "olive-lark",
    name: "Za'atar Fries",
    description: "Crispy fries dusted with za'atar and sea salt, served with garlic toum for dipping.",
    glyph: "fries",
    basePriceCents: 595,
    tags: [
      "mediterranean",
      "fries",
      "zaatar",
      "side",
      "garlic"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "snack",
      "dinner"
    ],
    popularity: 0.74
  },
  {
    id: "olive-lark:cauliflower-shawarma-bowl",
    restaurantId: "olive-lark",
    name: "Cauliflower Shawarma Bowl",
    description: "Spice-roasted cauliflower, saffron rice, crispy chickpeas, herb salad and tahini amba drizzle.",
    glyph: "bowl",
    basePriceCents: 1350,
    tags: [
      "mediterranean",
      "cauliflower",
      "grain bowl",
      "vegan",
      "tahini"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.46
  },
  {
    id: "olive-lark:mint-lemonade-cooler",
    restaurantId: "olive-lark",
    name: "Mint Lemonade Cooler",
    description: "Fresh-squeezed lemonade blended with mint leaves over crushed ice, lightly sweetened.",
    glyph: "boba",
    basePriceCents: 475,
    tags: [
      "mediterranean",
      "drink",
      "lemon",
      "mint",
      "refreshing"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "snack",
      "dinner"
    ],
    popularity: 0.52
  },
  {
    id: "olive-lark:orange-blossom-olive-oil-cake",
    restaurantId: "olive-lark",
    name: "Orange Blossom Olive Oil Cake",
    description: "Moist olive oil cake scented with orange blossom, candied citrus peel and a labneh cream swipe.",
    glyph: "cake",
    basePriceCents: 825,
    tags: [
      "mediterranean",
      "dessert",
      "cake",
      "citrus",
      "olive oil"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "snack",
      "dinner"
    ],
    popularity: 0.31
  },
  {
    id: "tonkotsu-club:classic-18-hour-tonkotsu",
    restaurantId: "tonkotsu-club",
    name: "Classic 18-Hour Tonkotsu",
    description: "Creamy 18-hour pork bone broth, thin springy noodles, chashu, ajitama egg, wood ear, scallion.",
    glyph: "ramen",
    basePriceCents: 1695,
    tags: [
      "ramen",
      "pork",
      "tonkotsu",
      "noodles",
      "comfort"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner",
      "latenight"
    ],
    popularity: 0.94
  },
  {
    id: "tonkotsu-club:spicy-miso-tonkotsu",
    restaurantId: "tonkotsu-club",
    name: "Spicy Miso Tonkotsu",
    description: "Tonkotsu broth hit with red miso tare and chili oil, ground pork, corn, bean sprouts, mayu drizzle.",
    glyph: "ramen",
    basePriceCents: 1750,
    tags: [
      "ramen",
      "spicy",
      "miso",
      "pork",
      "noodles"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight",
      "lunch"
    ],
    popularity: 0.87
  },
  {
    id: "tonkotsu-club:black-garlic-tonkotsu-deluxe",
    restaurantId: "tonkotsu-club",
    name: "Black Garlic Tonkotsu Deluxe",
    description: "Double chashu, smoked ajitama and black garlic oil over rich broth with extra-firm noodles.",
    glyph: "ramen",
    basePriceCents: 1895,
    tags: [
      "ramen",
      "pork",
      "black garlic",
      "premium",
      "rich"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.66
  },
  {
    id: "tonkotsu-club:yuzu-shio-chicken-ramen",
    restaurantId: "tonkotsu-club",
    name: "Yuzu Shio Chicken Ramen",
    description: "Clear chicken shio broth brightened with yuzu peel, chicken chashu, menma and mitsuba.",
    glyph: "ramen",
    basePriceCents: 1595,
    tags: [
      "ramen",
      "chicken",
      "yuzu",
      "light",
      "noodles"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.58
  },
  {
    id: "tonkotsu-club:mushroom-miso-vegan-ramen",
    restaurantId: "tonkotsu-club",
    name: "Mushroom Miso Vegan Ramen",
    description: "Roasted shiitake and koji miso broth, fried tofu, charred cabbage, corn and sesame chili crisp.",
    glyph: "ramen",
    basePriceCents: 1550,
    tags: [
      "ramen",
      "vegan",
      "mushroom",
      "miso",
      "noodles"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.49
  },
  {
    id: "tonkotsu-club:pork-gyoza",
    restaurantId: "tonkotsu-club",
    name: "Pork Gyoza",
    description: "Six pan-seared dumplings with pork, ginger and chive, crisped bottoms, black vinegar dip.",
    glyph: "dumpling",
    basePriceCents: 895,
    tags: [
      "ramen",
      "gyoza",
      "pork",
      "dumplings",
      "izakaya"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight",
      "snack"
    ],
    popularity: 0.82
  },
  {
    id: "tonkotsu-club:karaage-fried-chicken",
    restaurantId: "tonkotsu-club",
    name: "Karaage Fried Chicken",
    description: "Twice-fried soy-ginger chicken thigh chunks with kewpie mayo, lemon wedge and togarashi.",
    glyph: "drumstick",
    basePriceCents: 1050,
    tags: [
      "izakaya",
      "chicken",
      "fried",
      "snack",
      "ramen"
    ],
    dietary: [],
    mealPeriods: [
      "snack",
      "dinner",
      "latenight"
    ],
    popularity: 0.76
  },
  {
    id: "tonkotsu-club:chashu-rice-bowl",
    restaurantId: "tonkotsu-club",
    name: "Chashu Rice Bowl",
    description: "Seared chashu ends over steamed rice with scallion, pickled ginger, soft egg and sweet soy glaze.",
    glyph: "bowl",
    basePriceCents: 1295,
    tags: [
      "rice",
      "pork",
      "izakaya",
      "comfort",
      "ramen"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "latenight"
    ],
    popularity: 0.63
  },
  {
    id: "tonkotsu-club:cucumber-sesame-smash",
    restaurantId: "tonkotsu-club",
    name: "Cucumber Sesame Smash",
    description: "Smashed cucumbers marinated in sesame oil, rice vinegar, garlic and a pinch of chili flake.",
    glyph: "salad",
    basePriceCents: 595,
    tags: [
      "izakaya",
      "cucumber",
      "sesame",
      "cold",
      "side"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "snack",
      "dinner"
    ],
    popularity: 0.33
  },
  {
    id: "tonkotsu-club:yuzu-ramune-soda",
    restaurantId: "tonkotsu-club",
    name: "Yuzu Ramune Soda",
    description: "Sparkling Japanese ramune with a squeeze of fresh yuzu, served ice cold with the marble pop.",
    glyph: "boba",
    basePriceCents: 425,
    tags: [
      "drink",
      "yuzu",
      "soda",
      "japanese",
      "izakaya"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner",
      "latenight"
    ],
    popularity: 0.44
  },
  {
    id: "tonkotsu-club:matcha-soft-serve",
    restaurantId: "tonkotsu-club",
    name: "Matcha Soft Serve",
    description: "Ceremonial-grade matcha soft serve with a crisp black sesame tuile and roasted soy dust.",
    glyph: "icecream",
    basePriceCents: 675,
    tags: [
      "dessert",
      "matcha",
      "icecream",
      "japanese",
      "sweet"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "snack",
      "latenight"
    ],
    popularity: 0.28
  },
  {
    id: "seoul-fired:og-double-fried-half-bird",
    restaurantId: "seoul-fired",
    name: "OG Double-Fried Half Bird",
    description: "Half chicken twice-fried in rice-flour batter, shatter-crisp skin, pickled radish cubes on the side",
    glyph: "drumstick",
    basePriceCents: 1795,
    tags: [
      "korean",
      "fried chicken",
      "crispy",
      "comfort"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.92
  },
  {
    id: "seoul-fired:gochujang-glaze-wings",
    restaurantId: "seoul-fired",
    name: "Gochujang Glaze Wings",
    description: "Ten wings tossed in sticky gochujang-honey glaze, toasted sesame and scallion threads over top",
    glyph: "wings",
    basePriceCents: 1495,
    tags: [
      "korean",
      "wings",
      "spicy",
      "gochujang",
      "sweet"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.89
  },
  {
    id: "seoul-fired:soy-garlic-crunch-tenders",
    restaurantId: "seoul-fired",
    name: "Soy-Garlic Crunch Tenders",
    description: "Hand-battered tenders lacquered in soy, garlic and brown sugar, finished with crushed peanuts",
    glyph: "drumstick",
    basePriceCents: 1350,
    tags: [
      "korean",
      "chicken",
      "garlic",
      "soy",
      "tenders"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.84
  },
  {
    id: "seoul-fired:snow-cheese-boneless-bites",
    restaurantId: "seoul-fired",
    name: "Snow Cheese Boneless Bites",
    description: "Boneless thigh bites dusted in powdered cheddar and parmesan snow, ranch-kewpie dip included",
    glyph: "drumstick",
    basePriceCents: 1425,
    tags: [
      "korean",
      "chicken",
      "cheese",
      "snack"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight",
      "snack"
    ],
    popularity: 0.66
  },
  {
    id: "seoul-fired:fire-bird-sandwich",
    restaurantId: "seoul-fired",
    name: "Fire Bird Sandwich",
    description: "Double-fried thigh, gochugaru mayo, kimchi slaw and pickles on a toasted potato roll",
    glyph: "sandwich",
    basePriceCents: 1275,
    tags: [
      "korean",
      "sandwich",
      "spicy",
      "chicken",
      "kimchi"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.71
  },
  {
    id: "seoul-fired:whole-bird-feast",
    restaurantId: "seoul-fired",
    name: "Whole Bird Feast",
    description: "Whole chicken split two glazes, kimchi, pickled radish, two rice sides and a stack of moist towels",
    glyph: "drumstick",
    basePriceCents: 2395,
    tags: [
      "korean",
      "fried chicken",
      "sharing",
      "feast"
    ],
    dietary: [],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.58
  },
  {
    id: "seoul-fired:kimchi-fried-rice",
    restaurantId: "seoul-fired",
    name: "Kimchi Fried Rice",
    description: "Day-old rice wok-fried with aged kimchi, bacon and butter, topped with a runny fried egg",
    glyph: "bowl",
    basePriceCents: 1150,
    tags: [
      "korean",
      "rice",
      "kimchi",
      "comfort",
      "egg"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.62
  },
  {
    id: "seoul-fired:tteokbokki-skillet",
    restaurantId: "seoul-fired",
    name: "Tteokbokki Skillet",
    description: "Chewy rice cakes simmered in gochujang broth with fish cake, scallion and a melted mozzarella pull",
    glyph: "bowl",
    basePriceCents: 1195,
    tags: [
      "korean",
      "tteokbokki",
      "spicy",
      "rice cakes"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.47
  },
  {
    id: "seoul-fired:house-kimchi-cup",
    restaurantId: "seoul-fired",
    name: "House Kimchi Cup",
    description: "Napa cabbage kimchi fermented in-house two weeks, funky, crunchy and bright with garlic heat",
    glyph: "bowl",
    basePriceCents: 425,
    tags: [
      "korean",
      "kimchi",
      "side",
      "fermented",
      "spicy"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.33
  },
  {
    id: "seoul-fired:yuzu-radish-slaw",
    restaurantId: "seoul-fired",
    name: "Yuzu Radish Slaw",
    description: "Shaved daikon and cabbage in yuzu vinaigrette, the cooling counterpunch to a gochujang order",
    glyph: "salad",
    basePriceCents: 495,
    tags: [
      "korean",
      "salad",
      "side",
      "citrus",
      "fresh"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.27
  },
  {
    id: "seoul-fired:barley-citron-iced-tea",
    restaurantId: "seoul-fired",
    name: "Barley Citron Iced Tea",
    description: "Roasted barley tea shaken with citron marmalade over ice, lightly sweet and toasty",
    glyph: "boba",
    basePriceCents: 375,
    tags: [
      "korean",
      "drink",
      "tea",
      "citrus"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.22
  },
  {
    id: "verdant:golden-turmeric-grain-bowl",
    restaurantId: "verdant",
    name: "Golden Turmeric Grain Bowl",
    description: "Turmeric-roasted cauliflower, farro, chickpeas and pickled onion under a lemon-tahini drizzle",
    glyph: "bowl",
    basePriceCents: 1450,
    tags: [
      "plant-based",
      "bowl",
      "grains",
      "tahini",
      "healthy"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.91
  },
  {
    id: "verdant:smoky-maple-tempeh-bowl",
    restaurantId: "verdant",
    name: "Smoky Maple Tempeh Bowl",
    description: "Maple-glazed tempeh over black rice with charred broccoli, avocado and chipotle cashew crema",
    glyph: "bowl",
    basePriceCents: 1495,
    tags: [
      "plant-based",
      "bowl",
      "tempeh",
      "smoky",
      "protein"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.83
  },
  {
    id: "verdant:caesar-of-the-future",
    restaurantId: "verdant",
    name: "Caesar of the Future",
    description: "Charred little gem, crispy capers, smoked almond parm and sourdough croutons in cashew caesar",
    glyph: "salad",
    basePriceCents: 1295,
    tags: [
      "plant-based",
      "salad",
      "caesar",
      "greens"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.86
  },
  {
    id: "verdant:harissa-carrot-flatbread-wrap",
    restaurantId: "verdant",
    name: "Harissa Carrot Flatbread Wrap",
    description: "Harissa-roasted carrots, hummus, herbs and quick-pickled cucumber rolled in warm flatbread",
    glyph: "wrap",
    basePriceCents: 1175,
    tags: [
      "plant-based",
      "wrap",
      "harissa",
      "hummus",
      "spicy"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch"
    ],
    popularity: 0.64
  },
  {
    id: "verdant:mushroom-reuben-melt",
    restaurantId: "verdant",
    name: "Mushroom Reuben Melt",
    description: "Braised king oyster mushrooms, sauerkraut, cashew swiss and russian dressing on griddled rye",
    glyph: "sandwich",
    basePriceCents: 1395,
    tags: [
      "plant-based",
      "sandwich",
      "mushroom",
      "comfort"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.57
  },
  {
    id: "verdant:truffle-cacio-e-pepe-gnocchi",
    restaurantId: "verdant",
    name: "Truffle Cacio e Pepe Gnocchi",
    description: "Potato gnocchi in cashew-pecorino cream with black truffle shavings and cracked pepper",
    glyph: "noodles",
    basePriceCents: 1695,
    tags: [
      "plant-based",
      "pasta",
      "truffle",
      "comfort",
      "premium"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.49
  },
  {
    id: "verdant:sunrise-chia-parfait",
    restaurantId: "verdant",
    name: "Sunrise Chia Parfait",
    description: "Coconut chia pudding layered with mango puree, toasted buckwheat granola and lime zest",
    glyph: "bowl",
    basePriceCents: 950,
    tags: [
      "plant-based",
      "breakfast",
      "chia",
      "mango",
      "granola"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "breakfast",
      "snack"
    ],
    popularity: 0.68
  },
  {
    id: "verdant:smashed-avo-sourdough",
    restaurantId: "verdant",
    name: "Smashed Avo Sourdough",
    description: "Seeded sourdough with smashed avocado, radish, chili crisp oil and a scatter of hemp hearts",
    glyph: "toast",
    basePriceCents: 1095,
    tags: [
      "plant-based",
      "toast",
      "avocado",
      "breakfast"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "breakfast",
      "lunch"
    ],
    popularity: 0.74
  },
  {
    id: "verdant:green-machine-smoothie",
    restaurantId: "verdant",
    name: "Green Machine Smoothie",
    description: "Kale, pineapple, banana, ginger and coconut water blended thick with a squeeze of lime",
    glyph: "boba",
    basePriceCents: 875,
    tags: [
      "plant-based",
      "smoothie",
      "kale",
      "drink",
      "fresh"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "breakfast",
      "snack"
    ],
    popularity: 0.61
  },
  {
    id: "verdant:miso-ginger-sipping-broth",
    restaurantId: "verdant",
    name: "Miso Ginger Sipping Broth",
    description: "Light miso broth with ginger, wakame and scallion, made to warm your hands between meetings",
    glyph: "soup",
    basePriceCents: 550,
    tags: [
      "plant-based",
      "soup",
      "miso",
      "light"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "snack"
    ],
    popularity: 0.31
  },
  {
    id: "verdant:beet-kvass-spritz",
    restaurantId: "verdant",
    name: "Beet Kvass Spritz",
    description: "House-fermented beet kvass topped with sparkling water and a rosemary sprig, earthy and tart",
    glyph: "boba",
    basePriceCents: 495,
    tags: [
      "plant-based",
      "drink",
      "fermented",
      "beet"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.19
  },
  {
    id: "smokestack:half-pound-oak-smoked-brisket",
    restaurantId: "smokestack",
    name: "Half-Pound Oak-Smoked Brisket",
    description: "Angus brisket smoked 14 hours over oak, sliced thick with pickles, white bread, and house pepper sauce.",
    glyph: "sandwich",
    basePriceCents: 2195,
    tags: [
      "bbq",
      "beef",
      "brisket",
      "smoked",
      "comfort"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.93
  },
  {
    id: "smokestack:st-louis-ribs-half-rack",
    restaurantId: "smokestack",
    name: "St. Louis Ribs, Half Rack",
    description: "Dry-rubbed pork ribs glazed with sorghum-cider mop, smoked until the bark cracks. Six bones per rack.",
    glyph: "drumstick",
    basePriceCents: 1995,
    tags: [
      "bbq",
      "pork",
      "ribs",
      "smoked",
      "sweet"
    ],
    dietary: [
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.88
  },
  {
    id: "smokestack:burnt-ends-plate",
    restaurantId: "smokestack",
    name: "Burnt Ends Plate",
    description: "Cubed brisket points double-smoked and lacquered in molasses barbecue sauce, with pickled red onion.",
    glyph: "bowl",
    basePriceCents: 2450,
    tags: [
      "bbq",
      "beef",
      "burnt ends",
      "smoked",
      "rich"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.82
  },
  {
    id: "smokestack:pitmaster-s-board-for-two",
    restaurantId: "smokestack",
    name: "Pitmaster's Board For Two",
    description: "Brisket, ribs, jalapeno-cheddar sausage, and pulled pork with two sides, cornbread, and both sauces.",
    glyph: "skewer",
    basePriceCents: 3195,
    tags: [
      "bbq",
      "beef",
      "pork",
      "sausage",
      "platter"
    ],
    dietary: [],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.74
  },
  {
    id: "smokestack:pulled-pork-sandwich",
    restaurantId: "smokestack",
    name: "Pulled Pork Sandwich",
    description: "Hickory-smoked shoulder piled on a toasted potato bun with tangy slaw and Carolina vinegar sauce.",
    glyph: "sandwich",
    basePriceCents: 1395,
    tags: [
      "bbq",
      "pork",
      "sandwich",
      "slaw",
      "tangy"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.85
  },
  {
    id: "smokestack:smoked-turkey-breast-plate",
    restaurantId: "smokestack",
    name: "Smoked Turkey Breast Plate",
    description: "Brined turkey breast smoked over oak, sliced lean and served with cranberry mostarda and one side.",
    glyph: "drumstick",
    basePriceCents: 1750,
    tags: [
      "bbq",
      "turkey",
      "smoked",
      "lean"
    ],
    dietary: [
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.42
  },
  {
    id: "smokestack:jalapeno-cheddar-sausage-link",
    restaurantId: "smokestack",
    name: "Jalapeno-Cheddar Sausage Link",
    description: "Coarse-ground pork link studded with cheddar and fresh jalapeno, snappy casing, mustard on the side.",
    glyph: "skewer",
    basePriceCents: 875,
    tags: [
      "bbq",
      "pork",
      "sausage",
      "spicy",
      "cheese"
    ],
    dietary: [
      "gluten-free"
    ],
    mealPeriods: [
      "lunch",
      "snack",
      "dinner"
    ],
    popularity: 0.61
  },
  {
    id: "smokestack:pit-beans-with-brisket-trim",
    restaurantId: "smokestack",
    name: "Pit Beans With Brisket Trim",
    description: "Slow pot of pinto beans simmered with brisket ends, molasses, and a hit of chipotle.",
    glyph: "bowl",
    basePriceCents: 495,
    tags: [
      "bbq",
      "beans",
      "side",
      "smoky",
      "comfort"
    ],
    dietary: [
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.55
  },
  {
    id: "smokestack:buttermilk-slaw",
    restaurantId: "smokestack",
    name: "Buttermilk Slaw",
    description: "Shaved cabbage and carrot in a buttermilk-celery seed dressing, kept cold and crunchy for the fatty cuts.",
    glyph: "salad",
    basePriceCents: 425,
    tags: [
      "bbq",
      "slaw",
      "side",
      "cabbage",
      "fresh"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.33
  },
  {
    id: "smokestack:skillet-cornbread-with-honey-butter",
    restaurantId: "smokestack",
    name: "Skillet Cornbread With Honey Butter",
    description: "Cast-iron cornbread wedge, crisp edges, served warm with whipped wildflower honey butter.",
    glyph: "toast",
    basePriceCents: 550,
    tags: [
      "bbq",
      "cornbread",
      "side",
      "honey",
      "baked"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "lunch",
      "snack",
      "dinner"
    ],
    popularity: 0.58
  },
  {
    id: "smokestack:smoked-chicken-wings",
    restaurantId: "smokestack",
    name: "Smoked Chicken Wings",
    description: "Whole wings smoked then flash-fried, tossed in white Alabama sauce with cracked black pepper.",
    glyph: "wings",
    basePriceCents: 1495,
    tags: [
      "bbq",
      "chicken",
      "wings",
      "smoked",
      "peppery"
    ],
    dietary: [
      "gluten-free"
    ],
    mealPeriods: [
      "lunch",
      "snack",
      "dinner"
    ],
    popularity: 0.29
  },
  {
    id: "little-alps:alpine-vanilla-bean-double-scoop",
    restaurantId: "little-alps",
    name: "Alpine Vanilla Bean Double Scoop",
    description: "Two scoops of Madagascar vanilla churned small-batch with grass-fed alpine cream, in a cup or cone.",
    glyph: "icecream",
    basePriceCents: 695,
    tags: [
      "dessert",
      "ice cream",
      "vanilla",
      "creamy",
      "classic"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "snack",
      "dinner",
      "latenight"
    ],
    popularity: 0.86
  },
  {
    id: "little-alps:toasted-hazelnut-gianduja-scoop",
    restaurantId: "little-alps",
    name: "Toasted Hazelnut Gianduja Scoop",
    description: "Piedmont hazelnut ice cream rippled with dark gianduja and crushed candied hazelnuts.",
    glyph: "icecream",
    basePriceCents: 745,
    tags: [
      "dessert",
      "ice cream",
      "hazelnut",
      "chocolate",
      "nutty"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "snack",
      "dinner",
      "latenight"
    ],
    popularity: 0.68
  },
  {
    id: "little-alps:matterhorn-sundae",
    restaurantId: "little-alps",
    name: "Matterhorn Sundae",
    description: "Three scoops under warm bittersweet fudge, toasted meringue peak, salted almond brittle, and cherry.",
    glyph: "icecream",
    basePriceCents: 1295,
    tags: [
      "dessert",
      "sundae",
      "chocolate",
      "fudge",
      "almond"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.91
  },
  {
    id: "little-alps:warm-brown-butter-chocolate-chunk",
    restaurantId: "little-alps",
    name: "Warm Brown Butter Chocolate Chunk",
    description: "A five-inch cookie baked to order with brown butter and dark chocolate chunks, flaky salt on top.",
    glyph: "cookie",
    basePriceCents: 495,
    tags: [
      "dessert",
      "cookie",
      "chocolate",
      "warm",
      "baked"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "snack",
      "latenight"
    ],
    popularity: 0.83
  },
  {
    id: "little-alps:cookie-and-scoop-skillet",
    restaurantId: "little-alps",
    name: "Cookie And Scoop Skillet",
    description: "Warm chocolate chunk cookie in a mini skillet topped with vanilla bean scoop and hot fudge drizzle.",
    glyph: "cookie",
    basePriceCents: 975,
    tags: [
      "dessert",
      "cookie",
      "ice cream",
      "fudge",
      "warm"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.77
  },
  {
    id: "little-alps:black-forest-affogato",
    restaurantId: "little-alps",
    name: "Black Forest Affogato",
    description: "Double espresso poured over cherry-kirsch ice cream with shaved dark chocolate.",
    glyph: "coffee",
    basePriceCents: 795,
    tags: [
      "dessert",
      "affogato",
      "espresso",
      "cherry",
      "chocolate"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "snack",
      "dinner",
      "latenight"
    ],
    popularity: 0.46
  },
  {
    id: "little-alps:edelweiss-meringue-glacee",
    restaurantId: "little-alps",
    name: "Edelweiss Meringue Glacee",
    description: "Crisp meringue shells with creme fraiche ice cream, macerated alpine strawberries, and chantilly.",
    glyph: "cake",
    basePriceCents: 1150,
    tags: [
      "dessert",
      "meringue",
      "strawberry",
      "cream",
      "elegant"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "dinner"
    ],
    popularity: 0.31
  },
  {
    id: "little-alps:coconut-blackberry-sorbet",
    restaurantId: "little-alps",
    name: "Coconut Blackberry Sorbet",
    description: "Dairy-free churn of coconut cream and wild blackberries, finished with a squeeze of lime.",
    glyph: "icecream",
    basePriceCents: 650,
    tags: [
      "dessert",
      "sorbet",
      "coconut",
      "blackberry",
      "fruity"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "snack",
      "latenight"
    ],
    popularity: 0.52
  },
  {
    id: "little-alps:grand-fondue-sundae-for-two",
    restaurantId: "little-alps",
    name: "Grand Fondue Sundae For Two",
    description: "Six scoops, warm Toblerone-style honey-nougat fondue, waffle shards, brittle, and whipped cream.",
    glyph: "cake",
    basePriceCents: 1300,
    tags: [
      "dessert",
      "sundae",
      "chocolate",
      "sharing",
      "nougat"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.64
  },
  {
    id: "little-alps:swiss-hot-chocolate",
    restaurantId: "little-alps",
    name: "Swiss Hot Chocolate",
    description: "Drinking chocolate melted from 64 percent couverture with steamed milk and a soft cream cap.",
    glyph: "coffee",
    basePriceCents: 525,
    tags: [
      "dessert",
      "hot chocolate",
      "drink",
      "cozy",
      "chocolate"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "snack",
      "dinner",
      "latenight"
    ],
    popularity: 0.39
  },
  {
    id: "little-alps:alpine-root-beer-float",
    restaurantId: "little-alps",
    name: "Alpine Root Beer Float",
    description: "Sarsaparilla root beer over two scoops of vanilla bean, served with a long spoon and striped straw.",
    glyph: "boba",
    basePriceCents: 595,
    tags: [
      "dessert",
      "float",
      "root beer",
      "vanilla",
      "fizzy"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "snack",
      "latenight"
    ],
    popularity: 0.24
  },
  {
    id: "brine-rye:the-stacked-pastrami",
    restaurantId: "brine-rye",
    name: "The Stacked Pastrami",
    description: "Half pound of house-cured pastrami sliced hot, piled on seeded rye with deli mustard.",
    glyph: "sandwich",
    basePriceCents: 1795,
    tags: [
      "deli",
      "pastrami",
      "beef",
      "rye",
      "sandwich"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.93
  },
  {
    id: "brine-rye:matzo-ball-soup",
    restaurantId: "brine-rye",
    name: "Matzo Ball Soup",
    description: "Golden chicken broth with a fluffy matzo ball, pulled chicken, carrots, and dill.",
    glyph: "soup",
    basePriceCents: 950,
    tags: [
      "deli",
      "soup",
      "chicken",
      "comfort",
      "broth"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.86
  },
  {
    id: "brine-rye:corned-beef-reuben",
    restaurantId: "brine-rye",
    name: "Corned Beef Reuben",
    description: "Corned beef griddled with sauerkraut, Swiss, and Russian dressing on buttered rye.",
    glyph: "sandwich",
    basePriceCents: 1650,
    tags: [
      "deli",
      "corned beef",
      "reuben",
      "sauerkraut",
      "cheese"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.84
  },
  {
    id: "brine-rye:lox-and-schmear-bagel",
    restaurantId: "brine-rye",
    name: "Lox & Schmear Bagel",
    description: "Hand-sliced cured salmon on a toasted bagel with scallion cream cheese, capers, and red onion.",
    glyph: "fish",
    basePriceCents: 1495,
    tags: [
      "deli",
      "salmon",
      "bagel",
      "breakfast",
      "cured"
    ],
    dietary: [],
    mealPeriods: [
      "breakfast",
      "lunch"
    ],
    popularity: 0.72
  },
  {
    id: "brine-rye:pastrami-hash-and-eggs",
    restaurantId: "brine-rye",
    name: "Pastrami Hash & Eggs",
    description: "Crisped pastrami ends with griddled potatoes, onions, and two sunny eggs on top.",
    glyph: "egg",
    basePriceCents: 1350,
    tags: [
      "deli",
      "pastrami",
      "eggs",
      "potatoes",
      "breakfast"
    ],
    dietary: [
      "gluten-free"
    ],
    mealPeriods: [
      "breakfast"
    ],
    popularity: 0.61
  },
  {
    id: "brine-rye:challah-french-toast",
    restaurantId: "brine-rye",
    name: "Challah French Toast",
    description: "Thick-cut challah soaked in vanilla custard, griddled and finished with cinnamon sugar.",
    glyph: "toast",
    basePriceCents: 1150,
    tags: [
      "deli",
      "challah",
      "sweet",
      "breakfast",
      "eggs"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "breakfast"
    ],
    popularity: 0.55
  },
  {
    id: "brine-rye:half-sour-pickle-plate",
    restaurantId: "brine-rye",
    name: "Half Sour Pickle Plate",
    description: "House pickles from the barrel: half sours, garlic dills, and pickled green tomatoes.",
    glyph: "salad",
    basePriceCents: 550,
    tags: [
      "deli",
      "pickles",
      "sour",
      "snack",
      "vegetables"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "snack"
    ],
    popularity: 0.48
  },
  {
    id: "brine-rye:potato-knish",
    restaurantId: "brine-rye",
    name: "Potato Knish",
    description: "Baked pastry stuffed with mashed potato and caramelized onion, served with brown mustard.",
    glyph: "dumpling",
    basePriceCents: 625,
    tags: [
      "deli",
      "potato",
      "knish",
      "pastry",
      "comfort"
    ],
    dietary: [
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "snack"
    ],
    popularity: 0.44
  },
  {
    id: "brine-rye:chopped-liver-on-rye",
    restaurantId: "brine-rye",
    name: "Chopped Liver On Rye",
    description: "Old-school chopped chicken liver with schmaltz onions and a jammy egg on toasted rye.",
    glyph: "toast",
    basePriceCents: 1250,
    tags: [
      "deli",
      "chicken",
      "liver",
      "rye",
      "classic"
    ],
    dietary: [],
    mealPeriods: [
      "lunch"
    ],
    popularity: 0.28
  },
  {
    id: "brine-rye:kasha-varnishkes-bowl",
    restaurantId: "brine-rye",
    name: "Kasha Varnishkes Bowl",
    description: "Toasted buckwheat with bowtie pasta, mushrooms, and deeply browned onions.",
    glyph: "bowl",
    basePriceCents: 1050,
    tags: [
      "deli",
      "buckwheat",
      "pasta",
      "mushroom",
      "comfort"
    ],
    dietary: [
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.24
  },
  {
    id: "brine-rye:dr-brown-s-cel-ray-soda",
    restaurantId: "brine-rye",
    name: "Dr. Brown's Cel-Ray Soda",
    description: "The classic celery soda in a cold can, the proper chaser for a pastrami sandwich.",
    glyph: "boba",
    basePriceCents: 350,
    tags: [
      "deli",
      "soda",
      "drink",
      "celery",
      "classic"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "gluten-free",
      "dairy-free"
    ],
    mealPeriods: [
      "lunch",
      "snack"
    ],
    popularity: 0.32
  },
  {
    id: "night-owl-wings:classic-buffalo-dozen",
    restaurantId: "night-owl-wings",
    name: "Classic Buffalo Dozen",
    description: "Twelve double-fried wings tossed in cayenne butter, with celery and blue cheese dip.",
    glyph: "wings",
    basePriceCents: 1595,
    tags: [
      "wings",
      "buffalo",
      "chicken",
      "spicy",
      "fried"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.94
  },
  {
    id: "night-owl-wings:honey-garlic-six-pack",
    restaurantId: "night-owl-wings",
    name: "Honey Garlic Six Pack",
    description: "Six crispy wings glazed in roasted garlic honey with toasted sesame and scallion.",
    glyph: "wings",
    basePriceCents: 995,
    tags: [
      "wings",
      "chicken",
      "honey",
      "garlic",
      "sweet"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.82
  },
  {
    id: "night-owl-wings:owl-s-nest-loaded-fries",
    restaurantId: "night-owl-wings",
    name: "Owl's Nest Loaded Fries",
    description: "Crinkle fries buried under cheddar sauce, chopped buffalo chicken, ranch, and jalapeños.",
    glyph: "fries",
    basePriceCents: 1195,
    tags: [
      "wings",
      "fries",
      "cheese",
      "chicken",
      "loaded"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight",
      "snack"
    ],
    popularity: 0.88
  },
  {
    id: "night-owl-wings:nashville-hot-tender-basket",
    restaurantId: "night-owl-wings",
    name: "Nashville Hot Tender Basket",
    description: "Four buttermilk tenders dredged in hot chile oil, on white bread with dill pickle chips.",
    glyph: "drumstick",
    basePriceCents: 1450,
    tags: [
      "wings",
      "chicken",
      "spicy",
      "nashville",
      "fried"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.67
  },
  {
    id: "night-owl-wings:korean-gochujang-dozen",
    restaurantId: "night-owl-wings",
    name: "Korean Gochujang Dozen",
    description: "Twelve wings lacquered in gochujang-soy glaze with sesame, pickled daikon on the side.",
    glyph: "wings",
    basePriceCents: 1695,
    tags: [
      "wings",
      "korean",
      "gochujang",
      "spicy",
      "chicken"
    ],
    dietary: [
      "dairy-free"
    ],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.71
  },
  {
    id: "night-owl-wings:the-night-shift-platter",
    restaurantId: "night-owl-wings",
    name: "The Night Shift Platter",
    description: "Eighteen wings in three sauces of your choice, loaded fries, and two dips to share.",
    glyph: "wings",
    basePriceCents: 2195,
    tags: [
      "wings",
      "chicken",
      "platter",
      "sharing",
      "fries"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.58
  },
  {
    id: "night-owl-wings:lemon-pepper-cauliflower-bites",
    restaurantId: "night-owl-wings",
    name: "Lemon Pepper Cauliflower Bites",
    description: "Battered cauliflower fried crisp and dusted with lemon pepper, served with vegan ranch.",
    glyph: "bowl",
    basePriceCents: 1050,
    tags: [
      "wings",
      "cauliflower",
      "vegan",
      "lemon pepper",
      "fried"
    ],
    dietary: [
      "vegan",
      "vegetarian",
      "dairy-free"
    ],
    mealPeriods: [
      "dinner",
      "snack"
    ],
    popularity: 0.41
  },
  {
    id: "night-owl-wings:smoked-chipotle-bbq-six-pack",
    restaurantId: "night-owl-wings",
    name: "Smoked Chipotle BBQ Six Pack",
    description: "Six wings in a smoky chipotle barbecue glaze with charred corn and lime crema dip.",
    glyph: "wings",
    basePriceCents: 1025,
    tags: [
      "wings",
      "chicken",
      "bbq",
      "chipotle",
      "smoky"
    ],
    dietary: [],
    mealPeriods: [
      "dinner",
      "latenight"
    ],
    popularity: 0.52
  },
  {
    id: "night-owl-wings:buffalo-chicken-wrap",
    restaurantId: "night-owl-wings",
    name: "Buffalo Chicken Wrap",
    description: "Chopped crispy chicken, buffalo sauce, iceberg, tomato, and ranch in a grilled tortilla.",
    glyph: "wrap",
    basePriceCents: 1195,
    tags: [
      "wings",
      "chicken",
      "wrap",
      "buffalo",
      "lunch"
    ],
    dietary: [],
    mealPeriods: [
      "lunch",
      "dinner"
    ],
    popularity: 0.33
  },
  {
    id: "night-owl-wings:seasoned-crinkle-fries",
    restaurantId: "night-owl-wings",
    name: "Seasoned Crinkle Fries",
    description: "Crinkle-cut fries tossed in house seasoning salt, with ketchup or ranch for dipping.",
    glyph: "fries",
    basePriceCents: 495,
    tags: [
      "wings",
      "fries",
      "side",
      "potato",
      "snack"
    ],
    dietary: [
      "vegetarian"
    ],
    mealPeriods: [
      "dinner",
      "latenight",
      "snack"
    ],
    popularity: 0.46
  },
  {
    id: "night-owl-wings:frozen-root-beer-float",
    restaurantId: "night-owl-wings",
    name: "Frozen Root Beer Float",
    description: "Draft root beer over vanilla soft serve in a frosted cup, capped with whipped cream.",
    glyph: "icecream",
    basePriceCents: 550,
    tags: [
      "wings",
      "dessert",
      "root beer",
      "icecream",
      "drink"
    ],
    dietary: [
      "vegetarian",
      "gluten-free"
    ],
    mealPeriods: [
      "latenight",
      "snack"
    ],
    popularity: 0.22
  }
];
