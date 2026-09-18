require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const crypto = require("crypto");
const path = require("path");

const { createBot } = require("./bot/client");
const { scanMessage } = require("./bot/modFilter");
const db = require("./db");

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const PASSCODE = process.env.DASHBOARD_PASSCODE || "changeme123";
const PORT = process.env.PORT || 3000;

if (!TOKEN || !GUILD_ID) {
  console.error("Missing DISCORD_TOKEN or GUILD_ID in .env — see .env.example");
  process.exit(1);
}

const sessions = new Set();

const bot = createBot({
  token: TOKEN,
  guildId: GUILD_ID,
  onMessage: (msg) => {
    db.bumpChannelCount(msg.channelId);
    const reasons = scanMessage(msg);
    if (reasons.length) {
      db.addFlag({
        channelId: msg.channelId,
        messageId: msg.id,
        authorTag: msg.author.tag,
        content: msg.content.slice(0, 500),
        reason: reasons.join(", "),
      });
      db.addActivity("mod", `message from ${msg.author.tag} flagged: ${reasons.join(", ")}`);
    }
  },
  onVoiceUpdate: (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!oldState.channelId && newState.channelId) {
      db.addActivity("voice", `${member.displayName} joined voice: ${newState.channel.name}`);
    } else if (oldState.channelId && !newState.channelId) {
      db.addActivity("voice", `${member.displayName} left voice`);
    }
  },
  onMemberUpdate: (type, member) => {
    db.addActivity("member", `${member.displayName || member.user.tag} ${type === "join" ? "joined the server" : "left the server"}`);
  },
});

// real daily(ish) member-count snapshot for the growth chart — starts accumulating from now
cron.schedule("0 * * * *", () => {
  try {
    db.addSnapshot(bot.getGuild().memberCount);
  } catch (e) {
    /* bot not ready yet */
  }
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  const token = req.headers["authorization"]?.replace("Bearer ", "");
  if (!token || !sessions.has(token)) return res.status(401).json({ error: "unauthorized" });
  next();
}

app.post("/api/auth", (req, res) => {
  const { passcode } = req.body;
  if (passcode !== PASSCODE) return res.status(403).json({ error: "wrong passcode" });
  const token = crypto.randomBytes(24).toString("hex");
  sessions.add(token);
  res.json({ token });
});

app.get("/api/stats", requireAuth, (req, res) => {
  res.json(bot.getStats());
});

app.get("/api/roles", requireAuth, (req, res) => {
  res.json(bot.getRoles());
});

app.get("/api/voice", requireAuth, (req, res) => {
  res.json(bot.getVoiceChannels());
});

app.get("/api/channels", requireAuth, (req, res) => {
  res.json(bot.getTextChannels());
});

app.get("/api/channels/top", requireAuth, (req, res) => {
  res.json(bot.getTopChannels(5, db.getChannelCounts()));
});

app.get("/api/growth", requireAuth, (req, res) => {
  res.json(db.getSnapshots(30));
});

app.get("/api/feed", requireAuth, (req, res) => {
  res.json(db.getActivity(30));
});

app.get("/api/mod", requireAuth, (req, res) => {
  res.json(db.getPendingFlags());
});

app.post("/api/mod/:id/resolve", requireAuth, async (req, res) => {
  const { action } = req.body; // "approve" | "remove"
  const id = Number(req.params.id);
  const flags = db.getPendingFlags();
  const flag = flags.find((f) => f.id === id);
  if (!flag) return res.status(404).json({ error: "not found" });

  if (action === "remove") {
    try {
      await bot.deleteMessage(flag.channel_id, flag.message_id);
    } catch (e) {
      // message may already be gone — still resolve the queue item
    }
  }
  db.resolveFlag(id, action);
  db.addActivity("mod", `you ${action === "approve" ? "cleared" : "removed"} a flagged message from ${flag.author_tag}`);
  res.json({ ok: true });
});

app.post("/api/announce", requireAuth, async (req, res) => {
  const { channelId, text } = req.body;
  if (!channelId || !text) return res.status(400).json({ error: "channelId and text required" });
  try {
    await bot.sendAnnouncement(channelId, text);
    db.addActivity("announce", `you posted an announcement`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/invite", requireAuth, async (req, res) => {
  try {
    const url = await bot.createInvite(req.body.channelId);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

bot.login().then(() => {
  app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
});
