import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";
import "dotenv/config";
import fs from "node:fs";
import http from "node:http";
import config from "../config.json" with { type: "json" };

// ---------- Mini webserver voor Render (free Web Service checkt een poort) ----------
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Tier Queue Bot is running ✅");
  })
  .listen(PORT, () => console.log(`🌐 Webserver luistert op poort ${PORT}`));

// ---------- State (wordt opgeslagen in queue.json) ----------
const STATE_FILE = new URL("../queue.json", import.meta.url);

let state = {
  open: false,
  channelId: null,
  messageId: null,
  queue: [], // [{ id, username, joinedAt }]
  lastSession: null, // ISO string
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      state = { ...state, ...data };
    }
  } catch (e) {
    console.error("Kon queue.json niet laden:", e);
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("Kon queue.json niet opslaan:", e);
  }
}

loadState();

// ---------- Helpers ----------
function formatLastSession() {
  if (!state.lastSession) return "nog geen";
  const d = new Date(state.lastSession);
  // bv: "10 oktober 2026 om 16:57" zoals in je screenshot
  return (
    d.toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }) +
    " om " +
    d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
  );
}

function buildEmbed() {
  const count = state.queue.length;

  if (!state.open) {
    return new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(config.serverTitle)
      .setDescription(
        `**Queue Gesloten**\nEr is momenteel geen tier-test queue open.\nCheck back later!`
      )
      .setFooter({ text: `Last testing session: ${formatLastSession()}` })
      .setTimestamp();
  }

  let description = "";
  if (count === 0) {
    // Tekst zoals in je screenshot
    description =
      `**No Testers Online**\n` +
      `No testers for your gamemode are available at this time.\n` +
      `You will be pinged when a tester is available.\n` +
      `Check back later!`;
  } else {
    description = `**🟢 ${count} in Queue**\n\n`;
    const shown = state.queue.slice(0, config.maxQueueShown ?? 10);
    shown.forEach((entry, i) => {
      const unix = Math.floor(new Date(entry.joinedAt).getTime() / 1000);
      description += `${i + 1}. <@${entry.id}> - <t:${unix}:R>\n`;
    });
    if (count > shown.length) {
      description += `\n*...en nog ${count - shown.length} andere*`;
    }
    description += `\nKlik **Leave Queue** als je eruit wilt.`;
  }

  return new EmbedBuilder()
    .setColor(0xed4245) // rode streep links zoals SubTiers
    .setTitle(config.serverTitle)
    .setDescription(description)
    .setFooter({ text: `Last testing session: ${formatLastSession()}` })
    .setTimestamp();
}

function buildButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("queue_join")
      .setLabel("Join Queue")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || !state.open),
    new ButtonBuilder()
      .setCustomId("queue_leave")
      .setLabel("Leave Queue")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || !state.open)
  );
}

async function refreshQueueMessage(client) {
  if (!state.channelId || !state.messageId) return;
  try {
    const channel = await client.channels.fetch(state.channelId);
    if (!channel?.isTextBased()) return;
    const msg = await channel.messages.fetch(state.messageId);
    await msg.edit({ embeds: [buildEmbed()], components: [buildButtons(!state.open)] });
  } catch (e) {
    console.error("Kon queue-bericht niet updaten (misschien verwijderd):", e.message);
  }
}

function isTesterOrAdmin(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const testerName = (config.testerRoleName ?? "Tester").toLowerCase();
  return member.roles.cache.some((r) => r.name.toLowerCase() === testerName);
}

// ---------- Slash commands ----------
const commands = [
  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Beheer de tier-test queue")
    .addSubcommand((s) =>
      s.setName("start").setDescription("Open een nieuwe queue in dit kanaal (admin)")
    )
    .addSubcommand((s) =>
      s.setName("stop").setDescription("Sluit de queue (admin)")
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("Bekijk wie er in de queue staat")
    )
    .addSubcommand((s) =>
      s.setName("clear").setDescription("Maak de queue leeg (admin)")
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("next")
    .setDescription("Haal de eerstvolgende uit de queue op (tester)")
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log("✓ Slash commands geregistreerd: /queue start|stop|list|clear, /next");
}

// ---------- Client ----------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`✓ Ingelogd als ${client.user.tag}`);
  // Herstel knoppen na herstart (als queue nog open was)
  await refreshQueueMessage(client);
});

