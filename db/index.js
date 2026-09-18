const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "shor-data.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (e) {
    return { snapshots: [], modFlags: [], activity: [], channelCounts: {}, nextFlagId: 1 };
  }
}

let data = load();

function save() {
  fs.writeFileSync(FILE, JSON.stringify(data), "utf8");
}

module.exports = {
  // growth chart - real snapshots taken over time, starting from when the bot goes live
  addSnapshot(memberCount) {
    data.snapshots.push({ taken_at: new Date().toISOString(), member_count: memberCount });
    if (data.snapshots.length > 200) data.snapshots.shift();
    save();
  },
  getSnapshots(limit = 30) {
    return data.snapshots.slice(-limit);
  },

  // real moderation queue
  addFlag({ channelId, messageId, authorTag, content, reason }) {
    data.modFlags.push({
      id: data.nextFlagId++,
      channel_id: channelId,
      message_id: messageId,
      author_tag: authorTag,
      content,
      reason,
      created_at: new Date().toISOString(),
      status: "pending",
    });
    save();
  },
  getPendingFlags() {
    return data.modFlags.filter((f) => f.status === "pending").slice().reverse();
  },
  resolveFlag(id, status) {
    const f = data.modFlags.find((x) => x.id === id);
    if (f) f.status = status;
    save();
  },

  // activity feed - real events as they happen
  addActivity(kind, text) {
    data.activity.push({ kind, text, created_at: new Date().toISOString() });
    if (data.activity.length > 200) data.activity.shift();
    save();
  },
  getActivity(limit = 30) {
    return data.activity.slice(-limit).reverse();
  },

  // per-channel message counts, for a real "top channels" ranking
  bumpChannelCount(channelId) {
    data.channelCounts[channelId] = (data.channelCounts[channelId] || 0) + 1;
    save();
  },
  getChannelCounts() {
    return data.channelCounts;
  },
};
