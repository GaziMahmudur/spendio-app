/* =====================================================
   SpendWise – app.js
   Full expense tracker logic: state, rendering, export
===================================================== */

// ── CUSTOM DATE PICKER ────────────────────────────────
class DatePicker {
  constructor(input) {
    this.input = input;
    this.viewDate = new Date();
    this.selected = null;

    // Parse existing value
    if (input.value) {
      const parts = input.value.split("-");
      this.selected = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      this.viewDate = new Date(this.selected);
    }

    this._build();
    this._sync();
    this._closeOnOutside = this._closeOnOutside.bind(this);
  }

  _build() {
    // Wrap the native input
    const wrap = document.createElement("div");
    wrap.className = "dp-wrap";
    this.input.parentNode.insertBefore(wrap, this.input);
    wrap.appendChild(this.input);

    // Trigger button
    this.trigger = document.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "dp-trigger";
    this.trigger.setAttribute("aria-haspopup", "true");
    wrap.appendChild(this.trigger);

    // Calendar panel
    this.cal = document.createElement("div");
    this.cal.className = "dp-calendar";
    wrap.appendChild(this.cal);

    this.trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggle();
    });
    this.wrap = wrap;
  }

  _toggle() {
    if (this.cal.classList.contains("open")) {
      this._close();
    } else {
      this._open();
    }
  }
  _open() {
    // Close any other open pickers
    document
      .querySelectorAll(".dp-calendar.open")
      .forEach((c) => c.classList.remove("open"));
    document
      .querySelectorAll(".dp-trigger.open")
      .forEach((t) => t.classList.remove("open"));
    document
      .querySelectorAll(".dp-wrap.open-level")
      .forEach((w) => w.classList.remove("open-level"));

    this._renderCal();
    this.cal.classList.add("open");
    this.trigger.classList.add("open");
    if (this.wrap) this.wrap.classList.add("open-level");

    // adjust position to prevent horizontal overflow and screen edge clipping
    this.cal.style.left = "0";
    this.cal.style.right = "auto";
    let rect = this.cal.getBoundingClientRect();
    const margin = 12;
    if (rect.right > window.innerWidth - margin) {
      this.cal.style.left = "auto";
      this.cal.style.right = "0";
      rect = this.cal.getBoundingClientRect();
    }
    if (rect.left < margin) {
      // If right-aligning or left-aligning causes left side to be cut off, shift it into view
      const shift = margin - rect.left;
      this.cal.style.left = `${shift}px`;
      this.cal.style.right = "auto";
    }

    document.addEventListener("click", this._closeOnOutside);
  }
  _close() {
    this.cal.classList.remove("open");
    this.trigger.classList.remove("open");
    if (this.wrap) this.wrap.classList.remove("open-level");
    document.removeEventListener("click", this._closeOnOutside);
  }
  _closeOnOutside(e) {
    if (!this.wrap.contains(e.target)) this._close();
  }

  _renderCal() {
    const y = this.viewDate.getFullYear();
    const m = this.viewDate.getMonth();
    const MONTHS = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const selStr = this.selected
      ? `${this.selected.getFullYear()}-${this.selected.getMonth()}-${this.selected.getDate()}`
      : null;

    // First day of month, how many blank cells before
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // Day cells
    let dayCells = "";
    for (let i = 0; i < firstDay; i++) {
      dayCells += `<button class="dp-day dp-day--empty" disabled></button>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${m}-${d}`;
      const isToday = key === todayStr;
      const isSel = key === selStr;
      let cls = "dp-day";
      if (isToday) cls += " dp-day--today";
      if (isSel) cls += " dp-day--selected";
      dayCells += `<button class="${cls}" data-d="${d}">${d}</button>`;
    }

    this.cal.innerHTML = `
      <div class="dp-header">
        <button type="button" class="dp-nav-btn" id="dpPrev">&#8249;</button>
        <div class="dp-header-text-container">
          <span class="dp-month-label" id="dpMonthText">${MONTHS[m]} ${y}</span>
        </div>
        <button type="button" class="dp-nav-btn" id="dpNext">&#8250;</button>
      </div>
      <div class="dp-weekdays">${DAYS.map(
        (d) => `<span class="dp-wd">${d}</span>`,
      ).join("")}</div>
      <div class="dp-days">${dayCells}</div>
      <div class="dp-footer">
        <button type="button" class="dp-footer-btn dp-clear-btn">Clear</button>
        <button type="button" class="dp-footer-btn dp-today-btn">Today</button>
      </div>`;

    // Events
    this.cal.querySelector("#dpPrev").addEventListener("click", (e) => {
      e.stopPropagation();
      this._changeMonth(-1);
    });
    this.cal.querySelector("#dpNext").addEventListener("click", (e) => {
      e.stopPropagation();
      this._changeMonth(1);
    });
    this.cal.querySelector(".dp-clear-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      this.selected = null;
      this._sync();
      this._close();
    });
    this.cal.querySelector(".dp-today-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      this._select(new Date());
    });
    this.cal.querySelectorAll(".dp-day[data-d]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const d = parseInt(btn.dataset.d);
        this._select(new Date(y, m, d));
      });
    });
  }

  _changeMonth(delta) {
    const label = this.cal.querySelector("#dpMonthText");
    if (!label) {
      this.viewDate.setMonth(this.viewDate.getMonth() + delta);
      this._renderCal();
      return;
    }

    const dir = delta > 0 ? "next" : "prev";
    const exitClass = dir === "next" ? "dp-slide-next-exit" : "dp-slide-prev-exit";
    const enterClass = dir === "next" ? "dp-slide-next-enter" : "dp-slide-prev-enter";

    label.className = "dp-month-label " + exitClass;

    setTimeout(() => {
      this.viewDate.setMonth(this.viewDate.getMonth() + delta);
      this._renderCal();
      const newLabel = this.cal.querySelector("#dpMonthText");
      if (newLabel) {
        newLabel.className = "dp-month-label " + enterClass;
      }
    }, 180);
  }

  _select(date) {
    this.selected = date;
    this.viewDate = new Date(date);
    this._sync();
    this._close();
    // Fire change event so listeners react
    this.input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  _sync() {
    if (this.selected) {
      const y = this.selected.getFullYear();
      const m = String(this.selected.getMonth() + 1).padStart(2, "0");
      const d = String(this.selected.getDate()).padStart(2, "0");
      this.input.value = `${y}-${m}-${d}`;
      this.trigger.textContent = this.selected.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      this.trigger.classList.remove("dp-placeholder");
    } else {
      this.input.value = "";
      this.trigger.innerHTML = `<span class="dp-placeholder">Select date…</span>`;
    }
  }

  // Public: set value from outside (e.g. when editing an expense)
  setValue(dateStr) {
    if (!dateStr) {
      this.selected = null;
    } else {
      const parts = dateStr.split("-");
      this.selected = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      this.viewDate = new Date(this.selected);
    }
    this._sync();
  }

  getValue() {
    return this.input.value;
  }
}

// Registry so we can talk to pickers by input id
const _pickers = {};
function initDatePickers() {
  document.querySelectorAll('input[type="date"]').forEach((inp) => {
    if (!inp.dataset.dpInit) {
      inp.dataset.dpInit = "1";
      _pickers[inp.id] = new DatePicker(inp);
    }
  });
}
function dpSetValue(inputId, dateStr) {
  if (_pickers[inputId]) _pickers[inputId].setValue(dateStr);
  else {
    const el = document.getElementById(inputId);
    if (el) el.value = dateStr;
  }
}
function dpGetValue(inputId) {
  if (_pickers[inputId]) return _pickers[inputId].getValue();
  const el = document.getElementById(inputId);
  return el ? el.value : "";
}

// ── CUSTOM SELECT ─────────────────────────────────────
class CustomSelect {
  constructor(select) {
    this.select = select;
    this._closeOnOutside = this._closeOnOutside.bind(this);
    this._build();
  }

  _build() {
    const wrap = document.createElement("div");
    wrap.className = "cs-wrap";
    this.select.parentNode.insertBefore(wrap, this.select);
    wrap.appendChild(this.select);

    // Trigger
    this.trigger = document.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "cs-trigger";
    this.trigger.setAttribute("aria-haspopup", "listbox");
    wrap.appendChild(this.trigger);

    // Dropdown panel
    this.dropdown = document.createElement("div");
    this.dropdown.className = "cs-dropdown";
    this.dropdown.setAttribute("role", "listbox");
    wrap.appendChild(this.dropdown);

    this.wrap = wrap;
    this.trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggle();
    });
    this._syncTrigger();
  }

  _toggle() {
    if (this.dropdown.classList.contains("open")) {
      this._close();
    } else {
      this._open();
    }
  }
  _open() {
    // Close other open custom selects
    document
      .querySelectorAll(".cs-dropdown.open")
      .forEach((d) => d.classList.remove("open"));
    document
      .querySelectorAll(".cs-trigger.open")
      .forEach((t) => t.classList.remove("open"));
    document
      .querySelectorAll(".cs-wrap.open-level")
      .forEach((w) => w.classList.remove("open-level"));

    this._renderOptions();
    this.dropdown.classList.add("open");
    this.trigger.classList.add("open");
    if (this.wrap) this.wrap.classList.add("open-level");

    this.dropdown.style.left = "0";
    this.dropdown.style.right = "auto";
    let rect = this.dropdown.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.dropdown.style.left = "auto";
      this.dropdown.style.right = "0";
    }

    document.addEventListener("click", this._closeOnOutside);
  }
  _close() {
    this.dropdown.classList.remove("open");
    this.trigger.classList.remove("open");
    if (this.wrap) this.wrap.classList.remove("open-level");
    document.removeEventListener("click", this._closeOnOutside);
  }
  _closeOnOutside(e) {
    if (!this.wrap.contains(e.target)) this._close();
  }

  _renderOptions() {
    const curVal = this.select.value;
    // Build items from state categories
    const cats = state.categories;
    if (!cats.length) {
      this.dropdown.innerHTML = `<div class="cs-empty">No categories yet. Create one first!</div>`;
      return;
    }
    this.dropdown.innerHTML = cats
      .map((cat) => {
        const isSel = curVal === cat.id;
        return `<button type="button" class="cs-option${
          isSel ? " selected" : ""
        }" data-val="${cat.id}"
          role="option" aria-selected="${isSel}">
        <span class="cs-option-icon" style="background:${cat.color}22;">${
          cat.icon
        }</span>
        <span class="cs-option-name" style="color:${cat.color}">${escHtml(
          cat.name,
        )}</span>
        <span class="cs-option-check">✓</span>
      </button>`;
      })
      .join("");

    this.dropdown.querySelectorAll(".cs-option").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.setValue(btn.dataset.val);
        this._close();
        this.select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  }

  _syncTrigger() {
    const val = this.select.value;
    const cat = state.categories.find((c) => c.id === val);
    if (cat) {
      this.trigger.innerHTML = `
        <span class="cs-trigger-icon" style="background:${cat.color}22;">${
        cat.icon
      }</span>
        <span class="cs-trigger-label" style="color:${cat.color}">${escHtml(
        cat.name,
      )}</span>`;
    } else {
      this.trigger.innerHTML = `<span class="cs-trigger-label cs-placeholder">Select a category…</span>`;
    }
  }

  setValue(val) {
    this.select.value = val;
    this._syncTrigger();
    this.select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  getValue() {
    return this.select.value;
  }

  // Rebuild the native select options then re-sync trigger
  refreshOptions(categories) {
    const prev = this.select.value;
    this.select.innerHTML =
      '<option value="">Select a category</option>' +
      categories
        .map(
          (c) =>
            `<option value="${c.id}">${c.icon} ${escHtml(c.name)}</option>`,
        )
        .join("");
    if (prev && categories.find((c) => c.id === prev)) {
      this.select.value = prev;
    }
    this._syncTrigger();
  }
}

const _cSelects = {};
function initCustomSelects() {
  document.querySelectorAll("select.form-input").forEach((sel) => {
    if (!sel.dataset.csInit) {
      sel.dataset.csInit = "1";
      _cSelects[sel.id] = new CustomSelect(sel);
    }
  });
}
function csSetValue(selectId, val) {
  if (_cSelects[selectId]) _cSelects[selectId].setValue(val);
  else {
    const el = document.getElementById(selectId);
    if (el) el.value = val;
  }
}
function csGetValue(selectId) {
  if (_cSelects[selectId]) return _cSelects[selectId].getValue();
  const el = document.getElementById(selectId);
  return el ? el.value : "";
}
function csRefresh(selectId, categories) {
  if (_cSelects[selectId]) _cSelects[selectId].refreshOptions(categories);
}

