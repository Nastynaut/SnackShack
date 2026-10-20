// ============================================================
// OPTIONS SCREEN
// ============================================================
// Snacks that have toppings or flavors open this screen.
// Snacks with no options skip it and land on the ticket in one tap.
//
// app.js owns the ticket. This file only draws the screen and
// checks that the options list in menu.js is safe to use.
// A bad entry is skipped. It never crashes the page.

(function () {
  var screen = document.getElementById("options-screen");
  var titleEl = document.getElementById("options-title");
  var pictureEl = document.getElementById("options-picture");
  var groupsEl = document.getElementById("options-groups");
  var addButton = document.getElementById("options-add");
  var addLabel = document.getElementById("options-add-label");
  var backButton = document.getElementById("options-back");

  // The snack we are picking for right now. Null when the screen is closed.
  var session = null;

  // One warning per missing icon, so a broken file does not spam the console.
  var missingIcons = {};

  // ----------------------------------------------------------
  // Reading menu.js
  // ----------------------------------------------------------
  // The same checks app.js uses for snack ids. A quote or a space
  // in an id would break the button lookup, so those entries are skipped.

  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function textOf(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value.replace(/^\s+|\s+$/g, "");
  }

  function isSafeId(value) {
    return /^[A-Za-z0-9-]+$/.test(value);
  }

  // Turn the options list from menu.js into groups we can draw.
  // problems is a list of plain sentences for the yellow note.
  function clean(raw, snackName) {
    var problems = [];
    var groups = [];

    if (raw === undefined) {
      return { groups: groups, problems: problems };
    }

    // A word or a number here used to be able to throw. Skip the whole list.
    if (!Array.isArray(raw)) {
      problems.push(snackName + "'s options were skipped because they are not a list.");
      return { groups: groups, problems: problems };
    }

    var seenGroupIds = {};
    var seenChoiceIds = {};
    var index;

    for (index = 0; index < raw.length; index++) {
      var group = raw[index];
      var place = "option group " + (index + 1);
      if (!isRecord(group)) {
        problems.push(snackName + "'s " + place + " was skipped because it is not a group of choices.");
        continue;
      }

      var groupId = textOf(group.id);
      var groupName = textOf(group.name) || groupId || place;
      if (!groupId) {
        problems.push(snackName + "'s " + groupName + " group was skipped because it needs an id.");
        continue;
      }
      if (!isSafeId(groupId)) {
        problems.push(
          snackName +
            "'s " +
            groupName +
            " group was skipped because its id can only use letters, numbers, and dashes."
        );
        continue;
      }
      if (seenGroupIds[groupId]) {
        problems.push(
          snackName +
            "'s " +
            groupName +
            ' group was skipped because another group already uses the id "' +
            groupId +
            '".'
        );
        continue;
      }

      // "one" = pick a single flavor. "many" = toggle any toppings.
      // Capital letters are fine. Anything else is a typo we skip.
      var pick = textOf(group.pick).toLowerCase();
      if (pick !== "one" && pick !== "many") {
        problems.push(
          snackName +
            "'s " +
            groupName +
            ' group was skipped because pick must be "one" or "many".'
        );
        continue;
      }

      if (!Array.isArray(group.choices)) {
        problems.push(
          snackName + "'s " + groupName + " choices were skipped because they are not a list."
        );
        continue;
      }

      var choices = [];
      var choiceIndex;
      for (choiceIndex = 0; choiceIndex < group.choices.length; choiceIndex++) {
        var choice = group.choices[choiceIndex];
        var choicePlace = groupName + " choice " + (choiceIndex + 1);
        if (!isRecord(choice)) {
          problems.push(
            snackName + "'s " + choicePlace + " was skipped because it is not a choice."
          );
          continue;
        }
        var choiceId = textOf(choice.id);
        var choiceName = textOf(choice.name);
        if (!choiceId || !choiceName) {
          problems.push(
            snackName + "'s " + (choiceName || choiceId || choicePlace) + " was skipped because it needs a name and an id."
          );
          continue;
        }
        if (!isSafeId(choiceId)) {
          problems.push(
            snackName +
              "'s " +
              choiceName +
              " was skipped because its id can only use letters, numbers, and dashes."
          );
          continue;
        }
        if (seenChoiceIds[choiceId]) {
          problems.push(
            snackName +
              "'s " +
              choiceName +
              ' was skipped because another choice already uses the id "' +
              choiceId +
              '".'
          );
          continue;
        }
        seenChoiceIds[choiceId] = true;
        choices.push({
          id: choiceId,
          name: choiceName,
          icon: typeof choice.icon === "string" ? textOf(choice.icon) : "",
          emoji: typeof choice.emoji === "string" ? choice.emoji : ""
        });
      }

      if (choices.length === 0) {
        problems.push(
          snackName + "'s " + groupName + " group was skipped because it has no choices left."
        );
        continue;
      }

      seenGroupIds[groupId] = true;
      groups.push({
        id: groupId,
        name: textOf(group.name) || groupId,
        pick: pick,
        choices: choices
      });
    }

    return { groups: groups, problems: problems };
  }

  function hasOptions(item) {
    return !!(item && item.optionGroups && item.optionGroups.length > 0);
  }

  // Keep choices in menu order, and keep exactly one flavor selected.
  // Tap order does not matter, so two burgers with the same toppings match.
  function normalize(groups, chosen) {
    var picked = {};
    var i;
    var list = chosen || [];
    for (i = 0; i < list.length; i++) {
      picked[list[i]] = true;
    }
    var ids = [];
    for (i = 0; i < groups.length; i++) {
      var group = groups[i];
      var c;
      if (group.pick === "one") {
        var found = "";
        for (c = 0; c < group.choices.length; c++) {
          if (picked[group.choices[c].id]) {
            found = group.choices[c].id;
            break;
          }
        }
        // Add is never blocked. A flavor with nothing picked uses the first one.
        ids.push(found || group.choices[0].id);
      } else {
        for (c = 0; c < group.choices.length; c++) {
          if (picked[group.choices[c].id]) {
            ids.push(group.choices[c].id);
          }
        }
      }
    }
    return ids;
  }

  // The first flavor starts selected. Toppings start off, which reads as "Plain".
  function defaults(groups) {
    return normalize(groups, []);
  }

  // Small text under the snack name. "Plain" means no toppings were chosen.
  // A snack with no options at all returns "" so the ticket stays one line.
  function detailsText(groups, optionIds) {
    if (!groups || groups.length === 0) {
      return "";
    }
    var chosen = {};
    var i;
    var list = optionIds || [];
    for (i = 0; i < list.length; i++) {
      chosen[list[i]] = true;
    }
    var names = [];
    for (i = 0; i < groups.length; i++) {
      var group = groups[i];
      var c;
      for (c = 0; c < group.choices.length; c++) {
        if (chosen[group.choices[c].id]) {
          names.push(group.choices[c].name);
        }
      }
    }
    if (names.length === 0) {
      return "Plain";
    }
    return names.join(", ");
  }

  // Snack id plus the chosen ids, in menu order.
  // "burger|" is plain. "burger|ketchup,pickles" is a different line.
  function lineKey(itemId, optionIds) {
    return itemId + "|" + (optionIds || []).join(",");
  }

  // ----------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------

  function clearChildren(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  // Same idea as the menu pictures: try the drawing, keep the emoji if it is missing.
  function fillPicture(container, image, emoji, label) {
    clearChildren(container);
    var emojiEl = document.createElement("span");
    emojiEl.className = "emoji";
    emojiEl.setAttribute("aria-hidden", "true");
    emojiEl.textContent = emoji || "";
    container.appendChild(emojiEl);

    if (!image) {
      return;
    }

    var img = document.createElement("img");
    img.alt = "";
    img.hidden = true;
    img.addEventListener("load", function () {
      img.hidden = false;
      emojiEl.hidden = true;
    });
    img.addEventListener("error", function () {
      img.hidden = true;
      emojiEl.hidden = false;
      if (!missingIcons[image]) {
        missingIcons[image] = true;
        console.warn(
          (label || "An option") +
            "'s icon didn't load (" +
            image +
            "). " +
            (emoji ? "The emoji is showing instead." : "The name is showing instead.")
        );
      }
    });
    // setAttribute keeps the path relative (img.src would store a full address).
    img.setAttribute("src", image);
    container.appendChild(img);
  }

  function choiceIsOn(button) {
    return button.getAttribute("aria-pressed") === "true" || button.getAttribute("aria-checked") === "true";
  }

  function setChoiceOn(button, on) {
    var pick = button.getAttribute("data-pick");
    if (pick === "one") {
      button.setAttribute("aria-checked", on ? "true" : "false");
      button.tabIndex = on ? 0 : -1;
    } else {
      button.setAttribute("aria-pressed", on ? "true" : "false");
    }
    button.classList.toggle("is-selected", on);
    var mark = button.querySelector(".option-mark");
    if (mark) {
      mark.hidden = !on;
    }
  }

  function selectRadio(button) {
    var grid = button.closest(".options-choice-grid");
    if (!grid) {
      return;
    }
    var radios = grid.querySelectorAll('[data-pick="one"]');
    var i;
    for (i = 0; i < radios.length; i++) {
      setChoiceOn(radios[i], radios[i] === button);
    }
  }

  function makeChoiceButton(group, choice, on) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "option-button";
    button.setAttribute("data-option-id", choice.id);
    button.setAttribute("data-group", group.id);
    button.setAttribute("data-pick", group.pick);

    if (group.pick === "one") {
      // Pick one. Arrow keys move the selection. The pressed state
      // would be wrong here, because these are not on/off toggles.
      button.setAttribute("role", "radio");
    }

    var icon = document.createElement("span");
    icon.className = "option-icon";
    icon.setAttribute("aria-hidden", "true");
    fillPicture(icon, choice.icon, choice.emoji, choice.name);

    var name = document.createElement("span");
    name.className = "option-name";
    name.textContent = choice.name;

    // A check, not just a color, so a chosen topping is obvious.
    var mark = document.createElement("span");
    mark.className = "option-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "\u2713";

    button.appendChild(mark);
    button.appendChild(icon);
    button.appendChild(name);
    setChoiceOn(button, on);
    return button;
  }

  function render(options) {
    var item = options.item;
    var selected = {};
    var ids = normalize(item.optionGroups, options.selectedIds || []);
    var i;
    for (i = 0; i < ids.length; i++) {
      selected[ids[i]] = true;
    }

    session = {
      item: item,
      onConfirm: options.onConfirm,
      onCancel: options.onCancel,
      closed: false
    };

    titleEl.textContent = item.name;
    fillPicture(pictureEl, item.image, item.emoji, item.name);
    addLabel.textContent = options.confirmLabel || "Add to Ticket";
    clearChildren(groupsEl);

    for (i = 0; i < item.optionGroups.length; i++) {
      var group = item.optionGroups[i];
      var block = document.createElement("section");
      block.className = "options-group";

      var heading = document.createElement("h3");
      heading.className = "options-group-name";
      heading.id = "options-label-" + group.id;
      heading.textContent = group.name;

      var grid = document.createElement("div");
      grid.className = "options-choice-grid";
      if (group.pick === "one") {
        grid.setAttribute("role", "radiogroup");
      } else {
        grid.setAttribute("role", "group");
      }
      grid.setAttribute("aria-labelledby", heading.id);

      var c;
      for (c = 0; c < group.choices.length; c++) {
        var choice = group.choices[c];
        grid.appendChild(makeChoiceButton(group, choice, !!selected[choice.id]));
      }

      block.appendChild(heading);
      block.appendChild(grid);
      groupsEl.appendChild(block);
    }
  }

  function chosenIds() {
    var ids = [];
    var buttons = groupsEl.querySelectorAll("button");
    var i;
    for (i = 0; i < buttons.length; i++) {
      if (choiceIsOn(buttons[i])) {
        ids.push(buttons[i].getAttribute("data-option-id"));
      }
    }
    return ids;
  }

  function closeSession() {
    var current = session;
    session = null;
    return current;
  }

  function confirm() {
    var current = session;
    if (!current || current.closed) {
      return;
    }
    current.closed = true;
    var ids = chosenIds();
    closeSession();
    current.onConfirm(ids);
  }

  function cancel() {
    var current = session;
    if (!current || current.closed) {
      return;
    }
    current.closed = true;
    closeSession();
    current.onCancel();
  }

  function moveRadio(current, direction) {
    var grid = current.closest(".options-choice-grid");
    if (!grid) {
      return;
    }
    var radios = grid.querySelectorAll('[data-pick="one"]');
    if (!radios.length) {
      return;
    }
    var index = 0;
    var i;
    for (i = 0; i < radios.length; i++) {
      if (radios[i] === current) {
        index = i;
      }
    }
    var next = index;
    if (direction === "next") {
      next = (index + 1) % radios.length;
    } else if (direction === "prev") {
      next = (index - 1 + radios.length) % radios.length;
    } else if (direction === "first") {
      next = 0;
    } else if (direction === "last") {
      next = radios.length - 1;
    }
    selectRadio(radios[next]);
    radios[next].focus();
  }

  groupsEl.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button || !groupsEl.contains(button)) {
      return;
    }
    if (button.getAttribute("data-pick") === "one") {
      // Clicking the flavor that is already picked leaves it picked.
      selectRadio(button);
      return;
    }
    setChoiceOn(button, button.getAttribute("aria-pressed") !== "true");
  });

  groupsEl.addEventListener("keydown", function (event) {
    var button = event.target.closest("button");
    if (!button || button.getAttribute("data-pick") !== "one") {
      return;
    }
    var direction = "";
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      direction = "next";
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      direction = "prev";
    } else if (event.key === "Home") {
      direction = "first";
    } else if (event.key === "End") {
      direction = "last";
    } else {
      return;
    }
    // Keep the arrow key from scrolling the choices list.
    event.preventDefault();
    moveRadio(button, direction);
  });

  addButton.addEventListener("click", confirm);
  backButton.addEventListener("click", cancel);

  // Escape is the keyboard version of Back. It adds nothing.
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !session || screen.hidden) {
      return;
    }
    event.preventDefault();
    cancel();
  });

  window.SnackOptions = {
    clean: clean,
    hasOptions: hasOptions,
    normalize: normalize,
    defaults: defaults,
    detailsText: detailsText,
    lineKey: lineKey,
    render: render
  };
})();