client.on("interactionCreate", async (interaction) => {
  try {
    // ----- Buttons -----
    if (interaction.isButton()) {
      if (interaction.customId === "queue_join") {
        if (!state.open) {
          return interaction.reply({ content: "❌ De queue is gesloten.", ephemeral: true });
        }
        if (state.queue.some((e) => e.id === interaction.user.id)) {
          const pos = state.queue.findIndex((e) => e.id === interaction.user.id) + 1;
          return interaction.reply({
            content: `Je staat al in de queue op positie **#${pos}**.`,
            ephemeral: true,
          });
        }
        state.queue.push({
          id: interaction.user.id,
          username: interaction.user.username,
          joinedAt: new Date().toISOString(),
        });
        saveState();
        await refreshQueueMessage(interaction.client);
        return interaction.reply({
          content: `✅ Je bent toegevoegd! Positie **#${state.queue.length}**. Je wordt gepingd als een tester je ophaalt.`,
          ephemeral: true,
        });
      }

      if (interaction.customId === "queue_leave") {
        const idx = state.queue.findIndex((e) => e.id === interaction.user.id);
        if (idx === -1) {
          return interaction.reply({ content: "Je staat niet in de queue.", ephemeral: true });
        }
        state.queue.splice(idx, 1);
        saveState();
        await refreshQueueMessage(interaction.client);
        return interaction.reply({ content: "👋 Je bent uit de queue gehaald.", ephemeral: true });
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    // ----- /queue -----
    if (interaction.commandName === "queue") {
      const sub = interaction.options.getSubcommand();

      if (sub === "start") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: "❌ Alleen admins kunnen de queue starten.", ephemeral: true });
        }
        if (state.open) {
          return interaction.reply({ content: "❌ Er is al een queue open.", ephemeral: true });
        }
        state.open = true;
        state.channelId = interaction.channelId;
        state.queue = [];
        state.lastSession = new Date().toISOString();
        saveState();

        const msg = await interaction.reply({
          embeds: [buildEmbed()],
          components: [buildButtons(false)],
          fetchReply: true,
        });
        state.messageId = msg.id;
        saveState();
        return;
      }

      if (sub === "stop") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: "❌ Alleen admins kunnen de queue stoppen.", ephemeral: true });
        }
        if (!state.open) {
          return interaction.reply({ content: "Er is geen queue open.", ephemeral: true });
        }
        state.open = false;
        state.lastSession = new Date().toISOString();
        saveState();
        await refreshQueueMessage(interaction.client);
        return interaction.reply({ content: "🔒 Queue gesloten.", ephemeral: true });
      }

      if (sub === "list") {
        if (state.queue.length === 0) {
          return interaction.reply({
            content: state.open ? "De queue is leeg." : "Er is geen queue open.",
            ephemeral: true,
          });
        }
        const lines = state.queue
          .slice(0, 20)
          .map((e, i) => `${i + 1}. <@${e.id}> (${e.username})`);
        return interaction.reply({
          content: `**Queue (${state.queue.length}):**\n${lines.join("\n")}`,
          ephemeral: true,
        });
      }

      if (sub === "clear") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: "❌ Alleen admins kunnen de queue legen.", ephemeral: true });
        }
        state.queue = [];
        saveState();
        await refreshQueueMessage(interaction.client);
        return interaction.reply({ content: "🧹 Queue geleegd.", ephemeral: true });
      }
    }

    // ----- /next (tester haalt eerstvolgende op) -----
    if (interaction.commandName === "next") {
      if (!isTesterOrAdmin(interaction.member)) {
        return interaction.reply({
          content: `❌ Alleen mensen met de rol **${config.testerRoleName}** (of admins) kunnen dit.`,
          ephemeral: true,
        });
      }
      if (!state.open) {
        return interaction.reply({ content: "Er is geen queue open.", ephemeral: true });
      }
      if (state.queue.length === 0) {
        return interaction.reply({ content: "De queue is leeg, niemand om op te halen.", ephemeral: true });
      }
      const nextUp = state.queue.shift();
      state.lastSession = new Date().toISOString();
      saveState();
      await refreshQueueMessage(interaction.client);
      return interaction.reply({
        content: `⚔️ <@${interaction.user.id}> haalt <@${nextUp.id}> op! (${state.queue.length} over in queue)\n<@${nextUp.id}>, join het test-kanaal / stuur je tester een bericht!`,
      });
    }
  } catch (e) {
    console.error(e);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Er ging iets mis.", ephemeral: true });
    }
  }
});

// ---------- Start ----------
console.log(`ENV check: DISCORD_TOKEN ${process.env.DISCORD_TOKEN ? "aanwezig ✅" : "ONTBREEKT ❌"}, CLIENT_ID ${process.env.CLIENT_ID ? "aanwezig ✅" : "ONTBREEKT ❌"}`);
if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error("❌ Zet DISCORD_TOKEN en CLIENT_ID als Environment Variables in Render (Environment tab), niet alleen in .env");
  process.exit(1);
}

try {
  await registerCommands();
  await client.login(process.env.DISCORD_TOKEN);
} catch (e) {
  console.error("❌ Bot kon niet inloggen/starten:", e?.message ?? e);
  if (String(e?.message ?? "").includes("disallowed intents")) {
    console.error("→ Zet in Discord Developer Portal onder Bot geen privileged intents aan (deze bot heeft alleen Guilds nodig).");
  }
  if (String(e?.code ?? "") === "TokenInvalid" || String(e?.message ?? "").includes("invalid token")) {
    console.error("→ Je DISCORD_TOKEN is ongeldig/verlopen. Maak een nieuwe via Developer Portal → Bot → Reset Token en update hem in Render.");
  }
  process.exit(1);
}
