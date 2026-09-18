const INVITE_RE = /(discord\.gg|discordapp\.com\/invite)\/[a-z0-9-]+/i;
const LINK_RE = /https?:\/\/[^\s]+/gi;
const BAD_WORDS = ["scam", "nudes", "freenitro", "crypto giveaway"]; // extend as needed

function scanMessage(msg) {
  const content = msg.content || "";
  const reasons = [];

  if (INVITE_RE.test(content)) reasons.push("possible invite link");

  const links = content.match(LINK_RE) || [];
  if (links.length >= 2) reasons.push("multiple links (possible spam)");

  const lower = content.toLowerCase();
  if (BAD_WORDS.some((w) => lower.includes(w))) reasons.push("flagged keyword");

  const letters = content.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 12) {
    const caps = content.replace(/[^A-Z]/g, "").length;
    if (caps / letters.length > 0.7) reasons.push("excessive caps");
  }

  return reasons; // empty array = clean, real content, not flagged
}

module.exports = { scanMessage };
