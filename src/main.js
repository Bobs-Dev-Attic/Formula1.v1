// -----------------------------------------------------------------------------
// Bootstrap: build the start menu + garage setup sheet, then hand control to the
// Game. Persists the player's setup/selection in localStorage.
// -----------------------------------------------------------------------------

import { Game } from './game.js';
import { TRACKS } from './tracks.js';
import { TEAMS, SETUP_SCHEMA, defaultSetup, VERSION } from './config.js';
import { Controls } from './controls.js';

// Stamp the build version everywhere the player can see it.
const badge = document.getElementById('version-badge');
if (badge) badge.textContent = `FORMULA 1 · V1 · ${VERSION}`;
const menuTag = document.querySelector('#menu .tag');
if (menuTag) menuTag.textContent = `Configurable 3D F1 · Three.js · ${VERSION}`;
document.title = `Formula 1 · V1 ${VERSION}`;

const STORE = 'f1v1.save';

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save(data) {
  try { localStorage.setItem(STORE, JSON.stringify(data)); } catch {}
}

const saved = load();
const selection = {
  trackId: saved.trackId || TRACKS[0].id,
  teamId: saved.teamId || TEAMS[0].id,
  assist: saved.assist || 'balanced',
  setup: { ...defaultSetup(), ...(saved.setup || {}) },
};

const el = {
  loader: document.getElementById('loader'),
  menu: document.getElementById('menu'),
  garage: document.getElementById('garage'),
  track: document.getElementById('sel-track'),
  team: document.getElementById('sel-team'),
  assist: document.getElementById('sel-assist'),
  start: document.getElementById('btn-start'),
  garageBtn: document.getElementById('btn-garage'),
  hint: document.getElementById('control-hint'),
};

// populate selects
for (const t of TRACKS) {
  const o = document.createElement('option');
  o.value = t.id;
  o.textContent = `${t.name} — ${t.inspiredBy}`;
  el.track.appendChild(o);
}
for (const t of TEAMS) {
  const o = document.createElement('option');
  o.value = t.id;
  o.textContent = t.name;
  el.team.appendChild(o);
}
el.track.value = selection.trackId;
el.team.value = selection.teamId;
el.assist.value = selection.assist;

el.hint.textContent = new Controls({}).hintText();

el.track.addEventListener('change', () => { selection.trackId = el.track.value; persist(); });
el.team.addEventListener('change', () => { selection.teamId = el.team.value; persist(); });
el.assist.addEventListener('change', () => { selection.assist = el.assist.value; persist(); });

function persist() {
  save({
    trackId: selection.trackId,
    teamId: selection.teamId,
    assist: selection.assist,
    setup: selection.setup,
  });
}

// ---- garage / setup sheet ----
function openGarage() {
  el.garage.classList.remove('hidden');
  el.garage.innerHTML = `
    <div class="garage-card">
      <h2>Garage &amp; Car Setup</h2>
      <p class="sub">Tune the car the way an engineer would. Every slider changes real handling.</p>
      <div class="setup-grid">
        ${SETUP_SCHEMA.map((s) => `
          <div class="setup-item" data-key="${s.key}">
            <label>${s.label}<b class="val">${selection.setup[s.key]}</b></label>
            <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${selection.setup[s.key]}" />
            <div class="ends"><span>${s.lo}</span><span>${s.hi}</span></div>
          </div>`).join('')}
      </div>
      <div class="garage-actions">
        <button id="g-reset">Reset defaults</button>
        <button id="g-done" class="primary">Save &amp; Close</button>
      </div>
    </div>`;

  el.garage.querySelectorAll('.setup-item').forEach((item) => {
    const key = item.dataset.key;
    const input = item.querySelector('input');
    const val = item.querySelector('.val');
    input.addEventListener('input', () => {
      selection.setup[key] = parseFloat(input.value);
      val.textContent = input.value;
    });
  });
  el.garage.querySelector('#g-reset').addEventListener('click', () => {
    selection.setup = defaultSetup();
    openGarage();
  });
  el.garage.querySelector('#g-done').addEventListener('click', () => {
    persist();
    el.garage.classList.add('hidden');
  });
}
el.garageBtn.addEventListener('click', openGarage);

// ---- game ----
const canvas = document.getElementById('scene');
const game = new Game(canvas);

// pause overlay reuses the menu, with a Resume button appended dynamically
game.onPause((paused) => {
  if (paused) showPauseMenu();
});
game.onFinish((res) => showFinish(res));

function beginRace() {
  el.menu.classList.add('hidden');
  el.garage.classList.add('hidden');
  persist();
  game.start({ ...selection });
}
el.start.addEventListener('click', beginRace);

function showPauseMenu() {
  el.menu.classList.remove('hidden');
  const card = el.menu.querySelector('.menu-card');
  if (!card.querySelector('#btn-resume')) {
    const resume = document.createElement('button');
    resume.id = 'btn-resume';
    resume.textContent = 'RESUME';
    resume.className = '';
    resume.style.cssText = 'width:100%;margin-top:14px;padding:14px;border:none;border-radius:12px;background:linear-gradient(90deg,#24e07a,#7ef0a0);color:#05231a;font-weight:700;letter-spacing:.08em;cursor:pointer;';
    card.insertBefore(resume, card.querySelector('#btn-start'));
    resume.addEventListener('click', () => {
      el.menu.classList.add('hidden');
      game.togglePause();
    });
  }
  el.start.textContent = 'RESTART RACE';
}

function showFinish(res) {
  el.menu.classList.remove('hidden');
  const card = el.menu.querySelector('.menu-card');
  el.start.textContent = 'RACE AGAIN';
  let banner = card.querySelector('#finish-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'finish-banner';
    banner.style.cssText = 'margin:8px 0 16px;padding:12px;border:1px solid var(--line);border-radius:12px;background:#0c0e16;text-align:center;';
    card.insertBefore(banner, card.querySelector('.menu-row'));
  }
  banner.innerHTML = `<div style="font-size:13px;color:var(--muted);letter-spacing:.14em;">🏁 RACE COMPLETE</div>
    <div style="font-size:20px;font-weight:700;margin-top:6px;">Best lap ${fmt(res.best)}</div>`;
}

// ---- boot ----
window.addEventListener('load', () => {
  setTimeout(() => {
    el.loader.classList.add('hidden');
    el.menu.classList.remove('hidden');
  }, 500);
});

function fmt(ms) {
  if (ms == null) return '--:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(mm).padStart(3, '0')}`;
}
