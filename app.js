(() => {
  const GOAL = 171;
  const KEY = "bmf-count";
  const films = window.FILMS;

  // Running total at the end of each film: that's the milestone.
  let run = 0;
  const marks = films.map((f) => (run += f.count));

  const $ = (id) => document.getElementById(id);
  const countEl = $("count"), fillEl = $("fill"), barEl = $("bar"), nextEl = $("next");
  const micBtn = $("mic"), micLabel = $("mic-label"), heardEl = $("heard");
  const slotsEl = $("slots"), flashEl = $("flash"), finaleEl = $("finale");

  let count = load();
  let finaleShown = count >= GOAL;

  // ---------- storage (may be blocked; the page works without it) ----------

  function load() {
    try { return Math.max(0, parseInt(localStorage.getItem(KEY), 10) || 0); }
    catch { return 0; }
  }
  function save() {
    try { localStorage.setItem(KEY, String(count)); } catch {}
  }

  // ---------- matching ----------

  // Join "mother fucker" / "mother-f***" into one word, then match the
  // spelled-out, slang and censored forms speech engines hand back.
  const WORD = /\bm(?:other|otha|utha|uther|uva)(?:f[u*]|\*)[\w*]*|\bm\*{3,}[\w*]*/gi;

  function normalise(text) {
    return text.replace(/\b(m(?:other|otha|utha|uther|uva))[\s-]+(f|\*)/gi, "$1$2");
  }
  function countIn(text) {
    return (normalise(text).match(WORD) || []).length;
  }
  function highlight(text) {
    const esc = normalise(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    return esc.replace(WORD, (m) => `<mark>${m}</mark>`);
  }

  // ---------- rendering ----------

  function buildSlots() {
    slotsEl.innerHTML = films.map((f) => `
      <li>
        <span class="yr">${f.year}</span>
        <span class="t">${f.title}${f.note ? `<span class="note">${f.note}</span>` : ""}</span>
        <span class="n">${f.count}</span>
      </li>`).join("");
    // A tick on the progress line wherever a film's total lands.
    for (const m of new Set(marks.slice(0, -1))) {
      const t = document.createElement("span");
      t.className = "tick";
      t.dataset.mark = m;
      t.style.left = (m / GOAL) * 100 + "%";
      barEl.append(t);
    }
  }

  function render(prev) {
    countEl.textContent = count;
    fillEl.style.width = Math.min(100, (count / GOAL) * 100) + "%";
    for (const t of barEl.querySelectorAll(".tick")) t.classList.toggle("got", count >= +t.dataset.mark);

    const next = marks.findIndex((m) => count < m);
    const lis = slotsEl.children;
    for (let i = 0; i < films.length; i++) {
      const got = count >= marks[i];
      lis[i].classList.toggle("got", got);
      lis[i].classList.toggle("target", i === next);
    }

    if (next === -1) {
      nextEl.innerHTML = count > GOAL
        ? `<b>${count - GOAL}</b> past Sam.`
        : `Every film matched.`;
    } else {
      const need = marks[next] - count;
      nextEl.innerHTML = `<b>${need}</b> more to match ${films[next].title}.`;
    }

    if (prev === undefined) return;

    const unlocked = films.filter((_, i) => prev < marks[i] && count >= marks[i]);
    if (unlocked.length) flash(unlocked[unlocked.length - 1], unlocked.length);
    if (count >= GOAL && !finaleShown) {
      finaleShown = true;
      setTimeout(() => (finaleEl.hidden = false), 900);
    }
  }

  let flashTimer;
  function flash(film, n) {
    const more = n > 1 ? ` +${n - 1} more` : "";
    flashEl.innerHTML = `<b>${film.title}</b> <span>matched${more}</span>`;
    flashEl.classList.add("show");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flashEl.classList.remove("show"), 3200);
  }

  function add(n) {
    if (n <= 0) return;
    const prev = count;
    count += n;
    save();
    render(prev);
    countEl.classList.remove("bump");
    void countEl.offsetWidth;
    countEl.classList.add("bump");
    setTimeout(() => countEl.classList.remove("bump"), 250);
  }

  // ---------- speech ----------

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;

  function setListening(on) {
    listening = on;
    micBtn.setAttribute("aria-pressed", String(on));
    micLabel.textContent = on ? "Listening \u2014 say it" : "Tap and say it";
  }

  function setupSpeech() {
    if (!SR) {
      micBtn.disabled = true;
      micLabel.textContent = "Can't hear you";
      heardEl.textContent = "This browser has no speech recognition. Try Chrome, Edge or Safari.";
      return;
    }
    rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          // Take the alternative that heard the most; the top guess often
          // "cleans up" the word into "mother father" or similar.
          let best = r[0], bestN = countIn(r[0].transcript);
          for (let a = 1; a < r.length; a++) {
            const n = countIn(r[a].transcript);
            if (n > bestN) { best = r[a]; bestN = n; }
          }
          heardEl.innerHTML = bestN
            ? `“${highlight(best.transcript.trim())}”`
            : `Heard “${highlight(best.transcript.trim())}”. That's not it.`;
          add(bestN);
        } else {
          live += r[0].transcript;
        }
      }
      if (live) heardEl.innerHTML = `<span class="live">${highlight(live.trim())}…</span>`;
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setListening(false);
      heardEl.textContent = e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "No mic, no motherfuckers. Allow microphone access and try again."
        : `Speech recognition stopped (${e.error}). Press the snap again.`;
    };

    // Engines stop on their own after a pause; keep going until told not to.
    rec.onend = () => {
      if (!listening) return;
      try { rec.start(); } catch { setListening(false); }
    };

    micBtn.addEventListener("click", () => {
      if (listening) {
        setListening(false);
        rec.stop();
      } else {
        setListening(true);
        heardEl.textContent = "";
        try { rec.start(); } catch {}
      }
    });
  }

  // ---------- wiring ----------

  $("reset").addEventListener("click", () => {
    if (!count || !confirm("Reset your count to zero?")) return;
    count = 0;
    finaleShown = false;
    save();
    render();
  });
  $("finale-x").addEventListener("click", () => (finaleEl.hidden = true));

  // ?debug: space bar adds one, for testing without a mic.
  if (new URLSearchParams(location.search).has("debug")) {
    const tag = document.createElement("div");
    tag.className = "debug";
    tag.textContent = "debug: space = +1";
    document.body.append(tag);
    addEventListener("keydown", (e) => {
      if (e.code === "Space" && e.target === document.body) { e.preventDefault(); add(1); }
    });
    window.bmf = { add, countIn };
  }

  buildSlots();
  render();
  setupSpeech();
})();
