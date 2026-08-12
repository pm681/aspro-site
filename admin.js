/* ===== ASPRO CONSTRUCTION — admin panel logic ===== */
(function () {
  const { sb, configured, CFG, C, esc, CATS } = window.ASPRO;
  const $ = (id) => document.getElementById(id);
  const bucket = (C && C.imageBucket) || "site-images";

  const loginView = $("login-view");
  const appView = $("app-view");
  const loginStatus = $("login-status");

  if (!configured || !sb) {
    loginView.innerHTML = `<div class="alert alert-err">
      Backend not configured yet. Add your Supabase URL and anon key in
      <code>config.js</code>, then reload. See DEPLOY-GUIDE.md.</div>`;
    return;
  }

  /* ---------- AUTH ---------- */
  async function refresh() {
    const { data } = await sb.auth.getSession();
    if (data.session) showApp(data.session.user); else showLogin();
  }
  function showLogin() { loginView.classList.remove("hidden"); appView.classList.add("hidden"); }
  function showApp(user) {
    loginView.classList.add("hidden"); appView.classList.remove("hidden");
    $("who").textContent = user.email;
    loadTab(currentTab);
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    loginStatus.innerHTML = "";
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Signing in...`;
    const { error } = await sb.auth.signInWithPassword({
      email: $("login-email").value.trim(),
      password: $("login-password").value
    });
    btn.disabled = false; btn.textContent = "Sign in";
    if (error) { loginStatus.innerHTML = `<div class="alert alert-err">${esc(error.message)}</div>`; return; }
    refresh();
  });

  $("logout").addEventListener("click", async () => { await sb.auth.signOut(); showLogin(); });

  /* ---------- MEDIA UPLOAD (photos compressed, videos as-is) ---------- */
  const VIDEO_MAX_MB = Number((C && C.maxVideoMB) || 50);
  const VIDEO_EXT_RE = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i;
  const isVideoFile = (f) => /^video\//i.test(f.type || "") || VIDEO_EXT_RE.test(f.name || "");
  const isVideoUrl = (window.ASPRO.isVideo) || ((u) => /\.(mp4|webm|ogv|ogg|mov|m4v)(\?.*)?$/i.test(String(u || "")));

  // Shrink big photos in the browser first: smaller uploads are faster and far
  // more likely to get past strict network filters.
  function loadImg(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  async function compressImage(file) {
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) return file; // leave other types as-is
    try {
      const url = URL.createObjectURL(file);
      const img = await loadImg(url);
      URL.revokeObjectURL(url);
      const MAX = 1600;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > MAX) { const s = MAX / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.82));
      if (blob && blob.size < file.size)
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
      return file;
    } catch (_) { return file; }
  }
  async function uploadMedia(file) {
    if (!file) return null;
    const video = isVideoFile(file);
    if (video && file.size > VIDEO_MAX_MB * 1024 * 1024)
      throw new Error(`"${file.name}" is ${Math.round(file.size / 1048576)} MB. Videos must be under ${VIDEO_MAX_MB} MB — please trim or compress it first.`);

    // Videos upload untouched; photos get shrunk first so they go through faster.
    const data = video ? file : await compressImage(file);
    const ext = video
      ? ((file.name.match(VIDEO_EXT_RE) || [".mp4"])[0]).toLowerCase()
      : ".jpg";
    const type = data.type || (video ? "video/mp4" : "image/jpeg");

    const isNet = (e) => /fetch|network|timeout|load failed/i.test((e && e.message) || "");
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      try {
        const { error } = await sb.storage.from(bucket).upload(name, data, {
          cacheControl: "3600", upsert: true, contentType: type
        });
        if (!error) return sb.storage.from(bucket).getPublicUrl(name).data.publicUrl;
        lastErr = error;
        if (!isNet(error)) throw error;           // real error (permissions, etc.) — don't retry
      } catch (e) { lastErr = e; if (!isNet(e)) throw e; }
      await new Promise(r => setTimeout(r, 700 * (attempt + 1))); // back off, then retry
    }
    throw new Error("Upload kept failing (network/filter). " + ((lastErr && lastErr.message) || ""));
  }

  /* ---------- TABS ---------- */
  // A row is only "pending" once the approved column actually exists — before
  // the SQL script is run, nothing should be flagged.
  const isPending = (r) => ("approved" in r) && !r.approved;

  const TABS = {
    projects: {
      table: "projects", order: "sort_order",
      fields: [
        { key: "title", label: "Title", type: "text", required: true },
        { key: "category", label: "Category", type: "select", options: CATS },
        { key: "description", label: "Description", type: "textarea" },
        { key: "sort_order", label: "Sort order", type: "number" },
        { key: "images", label: "Photos & videos", type: "gallery" }
      ],
      title: (r) => r.title, sub: (r) => CATS[r.category] || r.category || "", img: (r) => (Array.isArray(r.images) && r.images[0]) || r.image_url
    },
    team_members: {
      table: "team_members", order: "sort_order",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "role", label: "Role", type: "text" },
        { key: "bio", label: "Bio", type: "textarea" },
        { key: "sort_order", label: "Sort order", type: "number" },
        { key: "photo_url", label: "Photo", type: "image" }
      ],
      title: (r) => r.name, sub: (r) => r.role || "", img: (r) => r.photo_url
    },
    testimonials: {
      table: "testimonials", order: "sort_order",
      fields: [
        { key: "author", label: "Author", type: "text", required: true },
        { key: "role", label: "Role / Company", type: "text" },
        { key: "quote", label: "Quote", type: "textarea", required: true },
        { key: "sort_order", label: "Sort order", type: "number" },
        // Anything you add here is published straight away; visitor submissions
        // arrive with this unchecked and wait for you.
        { key: "approved", label: "Published on the website", type: "checkbox", default: true }
      ],
      title: (r) => r.author, sub: (r) => r.role || "", img: () => null, hideThumb: true,
      // Show whichever quote is waiting on you first.
      sort: (a, b) => (isPending(a) === isPending(b)) ? 0 : (isPending(a) ? -1 : 1),
      badge: (r) => isPending(r) ? `<span class="badge-pending">Pending review</span>` : "",
      preview: (r) => r.quote || "",
      actions: (r) => !("approved" in r) ? ""            // column not added yet
        : r.approved
          ? `<button class="btn btn-mini" data-approve="${r.id}" data-val="0">Unpublish</button>`
          : `<button class="btn btn-mini btn-approve" data-approve="${r.id}" data-val="1">Approve</button>`
    },
    bts_posts: {
      table: "bts_posts", order: "created_at",
      fields: [
        { key: "title", label: "Title", type: "text", required: true },
        { key: "body", label: "Note", type: "textarea" },
        { key: "images", label: "Photos & videos", type: "gallery" }
      ],
      title: (r) => r.title, sub: (r) => "", img: (r) => (Array.isArray(r.images) && r.images[0]) || r.image_url
    }
  };
  const LABELS = { projects: "Projects", team_members: "Team", testimonials: "Testimonials", bts_posts: "Behind the Scenes" };

  let currentTab = "projects";
  const tabBar = $("tabs");
  tabBar.innerHTML = Object.keys(TABS).map(k =>
    `<button data-tab="${k}" class="${k === currentTab ? "active" : ""}">${LABELS[k]}</button>`).join("");
  tabBar.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    currentTab = b.dataset.tab;
    tabBar.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
    loadTab(currentTab);
  }));

  // 70x70 preview for a list row — a still frame if the item leads with a video.
  function rowThumb(url) {
    if (!url) return `<div class="row-thumb-empty"></div>`;
    if (isVideoUrl(url))
      return `<span class="row-thumb-video">
        <video src="${esc(url)}#t=0.1" preload="metadata" muted playsinline></video>
        <span class="play-badge play-badge-sm" aria-hidden="true"></span></span>`;
    return `<img src="${esc(url)}" alt="">`;
  }

  async function loadTab(tab) {
    const cfg = TABS[tab];
    renderForm(cfg, null);
    const list = $("list");
    list.innerHTML = `<p class="note">Loading…</p>`;
    let q = sb.from(cfg.table).select("*");
    q = q.order(cfg.order, { ascending: cfg.order !== "created_at" });
    const { data, error } = await q;
    if (error) { list.innerHTML = `<div class="alert alert-err">${esc(error.message)}</div>`; return; }
    if (!data.length) { list.innerHTML = `<p class="note">Nothing here yet — add your first item above.</p>`; return; }
    const rows = cfg.sort ? data.slice().sort(cfg.sort) : data;
    list.innerHTML = rows.map(r => `
      <div class="row${cfg.badge && cfg.badge(r) ? " row-pending" : ""}">
        ${cfg.hideThumb ? "" : rowThumb(cfg.img(r))}
        <div class="grow">
          <strong>${esc(cfg.title(r))}</strong>
          ${cfg.badge ? cfg.badge(r) : ""}<br>
          <span class="note">${esc(cfg.sub(r))}</span>
          ${cfg.preview ? `<div class="row-preview">${esc(cfg.preview(r))}</div>` : ""}
        </div>
        ${cfg.actions ? cfg.actions(r) : ""}
        <button class="btn btn-mini" data-edit="${r.id}">Edit</button>
        <button class="btn btn-mini btn-danger" data-del="${r.id}">Delete</button>
      </div>`).join("");
    list.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () =>
      renderForm(cfg, data.find(r => String(r.id) === b.dataset.edit))));
    list.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Delete this item? This cannot be undone.")) return;
      const { error } = await sb.from(cfg.table).delete().eq("id", b.dataset.del);
      if (error) alert(error.message); else { loadTab(tab); refreshPendingBadge(); }
    }));
    list.querySelectorAll("[data-approve]").forEach(b => b.addEventListener("click", async () => {
      b.disabled = true;
      const { error } = await sb.from(cfg.table)
        .update({ approved: b.dataset.val === "1" }).eq("id", b.dataset.approve);
      b.disabled = false;
      if (error) alert(error.message); else { loadTab(tab); refreshPendingBadge(); }
    }));
    if (tab === "testimonials") refreshPendingBadge();
  }

  /* ---------- Pending-testimonial counter on the tab ---------- */
  async function refreshPendingBadge() {
    const btn = tabBar.querySelector('[data-tab="testimonials"]');
    if (!btn) return;
    const { count, error } = await sb.from("testimonials")
      .select("id", { count: "exact", head: true }).eq("approved", false);
    // No badge if the query failed (column not added yet) or nothing is waiting.
    btn.innerHTML = LABELS.testimonials +
      (!error && count ? ` <span class="tab-count">${count}</span>` : "");
  }

  function renderForm(cfg, record) {
    const editing = !!record;
    const form = $("editor");
    form.dataset.editing = editing ? record.id : "";
    $("editor-title").textContent = editing ? "Edit item" : "Add new item";
    form.innerHTML = cfg.fields.map(f => {
      const val = editing ? (record[f.key] ?? "") : "";
      if (f.type === "textarea")
        return field(f, `<textarea name="${f.key}">${esc(val)}</textarea>`);
      if (f.type === "select")
        return field(f, `<select name="${f.key}">${Object.entries(f.options).map(([v, l]) =>
          `<option value="${v}" ${v === val ? "selected" : ""}>${l}</option>`).join("")}</select>`);
      if (f.type === "checkbox") {
        const on = editing ? !!record[f.key] : !!f.default;
        return `<div class="field field-check">
          <label><input type="checkbox" name="${f.key}" ${on ? "checked" : ""}> ${f.label}</label></div>`;
      }
      if (f.type === "gallery")
        return `<div class="field"><label>${f.label}</label>
          <div class="gallery-thumbs" data-gkey="${f.key}"></div>
          <input type="file" name="${f.key}__files" accept="image/*,video/*" multiple>
          <p class="note">Add one or more photos or videos (select several at once). Click the &times; on an item to remove it.
            The first item is the cover shown on the card. Videos must be under ${VIDEO_MAX_MB} MB — MP4 plays everywhere.</p></div>`;
      if (f.type === "image")
        return `<div class="field"><label>${f.label}</label>
          ${val ? `<img src="${esc(val)}" style="width:120px;height:90px;object-fit:cover;border-radius:6px;margin-bottom:8px">` : ""}
          <input type="file" name="${f.key}__file" accept="image/*">
          <input type="hidden" name="${f.key}" value="${esc(val)}">
          <p class="note">Leave empty to keep the current photo.</p></div>`;
      return field(f, `<input type="${f.type}" name="${f.key}" value="${esc(val)}" ${f.required ? "required" : ""}>`);
    }).join("") + `
      <button type="submit" class="btn btn-primary">${editing ? "Save changes" : "Add item"}</button>
      ${editing ? `<button type="button" id="cancel-edit" class="btn" style="background:#fff;border:1px solid var(--line)">Cancel</button>` : ""}
      <div id="editor-status"></div>`;

    function field(f, inner) {
      return `<div class="field"><label>${f.label}${f.required ? " *" : ""}</label>${inner}</div>`;
    }

    // Gallery fields: manage a live array of photo URLs
    const galleryState = {};
    function drawGalleryThumbs(key) {
      const box = form.querySelector(`.gallery-thumbs[data-gkey="${key}"]`);
      if (!box) return;
      box.innerHTML = galleryState[key].map((url, i) =>
        `<span class="gthumb">${isVideoUrl(url)
            ? `<video src="${esc(url)}#t=0.1" preload="metadata" muted playsinline></video><span class="play-badge play-badge-sm" aria-hidden="true"></span>`
            : `<img src="${esc(url)}" alt="">`
          }<button type="button" data-rm="${i}" title="Remove">&times;</button></span>`).join("");
      box.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => {
        galleryState[key].splice(+b.dataset.rm, 1); drawGalleryThumbs(key);
      }));
    }
    cfg.fields.filter(f => f.type === "gallery").forEach(f => {
      const init = editing
        ? (Array.isArray(record[f.key]) && record[f.key].length ? record[f.key].slice()
           : (record.image_url ? [record.image_url] : []))
        : [];
      galleryState[f.key] = init.filter(Boolean);
      drawGalleryThumbs(f.key);
    });

    const cancel = $("cancel-edit");
    if (cancel) cancel.addEventListener("click", () => renderForm(cfg, null));

    form.onsubmit = async (e) => {
      e.preventDefault();
      const status = $("editor-status");
      const btn = form.querySelector("[type=submit]");
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Saving…`;
      try {
        const fd = new FormData(form);
        const payload = {};
        for (const f of cfg.fields) {
          if (f.type === "gallery") {
            const files = fd.getAll(f.key + "__files").filter(x => x && x.size);
            const arr = (galleryState[f.key] || []).slice();
            for (const file of files) arr.push(await uploadMedia(file));
            payload[f.key] = arr;                 // full photo array
            payload.image_url = arr[0] || null;   // keep a cover for fallbacks
          } else if (f.type === "image") {
            const file = fd.get(f.key + "__file");
            if (file && file.size) payload[f.key] = await uploadMedia(file);
            else if (editing) payload[f.key] = record[f.key] || null;
          } else if (f.type === "checkbox") {
            // Unchecked boxes are absent from FormData, so read the element itself.
            const box = form.querySelector(`[name="${f.key}"]`);
            payload[f.key] = !!(box && box.checked);
          } else if (f.type === "number") {
            payload[f.key] = fd.get(f.key) === "" ? 0 : Number(fd.get(f.key));
          } else {
            payload[f.key] = fd.get(f.key);
          }
        }
        const write = (pl) => editing
          ? sb.from(cfg.table).update(pl).eq("id", record.id)
          : sb.from(cfg.table).insert(pl);
        let res = await write(payload);
        // Graceful fallback if a column hasn't been added to the DB yet
        const missingCol = (msg, col) =>
          new RegExp(col, "i").test(msg || "") && /(column|does not exist|schema)/i.test(msg || "");
        if (res.error && payload.images && missingCol(res.error.message, "images")) {
          const clone = Object.assign({}, payload); delete clone.images;
          res = await write(clone);
        }
        if (res.error && "approved" in payload && missingCol(res.error.message, "approved")) {
          const clone = Object.assign({}, payload); delete clone.approved;
          res = await write(clone);
        }
        if (res.error) throw res.error;
        // loadTab rebuilds the form (and #editor-status with it), so the
        // confirmation has to go in afterwards or it gets wiped instantly.
        await loadTab(currentTab);
        const fresh = $("editor-status");
        if (fresh) fresh.innerHTML = `<div class="alert alert-ok">Saved.</div>`;
      } catch (err) {
        status.innerHTML = `<div class="alert alert-err">${esc(err.message || err)}</div>`;
      } finally {
        btn.disabled = false;
      }
    };
  }

  refresh();
})();
