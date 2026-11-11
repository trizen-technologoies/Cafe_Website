// Morrow is fictional; so are these dishes and prices. Allergens use the UK's 14 major allergen names.

export const ALLERGENS = {
  gluten: 'Gluten',
  milk: 'Milk',
  eggs: 'Eggs',
  nuts: 'Nuts',
  soya: 'Soya',
  sesame: 'Sesame',
  mustard: 'Mustard',
  celery: 'Celery',
  fish: 'Fish',
};

// The allergens a guest can filter by, most asked about first.
export const FILTERS = ['gluten', 'milk', 'eggs', 'nuts', 'soya', 'sesame'];

export const MENU = [
  {
    id: 'coffee',
    title: 'Coffee',
    note: 'Roasted four streets away, every Tuesday.',
    items: [
      { name: 'Espresso', note: 'House blend. Dark chocolate, plum.', price: 2.8, allergens: [] },
      { name: 'Cortado', note: 'Equal parts espresso and steamed milk.', price: 3.4, allergens: ['milk'] },
      { name: 'Flat white', note: 'Double ristretto, silky milk. The one we’re known for.', price: 3.6, allergens: ['milk'], tag: 'Favourite' },
      { name: 'Oat cappuccino', note: 'Barista oat, a good dusting of cocoa.', price: 3.7, allergens: ['gluten'] },
      { name: 'Filter, Kenya Gichathaini', note: 'Blackcurrant, hibiscus, a bright finish. Brewed to order.', price: 4.2, allergens: [] },
      { name: 'Cardamom latte', note: 'Green cardamom syrup made here, whole milk.', price: 4.1, allergens: ['milk'] },
      { name: 'Mocha', note: 'Single-origin chocolate from Bristol.', price: 4.3, allergens: ['milk', 'soya'] },
    ],
  },
  {
    id: 'tea',
    title: 'Tea & chai',
    note: 'Loose leaf, brewed in the pot.',
    items: [
      { name: 'Masala chai', note: 'Simmered in the pan with ginger, clove and black pepper.', price: 3.8, allergens: ['milk'], tag: 'Rainy day' },
      { name: 'Earl Grey', note: 'Bergamot and cornflower petals.', price: 3.2, allergens: [] },
      { name: 'Fresh mint', note: 'A handful from the window box.', price: 2.9, allergens: [] },
      { name: 'Hot chocolate', note: 'Thick and dark, with a little sea salt.', price: 3.9, allergens: ['milk'] },
    ],
  },
  {
    id: 'bakes',
    title: 'Bakes',
    note: 'From the oven at six. When they’re gone, they’re gone.',
    items: [
      { name: 'Cardamom bun', note: 'Swedish-style, knotted by hand.', price: 3.8, allergens: ['gluten', 'milk', 'eggs'], tag: 'Favourite' },
      { name: 'Almond croissant', note: 'Twice-baked, frangipane, flaked almonds.', price: 3.9, allergens: ['gluten', 'milk', 'eggs', 'nuts'] },
      { name: 'Sourdough toast', note: 'Cultured butter and Seville marmalade.', price: 4.5, allergens: ['gluten', 'milk'] },
      { name: 'Sticky toffee cake', note: 'Medjool dates, warm toffee sauce.', price: 4.8, allergens: ['gluten', 'milk', 'eggs'] },
      { name: 'Pistachio financier', note: 'Brown butter, a little rose.', price: 3.2, allergens: ['gluten', 'milk', 'eggs', 'nuts'] },
    ],
  },
  {
    id: 'plates',
    title: 'All day',
    note: 'Served until 10pm.',
    items: [
      { name: 'Eggs on sourdough', note: 'Soft scrambled, brown butter, chives.', price: 9.5, allergens: ['gluten', 'milk', 'eggs'] },
      { name: 'Bacon bap', note: 'Dry-cured bacon, house ketchup, soft white roll.', price: 8, allergens: ['gluten', 'mustard'] },
      { name: 'Welsh rarebit', note: 'Mature cheddar, ale, a dash of Worcestershire.', price: 8.5, allergens: ['gluten', 'milk', 'mustard', 'fish'] },
      { name: 'Soup of the evening', note: 'Ask what’s in the pot. With bread and butter.', price: 7.5, allergens: ['gluten', 'milk', 'celery'] },
      { name: 'Squash & tahini salad', note: 'Roasted squash, lentils, toasted seeds.', price: 10, allergens: ['sesame'] },
    ],
  },
];

export const HOURS = [
  { days: 'Monday – Friday', open: 7, close: 23, match: [1, 2, 3, 4, 5] },
  { days: 'Saturday – Sunday', open: 8, close: 23, match: [0, 6] },
];
