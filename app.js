// ============================================================
// SNACK SHACK BEHAVIOR
// ============================================================
// Two screens share one order:
//
//   Menu  --Done-->  Summary
//     ^                  |
//     |---- Edit Order --|   (order stays)
//     |---- New Order ---|   (order is cleared)
//
// We only remember which snack and how many. The price is always
// read from menu.js, then multiplied. Prices are whole dollars,
// so the multiply is exact (no cents, no floating point).
//
// menu.js has to load first. It creates the global MENU list.

(function () {
  // Most a kid will add of one snack. Stops a mashed + button
  // from making a number the ticket cannot show cleanly.
  var MAX_QUANTITY = 99;

  // Biggest price we will add up. Bigger than this, and the total
  // turns into scientific notation like $1e+21.
  var MAX_PRICE = 999;

  // id -> snack object from the menu.
  var itemsById = {};

  var state = {
    // "menu" or "summary"
    screen: "menu",
    // Which tab is open. A category id from menu.js.
    categoryId: "",
    // How many of each snack. Example: { burger: 2, soda: 1 }
    // Zero is not stored. The snack is removed instead.
    quantities: {},
    // Ids in the order they were first added, so the ticket
    // does not jump around when quantities change.
    addedIds: []
  };

  // "ok" once an SVG loads, "missing" if the file is not there.
  // A missing picture is requested only the first time.
  var pictureStatus = {};

  var menuScreen = document.getElementById("menu-screen");
  var summaryScreen = document.getElementById("summary-screen");
  var tabsEl = document.getElementById("category-tabs");
  var gridEl = document.getElementById("menu-grid");
  var ticketLinesEl = document.getElementById("ticket-lines");
  var ticketTotalEl = document.getElementById("ticket-total");
  var doneButton = document.getElementById("done-button");
  var summaryLinesEl = document.getElementById("summary-lines");
  var summaryTotalEl = document.getElementById("summary-total");
  var summaryCountEl = document.getElementById("summary-count");
  var liveStatus = document.getElementById("live-status");

  // ----------------------------------------------------------
  // Menu lookup
  // ----------------------------------------------------------

  // Build itemsById once. A bad price or a repeated id is skipped
  // so the total cannot go wrong. We say why on the page and in
  // the console, so a menu edit is easy to spot.
  // null is not a usable record. Arrays are objects too, but a category
  // or a snack is always a plain { } in menu.js.
  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  // Name the snack by whatever menu.js actually filled in.
  function snackLabel(item, index, categoryLabel) {
    if (item && item.name) {
      return item.name;
    }
    if (item && item.id) {
      return item.id;
    }
    return "Snack " + (index + 1) + " in " + categoryLabel;
  }

  function prepareMenu() {
    var problems = [];
    var keptCategories = [];

    // An object, null, or a missing list used to throw and leave a blank page.
    // The same sentence as a missing menu.js, so the page still explains itself.
    if (!window.MENU || !Array.isArray(MENU.categories)) {
      problems.push("The menu did not load. Keep menu.js in the same folder as index.html.");
      console.warn(problems[0]);
      return problems;
    }

    MENU.categories.forEach(function (category, categoryIndex) {
      if (!isRecord(category)) {
        problems.push(
          "Category " + (categoryIndex + 1) + " is hidden because it is not a category."
        );
        return;
      }

      var kept = [];
      var label = category.label || category.id || "Category " + (categoryIndex + 1);

      // No items key at all used to crash (undefined has no forEach).
      // Treat that the same as an empty list, and say so.
      if (!Array.isArray(category.items)) {
        problems.push(
          label + " has no snacks list. In menu.js, add items: [ ] under that category."
        );
        category.items = [];
        keptCategories.push(category);
        return;
      }

      if (category.items.length === 0) {
        problems.push(label + " has no snacks yet.");
        keptCategories.push(category);
        return;
      }

      category.items.forEach(function (item, itemIndex) {
        if (!isRecord(item)) {
          problems.push(
            snackLabel(item, itemIndex, label) + " is hidden because it is not a snack."
          );
          return;
        }
        if (!item.id || !item.name) {
          problems.push(
            snackLabel(item, itemIndex, label) +
              " is hidden because it needs both a name and an id."
          );
          return;
        }
        if (itemsById[item.id]) {
          problems.push(
            item.name +
              " is hidden because another snack already uses the id \"" +
              item.id +
              "\". Give it a different id."
          );
          return;
        }
        var priceNote = priceProblem(item);
        if (priceNote) {
          problems.push(priceNote);
          return;
        }
        itemsById[item.id] = item;
        kept.push(item);
      });

      category.items = kept;
      keptCategories.push(category);
    });

    // Drop nulls so later loops can trust every entry.
    MENU.categories = keptCategories;

    if (problems.length > 0) {
      console.warn("Snack Shack menu notes:\n- " + problems.join("\n- "));
    }

    return problems;
  }

  // Why a price was skipped, in words a parent can match to menu.js.
  // A string "3" is shown with quotes, so it does not look like the number 3.
  function describePrice(price) {
    if (typeof price === "string") {
      return '"' + price + '"';
    }
    return String(price);
  }

  function priceProblem(item) {
    var price = item.price;
    var who = item.name || item.id || "A snack";
    if (price === undefined || price === null || price === "") {
      return who + " is hidden because it has no price. Use a whole number like 3.";
    }
    // NaN would print as the word NaN. Say what is wrong instead.
    if (typeof price === "number" && Number.isNaN(price)) {
      return who + " is hidden because its price is not a number. Use a whole number from 0 to 999.";
    }
    // A string "3" is shown with quotes, so it does not look like the number 3.
    if (typeof price !== "number") {
      return (
        who +
        " is hidden because its price is " +
        describePrice(price) +
        ". Use a whole number from 0 to 999."
      );
    }
    // Anything over MAX_PRICE would print like $1e+21.
    if (price > MAX_PRICE) {
      return who + " is hidden because its price is too big. Use a whole number from 0 to 999.";
    }
    // Number.isInteger also rejects 2.5 and negatives.
    if (!Number.isInteger(price) || price < 0) {
      return (
        who +
        " is hidden because its price is " +
        describePrice(price) +
        ". Use a whole number from 0 to 999."
      );
    }
    return "";
  }

  // A yellow note under the title. Plain words, not an error alarm.
  function showMenuNotes(problems) {
    var note = document.getElementById("menu-note");
    note.textContent = "";

    if (!problems || problems.length === 0) {
      note.hidden = true;
      return;
    }

    // One line until it is opened. A tall note was hiding a ticket row
    // on a short landscape iPad.
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "menu-note-toggle";
    toggle.textContent = "Check menu.js, then save and refresh.";
    toggle.setAttribute("aria-expanded", "false");

    var body = document.createElement("div");
    body.className = "menu-note-body";
    body.hidden = true;

    for (var i = 0; i < problems.length; i++) {
      var line = document.createElement("p");
      line.textContent = problems[i];
      body.appendChild(line);
    }

    toggle.addEventListener("click", function () {
      var open = body.hidden;
      body.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      fitTicketLines();
      updateScrollHint();
    });

    note.appendChild(toggle);
    note.appendChild(body);
    note.hidden = false;
  }

  function findCategory(id) {
    for (var i = 0; i < MENU.categories.length; i++) {
      if (MENU.categories[i].id === id) {
        return MENU.categories[i];
      }
    }
    return MENU.categories[0];
  }

  // "$3" from the number 3. No decimals, on purpose.
  function formatDollars(amount) {
    return "$" + amount;
  }

  // Price times quantity. Both are integers, so this stays exact.
  function lineTotal(item, quantity) {
    return item.price * quantity;
  }

  function eachAddedId(callback) {
    for (var i = 0; i < state.addedIds.length; i++) {
      var id = state.addedIds[i];
      var item = itemsById[id];
      var quantity = state.quantities[id];
      if (item && quantity) {
        callback(item, quantity);
      }
    }
  }

  function orderTotal() {
    var total = 0;
    eachAddedId(function (item, quantity) {
      total += lineTotal(item, quantity);
    });
    return total;
  }

  function totalQuantity() {
    var count = 0;
    eachAddedId(function (item, quantity) {
      count += quantity;
    });
    return count;
  }

  function say(message) {
    liveStatus.textContent = message;
  }

  // ----------------------------------------------------------
  // Sounds
  // ----------------------------------------------------------
  // Optional. Put these files next to the page and refresh:
  //   assets/sounds/add.mp3        plays when a snack is added
  //   assets/sounds/checkout.mp3   plays when Done is tapped
  // A missing file just stays quiet. The register still works.
  // "Sound off" is remembered on this tablet. That is a preference,
  // not tracking, and it never leaves the device.

  var MUTE_KEY = "snack-shack-muted";
  var soundMuted = false;

  try {
    soundMuted = localStorage.getItem(MUTE_KEY) === "1";
  } catch (err) {
    soundMuted = false;
  }

  // Returns a play() function for one file.
  function makeSound(src) {
    var audio = new Audio();
    var available = true;

    audio.preload = "auto";
    audio.addEventListener("error", function () {
      // The mp3 is not in the folder yet (or the name is wrong).
      available = false;
    });
    // Set src after the listener so a fast error is not missed.
    audio.src = src;

    return function play() {
      if (soundMuted || !available) {
        return;
      }

      // tokens.css can set --sound-volume. Otherwise use 0.6.
      var raw = getComputedStyle(document.documentElement)
        .getPropertyValue("--sound-volume")
        .trim();
      var volume = parseFloat(raw);
      if (!isFinite(volume) || volume < 0 || volume > 1) {
        volume = 0.6;
      }
      audio.volume = volume;

      try {
        // Start over so a second tap replays the ding from the top.
        audio.currentTime = 0;
      } catch (err) {
        // Not loaded enough to rewind yet. Playing still starts at 0.
      }

      var pending = audio.play();
      if (pending && pending.catch) {
        pending.catch(function () {
          if (audio.error) {
            available = false;
          }
        });
      }
    };
  }

  var playAdd = makeSound("assets/sounds/add.mp3");
  var playCheckout = makeSound("assets/sounds/checkout.mp3");

  function rememberMute() {
    try {
      localStorage.setItem(MUTE_KEY, soundMuted ? "1" : "0");
    } catch (err) {
      // Storage can be blocked for file:// pages. Mute still works
      // until the tab is closed.
    }
  }

  function renderMuteButton() {
    var button = document.getElementById("mute-button");
    var icon = document.getElementById("mute-icon");
    // The visible word stays "Sound". The picture and the accessible
    // name say on or off. No aria-pressed: the name already says it.
    button.classList.toggle("is-muted", soundMuted);
    if (soundMuted) {
      icon.textContent = "🔇";
      button.setAttribute("aria-label", "Sound is off. Tap to turn sound on.");
    } else {
      icon.textContent = "🔊";
      button.setAttribute("aria-label", "Sound is on. Tap to turn sound off.");
    }
  }

  // ----------------------------------------------------------
  // Changing the order
  // ----------------------------------------------------------

  function changeQuantity(id, delta) {
    var item = itemsById[id];
    if (!item) {
      return;
    }

    var current = state.quantities[id] || 0;
    var next = current + delta;
    if (next > MAX_QUANTITY) {
      next = MAX_QUANTITY;
    }
    if (next < 0) {
      next = 0;
    }
    // Already at the cap, or already at zero. Nothing to do.
    if (next === current) {
      return;
    }

    var addedOne = next > current;

    if (next === 0) {
      delete state.quantities[id];
      var kept = [];
      for (var i = 0; i < state.addedIds.length; i++) {
        if (state.addedIds[i] !== id) {
          kept.push(state.addedIds[i]);
        }
      }
      state.addedIds = kept;
      say("Removed " + item.name + ". Total " + formatDollars(orderTotal()) + ".");
    } else {
      // First time this snack is on the ticket: remember its place.
      if (!state.quantities[id]) {
        state.addedIds.push(id);
      }
      state.quantities[id] = next;
      say(
        item.name +
          ", " +
          next +
          ". Total " +
          formatDollars(orderTotal()) +
          "."
      );
    }

    // Ding only when the count goes up (a tap on the menu or +).
    // Minus stays quiet. A missing mp3 stays quiet too.
    if (addedOne) {
      playAdd();
    }

    renderOrder();
  }

  function clearOrder() {
    state.quantities = {};
    state.addedIds = [];
    state.screen = "menu";
    state.categoryId = firstOpenCategoryId() || MENU.categories[0].id;
    say("New order. The ticket is empty.");
    renderTabs();
    renderMenuGrid();
    renderOrder();
    showScreen(true);
  }

  // ----------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------

  function showScreen(moveFocus) {
    var onMenu = state.screen === "menu";
    menuScreen.hidden = !onMenu;
    summaryScreen.hidden = onMenu;

    if (!moveFocus) {
      return;
    }

    // Summary: land on the heading (it is not in the normal tab order).
    // Back on the menu: land on Done when there is an order, otherwise
    // the first tab, so keyboard users are not left on a hidden screen.
    if (onMenu) {
      if (!doneButton.disabled) {
        doneButton.focus({ preventScroll: true });
      } else {
        var firstTab = tabsEl.querySelector(".tab");
        if (firstTab) {
          firstTab.focus({ preventScroll: true });
        }
      }
    } else {
      document.getElementById("summary-heading").focus({ preventScroll: true });
    }

    // Coming back from the summary used to keep a half-cut scroll.
    // Reset after the screen is visible, so the browser does not
    // restore the old position while the menu was hidden.
    if (onMenu) {
      ticketLinesEl.scrollTop = 0;
    }

    // The summary was hidden while we measured it. Check the hint now.
    fitTicketLines();
    updateScrollHint();
  }

  function selectCategory(id) {
    if (state.categoryId === id) {
      return;
    }
    state.categoryId = id;
    renderTabs();
    renderMenuGrid();
  }

  function firstOpenCategoryId() {
    var i;
    for (i = 0; i < MENU.categories.length; i++) {
      var category = MENU.categories[i];
      if (category.items && category.items.length > 0) {
        return category.id;
      }
    }
    return "";
  }

  function focusSelectedTab() {
    var selected = tabsEl.querySelector(".tab.is-selected");
    if (!selected) {
      selected = tabsEl.querySelector(".tab");
    }
    if (selected) {
      selected.focus({ preventScroll: true });
    }
  }

  function renderTabs() {
    tabsEl.innerHTML = "";

    MENU.categories.forEach(function (category) {
      // Empty categories already have a yellow note. Skip the blank tab.
      if (!category.items || category.items.length === 0) {
        return;
      }

      var tab = document.createElement("button");
      tab.type = "button";
      tab.className = "tab";
      tab.setAttribute("role", "tab");
      tab.setAttribute("data-category", category.id);
      tab.setAttribute("aria-controls", "menu-grid");
      // The word is the accessible name. The emoji is just a picture.
      tab.setAttribute("aria-label", category.label);
      if (category.emoji) {
        var icon = document.createElement("span");
        icon.className = "btn-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = category.emoji;
        tab.appendChild(icon);
      }
      tab.appendChild(document.createTextNode(category.label));

      var selected = category.id === state.categoryId;
      tab.classList.toggle("is-selected", selected);
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      // Only the open tab is in the tab order. Arrow keys move between them.
      tab.tabIndex = selected ? 0 : -1;

      tab.addEventListener("click", function () {
        selectCategory(category.id);
      });

      tab.addEventListener("keydown", function (event) {
        var tabs = tabsEl.querySelectorAll(".tab");
        var index = 0;
        var i;
        for (i = 0; i < tabs.length; i++) {
          if (tabs[i] === tab) {
            index = i;
          }
        }
        var next = index;
        if (event.key === "ArrowRight") {
          next = (index + 1) % tabs.length;
        } else if (event.key === "ArrowLeft") {
          next = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
          next = 0;
        } else if (event.key === "End") {
          next = tabs.length - 1;
        } else {
          return;
        }
        event.preventDefault();
        selectCategory(tabs[next].getAttribute("data-category"));
        focusSelectedTab();
      });

      tabsEl.appendChild(tab);
    });
  }

  // One snack button. The picture tries the SVG first.
  function makeMenuButton(item) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "menu-item";
    button.setAttribute("data-id", item.id);

    var picture = document.createElement("span");
    picture.className = "picture";

    var emoji = document.createElement("span");
    emoji.className = "emoji";
    emoji.setAttribute("aria-hidden", "true");
    emoji.textContent = item.emoji;
    picture.appendChild(emoji);

    if (item.image && pictureStatus[item.id] !== "missing") {
      var img = document.createElement("img");
      img.alt = "";
      // Hidden until it loads, so a missing file never flashes a broken icon.
      img.hidden = pictureStatus[item.id] !== "ok";
      if (pictureStatus[item.id] === "ok") {
        emoji.hidden = true;
      }
      img.addEventListener("load", function () {
        pictureStatus[item.id] = "ok";
        img.hidden = false;
        emoji.hidden = true;
      });
      img.addEventListener("error", function () {
        // Remember the miss. The next time this snack is drawn,
        // we skip the image so the browser does not ask again.
        pictureStatus[item.id] = "missing";
        img.hidden = true;
        emoji.hidden = false;
      });
      // Set src after the listeners, or a fast error can be missed.
      img.src = item.image;
      picture.appendChild(img);
    }

    var name = document.createElement("span");
    name.className = "item-name";
    name.textContent = item.name;

    var price = document.createElement("span");
    price.className = "item-price";
    price.textContent = formatDollars(item.price);

    var badge = document.createElement("span");
    badge.className = "badge";
    badge.hidden = true;
    badge.setAttribute("aria-hidden", "true");

    button.appendChild(picture);
    button.appendChild(name);
    button.appendChild(price);
    button.appendChild(badge);

    // Tapping the picture, the name, or the price all add one.
    button.addEventListener("click", function () {
      changeQuantity(item.id, 1);
    });

    return button;
  }

  function renderMenuGrid() {
    var category = findCategory(state.categoryId);
    var items = category.items || [];
    gridEl.innerHTML = "";
    gridEl.setAttribute("aria-label", category.label);

    // 4 or fewer snacks read better as two big columns
    // (Drinks is 2x2, Treats is a pair). Food stays 3 across
    // until the screen is narrow — that case is in styles.css.
    gridEl.classList.toggle("is-few", items.length <= 4);

    items.forEach(function (item) {
      gridEl.appendChild(makeMenuButton(item));
    });

    updateBadges();
  }

  // The number bubble on a snack that is already on the ticket.
  function updateBadges() {
    var buttons = gridEl.querySelectorAll(".menu-item");
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var id = button.getAttribute("data-id");
      var item = itemsById[id];
      var quantity = state.quantities[id] || 0;
      var badge = button.querySelector(".badge");

      button.classList.toggle("is-on-ticket", quantity > 0);
      if (quantity > 0) {
        badge.hidden = false;
        badge.textContent = String(quantity);
        button.setAttribute(
          "aria-label",
          item.name + ", " + formatDollars(item.price) + ", " + quantity + " on the ticket. Tap to add another."
        );
      } else {
        badge.hidden = true;
        button.setAttribute(
          "aria-label",
          item.name + ", " + formatDollars(item.price) + ". Tap to add."
        );
      }
    }
  }

  function renderTicket() {
    // Rebuilding the rows drops keyboard focus. Remember which
    // + or − was pressed so we can put focus back on the new one.
    var active = document.activeElement;
    var restoreId = "";
    var restoreAction = "";
    if (active && ticketLinesEl.contains(active)) {
      restoreId = active.getAttribute("data-id") || "";
      restoreAction = active.getAttribute("data-action") || "";
    }

    ticketLinesEl.innerHTML = "";

    if (state.addedIds.length === 0) {
      var empty = document.createElement("p");
      empty.className = "ticket-empty";
      empty.textContent = "Tap a snack to start the ticket.";
      ticketLinesEl.appendChild(empty);
    } else {
      eachAddedId(function (item, quantity) {
        ticketLinesEl.appendChild(makeTicketRow(item, quantity));
      });
    }

    var total = orderTotal();
    ticketTotalEl.textContent = formatDollars(total);
    // Done stays quiet until there is something to summarize.
    doneButton.disabled = state.addedIds.length === 0;

    if (restoreId && restoreAction) {
      restoreTicketFocus(restoreId, restoreAction);
    }

    fitTicketLines();
    updateScrollHint();
  }

  // Put keyboard focus back after the ticket is rebuilt.
  // A disabled + cannot hold focus, and neither can a deleted row.
  function restoreTicketFocus(id, action) {
    var button = ticketLinesEl.querySelector(
      'button[data-id="' + id + '"][data-action="' + action + '"]'
    );

    // + just hit 99 and is now disabled. Land on that row's −.
    if (button && button.disabled) {
      button = ticketLinesEl.querySelector(
        'button[data-id="' + id + '"][data-action="minus"]'
      );
    }

    // The row is gone (quantity hit 0). Move to a button that is left.
    if (!button || button.disabled) {
      button = ticketLinesEl.querySelector("button:not([disabled])");
    }

    if (button) {
      button.focus({ preventScroll: true });
      return;
    }

    // Last line removed. Land on the open tab (or the first one).
    focusSelectedTab();
  }

  // Show only whole ticket rows, so a + / − is never half cut off.
  // The extra gap stays above the total, inside the ticket.
  function fitTicketLines() {
    ticketLinesEl.style.maxHeight = "";
    if (menuScreen.hidden) {
      return;
    }

    var rows = ticketLinesEl.querySelectorAll(".ticket-row");
    var room = ticketLinesEl.clientHeight;
    if (!rows.length || room < 1) {
      return;
    }

    // Everything fits. Leave the list filling the ticket.
    if (ticketLinesEl.scrollHeight <= room + 1) {
      return;
    }

    // Keep only whole rows. A long name can be a little taller
    // than "Soda", so add them up instead of assuming one height.
    var origin = rows[0].getBoundingClientRect().top;
    var used = 0;
    var fit = 0;
    var i;
    for (i = 0; i < rows.length; i++) {
      var bottom = rows[i].getBoundingClientRect().bottom - origin;
      if (bottom > room + 0.5) {
        break;
      }
      used = bottom;
      fit += 1;
    }
    if (fit < 1) {
      return;
    }
    if (room - used > 1) {
      ticketLinesEl.style.maxHeight = used + "px";
    }
    alignTicketScroll();
  }

  // A scroll can stop between two rows and cut a + / − in half.
  // Land on the nearest row start instead. Called after the scroll
  // settles, so a finger can still drag.
  var ticketSnapTimer = 0;
  var aligningTicket = false;

  function alignTicketScroll() {
    if (aligningTicket || menuScreen.hidden) {
      return;
    }
    var rows = ticketLinesEl.querySelectorAll(".ticket-row");
    if (!rows.length) {
      return;
    }
    var scrollTop = ticketLinesEl.scrollTop;
    if (scrollTop < 1) {
      return;
    }
    var maxScroll = ticketLinesEl.scrollHeight - ticketLinesEl.clientHeight;
    var portTop = ticketLinesEl.getBoundingClientRect().top;
    var best = 0;
    var bestDist = Math.abs(scrollTop);
    var i;
    for (i = 0; i < rows.length; i++) {
      var y = scrollTop + (rows[i].getBoundingClientRect().top - portTop);
      if (y > maxScroll + 1) {
        break;
      }
      var dist = Math.abs(y - scrollTop);
      if (dist < bestDist) {
        bestDist = dist;
        best = y;
      }
    }
    if (Math.abs(scrollTop - best) < 1) {
      return;
    }
    aligningTicket = true;
    ticketLinesEl.scrollTop = best;
    aligningTicket = false;
  }

  // "More below" when a list is taller than the space it has.
  function updateOneHint(linesEl, hint, active) {
    if (!active) {
      hint.hidden = true;
      return;
    }
    var extra = linesEl.scrollHeight - linesEl.clientHeight;
    var atEnd = linesEl.scrollTop + linesEl.clientHeight >= linesEl.scrollHeight - 4;
    hint.hidden = extra <= 4 || atEnd;
  }

  function updateScrollHint() {
    updateOneHint(ticketLinesEl, document.getElementById("ticket-scroll-hint"), !menuScreen.hidden);
    updateOneHint(
      summaryLinesEl,
      document.getElementById("summary-scroll-hint"),
      !summaryScreen.hidden
    );
  }

  function makeTicketRow(item, quantity) {
    var row = document.createElement("div");
    row.className = "ticket-row";

    // Name, with the each-price tucked under it when the row has room.
    var main = document.createElement("div");
    main.className = "line-main";

    var name = document.createElement("span");
    name.className = "line-name";
    name.textContent = item.name;

    var each = document.createElement("span");
    each.className = "line-each";
    each.textContent = formatDollars(item.price) + " each";

    main.appendChild(name);
    main.appendChild(each);

    var linePrice = document.createElement("span");
    linePrice.className = "line-price";
    linePrice.textContent = formatDollars(lineTotal(item, quantity));

    var qty = document.createElement("div");
    qty.className = "qty";

    var minus = document.createElement("button");
    minus.type = "button";
    minus.className = "qty-button qty-minus btn btn--icon btn--remove";
    minus.setAttribute("data-action", "minus");
    minus.setAttribute("data-id", item.id);
    minus.setAttribute("aria-label", "Remove one " + item.name);
    minus.textContent = "\u2212";

    var number = document.createElement("span");
    number.className = "qty-number";
    number.textContent = String(quantity);

    var plus = document.createElement("button");
    plus.type = "button";
    plus.className = "qty-button qty-plus btn btn--icon btn--add";
    plus.setAttribute("data-action", "plus");
    plus.setAttribute("data-id", item.id);
    plus.setAttribute("aria-label", "Add one " + item.name);
    plus.textContent = "+";
    plus.disabled = quantity >= MAX_QUANTITY;

    qty.appendChild(minus);
    qty.appendChild(number);
    qty.appendChild(plus);

    row.appendChild(main);
    row.appendChild(linePrice);
    row.appendChild(qty);
    return row;
  }

  function renderSummary() {
    summaryLinesEl.innerHTML = "";

    eachAddedId(function (item, quantity) {
      var row = document.createElement("div");
      row.className = "summary-row";

      var name = document.createElement("span");
      name.textContent = item.name;

      var howMany = document.createElement("span");
      howMany.textContent = String(quantity);

      var price = document.createElement("span");
      price.className = "summary-price";
      price.textContent = formatDollars(lineTotal(item, quantity));

      row.appendChild(name);
      row.appendChild(howMany);
      row.appendChild(price);
      summaryLinesEl.appendChild(row);
    });

    var count = totalQuantity();
    var noun = count === 1 ? "item" : "items";
    summaryCountEl.textContent = count + " " + noun;
    summaryTotalEl.textContent = formatDollars(orderTotal());
    updateScrollHint();
  }

  // Ticket, badges, and summary all read the same order.
  function renderOrder() {
    updateBadges();
    renderTicket();
    renderSummary();
  }

  // ----------------------------------------------------------
  // Wire-up
  // ----------------------------------------------------------

  function showSetupProblem(message) {
    var note = document.createElement("p");
    note.className = "noscript";
    note.textContent = message;
    document.body.insertBefore(note, document.body.firstChild);
  }

  function init() {
    var problems = prepareMenu();
    if (!window.MENU || !Array.isArray(MENU.categories) || MENU.categories.length === 0) {
      showSetupProblem("The menu did not load. Keep menu.js in the same folder as index.html.");
      showMenuNotes(problems);
      return;
    }

    state.categoryId = firstOpenCategoryId() || MENU.categories[0].id;

    // + and - are recreated every time the ticket redraws,
    // so one listener on the list catches all of them.
    ticketLinesEl.addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button || !ticketLinesEl.contains(button)) {
        return;
      }
      var id = button.getAttribute("data-id");
      var action = button.getAttribute("data-action");
      if (action === "plus") {
        changeQuantity(id, 1);
      } else if (action === "minus") {
        changeQuantity(id, -1);
      }
    });

    doneButton.addEventListener("click", function () {
      if (state.addedIds.length === 0) {
        return;
      }
      state.screen = "summary";
      renderSummary();
      showScreen(true);
      // Cha-ching. Silent if assets/sounds/checkout.mp3 is missing.
      playCheckout();
      say("Order summary. Total " + formatDollars(orderTotal()) + ".");
    });

    document.getElementById("edit-order").addEventListener("click", function () {
      state.screen = "menu";
      showScreen(true);
      say("Back on the menu. The ticket was kept.");
    });

    document.getElementById("new-order").addEventListener("click", clearOrder);

    renderMuteButton();
    document.getElementById("mute-button").addEventListener("click", function () {
      soundMuted = !soundMuted;
      rememberMute();
      renderMuteButton();
      say(soundMuted ? "Sound off." : "Sound on.");
    });

    ticketLinesEl.addEventListener("scroll", function () {
      updateScrollHint();
      window.clearTimeout(ticketSnapTimer);
      ticketSnapTimer = window.setTimeout(alignTicketScroll, 60);
    });
    summaryLinesEl.addEventListener("scroll", updateScrollHint);
    window.addEventListener("resize", function () {
      fitTicketLines();
      updateScrollHint();
    });
    // Row height can change once Fredoka finishes loading.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        fitTicketLines();
        updateScrollHint();
      });
    }

    // Yellow note when a price or id was skipped. Hidden when the menu is fine.
    showMenuNotes(problems);

    renderTabs();
    renderMenuGrid();
    renderOrder();
    showScreen();
  }

  init();
})();