// ── GENERIC CUSTOM SELECT (filter-select / period-select) ──────────────────
class GenericCustomSelect {
  constructor(select) {
    this.select = select;
    this._closeOnOutside = this._closeOnOutside.bind(this);
    this._build();
  }

  _build() {
    const wrap = document.createElement("div");
    wrap.className = "gcs-wrap";
    this.select.parentNode.insertBefore(wrap, this.select);
    wrap.appendChild(this.select);
    // Hide native select
    this.select.style.cssText =
      "position:absolute;opacity:0;pointer-events:none;width:0;height:0;";

    this.trigger = document.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "gcs-trigger";
    wrap.appendChild(this.trigger);

    this.dropdown = document.createElement("div");
    this.dropdown.className = "gcs-dropdown";
    wrap.appendChild(this.dropdown);

    this.wrap = wrap;
    this.trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggle();
    });
    this._syncTrigger();
  }

  _toggle() {
    if (this.dropdown.classList.contains("open")) {
      this._close();
    } else {
      this._open();
    }
  }
  _open() {
    document
      .querySelectorAll(".gcs-dropdown.open,.cs-dropdown.open")
      .forEach((d) => d.classList.remove("open"));
    document
      .querySelectorAll(".gcs-trigger.open,.cs-trigger.open")
      .forEach((t) => t.classList.remove("open"));
    document
      .querySelectorAll(".gcs-wrap.open-level,.cs-wrap.open-level")
      .forEach((w) => w.classList.remove("open-level"));

    this._renderOptions();
    this.dropdown.classList.add("open");
    this.trigger.classList.add("open");
    if (this.wrap) this.wrap.classList.add("open-level");

    // Default to right-align to perfectly match floating filter buttons
    this.dropdown.style.right = "0";
    this.dropdown.style.left = "auto";
    let rect = this.dropdown.getBoundingClientRect();
    if (rect.left < 0) {
      this.dropdown.style.right = "auto";
      this.dropdown.style.left = "0";
    }

    document.addEventListener("click", this._closeOnOutside);
  }
  _close() {
    this.dropdown.classList.remove("open");
    this.trigger.classList.remove("open");
    if (this.wrap) this.wrap.classList.remove("open-level");
    document.removeEventListener("click", this._closeOnOutside);
  }
  _closeOnOutside(e) {
    if (!this.wrap.contains(e.target)) this._close();
  }

  _renderOptions() {
    const curVal = this.select.value;
    const options = Array.from(this.select.options);
    if (!options.length) {
      this.dropdown.innerHTML = `<div class="gcs-empty">No options</div>`;
      return;
    }
    this.dropdown.innerHTML = options
      .map((opt) => {
        const isSel = opt.value === curVal;
        // Extract leading emoji if present (category labels contain emoji)
        const emojiRx =
          /^([\u{1F300}-\u{1FAFF}][\uFE0F]?|[\u2600}-\u{26FF}])\s*/u;
        const em = opt.text.match(emojiRx);
        const emoji = em
          ? `<span class="gcs-option-emoji">${em[0].trim()}</span>`
          : "";
        const label = em ? opt.text.slice(em[0].length) : opt.text;
        return `<button type="button" class="gcs-option${
          isSel ? " selected" : ""
        }" data-val="${opt.value}">
        ${emoji}<span class="gcs-option-text">${escHtml(label)}</span>
        <span class="gcs-radio"></span>
      </button>`;
      })
      .join("");

    this.dropdown.querySelectorAll(".gcs-option").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.setValue(btn.dataset.val);
        this._close();
        this.select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  }

  _syncTrigger() {
    const val = this.select.value;
    const opt =
      Array.from(this.select.options).find((o) => o.value === val) ||
      this.select.options[0];
    const text = opt ? opt.text : "Select…";
    // Strip leading emoji from trigger label for cleanliness
    const emojiRx = /^([\u{1F300}-\u{1FAFF}][\uFE0F]?|[\u2600}-\u{26FF}])\s*/u;
    const clean = text.replace(emojiRx, "").trim();
    this.trigger.innerHTML = `<span class="gcs-trigger-label">${escHtml(
      clean || text,
    )}</span>`;
  }

  setValue(val) {
    this.select.value = val;
    this._syncTrigger();
  }
  getValue() {
    return this.select.value;
  }
  refresh() {
    this._syncTrigger();
    if (this.dropdown.classList.contains("open")) this._renderOptions();
  }
}

const _gSelects = {};
function initGenericCustomSelects() {
  document.querySelectorAll(".filter-select, .period-select").forEach((sel) => {
    if (!sel.dataset.gcsInit) {
      sel.dataset.gcsInit = "1";
      _gSelects[sel.id] = new GenericCustomSelect(sel);
    }
  });
}
function gcsRefresh(selectId) {
  if (_gSelects[selectId]) _gSelects[selectId].refresh();
}

// ── USER-STORAGE UID INITIALIZATION ───────────────────────
// Pre-load the last active logged-in UID from localStorage so the initial loadState()
// immediately reads the logged-in user's data with ZERO delay, before Firebase Auth resolves!
let _currentStorageUid = (() => {
  try {
    return localStorage.getItem("spendwise_active_storage_uid") || null;
  } catch (e) {
    return null;
  }
})();

function setStorageUserUid(uid) {
  _currentStorageUid = uid || null;
  try {
    if (uid) {
      localStorage.setItem("spendwise_active_storage_uid", uid);
    } else {
      localStorage.removeItem("spendwise_active_storage_uid");
    }
  } catch (e) {}
}

function getActiveStateKey() {
  if (_currentStorageUid) {
    return `spendwise_v2_${_currentStorageUid}`;
  }
  return "spendwise_v2";
}

const STATE_KEY = "spendwise_v2";
let state = {
  expenses: [],
  categories: [],
  balanceRecords: [],
  currency: "taka",
};

// ── DEFAULT CATEGORIES ─────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: "cat_food", name: "Food & Dining", icon: "🍔", color: "#f59e0b" },
  { id: "cat_trans", name: "Transport", icon: "🚗", color: "#06b6d4" },
  { id: "cat_shop", name: "Shopping", icon: "🛍️", color: "#ec4899" },
  { id: "cat_savings", name: "Savings", icon: "💰", color: "#10b981" },
  { id: "cat_health", name: "Health", icon: "💊", color: "#10b981" },
  { id: "cat_entertain", name: "Entertainment", icon: "🎬", color: "#8b5cf6" },
  { id: "cat_util", name: "Utilities", icon: "💡", color: "#f97316" },
];

const PRESET_EMOJIS = [
  "🍔",
  "🛒",
  "🚗",
  "🏠",
  "💊",
  "🎬",
  "✈️",
  "📚",
  "☕",
  "🎮",
  "👗",
  "💄",
  "🍕",
  "⚽",
  "🎵",
  "💰",
  "🌴",
  "📱",
  "🎁",
  "🏋️",
];
const PRESET_COLORS = [
  "#7c3aed",
  "#4f46e5",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#f97316",
  "#8b5cf6",
  "#0ea5e9",
  "#84cc16",
  "#14b8a6",
];

let selectedEmoji = "";
let selectedColor = PRESET_COLORS[0];
let deleteTarget = null;
let currentPage = "dashboard";

// Quick-category creator state
let qcatSelectedEmoji = "";
let qcatSelectedColor = PRESET_COLORS[0];

// ── INIT ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Detect Windows OS and activate crisp vector icon set for Windows desktop
  const isWindows = /Windows|Win32|Win64/i.test(navigator.userAgent || navigator.platform || "");
  if (isWindows) {
    document.documentElement.classList.add("is-windows");
  }
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    const installBtn = document.getElementById("nav-install");
    const downloadBtn = document.getElementById("nav-download-apk");
    if (installBtn) installBtn.style.display = "none";
    if (downloadBtn) downloadBtn.style.display = "none";
  }

  loadState();
  if (state.categories.length === 0) {
    state.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
    saveState();
  }
  initWalletSelector();
  initDatePickers();
  setTodayDates();
  buildEmojiGrid();
  buildColorGrid();
  buildQcatPickers();
  updateSidebarDate();
  renderAll();
  initCustomSelects();
  initGenericCustomSelects();
  initImportDropzone();
  // Load currency setting into input
  const cu = document.getElementById("currencyUnit");
  if (cu) cu.value = state.currency || "taka";

  // Watch expCategory change to toggle Savings Unique Code input
  const expCatEl = document.getElementById("expCategory");
  if (expCatEl) {
    expCatEl.addEventListener("change", () => {
      const selectedId = expCatEl.value;
      const cat = state.categories.find((c) => c.id === selectedId);
      const isSavings = cat && (cat.id === "cat_savings" || cat.name.toLowerCase() === "savings");
      const codeGroup = document.getElementById("savingsCodeGroup");
      if (codeGroup) {
        codeGroup.style.display = isSavings ? "block" : "none";
        const codeInput = document.getElementById("expSavingsCode");
        if (codeInput && isSavings && !codeInput.value) {
          setTimeout(() => codeInput.focus(), 50);
        }
      }
    });
  }

  
  // Close modals or sidebar on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const openModal = document.querySelector('.modal-backdrop.open, .copy-preview-modal.open');
      if (openModal) {
        if (openModal.id === 'addExpenseModal') closeAddExpenseModal();
        else if (openModal.id === 'confirmModal') closeConfirmModal();
        else if (openModal.id === 'editIncomeModal') closeEditIncomeModal();
        else if (openModal.id === 'copyTextModal') closeCopyModal();
        else if (openModal.id === 'importResultModal') closeImportResultModal();
        else openModal.classList.remove('open');
        updateScrollLocks();
        return;
      }
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList.contains('open')) {
        closeSidebar();
      }
    }
  });

  // Global Enter-key support for all forms and modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        activeEl.tagName === "INPUT" &&
        activeEl.type !== "submit" &&
        activeEl.type !== "button"
      ) {
        // Ignore inputs inside inline quick-category creator
        if (activeEl.closest("#qcatPanel")) return;
        const form = activeEl.closest("form");
        if (form) {
          e.preventDefault();
          const submitBtn = form.querySelector("button[type='submit']");
          if (submitBtn) {
            submitBtn.click();
          } else if (typeof form.requestSubmit === "function") {
            form.requestSubmit();
          }
        }
      }
    }
  });
  window.addEventListener("resize", () => {
    updateDashPillIndicator(false);
  });
  initDashFilterPillState();
  setTimeout(() => updateDashPillIndicator(false), 50);
  setTimeout(() => updateDashPillIndicator(false), 200);
});

