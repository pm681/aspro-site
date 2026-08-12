/* ===== ASPRO CONSTRUCTION — shared front-end logic ===== */
(function () {
  const CFG = window.ASPRO_CONFIG || {};
  const C = CFG.COMPANY || {};

  /* ---- Supabase client (only if configured) ---- */
  let sb = null;
  const configured =
    CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("PASTE_") &&
    CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.includes("PASTE_");
  if (configured && window.supabase) {
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  }
  window.ASPRO = { sb, configured, CFG, C };

  /* ---- Category labels ---- */
  const CATS = {
    "custom-homes": "Custom Homes",
    "multifamily": "Multifamily",
    "commercial":  "Commercial",
    "institutional":"Institutional"
  };
  window.ASPRO.CATS = CATS;

  /* ---- Favicon ---- */
  (function () {
    const fav = document.createElement("link");
    fav.rel = "icon"; fav.type = "image/png"; fav.href = "favicon.png";
    document.head.appendChild(fav);
  })();

  /* ---- Scroll reveal + animated stat counters ---- */
  (function () {
    function countUp(el) {
      if (el.dataset.done) return; el.dataset.done = "1";
      const target = +el.getAttribute("data-count"), suffix = el.getAttribute("data-suffix") || "";
      const dur = 1100, t0 = performance.now();
      (function step(t) {
        const p = Math.min((t - t0) / dur, 1), eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }
    function revealAll(list) {
      list.forEach(r => { r.classList.add("in"); r.querySelectorAll("[data-count]").forEach(countUp); });
    }
    function init() {
      const reveals = [...document.querySelectorAll(".reveal")];
      if (!("IntersectionObserver" in window)) { revealAll(reveals); return; }
      try {
        const io = new IntersectionObserver((entries) => {
          entries.forEach(e => {
            if (!e.isIntersecting) return;
            e.target.classList.add("in");
            e.target.querySelectorAll("[data-count]").forEach(countUp);
            io.unobserve(e.target);
          });
        }, { threshold: 0.15 });
        reveals.forEach(r => io.observe(r));
        // safety net: never leave any section hidden, even if something goes wrong
        setTimeout(() => revealAll(reveals), 6000);
      } catch (_) { revealAll(reveals); }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  })();

  /* ---- Header + Footer injection ---- */
  const page = document.body.getAttribute("data-page") || "";
  const nav = [
    ["index.html", "Home"],
    ["projects.html", "Projects"],
    ["team.html", "Team"],
    ["testimonials.html", "Testimonials"],
    ["behind-the-scenes.html", "Behind the Scenes"],
    ["contact.html", "Contact"]
  ];
  const header = document.getElementById("site-header");
  if (header) {
    header.className = "site-header";
    header.innerHTML = `
      <div class="container">
        <a class="brand" href="index.html" aria-label="${C.name || "Aspro Construction"} home">
          <img src="logo.png" alt="${C.name || "Aspro Construction"}" class="brand-logo">
        </a>
        <button class="nav-toggle" aria-label="Menu">&#9776;</button>
        <nav class="nav">
          ${nav.map(([h, t]) =>
            `<a href="${h}" class="${page === h ? "active" : ""}">${t}</a>`).join("")}
          <a href="contact.html" class="btn btn-primary" style="padding:8px 16px">Get a Quote</a>
        </nav>
      </div>`;
    const btn = header.querySelector(".nav-toggle");
    btn.addEventListener("click", () =>
      header.querySelector(".nav").classList.toggle("open"));
  }

  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.className = "site-footer";
    const year = new Date().getFullYear();
    footer.innerHTML = `
      <div class="container footer-grid">
        <div>
          <h4>${C.name || "Aspro Construction"}</h4>
          <p style="max-width:340px">${C.tagline || ""}</p>
          <p>${C.address || ""}</p>
        </div>
        <div>
          <h4>Explore</h4>
          ${nav.map(([h, t]) => `<p><a href="${h}">${t}</a></p>`).join("")}
        </div>
        <div>
          <h4>Contact</h4>
          ${C.email ? `<p><a href="mailto:${C.email}">${C.email}</a></p>` : ""}
          ${C.phone ? `<p><a href="tel:${C.phone}">${C.phone}</a></p>` : ""}
          <p><a href="admin.html">Staff Login</a></p>
        </div>
      </div>
      <div class="container footer-bottom">
        <span>&copy; ${year} ${C.name || "Aspro Construction"}. All rights reserved.</span>
        <span>Built for speed &amp; hosted free.</span>
      </div>`;
  }

  /* ---- Helpers ---- */
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  window.ASPRO.esc = esc;

  async function fetchTable(table, order) {
    if (!sb) return { data: null, error: "not-configured" };
    let q = sb.from(table).select("*");
    if (order) q = q.order(order.col, { ascending: order.asc !== false });
    const { data, error } = await q;
    return { data, error };
  }
  window.ASPRO.fetchTable = fetchTable;

  /* ---- Renderers for public pages ---- */

  // Projects grid (supports optional category filter buttons)
  window.ASPRO.renderProjects = async function (mountId, opts = {}) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
    const { data, error } = await fetchTable("projects", { col: "sort_order", asc: true });
    let items = (data && data.length) ? data : (error ? SAMPLE.projects : []);
    if (opts.limit) items = items.slice(0, opts.limit);
    window.__ASPRO_PROJECTS = items;
    drawProjects(mount, items, "all");
    if (opts.filters) buildFilters(opts.filters, mount, items);
  };
  // Return an array of photo URLs for an item (new images[] with image_url fallback)
  function galleryOf(item) {
    if (Array.isArray(item.images) && item.images.length) return item.images.filter(Boolean);
    if (item.image_url) return [item.image_url];
    return [];
  }
  window.ASPRO.galleryOf = galleryOf;

  /* ---- Media helpers (photos + videos share one gallery) ---- */
  const VIDEO_RE = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?.*)?$/i;
  function isVideo(url) { return VIDEO_RE.test(String(url || "")); }
  window.ASPRO.isVideo = isVideo;

  // Card thumbnail: a still frame for videos, a background image for photos.
  function thumbHTML(g) {
    const cover = g[0];
    const vids = g.filter(isVideo).length;
    const badge = g.length > 1
      ? `<span class="photo-badge">${vids ? "&#127909;" : "&#128247;"} ${g.length}</span>`
      : (vids ? `<span class="photo-badge">&#127909; Video</span>` : "");
    if (!cover) return `<div class="thumb"></div>`;
    if (isVideo(cover))
      return `<div class="thumb thumb-video">
          <video src="${esc(cover)}#t=0.1" preload="metadata" muted playsinline></video>
          <span class="play-badge" aria-hidden="true"></span>${badge}
        </div>`;
    return `<div class="thumb" style="background-image:url('${esc(cover)}')">${badge}</div>`;
  }

  function drawProjects(mount, items, cat) {
    const list = cat === "all" ? items : items.filter(p => p.category === cat);
    if (!list.length) { mount.innerHTML = `<p class="note">No projects to show yet.</p>`; return; }
    mount.innerHTML = list.map((p, i) => {
      const g = galleryOf(p);
      return `
      <article class="card ${g.length ? "card-clickable" : ""}" data-gi="${i}">
        ${thumbHTML(g)}
        <div class="body">
          <span class="tag">${esc(CATS[p.category] || p.category || "Project")}</span>
          <h3 style="margin:.5em 0 .3em;font-size:1.2rem">${esc(p.title)}</h3>
          <p class="note">${esc(p.description || "")}</p>
        </div>
      </article>`;
    }).join("");
    mount.querySelectorAll(".card-clickable").forEach(card => card.addEventListener("click", () => {
      const p = list[+card.dataset.gi];
      openGallery(galleryOf(p), 0, p.title);
    }));
  }
  function buildFilters(barId, mount, items) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    const cats = ["all", ...Object.keys(CATS)];
    bar.innerHTML = cats.map((c, i) =>
      `<button class="btn ${i === 0 ? "btn-dark" : "btn"}" data-cat="${c}"
        style="${i === 0 ? "" : "background:#fff;border:1px solid var(--line)"}">
        ${c === "all" ? "All" : CATS[c]}</button>`).join("");
    bar.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      bar.querySelectorAll("button").forEach(x => {
        x.className = "btn"; x.style = "background:#fff;border:1px solid var(--line)";
      });
      b.className = "btn btn-dark"; b.style = "";
      drawProjects(mount, items, b.dataset.cat);
    }));
  }

  window.ASPRO.renderTeam = async function (mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
    const { data, error } = await fetchTable("team_members", { col: "sort_order", asc: true });
    const items = (data && data.length) ? data : (error ? SAMPLE.team : []);
    if (!items.length) { mount.innerHTML = `<p class="note">Team profiles coming soon.</p>`; return; }
    mount.innerHTML = items.map(m => `
      <div class="member">
        <div class="thumb card" style="${m.photo_url ? `background:url('${esc(m.photo_url)}') center/cover` : "background:#e9e9e4"}"></div>
        <h3>${esc(m.name)}</h3>
        <div class="role">${esc(m.role || "")}</div>
        <p class="note">${esc(m.bio || "")}</p>
      </div>`).join("");
  };

  window.ASPRO.renderTestimonials = async function (mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
    let data = null, error = "not-configured";
    if (sb) {
      // Only approved testimonials are public. (Row-level security enforces this
      // too — the filter just keeps the intent obvious.)
      let res = await sb.from("testimonials").select("*").eq("approved", true)
                        .order("sort_order", { ascending: true });
      // Fall back gracefully if the approved column hasn't been added yet.
      if (res.error && /approved/i.test(res.error.message || ""))
        res = await sb.from("testimonials").select("*").order("sort_order", { ascending: true });
      data = res.data; error = res.error;
    }
    const items = (data && data.length) ? data : (error ? SAMPLE.testimonials : []);
    if (!items.length) {
      mount.innerHTML = `<p class="note">No testimonials published yet — be the first to leave one below.</p>`;
      return;
    }
    mount.innerHTML = items.map(t => `
      <blockquote class="quote">
        <p>&ldquo;${esc(t.quote)}&rdquo;</p>
        <div class="who">${esc(t.author)}<span>${esc(t.role || "")}</span></div>
      </blockquote>`).join("");
  };

  /* ---- Public testimonial submission (lands in the admin panel as pending) ---- */
  window.ASPRO.initTestimonialForm = function (formId, statusId) {
    const form = document.getElementById(formId);
    const status = document.getElementById(statusId);
    if (!form || !status) return;
    const say = (cls, msg) => { status.innerHTML = `<div class="alert alert-${cls}">${msg}</div>`; };

    if (!sb) { say("err", "The testimonial form isn't connected yet. Please email us instead."); return; }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      status.innerHTML = "";
      const fd = new FormData(form);

      // Honeypot: real people never fill a hidden field; bots usually do.
      if (String(fd.get("company_website") || "").trim()) {
        form.reset();
        say("ok", "Thank you — your testimonial has been submitted for review.");
        return;
      }

      const author = String(fd.get("author") || "").trim().replace(/\s+/g, " ");
      const quote = String(fd.get("quote") || "").trim();
      if (author.length < 2) { say("err", "Please enter your name."); return; }
      if (author.length > 80) { say("err", "Please use a shorter name."); return; }
      if (quote.length < 10) { say("err", "Please write at least a sentence about your experience."); return; }
      if (quote.length > 2000) { say("err", "Please keep your testimonial under 2000 characters."); return; }

      const btn = form.querySelector("[type=submit]");
      const orig = btn.textContent;
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Sending…`;
      try {
        const { error } = await sb.from("testimonials")
          .insert({ author, quote, approved: false, sort_order: 0 });
        if (error) throw error;
        form.reset();
        say("ok", "Thank you! Your testimonial has been submitted and will appear once we've reviewed it.");
      } catch (err) {
        console.error("Testimonial submit failed:", err);
        say("err", "Sorry, we couldn't submit that just now. Please try again, or email us directly.");
      } finally {
        btn.disabled = false; btn.textContent = orig;
      }
    });
  };

  window.ASPRO.renderBTS = async function (mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
    const { data, error } = await fetchTable("bts_posts", { col: "created_at", asc: false });
    const items = (data && data.length) ? data : (error ? SAMPLE.bts : []);
    if (!items.length) { mount.innerHTML = `<p class="note">Updates coming soon.</p>`; return; }
    mount.innerHTML = items.map((b, i) => {
      const g = galleryOf(b);
      return `
      <article class="card ${g.length ? "card-clickable" : ""}" data-gi="${i}">
        ${thumbHTML(g)}
        <div class="body">
          <h3 style="margin:.2em 0 .4em;font-size:1.15rem">${esc(b.title)}</h3>
          <p class="note">${esc(b.body || "")}</p>
        </div>
      </article>`;
    }).join("");
    mount.querySelectorAll(".card-clickable").forEach(card => card.addEventListener("click", () => {
      const b = items[+card.dataset.gi];
      openGallery(galleryOf(b), 0, b.title);
    }));
  };

  /* ---- Lightbox gallery (photos + videos) ---- */
  function openGallery(images, start, title) {
    images = (images || []).filter(Boolean);
    if (!images.length) return;
    let idx = start || 0;
    let overlay = document.getElementById("aspro-lightbox");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "aspro-lightbox";
      overlay.className = "lightbox";
      overlay.innerHTML =
        `<button class="lb-close" aria-label="Close">&times;</button>
         <button class="lb-prev" aria-label="Previous">&#10094;</button>
         <img class="lb-img" alt="">
         <video class="lb-video" controls playsinline preload="metadata"></video>
         <button class="lb-next" aria-label="Next">&#10095;</button>
         <div class="lb-caption"></div>`;
      document.body.appendChild(overlay);
    }
    const img = overlay.querySelector(".lb-img");
    const vid = overlay.querySelector(".lb-video");
    const cap = overlay.querySelector(".lb-caption");
    const prev = overlay.querySelector(".lb-prev");
    const next = overlay.querySelector(".lb-next");
    const multi = images.length > 1;
    prev.style.display = next.style.display = multi ? "" : "none";
    function stopVideo() { try { vid.pause(); vid.removeAttribute("src"); vid.load(); } catch (_) {} }
    function show() {
      const src = images[idx];
      if (isVideo(src)) {
        img.style.display = "none"; img.removeAttribute("src");
        vid.style.display = ""; vid.src = src;
      } else {
        stopVideo();
        vid.style.display = "none";
        img.style.display = ""; img.src = src;
      }
      cap.textContent = (title ? title + " " : "") + (multi ? `(${idx + 1}/${images.length})` : "");
    }
    function go(d) { stopVideo(); idx = (idx + d + images.length) % images.length; show(); }
    function close() { stopVideo(); overlay.classList.remove("open"); document.removeEventListener("keydown", key); }
    function key(e) {
      // Let the video's own controls own the spacebar / arrows when it has focus.
      if (document.activeElement === vid && e.key !== "Escape") return;
      if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1);
    }
    prev.onclick = (e) => { e.stopPropagation(); go(-1); };
    next.onclick = (e) => { e.stopPropagation(); go(1); };
    overlay.querySelector(".lb-close").onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    document.addEventListener("keydown", key);
    show();
    overlay.classList.add("open");
  }
  window.ASPRO.openGallery = openGallery;

  /* ---- Contact form (Web3Forms -> email) ---- */
  window.ASPRO.initContactForm = function (formId, statusId) {
    const form = document.getElementById(formId);
    const status = document.getElementById(statusId);
    if (!form) return;
    const key = CFG.WEB3FORMS_KEY;
    if (!key || key.includes("PASTE_")) {
      status.innerHTML = `<div class="alert alert-err">Contact form not configured yet
        (add your Web3Forms key in config.js).</div>`;
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      status.innerHTML = "";
      const btn = form.querySelector("[type=submit]");
      const orig = btn.textContent; btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Sending...`;
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.access_key = key;
      payload.subject = `New website enquiry from ${payload.name || "visitor"}`;
      payload.from_name = "Aspro Construction Website";
      try {
        const r = await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload)
        });
        const j = await r.json();
        if (j.success) {
          form.reset();
          status.innerHTML = `<div class="alert alert-ok">Thanks — your message has been sent.
            We'll be in touch shortly.</div>`;
        } else {
          status.innerHTML = `<div class="alert alert-err">Sorry, something went wrong. Please email us directly.</div>`;
        }
      } catch (_) {
        status.innerHTML = `<div class="alert alert-err">Network error. Please email us directly.</div>`;
      } finally {
        btn.disabled = false; btn.textContent = orig;
      }
    });
  };

  /* ---- Fallback sample content (shown only if backend not reachable) ---- */
  const P = "https://base44.app/api/apps/694d54d3ffb43b8c3df047d7/files/public/694d54d3ffb43b8c3df047d7/";
  const SAMPLE = {
    projects: [
      { title: "11 Crest Ct.", category: "institutional", description: "School • Monsey, NY", image_url: P+"a9589ee78_11CrestCt.jpg" },
      { title: "22 Ashel Ln", category: "institutional", description: "Girls school building • Monsey, NY", image_url: P+"0ea3674df_22AshelLn.jpg" },
      { title: "Blauvelt Rd", category: "multifamily", description: "Multifamily full renovation • Monsey, NY", image_url: P+"4a4ca287e_Screenshot2025-12-26121731.png" },
      { title: "Full Gut Renovation", category: "institutional", description: "Yeshiva • Nyack, NY", image_url: P+"249a4bed2_31south.jpg" },
      { title: "Timothy Ct", category: "custom-homes", description: "Modern home • Monsey, NY", image_url: P+"a76627ece_Screenshot2025-12-26120220.png" },
      { title: "Vilchovitz Wedding Hall", category: "institutional", description: "Vilchovitz hall • Monsey, NY", image_url: P+"679eb86df_Screenshot2025-12-26115421.png" },
      { title: "Crest School", category: "institutional", description: "School • Monsey, NY", image_url: P+"77e112e0f_Screenshot2025-12-26115236.png" },
      { title: "Phyllis Terrace", category: "multifamily", description: "Multifamily • Monsey, NY", image_url: P+"cfa215c38_image9.png" },
      { title: "Dunhill Rd", category: "custom-homes", description: "Custom home • Monsey, NY", image_url: P+"2343c01a1_Dunhill.jpg" },
      { title: "Dana Rd.", category: "multifamily", description: "Multifamily • Monsey, NY", image_url: P+"15742ef26_dana.jpg" },
      { title: "Chestnut St.", category: "commercial", description: "Office building • Spring Valley, NY", image_url: P+"aa5b464c4_chestnut.jpg" },
      { title: "Route 306", category: "multifamily", description: "Multifamily • Monsey, NY", image_url: P+"c0c795e05_306.jpg" },
      { title: "Cheryl St.", category: "custom-homes", description: "Custom home • Spring Valley, NY", image_url: P+"ce9c8f05f_Cherylst.jpg" },
      { title: "Elaine Rd.", category: "custom-homes", description: "Single family addition • Monsey, NY", image_url: P+"fa219721f_Elaine.jpg" },
      { title: "Jeffrey Pl", category: "multifamily", description: "Multifamily • Monsey, NY", image_url: P+"b08c2e504_jaffrey.jpg" },
      { title: "Beautiful Custom Home", category: "custom-homes", description: "Modern custom home • Monsey, NY • 2025", image_url: P+"c06340af5_Screenshot2025-12-25103616.png" }
    ],
    team: [
      { name: "Rabbi Mendy Hager", role: "Owner", bio: "", photo_url: P+"ed16f5253_download46498478.png" },
      { name: "Abraham Spira", role: "Owner", bio: "", photo_url: P+"cb950474a_download46498478.png" },
      { name: "Mendel Volf Spira", role: "Office Manager", bio: "", photo_url: P+"e96cd3a2b_download46498478.png" },
      { name: "Hershel Schnitzer", role: "Project Manager", bio: "", photo_url: P+"35e5e8562_WhatsAppImage2026-01-01at23728PM.jpeg" },
      { name: "Eliezer Friedman", role: "Project Manager", bio: "", photo_url: P+"4dad1312f_WhatsAppImage2025-12-25at12633PM.jpeg" },
      { name: "Zisha Twersky", role: "Site Foreman", bio: "", photo_url: P+"c04e99979_Screenshot2025-12-25123551.png" }
    ],
    testimonials: [],
    bts: [
      { title: "היכל התורה", body: "Renovation and stunning bookcases installation.", image_url: P+"0f6f3ea6c_strat.jpg" },
      { title: "Shul in Monsey", body: "From foundation to move-in ready.", image_url: P+"62d431205_Elyon.jpg" },
      { title: "Vilchowitz Wedding Hall", body: "Behind the scenes on the wedding hall build.", image_url: P+"4b5ef8363_IMG_20140717_102048.jpg" },
      { title: "Office Building BTS", body: "#hustling" },
      { title: "Frost Protection for Concrete Pours", body: "Pre-warming and protecting excavation sites to ensure frost-free conditions for concrete footing pours in freezing weather." },
      { title: "Pre-Project HVAC Ductwork Planning", body: "Tired of ugly, bulky ductwork and low ceilings? By planning your AC ductwork layout in advance, we ensure maximum comfort with a design that perfectly fits your space.", image_url: P+"6e1e725d7_Screenshot2025-12-25110426.png" }
    ]
  };

  /* Small banner if backend not configured (helps during setup) */
  if (!configured) {
    document.addEventListener("DOMContentLoaded", () => {
      const b = document.createElement("div");
      b.style.cssText = "background:#fff3cd;color:#7a5b00;text-align:center;padding:8px;font-size:.85rem";
      b.textContent = "Preview mode — showing sample content. Add your Supabase keys in config.js to go live.";
      document.body.prepend(b);
    });
  }
})();
