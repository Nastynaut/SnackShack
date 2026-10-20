// ============================================================
// MENU
// ============================================================
// This is the only file you need to edit to change the snacks.
//
// Save this file, then refresh the browser. You do not need a
// build step, and you do not need to edit index.html.
//
// Each category needs:
//   id     A short name the code uses. No spaces.
//   label  The word on the tab (Food, Drinks, Treats).
//   emoji  A picture on the tab, for kids who are still learning to read.
//   items  The snacks in that tab.
//
// Each snack needs:
//   id     A short unique name. No spaces. Used inside the code.
//   name   What kids see on the button and on the ticket.
//   price  Whole dollars only, from 0 to 999. Write 3, not 3.00 and not "3".
//          The app adds these as integers so totals stay exact.
//   emoji  Placeholder picture until a real drawing exists.
//          Cheeseburger uses a burger (not a cheese wedge), chicken
//          nuggets use a chicken (not a drumstick), and milkshake uses
//          a tall cup (not a glass of milk). Those are the closest
//          single emoji. The SVG replaces them when the file is there.
//   image  The designer's SVG, named with hyphens:
//          assets/food/burger.svg, cheeseburger.svg, hot-dog.svg,
//          fries.svg, chicken-nuggets.svg, pizza-slice.svg,
//          soda.svg, lemonade.svg, milkshake.svg, water.svg,
//          ice-cream-cone.svg, cookie.svg.
//          If that file is missing, the emoji stays.
//          Drop the SVG in place (same filename) and refresh.
//
// Some snacks also have options (toppings or a flavor). Leave
// options off a snack and it still adds in one tap.
//
//   options   A list of groups. Each group needs:
//     id      Letters, numbers, and dashes only.
//     name    The heading kids see, like "Toppings" or "Flavor".
//     pick    "many" (tap any combination) or "one" (pick a single choice).
//             The first choice in a "one" group starts selected,
//             so Add to Ticket is never stuck.
//     choices The buttons in that group.
//
//   Each choice needs:
//     id      Letters, numbers, and dashes only. Unique on that snack.
//     name    The word on the button and on the ticket.
//     icon    A drawing in assets/options/. If the file is missing,
//             the emoji shows. If that is missing too, the name stays.
//     emoji   The backup picture.
//
// Options are free. They do not change the price.
// A bad choice is skipped. The rest of the menu still loads.
// The yellow note and the browser console say what was skipped.
//
// Burger and Cheeseburger share BURGER_TOPPINGS. Edit that list
// once and both snacks change. Milkshake and Ice Cream Cone share
// SHAKE_FLAVORS the same way. Hot dog has its own shorter list.
//
// Milkshake lives under Drinks. To move it, cut its block into
// another category's items list.

// Toppings for Burger and Cheeseburger. Edit this list once.
var BURGER_TOPPINGS = [
  {
    id: "ketchup",
    name: "Ketchup",
    icon: "assets/options/ketchup.svg",
    emoji: "🍅"
  },
  {
    id: "mustard",
    name: "Mustard",
    icon: "assets/options/mustard.svg",
    emoji: "💛"
  },
  {
    id: "mayo",
    name: "Mayo",
    icon: "assets/options/mayo.svg",
    emoji: "🤍"
  },
  {
    id: "pickles",
    name: "Pickles",
    icon: "assets/options/pickles.svg",
    emoji: "🥒"
  },
  {
    id: "lettuce",
    name: "Lettuce",
    icon: "assets/options/lettuce.svg",
    emoji: "🥬"
  },
  {
    id: "tomato",
    name: "Tomato",
    icon: "assets/options/tomato.svg",
    emoji: "🍅"
  },
  {
    id: "onion",
    name: "Onion",
    icon: "assets/options/onion.svg",
    emoji: "🧅"
  }
];

// Hot dog toppings. This is its own list, so a change here
// does not change the burger.
var HOT_DOG_TOPPINGS = [
  {
    id: "ketchup",
    name: "Ketchup",
    icon: "assets/options/ketchup.svg",
    emoji: "🍅"
  },
  {
    id: "mustard",
    name: "Mustard",
    icon: "assets/options/mustard.svg",
    emoji: "💛"
  },
  {
    id: "relish",
    name: "Relish",
    icon: "assets/options/relish.svg",
    emoji: "🟩"
  },
  {
    id: "onion",
    name: "Onion",
    icon: "assets/options/onion.svg",
    emoji: "🧅"
  }
];