// ── CURRENCY UNIT ───────────────────────────────────
function saveCurrencyUnit() {
  const val =
    (document.getElementById("currencyUnit")?.value || "taka").trim() || "taka";
  state.currency = val;
  saveState();
  renderAll(); // refresh preview amounts and dashboard amounts everywhere
}
function fmtCur(n) {
  const sym = state.currency || "taka";
  const num = Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // If symbol is more than 2 chars (word like "taka"), put AFTER: "1,234.00 taka"
  return sym.length > 2 ? `${num} ${sym}` : `${sym}${num}`;
}
// ── QUICK CATEGORY CREATOR ──────────────────────────────
function getUnusedColor() {
  const used = state.categories.map((c) => c.color.toLowerCase());
  const avail = PRESET_COLORS.filter((c) => !used.includes(c.toLowerCase()));
  if (avail.length > 0) return avail[Math.floor(Math.random() * avail.length)];
  return (
    "#" +
    Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, "0")
  );
}
function selectQcatColor(c) {
  const used = state.categories.map((cat) => cat.color.toLowerCase());
  if (used.includes(c.toLowerCase())) {
    showToast("This color is already taken by another category!", "error");
    qcatSelectedColor = getUnusedColor();
  } else {
    qcatSelectedColor = c;
  }
  buildQcatPickers();
}
function buildQcatPickers() {
  // Emoji grid inside quick cat panel
  const emojiEl = document.getElementById("qcatEmojis");
  if (emojiEl) {
    emojiEl.innerHTML = PRESET_EMOJIS.slice(0, 15)
      .map(
        (e) =>
          `<button type="button" class="qcat-emoji-btn" data-e="${e}">${e}</button>`,
      )
      .join("");
    emojiEl.querySelectorAll(".qcat-emoji-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        qcatSelectedEmoji = btn.dataset.e;
        document.getElementById("qcatIcon").value = qcatSelectedEmoji;
        emojiEl
          .querySelectorAll(".qcat-emoji-btn")
          .forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      });
    });
  }
  // Color grid
  const colorEl = document.getElementById("qcatColors");
  if (colorEl) {
    const used = state.categories.map((c) => c.color.toLowerCase());
    if (!qcatSelectedColor || used.includes(qcatSelectedColor.toLowerCase()))
      qcatSelectedColor = getUnusedColor();
    let html = `<div style="display: flex; flex-wrap: wrap; gap: 8px; width: 100%; align-items: center;">`;
    html += PRESET_COLORS.map((c) => {
      const isUsed = used.includes(c.toLowerCase());
      return `<button type="button" class="qcat-color-btn ${
        c === qcatSelectedColor ? "selected" : ""
      } ${
        isUsed ? "used" : ""
      }" data-c="${c}" style="background:${c}; border:2px solid transparent; ${
        isUsed ? "opacity:0.3; cursor:not-allowed;" : ""
      }" ${isUsed ? "disabled title='Already Used'" : ""}></button>`;
    }).join("");

    // Beautiful color wheel icon wrapper
    html += `<div style="display:flex; align-items:center;">
      <label class="qcat-color-btn" style="background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red); position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: pointer; width: 32px; height: 32px;" title="Custom Color">
        <input type="color" value="${qcatSelectedColor}" style="opacity:0; position:absolute; width:100%; height:100%; cursor:pointer;" onchange="selectQcatColor(this.value)">
        <span style="display:block; width:14px; height:14px; background:#fff; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.3); pointer-events:none;"></span>
      </label>
    </div></div>`;

    colorEl.innerHTML = html;
    colorEl
      .querySelectorAll(".qcat-color-btn:not([disabled])")
      .forEach((btn) => {
        if (btn.dataset.c)
          btn.addEventListener("click", () => selectQcatColor(btn.dataset.c));
      });
  }
}

function toggleQuickCat() {
  const panel = document.getElementById("qcatPanel");
  const isOpen = panel.classList.contains("open");
  panel.classList.toggle("open", !isOpen);
  if (!isOpen) {
    // Reset fields when opening
    document.getElementById("qcatName").value = "";
    document.getElementById("qcatIcon").value = "";
    qcatSelectedEmoji = "";
    qcatSelectedColor = getUnusedColor();
    buildQcatPickers();
    setTimeout(() => document.getElementById("qcatName").focus(), 100);
  }
}

function saveQuickCategory() {
  const name = document.getElementById("qcatName").value.trim();
  const icon =
    document.getElementById("qcatIcon").value.trim() ||
    qcatSelectedEmoji ||
    "🏷️";
  const color = qcatSelectedColor || PRESET_COLORS[0];

  if (!name) {
    document.getElementById("qcatName").focus();
    showToast("Please enter a category name.", "error");
    return;
  }

  // Prevent duplicates
  if (
    state.categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
  ) {
    showToast(`"${name}" already exists. Select it from the list.`, "error");
    return;
  }

  const newCat = { id: uid(), name, icon, color };
  state.categories.push(newCat);
  saveState();

  // Refresh the custom select with new options and auto-select new category
  populateCategoryDropdowns();
  csSetValue("expCategory", newCat.id);

  // Refresh categories page grid too
  renderCategories();

  // Close panel
  const panel = document.getElementById("qcatPanel");
  panel.classList.remove("open");

  showToast(`"${icon} ${name}" created and selected!`, "success");
}

// ── PERSISTENCE & WALLET MANAGER ───────────────────────
function loadState() {
  const activeKey = getActiveStateKey();
  try {
    const raw = localStorage.getItem(activeKey);
    if (raw) {
      // Clear memory fully before loading new state, so stale keys
      // like `accounts` don't override the restored data.
      for (const key in state) {
        delete state[key];
      }
      Object.assign(state, JSON.parse(raw));
    } else {
      // Clear all state keys if there is no data in localStorage
      // (e.g., after logging out or explicitly resetting data)
      for (const key in state) {
        delete state[key];
      }
      Object.assign(state, {
        expenses: [],
        categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
        balanceRecords: [],
        currency: "taka",
        accounts: null,
        activeAccountId: null,
      });
    }
  } catch (e) {}

  if (!state.accounts) {
    state.accounts = {
      wallet_main: {
        name: "Main Wallet",
        expenses: state.expenses || [],
        balanceRecords: state.balanceRecords || [],
      },
    };
    state.activeAccountId = "wallet_main";
  }

  const activeId = state.activeAccountId || "wallet_main";
  if (state.accounts[activeId]) {
    state.expenses = state.accounts[activeId].expenses || [];
    state.balanceRecords = state.accounts[activeId].balanceRecords || [];
  }

  state.expenses = state.expenses || [];
  if (!state.categories || state.categories.length === 0) {
    state.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  } else if (!state.categories.find(c => c.id === "cat_savings" || c.name.toLowerCase() === "savings")) {
    state.categories.push({ id: "cat_savings", name: "Savings", icon: "💰", color: "#10b981" });
  }
  state.balanceRecords = state.balanceRecords || [];
  if (!state.savingsVaults) {
    state.savingsVaults = [];
  }
}

let _autoBackupTimer = null;
function saveState() {
  const activeId = state.activeAccountId || "wallet_main";
  if (!state.accounts) state.accounts = {};
  if (!state.accounts[activeId]) state.accounts[activeId] = { name: "Wallet" };

  state.accounts[activeId].expenses = state.expenses;
  state.accounts[activeId].balanceRecords = state.balanceRecords;

  const activeKey = getActiveStateKey();
  localStorage.setItem(activeKey, JSON.stringify(state));
  if (typeof pushToCloud === "function" && _currentUser && !_isApplyingCloudChange) {
    clearTimeout(_autoBackupTimer);
    _autoBackupTimer = setTimeout(() => {
      pushToCloud(state, true);
    }, 800);
  }
}

function initWalletSelector() {
  // Ensure default wallet profile exists in accounts
  if (!state.accounts || typeof state.accounts !== "object" || Object.keys(state.accounts).length === 0) {
    state.accounts = {
      wallet_main: {
        name: "Main Wallet",
        expenses: state.expenses || [],
        balanceRecords: state.balanceRecords || [],
      },
    };
    state.activeAccountId = "wallet_main";
  }

  const activeId = state.activeAccountId || "wallet_main";
  state.activeAccountId = activeId;
  if (!state.accounts[activeId]) {
    state.accounts[activeId] = {
      name: "Main Wallet",
      expenses: state.expenses || [],
      balanceRecords: state.balanceRecords || [],
    };
  }

  const display = document.getElementById("currentWalletDisplay");
  if (display) {
    display.textContent = state.accounts[activeId].name || "Main Wallet";
  }
}

function switchWallet(id) {
  if (id === state.activeAccountId || !state.accounts[id]) return;
  saveState();
  state.activeAccountId = id;
  const acc = state.accounts[id];
  state.expenses = acc.expenses || [];
  state.balanceRecords = acc.balanceRecords || [];

  initWalletSelector();
  saveState();
  renderAll();
}

function promptNewWallet() {
  const name = prompt("Enter new wallet/balance name:");
  if (name && name.trim()) {
    saveState();
    const id = "wallet_" + Date.now();
    state.accounts[id] = {
      name: name.trim(),
      expenses: [],
      balanceRecords: [],
    };
    state.activeAccountId = id;
    state.expenses = [];
    state.balanceRecords = [];

    initWalletSelector();
    saveState();
    renderAll();
    showToast("Switched to new wallet context!", "success");
  }
}

// ── NAVIGATION ─────────────────────────────────────────
function navigateTo(page) {
  currentPage = page;
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  const pg = document.getElementById(`page-${page}`);
  const nav = document.getElementById(`nav-${page}`);
  if (pg) pg.classList.add("active");
  if (nav) nav.classList.add("active");
  const titles = {
    dashboard: "Dashboard",
    transactions: "Transactions",
    categories: "Categories",
    balance: "Balance",
    savings: "Savings & Goals",
    export: "Export / Import",
    cloud: "Cloud Backup",
  };
  document.getElementById("topbarTitle").textContent = titles[page] || "";
  closeSidebar();
  if (page === "dashboard") setTimeout(() => updateDashPillIndicator(false), 50);
  if (page === "savings") renderSavingsPage();
  if (page === "export") renderExportPreview();
  if (page === "transactions") populateCategoryFilter();
}


// ── SCROLL LOCKING HELPERS ─────────────────────────────
function updateScrollLocks() {
  const hasOpenModal = !!document.querySelector('.modal-backdrop.open, .copy-preview-modal.open');
  const sidebar = document.getElementById('sidebar');
  const hasOpenSidebar = !!(sidebar && sidebar.classList.contains('open'));

  // Body classes
  document.body.classList.toggle('modal-open', hasOpenModal);
  document.body.classList.toggle('sidebar-open', hasOpenSidebar);

  // If any modal or mobile sidebar is open, lock body/pages-container scroll
  if (hasOpenModal || (hasOpenSidebar && window.innerWidth <= 900)) {
    document.body.style.overflow = 'hidden';
    const pc = document.querySelector('.pages-container');
    if (pc) pc.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
    const pc = document.querySelector('.pages-container');
    if (pc) pc.style.overflow = '';
  }
}

// ── SIDEBAR (MOBILE) ───────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("navOverlay");
  const isOpen = sidebar.classList.toggle("open");
  if (overlay) overlay.classList.toggle("open", isOpen);
  updateScrollLocks();
}
function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("navOverlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("open");
  updateScrollLocks();
}

// ── DATE HELPERS ───────────────────────────────────────
function setTodayDates() {
  const today = new Date().toISOString().split("T")[0];
  dpSetValue("expDate", today);
  dpSetValue("balDate", today);
  dpSetValue("exportFrom", firstDayOfMonth());
  dpSetValue("exportTo", today);
}
function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function fmtAmount(n) {
  return fmtCur(n);
}
function updateSidebarDate() {
  const el = document.getElementById("sidebarDate");
  if (el)
    el.textContent = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── RENDER ALL ─────────────────────────────────────────
function renderAll() {
  renderDashboard();
  renderTransactions();
  renderCategories();
  renderBalanceHistory();
  populateCategoryDropdowns();
  initWalletSelector();
  renderSavingsPage();
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    try { lucide.createIcons(); } catch(e) {}
  }
  if (currentPage === "export") renderExportPreview();
}

// ── DASHBOARD FILTER STATE & HELPERS ───────────────────
let dashFilterMode = (() => {
  try {
    return localStorage.getItem("spendwise_dash_filter") || "all";
  } catch (e) {
    return "all";
  }
})();
let dashCustomStart = "";
let dashCustomEnd = "";

function initDashFilterPillState() {
  document.querySelectorAll("#dashFilterPills .dash-filter-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-filter") === dashFilterMode);
  });
  const customInputs = document.getElementById("dashCustomRangeInputs");
  if (customInputs) customInputs.classList.toggle("show", dashFilterMode === "custom");
  updateDashPillIndicator(false);
}

function updateDashPillIndicator(animate = true) {
  const container = document.getElementById("dashFilterPills");
  const indicator = document.getElementById("dashPillIndicator");
  if (!container || !indicator) return;

  const activeBtn = container.querySelector(`.dash-filter-pill[data-filter="${dashFilterMode}"]`);
  if (!activeBtn) return;

  const cRect = container.getBoundingClientRect();
  const bRect = activeBtn.getBoundingClientRect();

  const left = bRect.left - cRect.left + container.scrollLeft;
  const width = bRect.width;

  if (!animate) {
    indicator.style.transition = "none";
  } else {
    indicator.style.transition = "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
  }

  indicator.style.transform = `translateX(${left}px)`;
  indicator.style.width = `${width}px`;

  // On mobile, smoothly scroll active pill into visible container if partially hidden
  if (container.scrollWidth > container.clientWidth) {
    const scrollTarget = left - (container.clientWidth - width) / 2;
    container.scrollTo({ left: Math.max(0, scrollTarget), behavior: animate ? "smooth" : "auto" });
  }
}

