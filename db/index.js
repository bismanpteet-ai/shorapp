const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "shor.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS member_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taken_at TEXT NOT NULL,
  member_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mod_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  author_tag TEXT NOT NULL,
  content TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS activity_feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_message_counts (
  channel_id TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);
`);

module.exports = {
  // growth chart - real snapshots taken over time, starting from when the bot goes live
  addSnapshot(memberCount) {
    db.prepare("INSERT INTO member_snapshots (taken_at, member_count) VALUES (datetime('now'), ?)").run(memberCount);
  },
  getSnapshots(limit = 30) {
    return db
      .prepare("SELECT taken_at, member_count FROM member_snapshots ORDER BY id DESC LIMIT ?")
      .all(limit)
      .reverse();
  },

  // real moderation queue
  addFlag({ channelId, messageId, authorTag, content, reason }) {
    db.prepare(
      "INSERT INTO mod_flags (channel_id, message_id, author_tag, content, reason, created_at) VALUES (?,?,?,?,?, datetime('now'))"
    ).run(channelId, messageId, authorTag, content, reason);
  },
  getPendingFlags() {
    return db.prepare("SELECT * FROM mod_flags WHERE status = 'pending' ORDER BY id DESC").all();
  },
  resolveFlag(id, status) {
    db.prepare("UPDATE mod_flags SET status = ? WHERE id = ?").run(status, id);
  },

  // activity feed - real events as they happen
  addActivity(kind, text) {
    db.prepare("INSERT INTO activity_feed (kind, text, created_at) VALUES (?, ?, datetime('now'))").run(kind, text);
    db.prepare(
      "DELETE FROM activity_feed WHERE id NOT IN (SELECT id FROM activity_feed ORDER BY id DESC LIMIT 200)"
    ).run();
  },
  getActivity(limit = 30) {
    return db.prepare("SELECT kind, text, created_at FROM activity_feed ORDER BY id DESC LIMIT ?").all(limit);
  },

  // per-channel message counts, for a real "top channels" ranking
  bumpChannelCount(channelId) {
    db.prepare(
      "INSERT INTO channel_message_counts (channel_id, count) VALUES (?, 1) ON CONFLICT(channel_id) DO UPDATE SET count = count + 1"
    ).run(channelId);
  },
  getChannelCounts() {
    const rows = db.prepare("SELECT channel_id, count FROM channel_message_counts").all();
    const map = {};
    rows.forEach((r) => (map[r.channel_id] = r.count));
    return map;
  },
};
