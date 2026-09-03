const MODULE_ID = "shadowdark-crossbow-reload";
const FLAG_LOADED = "loaded";

function getRollConfig(source) {
  return source?.flags?.shadowdark?.rollConfig
    ?? source?._source?.flags?.shadowdark?.rollConfig
    ?? null;
}

function isAttack(config) {
  return Boolean(config?.attack);
}

function isCrossbow(item) {
  if (!item) return false;
  if (String(item.type).toLowerCase() !== "weapon") return false;

  const candidates = [
    item.name,
    item.system?.baseWeapon,
    item.system?.base_weapon,
    item.system?.weaponType,
    item.system?.weapon,
    item.system?.type
  ];

  return candidates.some(value => String(value ?? "").toLowerCase().includes("crossbow"));
}

function isLoaded(item) {
  // Existing crossbows default to loaded until they have been fired once.
  return item?.getFlag(MODULE_ID, FLAG_LOADED) !== false;
}

async function setLoaded(item, loaded) {
  if (!item) return;
  await item.setFlag(MODULE_ID, FLAG_LOADED, Boolean(loaded));
}

async function resolveItem(uuid) {
  if (!uuid) return null;

  // Embedded actor items can normally be resolved synchronously in Foundry 14.
  try {
    if (typeof fromUuidSync === "function") {
      const syncDoc = fromUuidSync(uuid);
      if (syncDoc?.documentName === "Item") return syncDoc;
    }
  } catch (err) {
    // Fall through to async resolution.
  }

  try {
    const doc = await fromUuid(uuid);
    return doc?.documentName === "Item" ? doc : null;
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not resolve item ${uuid}`, err);
    return null;
  }
}

function canControlItem(item) {
  return Boolean(item && (item.isOwner || game.user.isGM));
}

function getRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function getAttackItem(app, attackRow) {
  if (!app?.actor || !attackRow) return null;

  // The outer attack row contains the embedded item id in Shadowdark 4.0.6.
  const itemId = attackRow.dataset.itemId;
  if (itemId) {
    const item = app.actor.items?.get(itemId);
    if (item) return item;
  }

  return null;
}

function addSheetControls(app, root) {
  if (!app?.actor || !root) return;

  const attackRows = root.querySelectorAll(".attack.item[data-item-id]");

  for (const row of attackRows) {
    const item = getAttackItem(app, row);
    if (!isCrossbow(item)) continue;

    row.classList.add("sdcr-crossbow-row");
    row.dataset.sdcrLoaded = String(isLoaded(item));

    // Remove stale controls if this is an in-place refresh.
    row.querySelector(".sdcr-sheet-controls")?.remove();

    const attackLink = row.querySelector("[data-action='item-attack']");
    if (!attackLink) continue;

    if (isLoaded(item)) {
      attackLink.classList.remove("sdcr-disabled-attack");
      attackLink.removeAttribute("aria-disabled");
      attackLink.removeAttribute("data-tooltip");
      continue;
    }

    attackLink.classList.add("sdcr-disabled-attack");
    attackLink.setAttribute("aria-disabled", "true");
    attackLink.dataset.tooltip = `${item.name} is unloaded. Reload before attacking.`;

    const controls = document.createElement("div");
    controls.className = "sdcr-sheet-controls";
    controls.innerHTML = `
      <span class="sdcr-sheet-status">
        <i class="fa-solid fa-triangle-exclamation"></i>
        UNLOADED
      </span>
      <button
        type="button"
        class="sdcr-reload-button"
        data-item-id="${item.id}"
        ${canControlItem(item) ? "" : "disabled"}
      >
        <i class="fa-solid fa-arrows-rotate"></i>
        Reload
      </button>
    `;

    attackLink.insertAdjacentElement("afterend", controls);
  }
}

async function reloadItem(item, app = null) {
  if (!item) return;

  if (!canControlItem(item)) {
    ui.notifications.warn(`You do not have permission to reload ${item.name}.`);
    return;
  }

  if (isLoaded(item)) {
    ui.notifications.info(`${item.name} is already loaded.`);
    return;
  }

  await setLoaded(item, true);

  const actorName = item.actor?.name ?? "A character";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: item.actor }),
    content: `<p><strong>${foundry.utils.escapeHTML(actorName)}</strong> spends their movement reloading their ${foundry.utils.escapeHTML(item.name)}.</p>`
  });

  // Foundry generally rerenders the actor sheet after an embedded item flag update,
  // but explicitly repaint this sheet as well for immediate feedback.
  if (app?.rendered) app.render(false);
}

function installSheetClickInterceptor(app, root) {
  if (!app?.actor || !root || root.dataset.sdcrInterceptor === "true") return;
  root.dataset.sdcrInterceptor = "true";

  /*
   * Capture phase is intentional. Shadowdark 4.0.6 binds its normal attack roll
   * listener during sheet activation. Capturing the click lets us stop an unloaded
   * crossbow before that listener receives the event, so no attack roll is started.
   */
  root.addEventListener("click", event => {
    const reloadButton = event.target.closest?.(".sdcr-reload-button");
    if (reloadButton && root.contains(reloadButton)) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const item = app.actor.items?.get(reloadButton.dataset.itemId);
      if (isCrossbow(item)) void reloadItem(item, app);
      return;
    }

    const attackLink = event.target.closest?.("[data-action='item-attack']");
    if (!attackLink || !root.contains(attackLink)) return;

    const row = attackLink.closest(".attack.item[data-item-id]");
    const item = getAttackItem(app, row);
    if (!isCrossbow(item) || isLoaded(item)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    ui.notifications.warn(`${item.name} is unloaded. Click Reload before firing again.`);
  }, true);
}

function enhancePlayerSheet(app, html) {
  if (game.system.id !== "shadowdark") return;
  const root = getRoot(html);
  if (!root) return;

  installSheetClickInterceptor(app, root);
  addSheetControls(app, root);
}

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing v0.3.0`);
});