function setDashboardFilter(mode) {
  dashFilterMode = mode;
  try {
    localStorage.setItem("spendwise_dash_filter", mode);
  } catch (e) {}
  document.querySelectorAll("#dashFilterPills .dash-filter-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-filter") === mode);
  });
  updateDashPillIndicator(true);

  // Trigger Apple-style subtle transition on dashboard data elements
  const animEls = document.querySelectorAll(
    "#dashIncome, #dashExpenses, #dashExpenseCount, #dashIncomeSub, #dashFilterActiveLabel, #recentTransactions, #donutChart, #chartLegend"
  );
  animEls.forEach((el) => {
    el.classList.add(el.id === "dashFilterActiveLabel" ? "ios-badge-shift" : (el.classList.contains("card-amount") ? "ios-val-shift" : "ios-content-fade"));
  });

  const customInputs = document.getElementById("dashCustomRangeInputs");
  if (customInputs) customInputs.classList.toggle("show", mode === "custom");
  if (mode === "custom") {
    const todayStr = today();
    if (!dashCustomStart) dashCustomStart = firstDayOfMonth();
    if (!dashCustomEnd) dashCustomEnd = todayStr;
    const sEl = document.getElementById("dashStartDate");
    const eEl = document.getElementById("dashEndDate");
    if (sEl) sEl.value = dashCustomStart;
    if (eEl) eEl.value = dashCustomEnd;
  }

  setTimeout(() => {
    renderDashboard();
    requestAnimationFrame(() => {
      animEls.forEach((el) => {
        el.classList.remove("ios-badge-shift", "ios-val-shift", "ios-content-fade");
      });
    });
  }, 90);
}

function onCustomDateRangeChange() {
  const sEl = document.getElementById("dashStartDate");
  const eEl = document.getElementById("dashEndDate");
  if (sEl && sEl.value) dashCustomStart = sEl.value;
  if (eEl && eEl.value) dashCustomEnd = eEl.value;
  renderDashboard();
}

function getFilteredDataForDashboard() {
  const now = new Date();
  const todayStr = today();
  let startDate = null;
  let endDate = null;
  let labelText = "All Time History";

  if (dashFilterMode === "today") {
    startDate = todayStr;
    endDate = todayStr;
    labelText = "Today (" + fmtDate(todayStr) + ")";
  } else if (dashFilterMode === "week") {
    const w = new Date(now);
    w.setDate(now.getDate() - 6);
    startDate = w.toISOString().split("T")[0];
    endDate = todayStr;
    labelText = "This Week (" + fmtDate(startDate) + " - " + fmtDate(endDate) + ")";
  } else if (dashFilterMode === "month") {
    startDate = firstDayOfMonth();
    endDate = todayStr;
    labelText = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } else if (dashFilterMode === "custom") {
    startDate = dashCustomStart || firstDayOfMonth();
    endDate = dashCustomEnd || todayStr;
    labelText = fmtDate(startDate) + " to " + fmtDate(endDate);
  } else {
    labelText = "All Time History";
  }

  const lblEl = document.getElementById("dashFilterActiveLabel");
  if (lblEl) lblEl.innerHTML = "<span>📅</span> " + escHtml(labelText);

  if (dashFilterMode === "all" || (!startDate && !endDate)) {
    return { expenses: state.expenses, incomes: state.balanceRecords, isFiltered: false };
  }

  const filteredExpenses = state.expenses.filter((e) => e.date >= startDate && e.date <= endDate);
  const filteredIncomes = state.balanceRecords.filter((b) => b.date >= startDate && b.date <= endDate);

  return { expenses: filteredExpenses, incomes: filteredIncomes, isFiltered: true };
}

function getFilteredExpensesForDashboard() {
  return getFilteredDataForDashboard().expenses;
}

// ── DASHBOARD ──────────────────────────────────────────
function renderDashboard() {
  const filteredData = typeof getFilteredDataForDashboard === "function"
    ? getFilteredDataForDashboard()
    : { expenses: state.expenses, incomes: state.balanceRecords, isFiltered: false };

  const filteredExpenses = filteredData.expenses;
  const filteredIncomes = filteredData.incomes;

  const totalAllExpenses = state.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalAllIncome = state.balanceRecords.reduce((s, b) => s + Number(b.amount), 0);
  const netWalletBalance = totalAllIncome - totalAllExpenses;

  // Filtered sums
  const displayedExpensesTotal = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const displayedIncomeTotal = filteredIncomes.reduce((s, b) => s + Number(b.amount), 0);

  const dashBalEl = document.getElementById("dashBalance");
  const dashIncEl = document.getElementById("dashIncome");
  const dashIncSubEl = document.getElementById("dashIncomeSub");
  const dashExpEl = document.getElementById("dashExpenses");
  const dashCountEl = document.getElementById("dashExpenseCount");
  const dashDateEl = document.getElementById("dashBalanceDate");

  if (dashBalEl) dashBalEl.textContent = fmtAmount(netWalletBalance);

  // Total Income dynamic display based on filter
  if (dashIncEl) {
    if (dashFilterMode === "all") {
      dashIncEl.textContent = fmtAmount(totalAllIncome);
    } else {
      dashIncEl.textContent = fmtAmount(displayedIncomeTotal);
    }
  }

  if (dashIncSubEl) {
    if (dashFilterMode === "all") {
      dashIncSubEl.textContent = "All time deposits";
    } else {
      dashIncSubEl.textContent = `${filteredIncomes.length} deposit${filteredIncomes.length !== 1 ? "s" : ""} in period`;
    }
  }

  // Total Expenses display
  if (dashExpEl) dashExpEl.textContent = fmtAmount(displayedExpensesTotal);

  if (dashCountEl) {
    if (dashFilterMode === "all") {
      dashCountEl.textContent = `${state.expenses.length} transaction${state.expenses.length !== 1 ? "s" : ""}`;
    } else {
      dashCountEl.textContent = `${filteredExpenses.length} in selected period`;
    }
  }

  if (dashDateEl) {
    if (dashFilterMode === "all") {
      dashDateEl.textContent = "All time net balance";
    } else {
      dashDateEl.textContent = `Current net balance`;
    }
  }

  renderRecentTransactions(filteredExpenses);
  renderChart();
  renderBarChart();
}

function computeCurrentBalance() {
  const totalExpenses = state.expenses.reduce(
    (s, e) => s + Number(e.amount),
    0,
  );
  const totalIncome = state.balanceRecords.reduce(
    (s, b) => s + Number(b.amount),
    0,
  );
  return totalIncome - totalExpenses;
}

// ── RECENT TRANSACTIONS ────────────────────────────────
function renderRecentTransactions(listOverride) {
  const el = document.getElementById("recentTransactions");
  if (!el) return;
  const source = listOverride !== undefined ? listOverride : state.expenses;
  const sorted = [...source]
    .sort((a, b) => {
      const diff = new Date(b.date) - new Date(a.date);
      if (diff !== 0) return diff;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      return tB - tA;
    })
    .slice(0, 8);
  if (!sorted.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🧾</div><p>No transactions found for this period.<br/>Add an expense or switch filter!</p></div>`;
    return;
  }
  el.innerHTML = `<div class="preview-table-wrap">
    <table class="preview-table">
      <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Note</th><th class="col-amount">Amount</th><th class="col-actions">Actions</th></tr></thead>
      <tbody>${sorted.map((e) => txItemHTML(e)).join("")}</tbody>
    </table>
  </div>`;
}

function txItemHTML(expense) {
  const cat = state.categories.find((c) => c.id === expense.categoryId) || {
    icon: "💸",
    name: "Uncategorized",
    color: "#7c3aed",
  };
  const isSavings = cat.id === "cat_savings" || cat.name.toLowerCase() === "savings" || !!expense.savingsCode;
  const savingsBadge = expense.savingsCode
    ? `<span style="display:inline-block; margin-left:6px; padding: 2px 6px; border-radius: 4px; background: rgba(16,185,129,0.15); color: #10b981; font-size: 10px; font-weight: 800; letter-spacing:0.5px;">${escHtml(expense.savingsCode)}</span>`
    : "";

  return `<tr>
    <td style="white-space: nowrap;">${fmtDate(expense.date)}</td>
    <td style="font-weight: 600;">${escHtml(expense.desc)}${savingsBadge}</td>
    <td style="white-space: nowrap;"><span style="display:inline-block; padding: 4px 8px; border-radius: 4px; background: ${
      cat.color
    }22; color: ${cat.color}; font-size: 11px; font-weight: 700;">${
    cat.icon
  } ${escHtml(cat.name)}</span></td>
    <td>${expense.note ? escHtml(expense.note) : "—"}</td>
    <td class="cell-amount">−${fmtAmount(expense.amount)}</td>
    <td class="cell-actions">
      <button style="background:none;border:none;cursor:pointer;font-size:15px;margin:0 3px;padding:3px;border-radius:4px;" title="Edit" onclick="editExpense('${
        expense.id
      }')">✏️</button>
      <button style="background:none;border:none;cursor:pointer;font-size:15px;margin:0 3px;padding:3px;border-radius:4px;" title="Delete" onclick="promptDeleteExpense('${
        expense.id
      }')">🗑️</button>
    </td>
  </tr>`;
}

// ── DONUT CHART ────────────────────────────────────────
function renderChart() {
  const periodEl = document.getElementById("chartPeriodFilter");
  const period = periodEl ? periodEl.value : "all";
  const baseExpenses = (typeof getFilteredExpensesForDashboard === "function" && dashFilterMode !== "all" && period === "all")
    ? getFilteredExpensesForDashboard()
    : state.expenses;
  const filtered = filterByPeriod(baseExpenses, period);

  const groups = {};
  filtered.forEach((e) => {
    const cat = state.categories.find((c) => c.id === e.categoryId);
    const key = cat ? cat.id : "__other";
    groups[key] = (groups[key] || 0) + Number(e.amount);
  });

  const total = Object.values(groups).reduce((s, v) => s + v, 0);
  const canvas = document.getElementById("donutChart");
  const noData = document.getElementById("chartNoData");
  const legendEl = document.getElementById("chartLegend");

  if (total === 0) {
    canvas.style.display = "none";
    legendEl.style.display = "none";
    noData.style.display = "flex";
    return;
  }
  canvas.style.display = "";
  legendEl.style.display = "";
  noData.style.display = "none";

  const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  canvas._entries = entries;
  canvas._total = total;

  if (!canvas._hasHover) {
    canvas._hasHover = true;
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = 110,
        cy = 110;
      const dx = mx - cx,
        dy = my - cy;
      const r = Math.sqrt(dx * dx + dy * dy);

      let hoverIdx = -1;
      if (r >= 55 && r <= 105) {
        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += Math.PI * 2;

        let curAngle = 0;
        for (let i = 0; i < canvas._entries.length; i++) {
          let sweep = (canvas._entries[i][1] / canvas._total) * Math.PI * 2;
          if (angle >= curAngle && angle <= curAngle + sweep) {
            hoverIdx = i;
            break;
          }
          curAngle += sweep;
        }
      }

      if (canvas._hoverIdx !== hoverIdx) {
        canvas._hoverIdx = hoverIdx;
        canvas.style.cursor = hoverIdx !== -1 ? "pointer" : "default";
        if (!canvas._animating) {
          canvas._animating = true;
          requestAnimationFrame(() => animateDonut(canvas));
        }
      }
    });

    canvas.addEventListener("mouseleave", () => {
      if (canvas._hoverIdx !== -1) {
        canvas._hoverIdx = -1;
        canvas.style.cursor = "default";
        if (!canvas._animating) {
          canvas._animating = true;
          requestAnimationFrame(() => animateDonut(canvas));
        }
      }
    });
  }

  drawDonutCore(canvas, entries, total, -1);

  const colors = entries.map(([id]) => {
    const cat = state.categories.find((c) => c.id === id);
    return cat ? cat.color : "#7c3aed";
  });

  legendEl.innerHTML = entries
    .slice(0, 6)
    .map(([id, val], i) => {
      const cat = state.categories.find((c) => c.id === id);
      const name = cat ? cat.name : "Other";
      const pct = ((val / total) * 100).toFixed(1);
      return `<div class="legend-item" 
                 onmouseenter="canvas._hoverIdx = ${i}; if(!canvas._animating) { canvas._animating = true; requestAnimationFrame(() => animateDonut(canvas)); }"
                 onmouseleave="canvas._hoverIdx = -1; if(!canvas._animating) { canvas._animating = true; requestAnimationFrame(() => animateDonut(canvas)); }">
      <div class="legend-dot" style="background:${colors[i]};"></div>
      <span class="legend-name">${escHtml(name)}</span>
      <span class="legend-pct">${pct}%</span>
    </div>`;
    })
    .join("");
}

function animateDonut(canvas) {
  let needsUpdate = false;
  const hoverIdx = canvas._hoverIdx;

  if (!canvas._animStates) canvas._animStates = [];
  if (canvas._fadeState === undefined) canvas._fadeState = 0;

  const len = canvas._entries ? canvas._entries.length : 0;
  for (let i = 0; i < len; i++) {
    const target = i === hoverIdx ? 1 : 0;
    const current = canvas._animStates[i] || 0;
    if (Math.abs(target - current) > 0.01) {
      canvas._animStates[i] = current + (target - current) * 0.15;
      needsUpdate = true;
    } else {
      canvas._animStates[i] = target;
    }
  }

  const targetFade = hoverIdx === -1 ? 0 : 1;
  if (Math.abs(targetFade - canvas._fadeState) > 0.01) {
    canvas._fadeState += (targetFade - canvas._fadeState) * 0.15;
    needsUpdate = true;
  } else {
    canvas._fadeState = targetFade;
  }

  drawDonutCore(canvas, canvas._entries, canvas._total, hoverIdx);

  if (needsUpdate) {
    requestAnimationFrame(() => animateDonut(canvas));
  } else {
    canvas._animating = false;
  }
}

function drawDonutCore(canvas, entries, total, hoverIdx) {
  const dpr = window.devicePixelRatio || 1;
  const SIZE = 220;
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width = SIZE + "px";
  canvas.style.height = SIZE + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const cx = 110,
    cy = 110,
    innerR = 60;
  let startAngle = -Math.PI / 2;

  const colors = entries.map(([id]) => {
    const cat = state.categories.find((c) => c.id === id);
    return cat ? cat.color : "#7c3aed";
  });

  entries.forEach(([id, val], i) => {
    const sweep = (val / total) * Math.PI * 2;

    // Smooth interpolation states
    const popScale = canvas._animStates
      ? canvas._animStates[i] || 0
      : hoverIdx === i
      ? 1
      : 0;
    const fadeState =
      canvas._fadeState !== undefined
        ? canvas._fadeState
        : hoverIdx !== -1 && hoverIdx !== i
        ? 1
        : 0;

    const outerR = 96 + popScale * 8;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerR, startAngle, startAngle + sweep);
    ctx.arc(cx, cy, innerR, startAngle + sweep, startAngle, true);
    ctx.closePath();

    const sliceAlpha = Math.min(
      1,
      Math.max(0, 1 - fadeState * 0.6 + popScale * 0.6 * fadeState),
    );
    ctx.globalAlpha = sliceAlpha;
    ctx.fillStyle = colors[i];
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    startAngle += sweep;
  });

  // White center circle for clean donut look
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Center text
  ctx.fillStyle = "#111827";
  ctx.font = `bold 16px 'Hind Siliguri', Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (hoverIdx !== -1 && entries[hoverIdx]) {
    const val = entries[hoverIdx][1];
    const cat = state.categories.find((c) => c.id === entries[hoverIdx][0]);
    ctx.fillText(fmtAmount(val), cx, cy - 8);
    ctx.fillStyle = colors[hoverIdx];
    ctx.font = `bold 12px 'Hind Siliguri', Inter, sans-serif`;
    ctx.fillText(cat ? cat.name : "Other", cx, cy + 12);
  } else {
    ctx.fillText(fmtAmount(total), cx, cy - 8);
    ctx.fillStyle = "#6b7280";
    ctx.font = `11px 'Hind Siliguri', Inter, sans-serif`;
    ctx.fillText("Total Spent", cx, cy + 12);
  }
}

