const { Client, GatewayIntentBits, Partials, ChannelType } = require("discord.js");

function createBot({ token, guildId, onMessage, onVoiceUpdate, onMemberUpdate }) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  let guild = null;

  client.once("ready", async () => {
    guild = await client.guilds.fetch(guildId);
    await guild.members.fetch(); // populate member cache (needed for real counts/roles)
    console.log(`[bot] logged in as ${client.user.tag}, watching guild ${guild.name}`);
  });

  client.on("messageCreate", (msg) => {
    if (msg.author.bot) return;
    if (onMessage) onMessage(msg);
  });

  client.on("voiceStateUpdate", (oldState, newState) => {
    if (onVoiceUpdate) onVoiceUpdate(oldState, newState);
  });

  client.on("guildMemberAdd", (member) => {
    if (onMemberUpdate) onMemberUpdate("join", member);
  });
  client.on("guildMemberRemove", (member) => {
    if (onMemberUpdate) onMemberUpdate("leave", member);
  });

  function getGuild() {
    if (!guild) throw new Error("bot not ready yet");
    return guild;
  }

  // ---- real data readers, no mock values ----

  function getStats() {
    const g = getGuild();
    const online = g.members.cache.filter((m) => m.presence && m.presence.status !== "offline").size;
    return {
      memberCount: g.memberCount,
      onlineCount: online,
      channelCount: g.channels.cache.filter((c) => c.type !== ChannelType.GuildCategory).size,
      roleCount: g.roles.cache.size,
    };
  }

  function getRoles() {
    const g = getGuild();
    return g.roles.cache
      .filter((r) => r.name !== "@everyone")
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.hexColor === "#000000" ? "#99a1af" : r.hexColor,
        count: r.members.size,
      }));
  }

  function getVoiceChannels() {
    const g = getGuild();
    return g.channels.cache
      .filter((c) => c.type === ChannelType.GuildVoice)
      .map((c) => ({
        id: c.id,
        name: c.name,
        members: c.members.map((m) => ({
          id: m.id,
          name: m.displayName,
        })),
      }));
  }

  function getTopChannels(limit = 5, counts) {
    const g = getGuild();
    return g.channels.cache
      .filter((c) => c.type === ChannelType.GuildText)
      .map((c) => ({ name: c.name, id: c.id, messages: counts[c.id] || 0 }))
      .sort((a, b) => b.messages - a.messages)
      .slice(0, limit);
  }

  async function sendAnnouncement(channelId, text) {
    const g = getGuild();
    const channel = await g.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) throw new Error("invalid channel");
    return channel.send(text);
  }

  async function createInvite(channelId) {
    const g = getGuild();
    const channel = channelId
      ? await g.channels.fetch(channelId)
      : g.channels.cache.find((c) => c.type === ChannelType.GuildText);
    const invite = await channel.createInvite({ maxAge: 86400, maxUses: 0, unique: true });
    return `https://discord.gg/${invite.code}`;
  }

  async function deleteMessage(channelId, messageId) {
    const g = getGuild();
    const channel = await g.channels.fetch(channelId);
    const msg = await channel.messages.fetch(messageId);
    await msg.delete();
  }

  function getTextChannels() {
    const g = getGuild();
    return g.channels.cache
      .filter((c) => c.type === ChannelType.GuildText)
      .map((c) => ({ id: c.id, name: c.name }));
  }

  return {
    client,
    login: () => client.login(token),
    getGuild,
    getStats,
    getRoles,
    getVoiceChannels,
    getTopChannels,
    getTextChannels,
    sendAnnouncement,
    createInvite,
    deleteMessage,
  };
}

module.exports = { createBot };
