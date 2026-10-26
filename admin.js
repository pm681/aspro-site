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
    wireBooklet();
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

  /* ---------- IMAGE UPLOAD (compress + retry) ---------- */
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
  async function uploadImage(file) {
    if (!file) return null;
    const data = await compressImage(file);
    const isNet = (e) => /fetch|network|timeout|load failed/i.test((e && e.message) || "");
    const ext = ((data.name.split(".").pop() || "bin").toLowerCase().match(/[a-z0-9]+/) || ["bin"])[0];
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      try {
        const { error } = await sb.storage.from(bucket).upload(name, data, {
          cacheControl: "3600", upsert: true, contentType: data.type || "image/jpeg"
        });
        if (!error) return sb.storage.from(bucket).getPublicUrl(name).data.publicUrl;
        lastErr = error;
        if (!isNet(error)) throw error;           // real error (permissions, etc.) — don't retry
      } catch (e) { lastErr = e; if (!isNet(e)) throw e; }
      await new Promise(r => setTimeout(r, 700 * (attempt + 1))); // back off, then retry
    }
    throw new Error("Upload kept failing (network/filter). " + ((lastErr && lastErr.message) || ""));
  }

  /* ---------- PROJECTS BOOKLET (PDF) ---------- */
  const BOOKLET_PATH = "booklet/projects-booklet.pdf";
  function bookletPublicUrl(ver) {
    const u = sb.storage.from(bucket).getPublicUrl(BOOKLET_PATH).data.publicUrl;
    return u + "?v=" + (ver || Date.now());
  }
  async function refreshBooklet() {
    const box = $("booklet-current");
    if (!box) return;
    try {
      const { data } = await sb.storage.from(bucket).list("booklet", { limit: 20 });
      const f = (data || []).find(x => x.name === "projects-booklet.pdf");
      if (f) {
        const ver = f.updated_at ? Date.parse(f.updated_at) : Date.now();
        box.innerHTML = `<div class="alert alert-ok" style="margin-bottom:10px">A booklet is live on your site. <a href="${bookletPublicUrl(ver)}" target="_blank" rel="noopener">View current PDF</a></div>`;
      } else {
        box.innerHTML = `<p class="note">No booklet uploaded yet.</p>`;
      }
    } catch (_) { box.innerHTML = ""; }
  }
  async function uploadBooklet(file) {
    const isNet = (e) => /fetch|network|timeout|load failed/i.test((e && e.message) || "");
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const { error } = await sb.storage.from(bucket).upload(BOOKLET_PATH, file, {
          cacheControl: "60", upsert: true, contentType: "application/pdf"
        });
        if (!error) return true;
        lastErr = error; if (!isNet(error)) throw error;
      } catch (e) { lastErr = e; if (!isNet(e)) throw e; }
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
    throw new Error("Upload kept failing (network/filter). " + ((lastErr && lastErr.message) || ""));
  }
  function wireBooklet() {
    const btn = $("booklet-upload");
    if (!btn) return;
    refreshBooklet();
    btn.onclick = async () => {
      const input = $("booklet-file");
      const status = $("booklet-status");
      status.innerHTML = "";
      const file = input.files && input.files[0];
      if (!file) { status.innerHTML = `<div class="alert alert-err">Choose a PDF first.</div>`; return; }
      if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
        status.innerHTML = `<div class="alert alert-err">Please choose a PDF file.</div>`; return;
      }
      if (file.size > 48 * 1024 * 1024) {
        status.innerHTML = `<div class="alert alert-err">That PDF is over 48 MB — too large for the free tier. Please compress it and try again.</div>`; return;
      }
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Uploading…`;
      try {
        await uploadBooklet(file);
        status.innerHTML = `<div class="alert alert-ok">Booklet uploaded — it’s now live on your Projects page.</div>`;
        input.value = "";
        refreshBooklet();
      } catch (err) {
        status.innerHTML = `<div class="alert alert-err">${esc(err.message || err)}</div>`;
      } finally {
        btn.disabled = false; btn.textContent = "Upload booklet";
      }
    };
  }

  /* ---------- TABS ---------- */
  const TABS = {
    projects: {
      table: "projects", order: "sort_order",
      fields: [
        { key: "title", label: "Title", type: "text", required: true },
        { key: "category", label: "Category", type: "select", options: CATS },
        { key: "description", label: "Description", type: "textarea" },
        { key: "sort_order", label: "Sort order", type: "number" },
        { key: "images", label: "Photos", type: "gallery" }
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
        { key: "sort_order", label: "Sort order", type: "number" }
      ],
      title: (r) => r.author, sub: (r) => r.role || "", img: () => null
    },
    bts_posts: {
      table: "bts_posts", order: "created_at",
      fields: [
        { key: "title", label: "Title", type: "text", required: true },
        { key: "body", label: "Note", type: "textarea" },
        { key: "images", label: "Photos", type: "gallery" }
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
    list.innerHTML = data.map(r => `
      <div class="row">
        ${cfg.img(r) ? `<img src="${esc(cfg.img(r))}" alt="">` : `<div style="width:70px;height:70px;background:#eee;border-radius:6px"></div>`}
        <div class="grow">
          <strong>${esc(cfg.title(r))}</strong><br>
          <span class="note">${esc(cfg.sub(r))}</span>
        </div>
        <button class="btn" data-edit="${r.id}" style="background:#fff;border:1px solid var(--line)">Edit</button>
        <button class="btn" data-del="${r.id}" style="background:#fdeaea;color:#b02222">Delete</button>
      </div>`).join("");
    list.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () =>
      renderForm(cfg, data.find(r => String(r.id) === b.dataset.edit))));
    list.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Delete this item? This cannot be undone.")) return;
      const { error } = await sb.from(cfg.table).delete().eq("id", b.dataset.del);
      if (error) alert(error.message); else loadTab(tab);
    }));
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
      if (f.type === "gallery")
        return `<div class="field"><label>${f.label}</label>
          <div class="gallery-thumbs" data-gkey="${f.key}"></div>
          <input type="file" name="${f.key}__files" accept="image/*,video/*" multiple>
          <p class="note">Add one or more <strong>photos or videos</strong> (select several at once). Click the &times; to remove one. The first item is the cover shown on the card. Keep videos short (roughly under 50&nbsp;MB) and upload them off the office wi-fi.</p></div>`;
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
      box.innerHTML = galleryState[key].map((url, i) => {
        const media = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i.test(url)
          ? `<video src="${esc(url)}" muted preload="metadata"></video><span class="gplay">&#9658;</span>`
          : `<img src="${esc(url)}" alt="">`;
        return `<span class="gthumb">${media}<button type="button" data-rm="${i}" title="Remove">&times;</button></span>`;
      }).join("");
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
            for (const file of files) arr.push(await uploadImage(file));
            payload[f.key] = arr;                 // full photo array
            payload.image_url = arr[0] || null;   // keep a cover for fallbacks
          } else if (f.type === "image") {
            const file = fd.get(f.key + "__file");
            if (file && file.size) payload[f.key] = await uploadImage(file);
            else if (editing) payload[f.key] = record[f.key] || null;
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
        // Graceful fallback if the images[] column hasn't been added to the DB yet
        if (res.error && payload.images && /images/i.test(res.error.message || "") &&
            /(column|does not exist|schema)/i.test(res.error.message || "")) {
          const clone = Object.assign({}, payload); delete clone.images;
          res = await write(clone);
        }
        if (res.error) throw res.error;
        status.innerHTML = `<div class="alert alert-ok">Saved.</div>`;
        renderForm(cfg, null);
        loadTab(currentTab);
      } catch (err) {
        status.innerHTML = `<div class="alert alert-err">${esc(err.message || err)}</div>`;
      } finally {
        btn.disabled = false;
      }
    };
  }

  refresh();
})();