// ── BAR CHART ──────────────────────────────────────────
function renderBarChart() {
  const el = document.getElementById("barChart");
  // Group by month (last 6 months)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short" }),
      total: 0,
    });
  }
  state.expenses.forEach((e) => {
    const mk = e.date.slice(0, 7);
    const m = months.find((m) => m.key === mk);
    if (m) m.total += Number(e.amount);
  });

  const max = Math.max(...months.map((m) => m.total), 1);
  el.innerHTML = months
    .map((m) => {
      const h = Math.max((m.total / max) * 110, 4);
      return `<div class="bar-wrap">
      <div class="bar" style="height:${h}px;">
        <div class="bar-tooltip">${fmtAmount(m.total)}</div>
      </div>
      <span class="bar-label">${m.label}</span>
    </div>`;
    })
    .join("");
}

function filterByPeriod(expenses, period) {
  const now = new Date();
  return expenses.filter((e) => {
    const d = new Date(e.date + "T00:00:00");
    if (period === "month")
      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      );
    if (period === "week") {
      const week = new Date(now);
      week.setDate(now.getDate() - 7);
      return d >= week;
    }
    return true;
  });
}

// ── TRANSACTIONS PAGE ──────────────────────────────────
function renderTransactions() {
  filterTransactions();
}

function filterTransactions() {
  const search = (
    document.getElementById("txSearch")?.value || ""
  ).toLowerCase();
  const catF = document.getElementById("txCategoryFilter")?.value || "";
  const sort = document.getElementById("txSortFilter")?.value || "date-desc";
  const el = document.getElementById("allTransactions");

  let list = [...state.expenses];
  if (search)
    list = list.filter(
      (e) =>
        e.desc.toLowerCase().includes(search) ||
        (e.note || "").toLowerCase().includes(search),
    );
  if (catF) list = list.filter((e) => e.categoryId === catF);

  list.sort((a, b) => {
    if (sort === "date-desc") {
      const diff = new Date(b.date) - new Date(a.date);
      if (diff !== 0) return diff;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      return tB - tA;
    }
    if (sort === "date-asc") {
      const diff = new Date(a.date) - new Date(b.date);
      if (diff !== 0) return diff;
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tA - tB;
    }
    if (sort === "amount-desc") return Number(b.amount) - Number(a.amount);
    if (sort === "amount-asc") return Number(a.amount) - Number(b.amount);
    return 0;
  });

  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No transactions found.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="preview-table-wrap">
    <table class="preview-table">
      <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Note</th><th class="col-amount">Amount</th><th class="col-actions">Actions</th></tr></thead>
      <tbody>${list.map((e) => txItemHTML(e)).join("")}</tbody>
    </table>
  </div>`;
}

function populateCategoryFilter() {
  const sel = document.getElementById("txCategoryFilter");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML =
    '<option value="">All Categories</option>' +
    state.categories
      .map(
        (c) =>
          `<option value="${c.id}">${escHtml(c.icon)} ${escHtml(
            c.name,
          )}</option>`,
      )
      .join("");
  sel.value = cur;
  gcsRefresh("txCategoryFilter");
}

// ── ADD EXPENSE MODAL ──────────────────────────────────
function openAddExpenseModal(editId = null, defaultCatId = null) {
  const modal = document.getElementById("addExpenseModal");
  const form = document.getElementById("expenseForm");
  const today = new Date().toISOString().split("T")[0];

  const catGroup = document.getElementById("expenseCategoryGroup");
  const codeGroup = document.getElementById("savingsCodeGroup");
  const codeInput = document.getElementById("expSavingsCode");

  if (editId) {
    const exp = state.expenses.find((e) => e.id === editId);
    if (!exp) return;
    document.getElementById("expenseEditId").value = editId;
    document.getElementById("expDesc").value = exp.desc;
    document.getElementById("expAmount").value = exp.amount;
    dpSetValue("expDate", exp.date);
    csSetValue("expCategory", exp.categoryId);
    document.getElementById("expNote").value = exp.note || "";
    if (codeInput) codeInput.value = exp.savingsCode || "";

    const cat = state.categories.find(c => c.id === exp.categoryId);
    const isSavings = cat && (cat.id === "cat_savings" || cat.name.toLowerCase() === "savings");
    if (codeGroup) codeGroup.style.display = isSavings ? "block" : "none";
    if (catGroup) catGroup.style.display = isSavings ? "none" : "block";

    document.getElementById("expenseModalTitle").textContent = isSavings ? "Edit Savings" : "Edit Expense";
    document.getElementById("expenseSubmitBtn").textContent = "Save Changes";
  } else {
    form.reset();
    document.getElementById("expenseEditId").value = "";
    dpSetValue("expDate", today);
    if (codeInput) codeInput.value = "";

    const targetCat = defaultCatId || "";
    csSetValue("expCategory", targetCat);

    const cat = state.categories.find(c => c.id === targetCat);
    const isSavings = cat && (cat.id === "cat_savings" || cat.name.toLowerCase() === "savings");
    if (codeGroup) codeGroup.style.display = isSavings ? "block" : "none";
    // If opened specifically for Savings, hide category dropdown completely!
    if (catGroup) catGroup.style.display = isSavings ? "none" : "block";

    document.getElementById("expenseModalTitle").textContent = isSavings ? "Add Savings Deposit" : "Add Expense";
    document.getElementById("expenseSubmitBtn").textContent = isSavings ? "+ Save Money" : "Add Expense";
  }
  // Re-populate category dropdown (reset() clears it)
  populateCategoryDropdowns();
  modal.classList.add("open");
  updateScrollLocks();
}

function openAddExpenseModalForSavings() {
  const savingsCat = state.categories.find(c => c.id === "cat_savings" || c.name.toLowerCase() === "savings");
  openAddExpenseModal(null, savingsCat ? savingsCat.id : "cat_savings");
}
function closeAddExpenseModal() {
  document.getElementById("addExpenseModal").classList.remove("open");
  updateScrollLocks();
  // Also collapse quick-cat panel if open
  const panel = document.getElementById("qcatPanel");
  const togBtn = document.getElementById("qcatToggleBtn");
  if (panel) panel.classList.remove("open");
  if (togBtn) {
    togBtn.classList.remove("active");
    togBtn.textContent = "＋ New Category";
  }
}
function handleModalBackdropClick(e) {
  if (e.target === document.getElementById("addExpenseModal"))
    closeAddExpenseModal();
}

function saveExpense(event) {
  event.preventDefault();
  const editId = document.getElementById("expenseEditId").value;
  const desc = document.getElementById("expDesc").value.trim();
  const amountVal = document.getElementById("expAmount").value;
  const amount = parseFloat(amountVal);
  const date = document.getElementById("expDate").value;
  let catId = csGetValue("expCategory");
  const note = document.getElementById("expNote").value.trim();

  // If opened in savings mode, automatically ensure savings category is set
  const catGroup = document.getElementById("expenseCategoryGroup");
  const isSavingsMode = catGroup && catGroup.style.display === "none";
  if (isSavingsMode && !catId) {
    const savingsCat = state.categories.find(c => c.id === "cat_savings" || c.name.toLowerCase() === "savings");
    if (savingsCat) catId = savingsCat.id;
  }

  if (!desc) {
    showToast("Please enter a description or goal name.", "error");
    document.getElementById("expDesc")?.focus();
    return;
  }
  if (!amountVal || isNaN(amount) || amount <= 0) {
    showToast("Please enter a valid amount.", "error");
    document.getElementById("expAmount")?.focus();
    return;
  }
  if (!date) {
    showToast("Please pick a date.", "error");
    return;
  }
  if (!catId) {
    showToast("Please select a category.", "error");
    return;
  }

  const cat = state.categories.find(c => c.id === catId);
  const isSavings = cat && (cat.id === "cat_savings" || cat.name.toLowerCase() === "savings");
  let savingsCode = "";
  if (isSavings) {
    const codeEl = document.getElementById("expSavingsCode");
    savingsCode = ((codeEl ? codeEl.value : "") || desc || "GENERAL").trim().toUpperCase();
  }

  if (editId) {
    const idx = state.expenses.findIndex((e) => e.id === editId);
    if (idx >= 0) {
      state.expenses[idx] = {
        ...state.expenses[idx],
        desc,
        amount,
        date,
        categoryId: catId,
        note,
        savingsCode: isSavings ? savingsCode : undefined,
      };
      showToast(isSavings ? "Savings record updated!" : "Expense updated!", "success");
    }
  } else {
    state.expenses.push({
      id: uid(),
      desc,
      amount,
      date,
      categoryId: catId,
      note,
      savingsCode: isSavings ? savingsCode : undefined,
      createdAt: new Date().toISOString(),
    });
    showToast(isSavings ? `Saved ${fmtAmount(amount)} to "${savingsCode}"!` : "Expense added!", "success");
  }
  saveState();
  renderAll();
  closeAddExpenseModal();
}

function editExpense(id) {
  openAddExpenseModal(id);
}

// ── DELETE EXPENSE ─────────────────────────────────────
function promptDeleteExpense(id) {
  deleteTarget = { type: "expense", id };
  document.getElementById("confirmMessage").textContent =
    "Delete this expense? This cannot be undone.";
  document.getElementById("confirmModal").classList.add("open");
  updateScrollLocks();
}
function promptDeleteCategory(id) {
  const used = state.expenses.some((e) => e.categoryId === id);
  const msg = used
    ? "This category has expenses linked to it. Deleting it will leave those expenses uncategorized. Continue?"
    : "Delete this category?";
  deleteTarget = { type: "category", id };
  document.getElementById("confirmMessage").textContent = msg;
  document.getElementById("confirmModal").classList.add("open");
}
function promptDeleteBalance(id) {
  deleteTarget = { type: "balance", id };
  document.getElementById("confirmMessage").textContent =
    "Delete this balance record?";
  document.getElementById("confirmModal").classList.add("open");
}
function closeConfirmModal() {
  document.getElementById("confirmModal").classList.remove("open");
  deleteTarget = null;
  updateScrollLocks();
}
function handleConfirmBackdropClick(e) {
  if (e.target === document.getElementById("confirmModal")) closeConfirmModal();
}
function executeDelete() {
  if (!deleteTarget) return;
  if (deleteTarget.type === "expense") {
    state.expenses = state.expenses.filter((e) => e.id !== deleteTarget.id);
    showToast("Expense deleted.", "info");
  } else if (deleteTarget.type === "category") {
    state.categories = state.categories.filter((c) => c.id !== deleteTarget.id);
    showToast("Category deleted.", "info");
  } else if (deleteTarget.type === "balance") {
    state.balanceRecords = state.balanceRecords.filter(
      (b) => b.id !== deleteTarget.id,
    );
    showToast("Balance record deleted.", "info");
  }
  saveState();
  renderAll();
  closeConfirmModal();
}

// ── CATEGORIES PAGE ────────────────────────────────────
function buildEmojiGrid() {
  const el = document.getElementById("emojiGrid");
  el.innerHTML = PRESET_EMOJIS.map(
    (e) =>
      `<button type="button" class="emoji-btn" onclick="selectEmoji('${e}')">${e}</button>`,
  ).join("");
}
function buildColorGrid() {
  const el = document.getElementById("colorGrid");
  if (!el) return;
  const used = state.categories.map((c) => c.color.toLowerCase());
  if (!selectedColor || used.includes(selectedColor.toLowerCase()))
    selectedColor = getUnusedColor();

  let html = `<div style="display: flex; flex-wrap: wrap; gap: 10px; width: 100%; align-items: center;">`;
  html += PRESET_COLORS.map((c) => {
    const isUsed = used.includes(c.toLowerCase());
    return `<button type="button" class="color-btn ${
      c === selectedColor ? "selected" : ""
    } ${
      isUsed ? "used" : ""
    }" style="background:${c}; border: 2px solid transparent; ${
      isUsed ? "opacity:0.3; cursor:not-allowed;" : ""
    }" ${
      isUsed ? "disabled title='Already Used'" : `onclick="selectColor('${c}')"`
    }></button>`;
  }).join("");
  html += `<div style="display:flex; align-items:center; gap:6px;">
    <label class="color-btn" style="background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red); position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: pointer; width: 32px; height: 32px;" title="Custom Color">
      <input type="color" value="${selectedColor}" style="opacity:0; position:absolute; width:100%; height:100%; cursor:pointer;" onchange="selectColor(this.value)">
      <span style="display:block; width:14px; height:14px; background:#fff; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.3); pointer-events:none;"></span>
    </label>
    <span style="font-size:12px;color:var(--text-muted);font-weight:600;">Custom</span>
  </div></div>`;
  el.innerHTML = html;
}
function selectEmoji(e) {
  selectedEmoji = e;
  document.getElementById("catIcon").value = e;
  document
    .querySelectorAll(".emoji-btn")
    .forEach((b) => b.classList.remove("selected"));
  event.currentTarget.classList.add("selected");
}
function selectColor(c) {
  const used = state.categories.map((cat) => cat.color.toLowerCase());
  if (used.includes(c.toLowerCase())) {
    showToast("This color is already taken by another category!", "error");
    selectedColor = getUnusedColor();
  } else {
    selectedColor = c;
  }
  buildColorGrid();
}

let editingCategoryId = null;

function addCategory(event) {
  event.preventDefault();
  const name = document.getElementById("catName").value.trim();
  const icon =
    document.getElementById("catIcon").value.trim() || selectedEmoji || "🏷️";
  if (!name) return;

  if (editingCategoryId) {
    const cat = state.categories.find((c) => c.id === editingCategoryId);
    if (cat) {
      cat.name = name;
      cat.icon = icon;
      cat.color = selectedColor;
    }
    editingCategoryId = null;
    document.querySelector("#categoryForm button[type='submit']").textContent =
      "Create Category";
    showToast(`Category updated successfully!`, "success");
  } else {
    state.categories.push({ id: uid(), name, icon, color: selectedColor });
    showToast(`Category "${name}" created!`, "success");
  }

  saveState();
  renderAll();
  document.getElementById("categoryForm").reset();
  selectedEmoji = "";
  selectedColor = getUnusedColor();
  buildColorGrid();
  document
    .querySelectorAll(".emoji-btn")
    .forEach((b) => b.classList.remove("selected"));
}

function editCategory(id) {
  const cat = state.categories.find((c) => c.id === id);
  if (!cat) return;
  editingCategoryId = id;

  document.getElementById("catName").value = cat.name;
  selectEmoji(cat.icon);

  // Try selecting the color to re-sync
  selectedColor = cat.color;
  buildColorGrid();

  document.querySelector("#categoryForm button[type='submit']").textContent =
    "Save Changes";

  // Scroll to form nicely
  document
    .getElementById("categoryForm")
    .scrollIntoView({ behavior: "smooth" });
}

function renderCategories() {
  const el = document.getElementById("categoriesGrid");
  if (!state.categories.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏷️</div><p>No categories yet.</p></div>`;
    return;
  }
  el.innerHTML = state.categories
    .map((cat) => {
      const count = state.expenses.filter(
        (e) => e.categoryId === cat.id,
      ).length;
      const total = state.expenses
        .filter((e) => e.categoryId === cat.id)
        .reduce((s, e) => s + Number(e.amount), 0);
      return `<div class="cat-card" style="background:${
        cat.color
      }18; border-color:${cat.color}44; position:relative;">
      <button class="cat-delete" onclick="promptDeleteCategory('${
        cat.id
      }')" title="Delete" style="position:absolute; top:8px; right:8px;">🗑️</button>
      <button class="cat-edit" onclick="editCategory('${
        cat.id
      }')" title="Edit" style="position:absolute; top:8px; right:36px; background:none; border:none; cursor:pointer; font-size:16px;">✏️</button>
      <div class="cat-icon">${cat.icon}</div>
      <div class="cat-name" style="color:${cat.color}">${escHtml(
        cat.name,
      )}</div>
      <div class="cat-count">${count} expense${count !== 1 ? "s" : ""}</div>
      ${total > 0 ? `<div class="cat-count">${fmtAmount(total)}</div>` : ""}
    </div>`;
    })
    .join("");
}

