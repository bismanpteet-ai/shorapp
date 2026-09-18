(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $all = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var token = sessionStorage.getItem("shor_token") || null;
  var gate = $("#gate"), cr = $("#cr");

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (token) opts.headers["Authorization"] = "Bearer " + token;
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { logout(); throw new Error("unauthorized"); }
      return r.json();
    });
  }

  function toast(msg) {
    var wrap = $("#toastWrap");
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function logout() {
    token = null;
    sessionStorage.removeItem("shor_token");
    gate.classList.add("is-open");
    cr.classList.remove("is-open");
  }

  function login(passcode) {
    return fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: passcode }),
    }).then(function (r) {
      if (!r.ok) throw new Error("bad passcode");
      return r.json();
    }).then(function (data) {
      token = data.token;
      sessionStorage.setItem("shor_token", token);
      gate.classList.remove("is-open");
      cr.classList.add("is-open");
      boot();
    });
  }

  $("#gateUnlock").addEventListener("click", function () {
    var val = $("#gateInput").value;
    login(val).catch(function () { $("#gateMsg").classList.add("is-shown"); });
  });
  $("#gateInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("#gateUnlock").click();
  });
  $("#lockBtn").addEventListener("click", logout);

  // nav switching
  $all(".cr__nav button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      $all(".cr__nav button").forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      var sec = btn.dataset.sec;
      $all(".cr__section").forEach(function (s) { s.hidden = true; });
      $("#sec-" + sec).hidden = false;
      $("#topTitle").textContent = btn.textContent;
    });
  });

  function timeAgo(iso) {
    var s = (Date.now() - new Date(String(iso).replace(" ", "T") + "Z").getTime()) / 1000;
    if (s < 60) return Math.floor(s) + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    return Math.floor(s / 3600) + "h ago";
  }

  function renderStats(s) {
    $("#statCards").innerHTML =
      '<div class="stat"><b>' + s.memberCount + '</b><span>members</span></div>' +
      '<div class="stat"><b>' + s.onlineCount + '</b><span>online now</span></div>' +
      '<div class="stat"><b>' + s.channelCount + '</b><span>channels</span></div>' +
      '<div class="stat"><b>' + s.roleCount + '</b><span>roles</span></div>';
  }

  function renderFeed(items) {
    $("#feed").innerHTML = items.length
      ? items.map(function (i) { return "<li>" + esc(i.text) + "<time>" + timeAgo(i.created_at) + "</time></li>"; }).join("")
      : '<li class="mod-empty">no activity yet — real events will appear here as they happen</li>';
  }

  function renderTopChannels(items) {
    var max = Math.max.apply(null, items.map(function (i) { return i.messages; }).concat([1]));
    $("#topChannels").innerHTML = items.length
      ? items.map(function (c) {
          var pct = Math.round((c.messages / max) * 100);
          return '<div class="row"><span>#' + esc(c.name) + '</span><div class="track"><div class="fill" style="width:' + pct + '%"></div></div><span class="val">' + c.messages + '</span></div>';
        }).join("")
      : '<p class="mod-empty">no messages tracked yet</p>';
  }

  function renderGrowth(points) {
    var el = $("#growthChart");
    if (points.length < 2) {
      el.innerHTML = '<p class="mod-empty">collecting real data — chart appears once there\'s enough history (snapshots are taken hourly)</p>';
      return;
    }
    var w = 560, h = 140, pad = 10;
    var vals = points.map(function (p) { return p.member_count; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var range = Math.max(max - min, 1);
    var step = (w - pad * 2) / (points.length - 1);
    var d = points.map(function (p, i) {
      var x = pad + i * step;
      var y = h - pad - ((p.member_count - min) / range) * (h - pad * 2);
      return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    el.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:160px;"><path d="' + d + '" fill="none" stroke="#35e0c4" stroke-width="2"/></svg>';
  }

  function renderVoice(channels) {
    $("#vcList").innerHTML = channels.map(function (c) {
      var body = c.members.length
        ? '<div class="vc__members">' + c.members.map(function (m) { return '<span class="avatar" title="' + esc(m.name) + '">' + esc(m.name.slice(0, 2).toUpperCase()) + '</span>'; }).join("") + '</div>'
        : '<span class="vc__empty">— empty —</span>';
      return '<div class="vc"><div class="vc__head"><b>' + esc(c.name) + '</b><span>' + c.members.length + ' in call</span></div>' + body + '</div>';
    }).join("");
  }

  function renderRoles(roles) {
    $("#rolesList").innerHTML = roles.map(function (r) {
      return '<div class="role-row"><span class="role-swatch" style="background:' + r.color + '"></span><span class="name">' + esc(r.name) + '</span><span class="count">' + r.count + ' members</span></div>';
    }).join("");
  }

  function renderMod(flags) {
    $("#modCount").textContent = flags.length + " flagged";
    $("#modQueue").innerHTML = flags.length
      ? flags.map(function (f) {
          return '<div class="mod-item" data-id="' + f.id + '"><div class="meta">' + esc(f.author_tag) + ' · ' + esc(f.reason) + ' · ' + timeAgo(f.created_at) + '</div><p>' + esc(f.content) + '</p><div class="actions"><button data-act="approve">approve</button><button data-act="remove">remove message</button></div></div>';
        }).join("")
      : '<div class="mod-empty">queue is empty — nice and quiet.</div>';
    $all("#modQueue .mod-item button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.closest(".mod-item").dataset.id;
        api("/api/mod/" + id + "/resolve", { method: "POST", body: JSON.stringify({ action: btn.dataset.act }) })
          .then(function () { toast("done"); refreshMod(); refreshFeed(); });
      });
    });
  }

  function populateChannelSelect(channels) {
    var sel = $("#announceChannel");
    sel.innerHTML = channels.map(function (c) { return '<option value="' + c.id + '">#' + esc(c.name) + '</option>'; }).join("");
  }

  $("#announceSend").addEventListener("click", function () {
    var channelId = $("#announceChannel").value;
    var text = $("#announceText").value.trim();
    if (!text) { toast("write something first"); return; }
    api("/api/announce", { method: "POST", body: JSON.stringify({ channelId: channelId, text: text }) })
      .then(function (r) {
        if (r.error) { toast(r.error); return; }
        toast("sent to Discord");
        $("#announceText").value = "";
        refreshFeed();
      });
  });

  $("#inviteGen").addEventListener("click", function () {
    api("/api/invite", { method: "POST", body: JSON.stringify({}) }).then(function (r) {
      if (r.error) { toast(r.error); return; }
      $("#inviteOut").value = r.url;
      toast("real invite generated");
    });
  });

  function refreshMod() { api("/api/mod").then(renderMod); }
  function refreshFeed() { api("/api/feed").then(renderFeed); }

  function refreshAll() {
    api("/api/stats").then(renderStats);
    api("/api/channels/top").then(renderTopChannels);
    api("/api/growth").then(renderGrowth);
    api("/api/voice").then(renderVoice);
    api("/api/roles").then(renderRoles);
    refreshFeed();
    refreshMod();
  }

  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    api("/api/channels").then(populateChannelSelect);
    refreshAll();
    setInterval(refreshAll, 5000); // poll every 5s for live-feeling updates
  }

  if (token) {
    gate.classList.remove("is-open");
    cr.classList.add("is-open");
    boot();
  }
})();
