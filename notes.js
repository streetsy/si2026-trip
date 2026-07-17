/*
 * Scotland & Ireland 2026 — shared, offline-first trip notes.
 * Requires Firebase v8 app, firestore and auth scripts to be loaded first.
 */
(function () {
  "use strict";

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBoRt5vY52HdJoOJwfV3tiKqmTE5E-qbcg",
    authDomain: "oc-cruise.firebaseapp.com",
    projectId: "oc-cruise",
    storageBucket: "oc-cruise.firebasestorage.app",
    messagingSenderId: "403343103551",
    appId: "1:403343103551:web:6ecd37ea8abd9196d88a8a"
  };

  // Deliberately separate from the existing cruises collection.
  const TRIP_ID = "scotland-ireland-2026-c3a8f59d";
  let db;
  let notes = [];
  let ready = false;
  let unsubscribe = null;

  const NOTE_TYPES = [
    ["overnight", "🚐 Overnight stop"],
    ["pub", "🍺 Pub stop"],
    ["aire", "🅿️ Aire"],
    ["parking", "🅿️ Parking"],
    ["backup", "🧭 Backup option"],
    ["general", "📝 General"]
  ];

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }

  function noteTypeLabel(type) {
    return (NOTE_TYPES.find(item => item[0] === type) || NOTE_TYPES[5])[1];
  }

  function noteTypeIcon(type) {
    return noteTypeLabel(type).split(" ")[0];
  }

  function sortNotes(list) {
    return [...list].sort((a, b) =>
      String(a.date || "9999-12-31").localeCompare(String(b.date || "9999-12-31")) ||
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    );
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .notes-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
      .notes-toolbar p{font-size:.78rem;color:var(--ink-light);line-height:1.45}
      .notes-add{background:var(--highland);color:#fff;border:0;border-radius:8px;padding:9px 13px;font-weight:700;white-space:nowrap}
      .trip-note{background:var(--card-bg);border-left:4px solid var(--activity);border-radius:var(--radius);padding:13px 15px;margin-bottom:9px;box-shadow:var(--shadow)}
      .trip-note-head{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}
      .trip-note-title{font-weight:700;font-size:.9rem}
      .trip-note-date{font: .68rem var(--mono);color:var(--ink-light);margin-top:3px}
      .trip-note-body{white-space:pre-wrap;font-size:.8rem;color:var(--ink-mid);line-height:1.5;margin-top:8px}
      .trip-note-meta{font:.67rem var(--mono);color:var(--ink-light);margin-top:7px}
      .note-actions{display:flex;gap:5px}
      .note-actions button{border:0;background:var(--paper-warm);border-radius:5px;padding:4px 7px;cursor:pointer}
      .note-modal{position:fixed;inset:0;background:rgba(10,25,15,.5);z-index:500;display:flex;align-items:flex-end;justify-content:center;padding:12px}
      .note-modal-card{width:min(620px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:14px 14px 8px 8px;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,.3)}
      .note-modal-card h2{font-size:1.05rem;margin-bottom:14px}
      .note-form label{display:block;font-size:.72rem;font-weight:700;color:var(--ink-light);margin:12px 0 4px}
      .note-form input,.note-form select,.note-form textarea{width:100%;border:1px solid var(--paper-warm);border-radius:7px;padding:9px;font:inherit;color:var(--ink);background:#fff}
      .note-form textarea{min-height:130px;resize:vertical;line-height:1.45}
      .note-form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .note-form-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:17px}
      .note-form-actions button{border:0;border-radius:7px;padding:9px 14px;font-weight:700;cursor:pointer}
      .note-save{background:var(--highland);color:#fff}.note-cancel{background:var(--paper-warm);color:var(--ink)}
      .note-calendar-pill{background:#fff8e1;color:#7a5600;border:1px solid #f2cd68;cursor:pointer}
      .note-timeline-line{font-size:.74rem;color:#7a5600;background:#fff8e1;border-radius:6px;padding:5px 8px;margin:3px 0}
      .notes-status{font:.68rem var(--mono);color:var(--ink-light)}
    `;
    document.head.appendChild(style);
  }

  function renderNotes() {
    const container = document.getElementById("tripNotesContainer");
    const status = document.getElementById("notesSyncStatus");
    if (!container) return;
    if (status) status.textContent = ready
      ? (navigator.onLine ? "Synced when online" : "Offline — saved on this phone")
      : "Connecting to shared notes…";
    if (!notes.length) {
      container.innerHTML = `<div class="empty-state"><div class="big">📝</div><strong>No shared notes yet</strong><p>Add possible overnight stops, pub stops, aires, parking details, or backup plans. They remain available offline.</p></div>`;
      return;
    }
    container.innerHTML = sortNotes(notes).map(note => `
      <article class="trip-note">
        <div class="trip-note-head">
          <div>
            <div class="trip-note-title">${noteTypeIcon(note.type)} ${escapeHtml(note.title || "Untitled note")}</div>
            <div class="trip-note-date">${note.date ? escapeHtml(formatNoteDate(note.date)) : "No date assigned"} · ${escapeHtml(noteTypeLabel(note.type))}</div>
          </div>
          <div class="note-actions">
            <button onclick="window.tripNotesEdit('${note.id}')" aria-label="Edit note">✏️</button>
            <button onclick="window.tripNotesDelete('${note.id}')" aria-label="Delete note">🗑️</button>
          </div>
        </div>
        ${note.details ? `<div class="trip-note-body">${escapeHtml(note.details)}</div>` : ""}
        ${note.location ? `<div class="trip-note-meta">📍 ${escapeHtml(note.location)}</div>` : ""}
      </article>`
    ).join("");
  }

  function formatNoteDate(value) {
    const date = new Date(value + "T12:00:00");
    return isNaN(date) ? value : date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }

  function decorateCalendarAndTimeline() {
    document.querySelectorAll(".note-calendar-pill,.note-timeline-line").forEach(element => element.remove());
    for (const note of notes) {
      if (!note.date) continue;
      const calendarDay = document.querySelector('.cal-day[data-date="' + note.date + '"] .cal-pills');
      if (calendarDay) {
        const pill = document.createElement("div");
        pill.className = "cal-pill note-calendar-pill";
        pill.textContent = noteTypeIcon(note.type) + " " + (note.title || "Note");
        pill.title = note.details || note.title || "Shared note";
        pill.onclick = () => { window.switchTab("notes"); };
        calendarDay.appendChild(pill);
      }
      const dayEvents = document.querySelector("#day-" + CSS.escape(note.date) + " .day-events");
      if (dayEvents) {
        const line = document.createElement("div");
        line.className = "note-timeline-line";
        line.textContent = noteTypeIcon(note.type) + " Shared note: " + (note.title || "Untitled");
        line.onclick = () => window.switchTab("notes");
        dayEvents.prepend(line);
      }
    }
  }

  function rerenderEverywhere() {
    renderNotes();
    if (typeof window.renderAll === "function") window.renderAll();
    setTimeout(decorateCalendarAndTimeline, 0);
  }

  function showEditor(note) {
    const current = note || { date: "", title: "", type: "overnight", location: "", details: "" };
    const wrapper = document.createElement("div");
    wrapper.className = "note-modal";
    wrapper.innerHTML = `
      <div class="note-modal-card" role="dialog" aria-modal="true">
        <h2>${note ? "Edit shared note" : "Add shared note"}</h2>
        <form class="note-form">
          <div class="note-form-row">
            <div><label>Date</label><input name="date" type="date" value="${escapeHtml(current.date)}"></div>
            <div><label>Type</label><select name="type">${NOTE_TYPES.map(([value, label]) => `<option value="${value}" ${current.type === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
          </div>
          <label>Title</label><input name="title" required maxlength="100" value="${escapeHtml(current.title)}" placeholder="e.g. The Harbour Inn overnight option">
          <label>Location / coordinates (optional)</label><input name="location" maxlength="180" value="${escapeHtml(current.location)}" placeholder="Town, postcode, what3words, or coordinates">
          <label>Details</label><textarea name="details" maxlength="3000" placeholder="Parking restrictions, facilities, pub opening times, backup plan…">${escapeHtml(current.details)}</textarea>
          <div class="note-form-actions"><button type="button" class="note-cancel">Cancel</button><button class="note-save" type="submit">Save shared note</button></div>
        </form>
      </div>`;
    document.body.appendChild(wrapper);
    const close = () => wrapper.remove();
    wrapper.querySelector(".note-cancel").onclick = close;
    wrapper.onclick = event => { if (event.target === wrapper) close(); };
    wrapper.querySelector("form").onsubmit = async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const data = {
        date: String(form.get("date") || ""),
        type: String(form.get("type") || "general"),
        title: String(form.get("title") || "").trim(),
        location: String(form.get("location") || "").trim(),
        details: String(form.get("details") || "").trim(),
        updatedAt: new Date().toISOString()
      };
      if (!data.title) return;
      try {
        const ref = db.collection("scotlandTrips").doc(TRIP_ID).collection("notes").doc(note ? note.id : makeId());
        await ref.set(data, { merge: true });
        close();
      } catch (error) {
        console.error(error);
        alert("The note is saved locally if you are offline. If this message persists online, check the Firebase rule.");
      }
    };
  }

  function makeId() {
    return "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function startFirebase() {
    try {
      if (!window.firebase) throw new Error("Firebase scripts did not load.");
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      await firebase.auth().signInAnonymously();
      db = firebase.firestore();
      try { await db.enablePersistence({ synchronizeTabs: true }); } catch (error) {
        if (error.code !== "failed-precondition" && error.code !== "unimplemented") console.warn("Offline notes:", error);
      }
      unsubscribe = db.collection("scotlandTrips").doc(TRIP_ID).collection("notes")
        .onSnapshot(snapshot => {
          notes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          ready = true;
          rerenderEverywhere();
        }, error => {
          console.error("Shared notes listener:", error);
          ready = true;
          renderNotes();
        });
    } catch (error) {
      console.error("Shared notes setup:", error);
      const status = document.getElementById("notesSyncStatus");
      if (status) status.textContent = "Shared notes could not connect — check Firebase setup.";
    }
  }

  function install() {
    injectStyles();
    const originalSwitchTab = window.switchTab;
    window.switchTab = function (name) {
      if (name === "notes") {
        document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
        document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
        document.getElementById("view-notes").classList.add("active");
        document.querySelector('.tab[data-tab="notes"]').classList.add("active");
        renderNotes();
        return;
      }
      originalSwitchTab(name);
    };
    const originalRenderAll = window.renderAll;
    window.renderAll = function () {
      originalRenderAll();
      setTimeout(decorateCalendarAndTimeline, 0);
    };
    window.tripNotesAdd = () => showEditor(null);
    window.tripNotesEdit = id => showEditor(notes.find(note => note.id === id));
    window.tripNotesDelete = async id => {
      const note = notes.find(item => item.id === id);
      if (!note || !confirm('Delete "' + note.title + '" from both phones?')) return;
      await db.collection("scotlandTrips").doc(TRIP_ID).collection("notes").doc(id).delete();
    };
    startFirebase();
  }

  window.addEventListener("DOMContentLoaded", install);
  window.addEventListener("online", () => { renderNotes(); });
  window.addEventListener("offline", () => { renderNotes(); });
})();