// ── CATEGORY DROPDOWNS ─────────────────────────────────
function populateCategoryDropdowns() {
  // Sync native <select> options (for form validation fallback)
  const sel = document.getElementById("expCategory");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML =
    '<option value="">Select a category</option>' +
    state.categories
      .map(
        (c) => `<option value="${c.id}">${c.icon} ${escHtml(c.name)}</option>`,
      )
      .join("");
  if (cur && state.categories.find((c) => c.id === cur)) sel.value = cur;
  // Sync the custom select UI
  csRefresh("expCategory", state.categories);
  if (cur && state.categories.find((c) => c.id === cur))
    csSetValue("expCategory", cur);
  populateCategoryFilter();
}

// ── BALANCE PAGE ───────────────────────────────────────
function addBalance(event) {
  event.preventDefault();
  const amount = parseFloat(document.getElementById("balAmount").value);
  const date = document.getElementById("balDate").value;
  const note = document.getElementById("balNote").value.trim();

  if (!amount || !date) return;

  state.balanceRecords.push({
    id: uid(),
    amount,
    date,
    note: note || "Income Deposit",
    type: "add",
    createdAt: new Date().toISOString(),
  });

  saveState();
  renderAll();
  showToast("Balance successfully added to your wallet!", "success");

  document.getElementById("balanceForm").reset();
  document.getElementById("balDate").value = new Date().toISOString().split("T")[0];
}

function editBalance(id) {
  const record = (state.balanceRecords || []).find((b) => b.id === id);
  if (!record) return;

  const idEl = document.getElementById("modalIncomeEditId");
  const amtEl = document.getElementById("modalIncomeAmount");
  const dateEl = document.getElementById("modalIncomeDate");
  const noteEl = document.getElementById("modalIncomeNote");

  if (idEl) idEl.value = id;
  if (amtEl) amtEl.value = record.amount;
  if (dateEl) dateEl.value = record.date;
  if (noteEl) noteEl.value = record.note || "";

  const modal = document.getElementById("editIncomeModal");
  if (modal) {
    modal.classList.add("open");
    updateScrollLocks();
    setTimeout(() => {
      amtEl?.focus();
      amtEl?.select();
    }, 100);
  }
}

function closeEditIncomeModal() {
  const modal = document.getElementById("editIncomeModal");
  if (modal) modal.classList.remove("open");
  updateScrollLocks();
  const form = document.getElementById("editIncomeForm");
  if (form) form.reset();
}

function handleEditIncomeBackdrop(e) {
  if (e.target === document.getElementById("editIncomeModal")) {
    closeEditIncomeModal();
  }
}

function saveEditedIncome(event) {
  event.preventDefault();
  const id = document.getElementById("modalIncomeEditId")?.value;
  const amount = parseFloat(document.getElementById("modalIncomeAmount")?.value);
  const date = document.getElementById("modalIncomeDate")?.value;
  const note = document.getElementById("modalIncomeNote")?.value.trim();

  if (!amount || !date || amount <= 0) {
    showToast("Please enter a valid amount and date.", "error");
    return;
  }

  const idx = (state.balanceRecords || []).findIndex((b) => b.id === id);
  if (idx >= 0) {
    state.balanceRecords[idx] = {
      ...state.balanceRecords[idx],
      amount,
      date,
      note: note || "Income Deposit",
      updatedAt: new Date().toISOString(),
    };
    saveState();
    renderAll();
    closeEditIncomeModal();
    showToast("Income record updated successfully!", "success");
  } else {
    showToast("Income record not found.", "error");
  }
}