Hooks.once("ready", () => {
  if (game.system.id !== "shadowdark") {
    console.warn(`${MODULE_ID} | This module only supports the Shadowdark system.`);
    return;
  }

  game.modules.get(MODULE_ID).api = {
    isCrossbow,
    isLoaded,
    setLoaded,
    reloadItem,
    async reloadSelected() {
      const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
      if (!actor) {
        ui.notifications.warn("Select a token or assign a character first.");
        return;
      }

      const crossbows = actor.items.filter(isCrossbow);
      if (!crossbows.length) {
        ui.notifications.warn(`${actor.name} has no crossbow.`);
        return;
      }

      await reloadItem(crossbows[0]);
    }
  };

  console.log(`${MODULE_ID} | Ready for Foundry 14 / Shadowdark 4.0.6`);
});

// Shadowdark's PlayerSheetSD is an ApplicationV1 actor sheet in 4.0.6.
// Register both hooks so the enhancement remains resilient to Foundry's hook naming.
Hooks.on("renderPlayerSheetSD", enhancePlayerSheet);
Hooks.on("renderActorSheet", enhancePlayerSheet);

/**
 * When a valid crossbow attack creates its Shadowdark roll card, mark the exact
 * weapon as unloaded. This is no longer used to block attacks; blocking happens
 * on the character sheet before Shadowdark receives the click.
 */
Hooks.on("preCreateChatMessage", (message, data, options, userId) => {
  if (userId !== game.user.id) return;

  const config = getRollConfig(data) ?? getRollConfig(message);
  if (!isAttack(config) || !config?.itemUuid) return;

  // Hook callbacks are synchronous from Foundry's perspective, so do the flag
  // update asynchronously without trying to cancel chat-message creation.
  void (async () => {
    const item = await resolveItem(config.itemUuid);
    if (!isCrossbow(item)) return;

    await setLoaded(item, false);
    console.log(`${MODULE_ID} | ${item.name} fired and is now unloaded.`);
  })();
});
