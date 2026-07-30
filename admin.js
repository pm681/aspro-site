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

  /* ---------- IMAGE UPLOAD ---------- */
  async function uploadImage(file) {
    if (!file) return null;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from(bucket).upload(name, file, {
      cacheControl: "3600", upsert: false, contentType: file.type
    });
    if (error) throw error;
    const { data } = sb.storage.from(bucket).getPublicUrl(name);
    return data.publicUrl;
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
          <input type="file" name="${f.key}__files" accept="image/*" multiple>
          <p class="note">Add one or more photos (select several at once). Click the &times; on a photo to remove it. The first photo is the cover shown on the card.</p></div>`;
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
        `<span class="gthumb"><img src="${esc(url)}" alt=""><button type="button" data-rm="${i}" title="Remove">&times;</button></span>`).join("");
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