function renderBalanceHistory() {
  const el = document.getElementById("balanceHistory");
  const records = [...state.balanceRecords].sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );
  if (!records.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏦</div><p>No balance records yet.</p></div>`;
    return;
  }
  el.innerHTML = records
    .map(
      (b) => `
    <div class="balance-item">
      <div class="bal-info">
        <div class="bal-amount">+${fmtAmount(b.amount)}</div>
        <div class="bal-meta">${fmtDate(b.date)}${
        b.note ? " · " + escHtml(b.note) : ""
      }</div>
      </div>
      <div class="bal-badge add">Income</div>
      <div class="bal-actions">
        <button class="tx-action-btn" onclick="editBalance('${
          b.id
        }')" title="Edit Income">✏️</button>
        <button class="tx-action-btn" onclick="promptDeleteBalance('${
          b.id
        }')" title="Delete">🗑️</button>
      </div>
    </div>`,
    )
    .join("");
}

// ── EXPORT PAGE ────────────────────────────────────────
function getExportData() {
  const fromStr = document.getElementById("exportFrom").value;
  const toStr = document.getElementById("exportTo").value;
  const from = fromStr ? new Date(fromStr + "T00:00:00") : null;
  const to = toStr ? new Date(toStr + "T23:59:59") : null;

  let expenses = [...state.expenses];
  if (from)
    expenses = expenses.filter((e) => new Date(e.date + "T00:00:00") >= from);
  if (to)
    expenses = expenses.filter((e) => new Date(e.date + "T00:00:00") <= to);
  expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

  let balances = [...state.balanceRecords];
  if (from)
    balances = balances.filter((b) => new Date(b.date + "T00:00:00") >= from);
  if (to)
    balances = balances.filter((b) => new Date(b.date + "T00:00:00") <= to);
  balances.sort((a, b) => new Date(b.date) - new Date(a.date));

  return { expenses, balances };
}

function renderExportPreview() {
  const { expenses, balances } = getExportData();
  const totalAmt = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const statsEl = document.getElementById("exportStats");
  statsEl.innerHTML = `
    <div class="stat-mini"><div class="stat-mini-val" style="color:#ef4444">${
      expenses.length
    }</div><div class="stat-mini-label">Expenses</div></div>
    <div class="stat-mini"><div class="stat-mini-val" style="color:#ef4444">${fmtAmount(
      totalAmt,
    )}</div><div class="stat-mini-label">Total Spent</div></div>
    <div class="stat-mini"><div class="stat-mini-val" style="color:#10b981">${
      balances.length
    }</div><div class="stat-mini-label">Balance Records</div></div>
    <div class="stat-mini"><div class="stat-mini-val" style="color:#10b981">${fmtAmount(
      computeCurrentBalance(),
    )}</div><div class="stat-mini-label">Current Balance</div></div>
  `;

  const previewEl = document.getElementById("exportPreview");
  if (!expenses.length) {
    previewEl.innerHTML = `<div class="empty-state" style="padding:24px;"><div class="empty-icon">📭</div><p>No data in selected range.</p></div>`;
    return;
  }
  const rows = expenses.map((e) => {
    const cat = state.categories.find((c) => c.id === e.categoryId);
    return `<tr>
      <td>${fmtDate(e.date)}</td>
      <td>${escHtml(e.desc)}</td>
      <td>${cat ? cat.icon + " " + escHtml(cat.name) : "Uncategorized"}</td>
      <td>${e.note ? escHtml(e.note) : "—"}</td>
      <td>−${fmtAmount(e.amount)}</td>
    </tr>`;
  });
  previewEl.innerHTML = `
    <table class="preview-table">
      <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
}

function exportCSV() {
  const { expenses, balances } = getExportData();
  const incExp = document.getElementById("exportExpenses").checked;
  const incBal = document.getElementById("exportBalance").checked;
  const incSum = document.getElementById("exportSummary").checked;

  let csv = "";

  if (incExp && expenses.length) {
    csv += "EXPENSES\n";
    csv +=
      "Date,Description,Category,Category Icon,Category Color,Note,Amount\n";
    expenses.forEach((e) => {
      const cat = state.categories.find((c) => c.id === e.categoryId);
      csv += `"${e.date}","${csvEsc(e.desc)}","${
        cat ? csvEsc(cat.name) : "Uncategorized"
      }","${cat ? csvEsc(cat.icon) : ""}","${
        cat ? csvEsc(cat.color) : ""
      }","${csvEsc(e.note || "")}","${Number(e.amount).toFixed(2)}"\n`;
    });
    csv += "\n";
  }

  if (incBal && balances.length) {
    csv += "BALANCE RECORDS\n";
    csv += "Date,Amount,Type,Note\n";
    balances.forEach((b) => {
      csv += `"${b.date}","${Number(b.amount).toFixed(2)}","${
        b.type
      }","${csvEsc(b.note || "")}"\n`;
    });
    csv += "\n";
  }

  if (incSum) {
    csv += "CATEGORY SUMMARY\n";
    csv += "Category,Transactions,Total Amount\n";
    state.categories.forEach((cat) => {
      const catExp = expenses.filter((e) => e.categoryId === cat.id);
      const total = catExp.reduce((s, e) => s + Number(e.amount), 0);
      if (catExp.length > 0) {
        csv += `"${csvEsc(cat.name)}","${catExp.length}","${total.toFixed(
          2,
        )}"\n`;
      }
    });
    csv += `\nCurrent Balance,"","${computeCurrentBalance().toFixed(2)}"\n`;
  }

  downloadFile(`SpendWise_Export_${today()}.csv`, csv, "text/csv");
  showToast("CSV exported successfully!", "success");
}

function exportJSON() {
  const { expenses, balances } = getExportData();
  const incExp = document.getElementById("exportExpenses").checked;
  const incBal = document.getElementById("exportBalance").checked;
  const incSum = document.getElementById("exportSummary").checked;

  const data = {
    exportDate: new Date().toISOString(),
    currentBalance: computeCurrentBalance(),
  };

  if (incExp)
    data.expenses = expenses.map((e) => {
      const cat = state.categories.find((c) => c.id === e.categoryId);
      return {
        ...e,
        categoryName: cat ? cat.name : "Uncategorized",
        categoryIcon: cat ? cat.icon : "💸",
        categoryColor: cat ? cat.color : "#7c3aed",
      };
    });
  if (incBal) data.balanceRecords = balances;
  if (incSum) {
    data.categorySummary = state.categories
      .map((cat) => {
        const catExp = expenses.filter((e) => e.categoryId === cat.id);
        return {
          id: cat.id,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          transactionCount: catExp.length,
          totalAmount: catExp.reduce((s, e) => s + Number(e.amount), 0),
        };
      })
      .filter((c) => c.transactionCount > 0);
  }

  downloadFile(
    `SpendWise_Export_${today()}.json`,
    JSON.stringify(data, null, 2),
    "application/json",
  );
  showToast("JSON exported successfully!", "success");
}

function exportPrint() {
  window.print();
}

async function exportPNG() {
  const card = document.getElementById("exportPreviewCard");
  if (!card) {
    showToast("Preview card not found.", "error");
    return;
  }
  const { expenses } = getExportData();
  if (!expenses.length) {
    showToast("No data to export as PNG.", "error");
    return;
  }

  showToast("Generating image…", "info");
  try {
    const canvas = await html2canvas(card, {
      backgroundColor: "#13162b",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const filename = `SpendWise_Preview_${today()}.png`;
    const b64Full = canvas.toDataURL("image/png");

    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      const Filesystem = window.Capacitor.Plugins.Filesystem;
      const Share = window.Capacitor.Plugins.Share;
      if (Filesystem && Share) {
        const b64Data = b64Full.split(",")[1];
        const result = await Filesystem.writeFile({
          path: filename,
          data: b64Data,
          directory: "DOCUMENTS",
        });
        await Share.share({
          title: filename,
          url: result.uri,
        });
        showToast("PNG ready to save/share!", "success");
        return;
      }
    }

    const link = document.createElement("a");
    link.download = filename;
    link.href = b64Full;
    link.click();
    showToast("PNG downloaded!", "success");
  } catch (err) {
    showToast("PNG export failed: " + err.message, "error");
  }
}

function exportCopyText() {
  const { expenses } = getExportData();
  if (!expenses.length) {
    showToast("No expenses in the selected range.", "error");
    return;
  }

  const sym = state.currency || "taka";
  const isWord = sym.length > 2;
  const fmt = (n) =>
    isWord
      ? `${Math.round(Number(n))} ${sym}`
      : `${sym}${Number(n).toFixed(2)}`;

  const sorted = [...expenses].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  );

  // Group by date
  const byDate = {};
  sorted.forEach((e) => {
    (byDate[e.date] = byDate[e.date] || []).push(e);
  });

  let lines = [];
  lines.push("=== SpendWise Expense Report ===");
  lines.push(
    `Generated: ${new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
  );
  lines.push("");

  Object.keys(byDate)
    .sort()
    .forEach((date) => {
      lines.push(`▶ ${fmtDate(date)}`);
      byDate[date].forEach((e) => {
        const cat = state.categories.find((c) => c.id === e.categoryId);
        const catLabel = cat ? `${cat.icon} ${cat.name}` : "Other";
        lines.push(
          `  ${e.desc}: ${fmt(e.amount)}  [${catLabel}]${
            e.note ? "  • " + e.note : ""
          }`,
        );
      });
      const dayTotal = byDate[date].reduce((s, e) => s + Number(e.amount), 0);
      lines.push(`  ─── Day total: ${fmt(dayTotal)}`);
      lines.push("");
    });

  const grandTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  lines.push("================================");
  lines.push(`Total Spent : ${fmt(grandTotal)}`);
  lines.push(`Balance     : ${fmt(computeCurrentBalance())}`);
  lines.push("================================");

  // Show preview modal
  document.getElementById("copyTextArea").value = lines.join("\n");
  document.getElementById("copyTextModal").classList.add("open");
  updateScrollLocks();
}

function doCopy() {
  const text = document.getElementById("copyTextArea").value;
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast("Copied to clipboard!", "success");
        closeCopyModal();
      })
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  const ta = document.getElementById("copyTextArea");
  ta.select();
  document.execCommand("copy");
  showToast("Copied!", "success");
  closeCopyModal();
}
function closeCopyModal() {
  document.getElementById("copyTextModal").classList.remove("open");
  updateScrollLocks();
}
function handleCopyModalBackdrop(e) {
  if (e.target === document.getElementById("copyTextModal")) closeCopyModal();
}

async function downloadFile(name, content, type) {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const Filesystem = window.Capacitor.Plugins.Filesystem;
      const Share = window.Capacitor.Plugins.Share;
      if (Filesystem && Share) {
        const result = await Filesystem.writeFile({
          path: name,
          data: content,
          directory: "DOCUMENTS",
          encoding: "utf8",
        });
        await Share.share({
          title: name,
          url: result.uri,
        });
        return;
      }
    } catch (e) {
      console.error("[Capacitor Export Error]", e);
    }
  }

  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function today() {
  return new Date().toISOString().split("T")[0];
}
function csvEsc(s) {
  return (s || "").toString().replace(/"/g, '""');
}

// ── EXPORT TABS ────────────────────────────────────────
function switchExportTab(tab) {
  document
    .querySelectorAll(".export-tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".export-tab-panel")
    .forEach((p) => p.classList.remove("active"));
  const tabEl = document.getElementById(`tab-${tab}`);
  const panelEl = document.getElementById(`panel-${tab}`);
  if (tabEl) tabEl.classList.add("active");
  if (panelEl) panelEl.classList.add("active");
  if (tab === "export") renderExportPreview();
}

// ── FULL BACKUP EXPORT ─────────────────────────────────
function buildFullBackupPayload() {
  return {
    _format: "spendwise_backup",
    _version: "2.0",
    _exportedAt: new Date().toISOString(),
    _appName: "SpendWise",
    expenses: state.expenses,
    categories: state.categories,
    balanceRecords: state.balanceRecords,
    currency: state.currency || "taka",
  };
}

function exportFullBackup() {
  const payload = buildFullBackupPayload();
  const json = JSON.stringify(payload, null, 2);
  downloadFile(
    `SpendWise_FullBackup_${today()}.spendwise`,
    json,
    "application/json",
  );
  showToast(
    `🔒 Full backup downloaded (${state.expenses.length} expenses, ${state.categories.length} categories)`,
    "success",
  );
}

function exportFullBackupJSON() {
  const payload = buildFullBackupPayload();
  const json = JSON.stringify(payload, null, 2);
  downloadFile(
    `SpendWise_FullBackup_${today()}.json`,
    json,
    "application/json",
  );
  showToast(`📦 Full backup downloaded as JSON`, "success");
}

// ── IMPORT & RESTORE ───────────────────────────────────
let _importData = null;

function initImportDropzone() {
  const dz = document.getElementById("importDropzone");
  if (!dz) return;
  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.classList.add("dragover");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) processImportFile(file);
  });
}

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  processImportFile(file);
}

function processImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      // Validate it's a SpendWise backup
      if (!parsed.expenses && !parsed.categories && !parsed.balanceRecords) {
        showToast(
          "Invalid backup file. Please use a .spendwise or full JSON backup.",
          "error",
        );
        return;
      }
      _importData = parsed;
      showImportPreview(file.name, parsed);
    } catch (err) {
      showToast("Could not read file: " + err.message, "error");
    }
  };
  reader.readAsText(file);
}

function showImportPreview(fileName, data) {
  document.getElementById("importFileName").textContent = fileName;
  const statsEl = document.getElementById("importStats");
  const expenses = Array.isArray(data.expenses) ? data.expenses : [];
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const balances = Array.isArray(data.balanceRecords)
    ? data.balanceRecords
    : [];
  const currency = data.currency || "taka";
  const exportDate = data._exportedAt
    ? new Date(data._exportedAt).toLocaleString()
    : "Unknown";
  statsEl.innerHTML = `
    <div class="import-stat"><span class="import-stat-val">${expenses.length}</span><span class="import-stat-label">Expenses</span></div>
    <div class="import-stat"><span class="import-stat-val">${categories.length}</span><span class="import-stat-label">Categories</span></div>
    <div class="import-stat"><span class="import-stat-val">${balances.length}</span><span class="import-stat-label">Balance Records</span></div>
    <div class="import-stat"><span class="import-stat-val">${currency}</span><span class="import-stat-label">Currency</span></div>
    <div class="import-stat-date">📅 Exported: ${exportDate}</div>
  `;
  document.getElementById("importPreview").style.display = "block";
  document.getElementById("importDropzone").style.display = "none";
}

function clearImportPreview() {
  _importData = null;
  document.getElementById("importPreview").style.display = "none";
  document.getElementById("importDropzone").style.display = "";
  document.getElementById("importFileInput").value = "";
}

function executeImport() {
  if (!_importData) {
    showToast("No file loaded.", "error");
    return;
  }
  const mode =
    document.querySelector('input[name="importMode"]:checked')?.value ||
    "merge";
  const incoming = {
    expenses: Array.isArray(_importData.expenses) ? _importData.expenses : [],
    categories: Array.isArray(_importData.categories)
      ? _importData.categories
      : [],
    balanceRecords: Array.isArray(_importData.balanceRecords)
      ? _importData.balanceRecords
      : [],
    currency: _importData.currency || state.currency || "taka",
  };

  let finalState;
  let mergeMsg = "";

  if (mode === "replace") {
    finalState = incoming;
    mergeMsg = `Replaced all data with ${incoming.expenses.length} expenses and ${incoming.balanceRecords.length} balance records.`;
  } else {
    // Smart merge
    const mergeArr = (local, cloud) => {
      const map = {};
      [...(local || []), ...(cloud || [])].forEach((item) => {
        const existing = map[item.id];
        if (!existing) {
          map[item.id] = item;
          return;
        }
        const existTs = existing.updatedAt || existing.createdAt || "";
        const newTs = item.updatedAt || item.createdAt || "";
        if (newTs > existTs) map[item.id] = item;
      });
      return Object.values(map);
    };
    const catMap = {};
    [...(incoming.categories || [])].forEach((c) => (catMap[c.id] = c));
    [...(state.categories || [])].forEach((c) => {
      if (!catMap[c.id]) catMap[c.id] = c;
    });

    const mergedExpenses = mergeArr(state.expenses, incoming.expenses);
    const mergedBalances = mergeArr(
      state.balanceRecords,
      incoming.balanceRecords,
    );
    finalState = {
      expenses: mergedExpenses,
      categories: Object.values(catMap),
      balanceRecords: mergedBalances,
      currency: incoming.currency || state.currency || "taka",
    };
    const newExpenses = mergedExpenses.length - state.expenses.length;
    const newBalances = mergedBalances.length - state.balanceRecords.length;
    mergeMsg = `Merge complete! Added ${Math.max(
      0,
      newExpenses,
    )} new expenses and ${Math.max(
      0,
      newBalances,
    )} new balance records. Total: ${mergedExpenses.length} expenses.`;
  }

  // Save and reload
  localStorage.setItem(getActiveStateKey(), JSON.stringify(finalState));
  loadState();
  renderAll();
  clearImportPreview();

  // Show result modal
  document.getElementById("importResultMsg").textContent = mergeMsg;
  document.getElementById("importResultModal").classList.add("open");
  updateScrollLocks();
}

function closeImportResultModal() {
  document.getElementById("importResultModal").classList.remove("open");
  updateScrollLocks();
}

// ── TOAST ──────────────────────────────────────────────
function showToast(message, type = "info") {
  const icons = { success: "✅", info: "ℹ️", error: "❌" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || "ℹ️"}</span> ${escHtml(message)}`;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ── UTILS ──────────────────────────────────────────────
function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Keep export preview updated on filter changes
document.addEventListener("DOMContentLoaded", () => {
  [
    "exportFrom",
    "exportTo",
    "exportExpenses",
    "exportBalance",
    "exportSummary",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderExportPreview);
  });
});

