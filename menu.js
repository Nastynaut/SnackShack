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
// Milkshake lives under Drinks. To move it, cut its block into
// another category's items list.

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
          image: "assets/food/burger.svg"
        },
        {
          id: "cheeseburger",
          name: "Cheeseburger",
          price: 4,
          emoji: "🍔",
          image: "assets/food/cheeseburger.svg"
        },
        {
          id: "hot-dog",
          name: "Hot Dog",
          price: 2,
          emoji: "🌭",
          image: "assets/food/hot-dog.svg"
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
          image: "assets/food/soda.svg"
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
          image: "assets/food/milkshake.svg"
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
          image: "assets/food/ice-cream-cone.svg"
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