// Flavors for Milkshake and Ice Cream Cone. The first one
// starts selected, because a flavor is pick-one.
var SHAKE_FLAVORS = [
  {
    id: "chocolate",
    name: "Chocolate",
    icon: "assets/options/chocolate.svg",
    emoji: "🍫"
  },
  {
    id: "vanilla",
    name: "Vanilla",
    icon: "assets/options/vanilla.svg",
    emoji: "🍦"
  },
  {
    id: "strawberry",
    name: "Strawberry",
    icon: "assets/options/strawberry.svg",
    emoji: "🍓"
  }
];

var MENU = {
  categories: [
    {
      id: "food",
      label: "Food",
      emoji: "🍔",
      items: [
        {
          id: "burger",
          name: "Burger",
          price: 3,
          emoji: "🍔",
          image: "assets/food/burger.svg",
          options: [
            {
              id: "toppings",
              name: "Toppings",
              pick: "many",
              choices: BURGER_TOPPINGS
            }
          ]
        },
        {
          id: "cheeseburger",
          name: "Cheeseburger",
          price: 4,
          emoji: "🍔",
          image: "assets/food/cheeseburger.svg",
          options: [
            {
              id: "toppings",
              name: "Toppings",
              pick: "many",
              choices: BURGER_TOPPINGS
            }
          ]
        },
        {
          id: "hot-dog",
          name: "Hot Dog",
          price: 2,
          emoji: "🌭",
          image: "assets/food/hot-dog.svg",
          options: [
            {
              id: "toppings",
              name: "Toppings",
              pick: "many",
              choices: HOT_DOG_TOPPINGS
            }
          ]
        },
        {
          id: "fries",
          name: "Fries",
          price: 2,
          emoji: "🍟",
          image: "assets/food/fries.svg"
        },
        {
          id: "chicken-nuggets",
          name: "Chicken Nuggets",
          price: 3,
          emoji: "🐔",
          image: "assets/food/chicken-nuggets.svg"
        },
        {
          id: "pizza-slice",
          name: "Pizza Slice",
          price: 3,
          emoji: "🍕",
          image: "assets/food/pizza-slice.svg"
        }
      ]
    },
    {
      id: "drinks",
      label: "Drinks",
      emoji: "🥤",
      items: [
        {
          id: "soda",
          name: "Soda",
          price: 1,
          emoji: "🥤",
          image: "assets/food/soda.svg",
          options: [
            {
              id: "ice",
              name: "Ice",
              pick: "one",
              choices: [
                {
                  id: "with-ice",
                  name: "Ice",
                  icon: "assets/options/ice.svg",
                  emoji: "🧊"
                },
                {
                  id: "no-ice",
                  name: "No ice",
                  icon: "assets/options/no-ice.svg",
                  emoji: "🚫"
                }
              ]
            }
          ]
        },
        {
          id: "lemonade",
          name: "Lemonade",
          price: 1,
          emoji: "🍋",
          image: "assets/food/lemonade.svg"
        },
        {
          id: "milkshake",
          name: "Milkshake",
          price: 3,
          emoji: "🧋",
          image: "assets/food/milkshake.svg",
          options: [
            {
              id: "flavor",
              name: "Flavor",
              pick: "one",
              choices: SHAKE_FLAVORS
            }
          ]
        },
        {
          id: "water",
          name: "Water",
          price: 1,
          emoji: "💧",
          image: "assets/food/water.svg"
        }
      ]
    },
    {
      id: "treats",
      label: "Treats",
      emoji: "🍦",
      items: [
        {
          id: "ice-cream-cone",
          name: "Ice Cream Cone",
          price: 2,
          emoji: "🍦",
          image: "assets/food/ice-cream-cone.svg",
          options: [
            {
              id: "flavor",
              name: "Flavor",
              pick: "one",
              choices: SHAKE_FLAVORS
            },
            {
              id: "extras",
              name: "Extras",
              pick: "many",
              choices: [
                {
                  id: "sprinkles",
                  name: "Sprinkles",
                  icon: "assets/options/sprinkles.svg",
                  emoji: "✨"
                }
              ]
            }
          ]
        },
        {
          id: "cookie",
          name: "Cookie",
          price: 1,
          emoji: "🍪",
          image: "assets/food/cookie.svg"
        }
      ]
    }
  ]
};
