# Shadowdark Crossbow Reload v0.3.0

Test build specifically targeted at:

- Foundry VTT 14 Stable, Build 364
- Shadowdark RPG 4.0.6

## What changed from v0.1

Reloading now lives directly on the Shadowdark character sheet instead of the attack chat card.

- A crossbow starts loaded.
- Firing it marks that exact weapon **UNLOADED**.
- The character sheet adds an **UNLOADED** status and **Reload** button beneath that crossbow.
- While unloaded, clicking the normal crossbow attack on the character sheet is intercepted before Shadowdark's attack handler runs.
- Clicking **Reload** marks the weapon loaded again and restores the normal attack control.
- The old chat-card Reload button has been removed.

## Upgrade / installation

1. Close the world or stop Foundry.
2. Delete or replace the existing `Data/modules/shadowdark-crossbow-reload` folder.
3. Extract the new ZIP so this file exists directly at:
   `Data/modules/shadowdark-crossbow-reload/module.json`
4. Start Foundry and the world.
5. Make sure **Shadowdark Crossbow Reload** is enabled under Manage Modules.

## Test checklist

1. Open a player character's **Abilities** tab with an equipped Crossbow.
2. The crossbow should initially look normal and be attackable.
3. Fire it once.
4. The sheet should update to show **UNLOADED** and a **Reload** button.
5. Click the Crossbow attack while it is unloaded.
   - No Shadowdark attack dialog or roll should start.
   - A warning should say to reload first.
6. Click **Reload** on the sheet.
7. The status/button should disappear and the Crossbow should become attackable again.
8. Other weapons should remain unaffected.

## Known scope of v0.2

The early blocking behavior is attached to attacks clicked from the Shadowdark character sheet. A hotbar attack macro or another module that calls Shadowdark's roll function directly may bypass this sheet-level blocker. That can be addressed in a later version once the normal sheet workflow is verified.

## Debug macro

To manually reload the first crossbow on a selected token (or assigned character):

```js
await game.modules.get("shadowdark-crossbow-reload").api.reloadSelected();
```


## v0.3.0
- Reloading now posts a chat message: **[Character] spends their movement reloading their [Crossbow].**