// ── PWA & INSTALLATION ─────────────────────────────────
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI notify the user they can install the PWA
  const installBtn = document.getElementById("nav-install");
  if (installBtn) installBtn.style.display = "flex";
});

function installPWA() {
  if (!deferredPrompt) return;
  // Show the install prompt
  deferredPrompt.prompt();
  // Wait for the user to respond to the prompt
  deferredPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === "accepted") {
      console.log("User accepted the install prompt");
      const installBtn = document.getElementById("nav-install");
      if (installBtn) installBtn.style.display = "none";
    }
    deferredPrompt = null;
  });
}

window.addEventListener("appinstalled", (evt) => {
  // Log install success
  console.log("SpendWise was installed.", evt);
});

// Register Service Worker for offline capability & caching
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        console.log("ServiceWorker registration successful");
      })
      .catch((err) => {
        console.log("ServiceWorker registration failed: ", err);
      });
  });
}

// ── ANDROID HARDWARE BACK BUTTON (Capacitor App) ─────────
(function initHardwareBackButton() {
  function handleBackButton() {
    const App = window.Capacitor?.Plugins?.App;
    if (!App) return;

    App.addListener('backButton', ({ canGoBack }) => {
      // 1. Close open modals
      const openModal = document.querySelector('.modal-backdrop.open, .copy-preview-modal.open, .qcat-panel.open');
      if (openModal) {
        if (openModal.id === 'addExpenseModal') {
          closeAddExpenseModal();
        } else if (openModal.id === 'confirmModal') {
          closeConfirmModal();
        } else if (openModal.id === 'copyTextModal') {
          closeCopyModal();
        } else if (openModal.id === 'importResultModal') {
          closeImportResultModal();
        } else if (openModal.classList.contains('qcat-panel')) {
          toggleQuickCat();
        } else {
          openModal.classList.remove('open');
        }
        return;
      }

      // 2. Close mobile sidebar menu if open
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList.contains('open')) {
        closeSidebar();
        return;
      }

      // 3. Navigate back to dashboard if on another page
      if (typeof currentPage !== 'undefined' && currentPage !== 'dashboard') {
        navigateTo('dashboard');
        return;
      }

      // 4. Default back / exit
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleBackButton);
  } else {
    handleBackButton();
  }
})();


// ── WALLET RENAME & SAVINGS VAULTS SYSTEM ───────────────
function openRenameWalletModal() {
  const activeId = state.activeAccountId || "wallet_main";
  const curName = (state.accounts && state.accounts[activeId] && state.accounts[activeId].name) || "Main Wallet";
  const inp = document.getElementById("renameWalletInput");
  if (inp) inp.value = curName;
  const modal = document.getElementById("renameWalletModal");
  if (modal) modal.classList.add("open");
  setTimeout(() => { if (inp) inp.focus(); }, 100);
}

function closeRenameWalletModal() {
  const modal = document.getElementById("renameWalletModal");
  if (modal) modal.classList.remove("open");
}

function handleRenameWalletBackdrop(e) {
  if (e.target === document.getElementById("renameWalletModal")) closeRenameWalletModal();
}

function saveWalletName(e) {
  e.preventDefault();
  const inp = document.getElementById("renameWalletInput");
  const newName = inp ? inp.value.trim() : "";
  if (!newName) {
    showToast("Please enter a valid wallet name.", "error");
    return;
  }

  const activeId = state.activeAccountId || "wallet_main";
  if (!state.accounts) state.accounts = {};
  if (!state.accounts[activeId]) {
    state.accounts[activeId] = {
      name: newName,
      expenses: state.expenses || [],
      balanceRecords: state.balanceRecords || [],
    };
  } else {
    state.accounts[activeId].name = newName;
  }

  saveState();
  initWalletSelector();
  closeRenameWalletModal();
  showToast(`Wallet renamed to "${newName}"`, "success");
}

// ── SAVINGS VAULTS / CARDS LOGIC ───────────────────────
function getSavingsCardsData() {
  const cardsMap = {};

  // Group all expenses with category 'cat_savings' or with a savingsCode
  (state.expenses || []).forEach(e => {
    const cat = state.categories.find(c => c.id === e.categoryId);
    const isSavingsCat = cat && (cat.id === "cat_savings" || cat.name.toLowerCase() === "savings");
    if (!isSavingsCat && !e.savingsCode) return;

    // Determine unique code: user entered code, or description, or 'GENERAL'
    const code = (e.savingsCode || e.desc || "GENERAL").trim().toUpperCase();
    if (!cardsMap[code]) {
      cardsMap[code] = {
        code: code,
        name: e.desc || code,
        totalSaved: 0,
        entriesCount: 0,
        lastDate: e.date,
        transactions: []
      };
    }

    cardsMap[code].totalSaved += Number(e.amount);
    cardsMap[code].entriesCount += 1;
    if (e.date > cardsMap[code].lastDate) {
      cardsMap[code].lastDate = e.date;
    }
    cardsMap[code].transactions.push(e);
  });

  return Object.values(cardsMap);
}

function renderSavingsPage() {
  const grid = document.getElementById("savingsVaultsGrid");
  const totalBadge = document.getElementById("savingsTotalBadge");

  const cards = getSavingsCardsData();
  const totalSavedAll = cards.reduce((s, c) => s + c.totalSaved, 0);

  if (totalBadge) {
    totalBadge.textContent = `Total Saved: ${fmtAmount(totalSavedAll)}`;
  }

  if (!grid) return;

  if (cards.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding: 48px 24px;">
        <div class="empty-icon" style="font-size: 48px; margin-bottom: 12px;">💰</div>
        <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 6px 0; color: var(--text-primary);">No savings cards yet</h3>
        <p style="font-size: 13px; color: var(--text-muted); max-width: 360px; margin: 0 auto 18px auto;">
          Add an expense with category <b>"Savings"</b> and enter a unique code (e.g. <code>EMERGENCY</code>, <code>CAR</code>) to create your first card!
        </p>
        <button type="button" class="btn btn-primary" onclick="openAddExpenseModalForSavings()" style="width:auto; padding: 9px 20px; font-size:13px; font-weight:600; border-radius: var(--radius-pill); background:#10b981 !important;">
          + Add First Savings
        </button>
      </div>`;
    return;
  }

  grid.innerHTML = cards.map(c => {
    return `
      <div class="savings-card" style="position:relative; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow-sm); transition: all 0.2s ease;">
        <div class="savings-card-top" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 14px;">
          <div>
            <span style="display:inline-block; font-size: 11px; font-weight: 800; letter-spacing: 0.8px; padding: 3px 8px; border-radius: 4px; background: rgba(16,185,129,0.12); color: var(--green); margin-bottom: 6px;">
              CODE: ${escHtml(c.code)}
            </span>
            <h4 class="savings-card-title" style="font-size: 18px; font-weight: 700; color: var(--text-primary); margin:0;" title="${escHtml(c.name)}">${escHtml(c.name)}</h4>
          </div>
          <span class="savings-card-badge" style="font-size: 11px; font-weight: 700; color: var(--green); background: rgba(16,185,129,0.1); padding: 4px 8px; border-radius: var(--radius-pill);">
            ${c.entriesCount} deposit${c.entriesCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div style="font-size: 26px; font-weight: 800; color: #10b981; letter-spacing: -0.5px; margin-bottom: 16px;">
          ${fmtAmount(c.totalSaved)}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid var(--border); padding-top: 12px; margin-top: auto;">
          <span style="font-size: 12px; color: var(--text-muted);">
            Last saved: ${fmtDate(c.lastDate)}
          </span>
          <button
            type="button"
            class="btn btn-secondary"
            onclick="addMoreToSavings('${escHtml(c.code)}', '${escHtml(c.name)}')"
            style="width:auto; padding: 5px 12px; font-size: 12px; font-weight: 600; border-radius: var(--radius-pill); background: rgba(16,185,129,0.08); color: var(--green); border-color: rgba(16,185,129,0.3);"
          >
            ＋ Add More
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function addMoreToSavings(code, name) {
  const savingsCat = state.categories.find(c => c.id === "cat_savings" || c.name.toLowerCase() === "savings");
  openAddExpenseModal(null, savingsCat ? savingsCat.id : "cat_savings");
  const descEl = document.getElementById("expDesc");
  const codeEl = document.getElementById("expSavingsCode");
  if (descEl) descEl.value = name || code;
  if (codeEl) codeEl.value = code;
}
