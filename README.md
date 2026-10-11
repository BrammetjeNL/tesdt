# Tier Queue Bot (Minecraft Tier Testing)

Bot zoals in je screenshot (SubTiers): met `/queue start` komt er een bericht met **Join Queue** knop.

## Wat doet hij?

- `/queue start` — opent queue in dit kanaal (alleen admins). Embed zoals je screenshot:
  rode streep, titel uit `config.json`, "No Testers Online" als hij leeg is, anders `X in Queue` met lijst + `Last testing session: ...`
- Knoppen onder het bericht: **Join Queue** (groen) / **Leave Queue** (rood)
- `/next` — tester haalt eerstvolgende op en pingt hem (vereist rol `Tester` uit `config.json`, of admin)
- `/queue list` — bekijk queue
- `/queue clear` — leeg queue (admin)
- `/queue stop` — sluit queue (admin)
- Queue wordt bewaard in `queue.json`, dus blijft bewaard na herstart.

## Setup (5 min)

1. Ga naar https://discord.com/developers/applications → **New Application** → naam bv. `TierQueue`
2. Tab **Bot** → **Reset Token** → kopieer token
3. Tab **General Information** → kopieer **Application ID** (= CLIENT_ID)
4. Nodig de bot uit:
   `https://discord.com/oauth2/authorize?client_id=JOUW_CLIENT_ID&permissions=277025392384&scope=bot%20applications.commands`
   (vervang `JOUW_CLIENT_ID`)
5. Maak in je server een rol aan genaamd `Tester` (of pas naam aan in `config.json`) en geef die aan je testers.
6. Installeer:
   ```bash
   npm install
   cp .env.example .env
   ```
   Vul in `.env` je `DISCORD_TOKEN` en `CLIENT_ID` in.
7. Start:
   ```bash
   npm start
   ```
   Je ziet: `✓ Slash commands geregistreerd` en `✓ Ingelogd als ...`

## Gebruik

1. In je tier-test kanaal: `/queue start`
2. Leden klikken **Join Queue**
3. Tester doet `/next` → eerstvolgende wordt gepingd en uit queue gehaald
4. Klaar? `/queue stop`

## Aanpassen

`config.json`:
```json
{
  "serverTitle": "[1.21+] Minecraft Diamond SMP PvP Community",
  "testerRoleName": "Tester",
  "maxQueueShown": 10
}
```

## Gratis hosten

- Railway / Render / Fly.io: zet `DISCORD_TOKEN` en `CLIENT_ID` als environment variables, startcommando `npm start`.
- Bot moet 24/7 aan staan om te werken.

## Problemen?

- `Used disallowed intents` → in Developer Portal onder **Bot** geen privileged intents nodig, deze bot gebruikt alleen `Guilds`.
- Commands niet zichtbaar? Wacht ~1 min of kick/re-invite de bot. Check dat je de invite-URL met `applications.commands` scope gebruikte.
