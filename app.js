/* =========================================================
   app.js — 하루가나의 동작(두뇌)
   ---------------------------------------------------------
   목차
     1. 작은 도우미 함수
     2. 저장하기 (localStorage)
     3. 공부 기록 (정답/오답, 외운 것, 즐겨찾기, 연속 공부일수)
     4. 읽는 법 만들기 (단어 → 로마자 · 한글 발음)
     5. 소리 (음성, 효과음, 진동)
     6. 화면 전환
     7. 홈
     8. 글자표
     9. 단어장
    10. 연습 — 고르기 화면
    11. 연습 — 플래시카드
    12. 연습 — 퀴즈
    13. 기록 · 설정
    14. 유튜브 강의
    15. 설치 · 업데이트 · 시작하기
   ========================================================= */
'use strict';

/* ---------- 1. 작은 도우미 함수 ---------- */
// 안드로이드 앱(APK) 안에서 열리면, 앱이 HarukanaAndroid 라는 연결 통로를 넣어 줘요
const ANDROID = window.HarukanaAndroid || null;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const GROUP_ORDER = ['basic', 'dakuten', 'yoon'];
const CAT_ORDER = Object.keys(VOCAB_CATS);

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgo(n) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// 날짜로 매일 바뀌는 숫자 만들기 (오늘의 글자/단어)
function daySeed(salt) {
  return [...(dateKey() + salt)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
}

let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  $('#toast-msg').textContent = msg;
  const btn = $('#toast-action');
  btn.hidden = !action;
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => { el.hidden = true; action.fn(); };
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 8000 : 2600);
}

// 확인 창 (예: "정말 지울까요?") — 확인을 누르면 true
function confirmBox(title, body, okLabel = '확인') {
  const dlg = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  $('#confirm-ok').textContent = okLabel;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise(resolve => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
  });
}

/* ---------- 2. 저장하기 ---------- */
const STORE_KEY = 'harukana:v1';

function defaultState() {
  return {
    settings: { goal: 20, rate: 0.85, theme: 'auto', sfx: true, vibrate: true, autoSpeak: true, furigana: true, petals: true, voice: '', voiceGender: 'female', pitch: 1, voicePack: true },
    prefs: {
      table: 'h',
      practiceTab: 'cards',
      cards: { kind: 'kana', script: 'h', groups: ['basic'], cats: ['all'], front: 'jp', filter: 'all' },
      quiz: { kind: 'kana', mode: 'read', wmode: 'meaning', script: 'h', groups: ['basic'], cats: ['all'], filter: 'all', length: '10' },
      write: { script: 'h', groups: ['basic'], order: 'seq', guide: 'trace' },
      vocab: { filter: 'all' },
      simIntroClosed: false,
      installClosed: false,
    },
    // 글자·단어별 기록: { c: 맞힌 수, w: 틀린 수, wt: 출제 가중치, run: 연속 정답, m: 외웠는지,
    //                    box: 복습 단계(0~5), due: 다음 복습 날짜 }
    chars: {},
    stars: {},             // 즐겨찾기한 단어
    streak: { last: null, count: 0, best: 0 },
    days: {},              // 날짜별 { n: 푼 문제, ok: 맞힌 문제, g: 그날 목표, s: 공부함 }
    totals: { n: 0, ok: 0 },
  };
}

// 저장된 내용을 기본값과 합쳐요 (새 기능이 생겨도 옛 기록이 그대로 동작하도록)
function normalize(saved) {
  const b = defaultState();
  if (!saved || typeof saved !== 'object') return b;
  const sp = saved.prefs || {};
  const s = {
    ...b, ...saved,
    settings: { ...b.settings, ...saved.settings },
    prefs: {
      ...b.prefs, ...sp,
      cards: { ...b.prefs.cards, ...sp.cards },
      quiz: { ...b.prefs.quiz, ...sp.quiz },
      write: { ...b.prefs.write, ...sp.write },
      vocab: { ...b.prefs.vocab, ...sp.vocab },
    },
    chars: saved.chars || {},
    stars: saved.stars || {},
    streak: { ...b.streak, ...saved.streak },
    days: saved.days || {},
    totals: { ...b.totals, ...saved.totals },
  };
  if (s.prefs.quiz.mode === 'choice') s.prefs.quiz.mode = 'read';   // v1 → v2
  for (const p of [s.prefs.cards, s.prefs.quiz, s.prefs.write]) {
    if (!Array.isArray(p.groups) || !p.groups.length) p.groups = ['basic'];
    if (!Array.isArray(p.cats) || !p.cats.length) p.cats = ['all'];
  }
  // v3: 복습 일정이 없는 옛 기록은 오늘 복습하도록 잡아 줘요
  for (const c of Object.values(s.chars)) {
    if (!c.due) { c.box = c.m ? 1 : 0; c.due = dateKey(); }
  }
  return s;
}

function loadState() {
  try { return normalize(JSON.parse(localStorage.getItem(STORE_KEY))); }
  catch (e) { return defaultState(); }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 저장 불가(사생활 보호 모드 등) */ }
}

let state = loadState();

/* ---------- 3. 공부 기록 ---------- */
const isWordId = id => id.startsWith('w:');
const itemOf = id => KANA_BY_ID[id] || VOCAB_BY_ID[id];
const speakTextOf = id => (isWordId(id) ? VOCAB_BY_ID[id].reading : id);

function charStat(id) {
  if (!state.chars[id]) state.chars[id] = { c: 0, w: 0, wt: 1, run: 0, m: false };
  return state.chars[id];
}
function today() {
  const key = dateKey();
  if (!state.days[key]) state.days[key] = { n: 0, ok: 0 };
  return state.days[key];
}

// 오늘 공부했다고 표시 → 연속 공부일수 계산
function markStudied() {
  today().s = 1;
  const t = dateKey();
  const s = state.streak;
  if (s.last === t) return;
  s.count = (s.last === dateKey(daysAgo(1))) ? s.count + 1 : 1;
  s.best = Math.max(s.best, s.count);
  s.last = t;
}
function currentStreak() {
  const s = state.streak;
  return (s.last === dateKey() || s.last === dateKey(daysAgo(1))) ? s.count : 0;
}

// 퀴즈 한 문제의 결과 기록.
// 틀리면 가중치 +2 (최대 8) → 더 자주 나와요. 맞히면 ×0.7 (최소 1) → 덜 나와요.
function recordAnswer(id, ok) {
  const c = charStat(id);
  if (ok) {
    c.c++; c.run++;
    c.wt = Math.max(1, +(c.wt * 0.7).toFixed(2));
    if (c.run >= 3) c.m = true;          // 3번 연속 맞히면 "외운 것"
  } else {
    c.w++; c.run = 0;
    c.wt = Math.min(8, c.wt + 2);
    c.m = false;
  }
  schedule(id, ok);
  const d = today();
  const before = d.n;
  d.n++; if (ok) d.ok++;
  d.g = state.settings.goal;
  state.totals.n++; if (ok) state.totals.ok++;
  markStudied();
  pruneDays();
  save();
  return before < state.settings.goal && d.n >= state.settings.goal;   // 방금 목표 달성?
}
function pruneDays() {
  const keep = dateKey(daysAgo(400));
  for (const k of Object.keys(state.days)) if (k < keep) delete state.days[k];
}

// 복습 일정 (간격 반복): 맞히면 1일 → 3일 → 7일 → 14일 → 30일 뒤, 틀리면 처음부터
const SRS_DAYS = [0, 1, 3, 7, 14, 30];
const inDays = n => dateKey(daysAgo(-n));
function schedule(id, ok) {
  const c = charStat(id);
  const t = dateKey();
  if (!ok) { c.box = 0; c.due = t; return; }
  // 복습할 때가 됐을 때만 다음 단계로 (같은 날 여러 번 맞혀도 한 단계만 올라가요)
  if (!c.due || c.due <= t) {
    c.box = Math.min(5, (c.box || 0) + 1);
    c.due = inDays(SRS_DAYS[c.box]);
  }
}
function dueList() {
  const t = dateKey();
  return [...KANA, ...VOCAB]
    .filter(x => { const c = state.chars[x.id]; return c && c.due && c.due <= t; })
    .sort((a, b) => state.chars[a.id].due.localeCompare(state.chars[b.id].due)
      || (state.chars[a.id].box || 0) - (state.chars[b.id].box || 0));
}
function dueCountWithin(days) {
  const end = inDays(days);
  return Object.values(state.chars).filter(c => c.due && c.due <= end).length;
}
function setMastered(id, value) {
  const c = charStat(id);
  c.m = value;
  if (!value) c.wt = Math.min(8, c.wt + 1);   // "아직 몰라요" → 퀴즈에 조금 더 자주
  schedule(id, value);
  markStudied();
  save();
}
function toggleStar(id) {
  if (state.stars[id]) delete state.stars[id]; else state.stars[id] = 1;
  save();
  return !!state.stars[id];
}

const isMastered = id => !!(state.chars[id] && state.chars[id].m);
// 가중치 2 이상 = "자주 틀리는 것" (틀린 뒤 두 번 연속 맞히면 빠져요)
const isWeak = id => !!(state.chars[id] && state.chars[id].wt >= 2);
function weakList(kind) {
  const list = kind === 'word' ? VOCAB : kind === 'kana' ? KANA : [...KANA, ...VOCAB];
  return list.filter(x => isWeak(x.id))
    .sort((a, b) => state.chars[b.id].wt - state.chars[a.id].wt || state.chars[b.id].w - state.chars[a.id].w);
}

// 가중치에 따라 무작위로 하나 고르기
function pickWeighted(ids, avoidId) {
  const cands = ids.length > 1 ? ids.filter(id => id !== avoidId) : ids;
  const weights = cands.map(id => {
    const c = state.chars[id];
    if (!c) return 1.2;               // 처음 보는 것은 살짝 더 자주
    return c.m ? c.wt * 0.5 : c.wt;   // 외운 것은 덜 자주
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i];
    if (r <= 0) return cands[i];
  }
  return cands[cands.length - 1];
}

function kanaPool(script, groups) {
  return KANA.filter(k => (script === 'both' || k.script === script) && groups.includes(k.group));
}
function wordPool(cats) {
  return cats.includes('all') ? [...VOCAB] : VOCAB.filter(w => cats.includes(w.cat));
}
function applyFilter(list, filter) {
  switch (filter) {
    case 'new':  return list.filter(x => !isMastered(x.id));
    case 'weak': return list.filter(x => isWeak(x.id));
    case 'star': return list.filter(x => state.stars[x.id]);
    case 'sim':  return list.filter(x => x.similar);
    default:     return list;
  }
}

/* ---------- 4. 읽는 법 만들기 ---------- */
// "きょう" → ['きょ', 'う'] 처럼 요음은 두 글자를 한 덩어리로 나눠요.
function kanaUnits(str) {
  const out = [];
  for (let i = 0; i < str.length;) {
    const two = str.slice(i, i + 2);
    if (two.length === 2 && KANA_BY_ID[two]) { out.push(two); i += 2; }
    else { out.push(str[i]); i += 1; }
  }
  return out;
}
const SMALL_TSU = new Set(['っ', 'ッ']);
const N_KANA = new Set(['ん', 'ン']);

function toRomaji(str) {
  let res = '';
  const units = kanaUnits(str);
  units.forEach((u, i) => {
    if (SMALL_TSU.has(u)) {           // 작은 っ: 다음 소리의 첫 자음을 한 번 더 (がっこう → gakkou)
      const next = KANA_BY_ID[units[i + 1]];
      if (next) res += next.romaji.startsWith('ch') ? 't' : next.romaji[0];
      return;
    }
    if (u === 'ー') { const m = res.match(/[aeiou]$/); if (m) res += m[0]; return; }  // 장음: 앞 모음을 한 번 더
    const k = KANA_BY_ID[u];
    res += k ? k.romaji : u;
  });
  return res;
}

// 한글 글자에 받침(ㄴ, ㅅ)을 붙여요. (유니코드 한글은 계산으로 만들 수 있어요)
function addFinal(s, finalIndex, fallback) {
  const code = s.charCodeAt(s.length - 1);
  if (!s || code < 0xAC00 || code > 0xD7A3 || (code - 0xAC00) % 28 !== 0) return s + fallback;
  return s.slice(0, -1) + String.fromCharCode(code + finalIndex);
}
function toKoPron(str) {
  let res = '';
  for (const u of kanaUnits(str)) {
    if (SMALL_TSU.has(u)) { res = addFinal(res, 19, 'ㅅ'); continue; }   // っ → ㅅ 받침
    if (N_KANA.has(u)) { res = addFinal(res, 4, 'ㄴ'); continue; }       // ん → ㄴ 받침
    if (u === 'ー') { res += '-'; continue; }
    const k = KANA_BY_ID[u];
    res += k ? k.ko : u;
  }
  return res;
}

/* ---------- 5. 소리 ---------- */
// 목소리 이름으로 여성/남성을 짐작해요 (기기마다 이름이 달라서, 모르는 이름은 표시하지 않아요)
const FEMALE_VOICES = /kyoko|haruka|ayumi|nanami|sayaka|mizuki|aoi|mayu|shiori|o-?ren|hikari|kaori|naomi|google\s*日本語/i;
const MALE_VOICES = /otoya|hattori|ichiro|keita|daichi|naoki|takumi|kenji|kazuki/i;
function voiceGender(v) {
  if (FEMALE_VOICES.test(v.name)) return 'female';
  if (MALE_VOICES.test(v.name)) return 'male';
  return '';
}
const GENDER_LABEL = { female: '여성', male: '남성' };

// 캐릭터 목소리 소리 파일 (audio/index.js 가 있으면 써요)
const PACK = typeof AUDIO_PACK !== 'undefined' ? AUDIO_PACK : null;
function packFile(id, text) {
  if (!PACK || !state.settings.voicePack) return null;
  const f = (id && PACK.ids[id]) || PACK.texts[text];
  return f ? `audio/${f}` : null;
}
const Player = {
  el: null,
  play(file, delay, text) {
    const go = () => {
      if (Speech.supported) speechSynthesis.cancel();
      if (!this.el) this.el = new Audio();
      const a = this.el;
      a.pause();
      a.src = file;
      a.preservesPitch = true;
      a.playbackRate = Math.max(0.5, Math.min(2, state.settings.rate / 0.85));   // "보통" 빠르기 = 원래 속도
      a.play().catch(() => Speech.tts(text, 0));   // 재생이 안 되면 휴대폰 음성으로
    };
    if (delay) setTimeout(go, delay); else go();
  },
};

const Speech = {
  supported: 'speechSynthesis' in window,
  voices: [], voice: null, loaded: false, warned: false,

  init() {
    if (ANDROID) { this.native = true; this.loaded = true; renderVoiceStatus(); return; }
    if (!this.supported) { this.loaded = true; renderVoiceStatus(); return; }
    const pick = () => {
      const all = speechSynthesis.getVoices();
      if (!all.length) return;
      this.voices = all.filter(v => /^ja/i.test(v.lang));
      this.choose();
      this.loaded = true;
      renderVoiceStatus();
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
    setTimeout(() => { if (!this.loaded) { this.loaded = true; renderVoiceStatus(); } }, 2500);
  },
  choose() {
    const want = state.settings.voice;            // 목록에서 직접 고른 목소리가 먼저
    const g = state.settings.voiceGender;         // 그다음 여성/남성 선호
    const byGender = g === 'auto' ? [] : this.voices.filter(v => voiceGender(v) === g);
    this.voice = (want && this.voices.find(v => v.voiceURI === want))
      || byGender.find(v => v.localService) || byGender[0]
      || this.voices.find(v => v.lang === 'ja-JP' && v.localService)
      || this.voices.find(v => v.lang === 'ja-JP')
      || this.voices[0] || null;
    this.genderMatched = !!this.voice && (g === 'auto' || voiceGender(this.voice) === g);
  },
  // 캐릭터 목소리 파일이 있으면 그걸, 없으면 휴대폰 음성(TTS)으로 읽어요
  speak(text, delay = 0, id) {
    const file = packFile(id, text);
    if (file) { Player.play(file, delay, text); return; }
    this.tts(text, delay);
  },
  tts(text, delay = 0) {
    if (this.native) {   // 안드로이드 앱: 휴대폰 음성으로 바로 읽어요
      const say = () => ANDROID.speak(text, state.settings.rate / 0.85, state.settings.pitch);
      if (delay) setTimeout(say, delay); else say();
      return;
    }
    if (!this.supported) { toast('이 브라우저는 소리 기능을 지원하지 않아요'); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (this.voice) u.voice = this.voice;
    u.rate = state.settings.rate;
    u.pitch = state.settings.pitch;               // 목소리 높낮이 (1 = 원래 목소리)
    const go = () => speechSynthesis.speak(u);
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel();
      setTimeout(go, Math.max(60, delay));
    } else if (delay) setTimeout(go, delay);
    else go();
    if (this.loaded && !this.voice && !this.warned) {
      this.warned = true;
      toast('일본어 음성이 없을 수 있어요. 기록 › 소리 › "소리가 안 나와요"를 확인해 보세요');
    }
  },
};
const speakId = (id, delay) => Speech.speak(speakTextOf(id), delay, id);

// 정답·오답 효과음 (파일 없이 브라우저가 직접 소리를 만들어요)
const Sfx = {
  ctx: null,
  play(ok) {
    if (!state.settings.sfx) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      const notes = ok ? [[880, 0], [1318.5, 0.09]] : [[233, 0], [196, 0.13]];
      for (const [freq, dt] of notes) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = ok ? 'sine' : 'triangle';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.exponentialRampToValueAtTime(ok ? 0.16 : 0.14, t + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.28);
        o.connect(g).connect(ctx.destination);
        o.start(t + dt); o.stop(t + dt + 0.32);
      }
    } catch (e) { /* 효과음을 못 내도 공부에는 지장 없어요 */ }
  },
};
function buzz() {
  if (!state.settings.vibrate) return;
  if (ANDROID) ANDROID.vibrate(120);
  else if (navigator.vibrate) navigator.vibrate(120);
}

/* ---------- 6. 화면 전환 ---------- */
const VIEWS = ['home', 'table', 'vocab', 'practice', 'stats', 'videos', 'lessons'];
const SUB_VIEWS = ['videos', 'lessons'];   // 뒤로 가기 버튼이 있는 화면
const renderers = {};
let currentView = null;
let lastMainView = 'home';

function showView(name) {
  if (!VIEWS.includes(name)) name = 'home';
  currentView = name;
  if (!SUB_VIEWS.includes(name)) lastMainView = name;
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== name;
  $$('.tabbar button').forEach(b => {
    if (b.dataset.go === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (renderers[name]) renderers[name]();
  window.scrollTo(0, 0);
}
function go(name) {
  if (location.hash === `#${name}`) showView(name);
  else location.hash = name;   // 주소 뒤 #home 같은 부분 → 휴대폰 뒤로가기 버튼도 동작해요
}
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));

document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) { go(g.dataset.go); return; }
  const s = e.target.closest('[data-speak]');
  if (s) speakId(s.dataset.speak);
  const v = e.target.closest('[data-video]');
  if (v) openVideos(v.dataset.video);
  const say = e.target.closest('[data-say]');
  if (say) Speech.speak(say.dataset.say);
});

// 세그먼트/칩 버튼 묶음과 설정값 연결
//   data-multi: 여러 개 선택, data-all: "전체" 버튼이 있는 묶음
function bindChoices(root, prefs, onChange) {
  const boxes = $$('[data-setting]', root);
  const paint = () => boxes.forEach(box => {
    const key = box.dataset.setting;
    const multi = box.hasAttribute('data-multi');
    $$('button', box).forEach(b => {
      const v = b.dataset.value;
      b.setAttribute('aria-pressed', String(multi ? prefs[key].includes(v) : String(prefs[key]) === v));
    });
  });
  boxes.forEach(box => {
    const key = box.dataset.setting;
    const multi = box.hasAttribute('data-multi');
    const hasAll = box.hasAttribute('data-all');
    box.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const v = b.dataset.value;
      if (multi) {
        let set = new Set(prefs[key]);
        if (hasAll && v === 'all') set = new Set(['all']);
        else {
          set.delete('all');
          if (set.has(v)) set.delete(v); else set.add(v);
          if (!set.size) {
            if (hasAll) set.add('all');
            else { toast('하나 이상 골라야 해요'); return; }
          }
        }
        const order = hasAll ? ['all', ...CAT_ORDER] : GROUP_ORDER;
        prefs[key] = order.filter(x => set.has(x));
      } else {
        prefs[key] = v;
      }
      save(); paint();
      if (onChange) onChange();
    });
  });
  paint();
  return paint;
}

function kanaTile(k, extra = '') {
  return `<button class="kana-tile" data-speak="${k.id}" aria-label="${k.kana} ${k.ko} 소리 듣기">
    <span class="k">${k.kana}</span><span class="r">${k.ko} · ${k.romaji}</span>${extra}</button>`;
}
function wordTile(w, extra = '') {
  return `<button class="kana-tile word ${w.word.length > 3 ? 'wide' : ''}" data-speak="${w.id}" aria-label="${w.word} ${w.meaning} 소리 듣기">
    <span class="k">${w.word}</span>${w.hasKanji ? `<span class="r">${w.reading}</span>` : ''}<span class="m">${w.meaning}</span>${extra}</button>`;
}
const tileOf = (id, extra) => (isWordId(id) ? wordTile(VOCAB_BY_ID[id], extra) : kanaTile(KANA_BY_ID[id], extra));

let celebrateTimer;
function celebrate() {
  const el = $('#celebrate');
  el.hidden = false;
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => { el.hidden = true; }, 1900);
}
$('#celebrate').addEventListener('click', () => { $('#celebrate').hidden = true; });

/* ---------- 7. 홈 ---------- */
const ROADMAP = [
  { name: '히라가나 기본 46자', video: 'hiragana', items: () => kanaPool('h', ['basic']),
    start: () => Cards.startFromPrefs({ kind: 'kana', script: 'h', groups: ['basic'], filter: 'all' }) },
  { name: '가타카나 기본 46자', video: 'katakana', items: () => kanaPool('k', ['basic']),
    start: () => Cards.startFromPrefs({ kind: 'kana', script: 'k', groups: ['basic'], filter: 'all' }) },
  { name: '탁음·요음 (히라가나)', video: 'sound', items: () => kanaPool('h', ['dakuten', 'yoon']),
    start: () => Cards.startFromPrefs({ kind: 'kana', script: 'h', groups: ['dakuten', 'yoon'], filter: 'all' }) },
  { name: '탁음·요음 (가타카나)', video: 'sound', items: () => kanaPool('k', ['dakuten', 'yoon']),
    start: () => Cards.startFromPrefs({ kind: 'kana', script: 'k', groups: ['dakuten', 'yoon'], filter: 'all' }) },
  { name: 'JLPT N5 단어', video: 'words', items: () => VOCAB,
    start: () => Cards.startFromPrefs({ kind: 'word', cats: ['all'], filter: 'new' }) },
];

renderers.home = function renderHome() {
  const h = new Date().getHours();
  $('#home-greeting').textContent =
    h < 5 ? '늦은 밤에도 한 걸음' : h < 12 ? '좋은 아침이에요' : h < 18 ? '오늘도 한 걸음' : '오늘 하루 마무리 공부';

  const streak = currentStreak();
  const studiedToday = state.streak.last === dateKey();
  $('#home-streak').textContent = streak;
  $('.streak-card').classList.toggle('off', !studiedToday);
  $('#home-streak-msg').textContent = studiedToday
    ? '오늘도 공부 완료! 내일도 이어가요'
    : streak > 0 ? `오늘 공부하면 ${streak + 1}일 연속이 돼요` : '오늘 카드나 퀴즈를 하나 하면 시작돼요';

  // 오늘의 목표 (원형 그래프)
  const goal = state.settings.goal;
  const n = (state.days[dateKey()] || { n: 0 }).n;
  const pct = Math.min(1, n / goal);
  const C = 2 * Math.PI * 50;
  const fill = $('#home-ring-fill');
  fill.style.strokeDasharray = C;
  fill.style.strokeDashoffset = C * (1 - pct);
  $('#home-ring').classList.toggle('done', pct >= 1);
  $('#home-ring').setAttribute('aria-label', `오늘의 목표 ${goal}문제 중 ${n}문제, ${Math.round(pct * 100)}% 달성`);
  $('#home-goal-pct').textContent = `${Math.round(pct * 100)}%`;
  $('#home-goal-count').textContent = `${n} / ${goal}`;
  $('#home-goal-msg').textContent = n >= goal ? '목표 달성! 더 풀면 실력이 더 늘어요'
    : n === 0 ? `퀴즈 ${goal}문제를 풀어 보세요` : `목표까지 ${goal - n}문제 남았어요`;
  $('#home-quiz-btn').textContent = n > 0 && n < goal ? '이어서 풀기' : '퀴즈 시작하기';

  // 오늘의 복습
  const due = dueList();
  const scheduled = Object.values(state.chars).some(c => c.due);
  const dk = due.filter(x => !isWordId(x.id)).length;
  $('#review-count').textContent = due.length;
  $('#review-card').classList.toggle('has-due', due.length > 0);
  $('#review-btn').hidden = due.length === 0;
  $('#review-btn').textContent = due.length > 30 ? '복습 시작하기 (먼저 30개)' : `복습 시작하기 (${due.length}개)`;
  $('#review-msg').textContent = due.length
    ? `잊어버리기 전에 다시 볼 때예요 · 글자 ${dk}개 · 단어 ${due.length - dk}개`
    : scheduled ? `오늘 복습 끝! 내일까지 ${dueCountWithin(1)}개가 기다려요` : '카드나 퀴즈로 공부하면 복습 일정이 자동으로 잡혀요';

  // 숫자 타일
  $('#home-mastered').textContent = KANA.filter(k => isMastered(k.id)).length;
  $('#home-total').textContent = KANA.length;
  $('#home-words').textContent = VOCAB.filter(w => isMastered(w.id)).length;
  $('#home-words-total').textContent = VOCAB.length;
  const wk = weakList('kana').length, ww = weakList('word').length;
  $('#home-weak').textContent = wk + ww;
  $('#home-review').hidden = wk + ww === 0;
  $('#home-weak-kana').hidden = wk === 0;
  $('#home-weak-words').hidden = ww === 0;
  $('#home-weak-kana-n').textContent = wk;
  $('#home-weak-words-n').textContent = ww;

  // 공부 순서 (80% 이상 외우면 다음 단계로)
  let currentFound = false;
  $('#roadmap').innerHTML = ROADMAP.map((step, i) => {
    const items = step.items();
    const m = items.filter(x => isMastered(x.id)).length;
    const p = m / items.length;
    const complete = p >= 0.8;
    const current = !complete && !currentFound;
    if (current) currentFound = true;
    return `<li class="road-step ${complete ? 'complete' : ''} ${current ? 'current' : ''}">
      <span class="road-num" aria-hidden="true">${complete ? '✓' : i + 1}</span>
      <div class="road-body">
        <strong>${step.name}</strong>
        <div class="meter" role="progressbar" aria-label="${step.name} 외운 비율" aria-valuemin="0" aria-valuemax="${items.length}" aria-valuenow="${m}"><div style="width:${p * 100}%"></div></div>
        <span class="road-sub">외운 것 ${m} / ${items.length} · <button class="link-btn" data-video="${step.video}">강의 영상</button></span>
      </div>
      <button class="btn btn-primary" data-road="${i}">${complete ? '복습' : current ? (m ? '이어서' : '시작') : '보기'}</button>
    </li>`;
  }).join('');

  // 오늘의 글자 · 오늘의 단어
  const basics = KANA.filter(k => k.group === 'basic');
  const tk = basics[daySeed('k') % basics.length];
  $('#home-today-kana').textContent = tk.kana;
  $('#home-today-kana').dataset.speak = tk.id;
  $('#home-today-ko').textContent = tk.ko;
  $('#home-today-rom').textContent = tk.romaji;
  const tw = VOCAB[daySeed('w') % VOCAB.length];
  $('#home-today-word').textContent = tw.word;
  $('#home-today-word').classList.toggle('long', tw.word.length > 4);
  $('#home-today-word').dataset.speak = tw.id;
  $('#home-today-reading').textContent = tw.hasKanji ? tw.reading : toRomaji(tw.pron);
  $('#home-today-meaning').textContent = tw.meaning;
  $('#home-today-sim').hidden = !tw.similar;

  renderInstall();
};
$('#roadmap').addEventListener('click', e => {
  const b = e.target.closest('[data-road]');
  if (b) ROADMAP[Number(b.dataset.road)].start();
});
$('#home-quiz-btn').addEventListener('click', () => Quiz.startFromPrefs());
$('#review-btn').addEventListener('click', () => Cards.startReview());
$('#home-weak-kana').addEventListener('click', () => Quiz.startWeak('kana'));
$('#home-weak-words').addEventListener('click', () => Quiz.startWeak('word'));
$('#home-weak-tile').addEventListener('click', () => {
  const wk = weakList('kana').length, ww = weakList('word').length;
  if (!wk && !ww) toast('복습할 것이 없어요 👍 퀴즈를 풀면 틀린 것이 여기에 모여요');
  else Quiz.startWeak(wk >= ww ? 'kana' : 'word');
});

/* ---------- 8. 글자표 ---------- */
renderers.table = function renderTable() {
  const script = state.prefs.table;
  $$('#table-script button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === script)));
  const layout = KANA_LAYOUT[script];
  let html = `<p class="table-legend"><i></i> 표시 = 외운 글자 · ${SCRIPT_INFO[script].desc}</p>`;
  for (const g of GROUP_ORDER) {
    const rows = layout[g];
    const count = rows.flat().filter(Boolean).length;
    html += `<section class="kana-section">
      <div class="kana-section-head"><h2 class="h2">${GROUP_INFO[g].name}</h2><span class="count">${count}글자</span></div>
      <p class="muted small">${GROUP_INFO[g].desc}</p>
      <div class="kana-grid ${g === 'yoon' ? 'cols-3' : ''}">`;
    for (const row of rows) {
      for (const id of row) {
        if (!id) { html += '<span class="kana-cell empty" aria-hidden="true"></span>'; continue; }
        const k = KANA_BY_ID[id];
        const m = isMastered(id);
        html += `<button class="kana-cell ${m ? 'mastered' : ''}" data-cell="${id}" aria-label="${k.kana}, ${k.ko}, ${k.romaji}${m ? ', 외운 글자' : ''}">
          <span class="k">${k.kana}</span><span class="r"><b>${k.ko}</b> ${k.romaji}</span></button>`;
      }
    }
    html += '</div></section>';
  }
  $('#table-body').innerHTML = html;

  $('#confuse-body').innerHTML = CONFUSABLES[script].map(c => `
    <div class="confuse-group">
      <div class="confuse-tiles">${c.set.map(id => kanaTile(KANA_BY_ID[id])).join('')}</div>
      <p>${c.tip}</p>
    </div>`).join('');
};
$('#table-script').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  state.prefs.table = b.dataset.value;
  save();
  renderers.table();
});
$('#table-body').addEventListener('click', e => {
  const cell = e.target.closest('[data-cell]');
  if (!cell) return;
  speakId(cell.dataset.cell);
  cell.classList.add('playing');
  setTimeout(() => cell.classList.remove('playing'), 700);
});
$('#confuse-quiz').addEventListener('click', () => {
  const ids = [...new Set(CONFUSABLES[state.prefs.table].flatMap(c => c.set))];
  Quiz.start({ kind: 'kana', mode: 'read', ids, total: 10 });
});
$('#table-videos').addEventListener('click', () => openVideos(state.prefs.table === 'h' ? 'hiragana' : 'katakana'));

/* ---------- 9. 단어장 ---------- */
const Vocab = {
  query: '',
  filters() {
    return [
      { key: 'all', label: '전체', list: VOCAB },
      { key: 'star', label: '★ 즐겨찾기', list: VOCAB.filter(w => state.stars[w.id]) },
      { key: 'sim', label: '한국어와 비슷해요', list: VOCAB.filter(w => w.similar) },
      { key: 'weak', label: '틀린 단어', list: VOCAB.filter(w => isWeak(w.id)) },
      ...CAT_ORDER.map(c => ({ key: c, label: VOCAB_CATS[c], list: VOCAB.filter(w => w.cat === c) })),
    ];
  },
  current() {
    const f = this.filters().find(x => x.key === state.prefs.vocab.filter) || this.filters()[0];
    const q = this.query.trim().toLowerCase();
    if (!q) return f.list;
    return f.list.filter(w =>
      w.word.includes(q) || w.reading.includes(q) || w.meaning.includes(q) ||
      w.kr.includes(q) || toRomaji(w.pron).includes(q) || toKoPron(w.pron).includes(q));
  },
  renderFilters() {
    const cur = state.prefs.vocab.filter;
    $('#vocab-filter').innerHTML = this.filters().map(f =>
      `<button data-filter="${f.key}" aria-pressed="${f.key === cur}">${f.label}<span class="n">${f.list.length}</span></button>`).join('');
  },
  render() {
    $('#sim-intro').hidden = state.prefs.simIntroClosed;
    this.renderFilters();
    const list = this.current();
    const m = list.filter(w => isMastered(w.id)).length;
    $('#vocab-count').textContent = list.length ? `단어 ${list.length}개 · 외운 단어 ${m}개` : '';
    $('#vocab-list').innerHTML = list.length ? list.map(w => {
      const krLine = w.similar
        ? `<span class="badge-sim">한국어와 비슷해요 · ${w.kr}</span>`
        : w.kr ? `<span class="kr">한자어: ${w.kr}</span>` : '';
      const star = !!state.stars[w.id];
      return `<li class="word-row ${isMastered(w.id) ? 'mastered' : ''}">
        <button class="word-main" data-speak="${w.id}" aria-label="${w.word}, ${w.reading}, ${w.meaning}. 소리 듣기">
          <span class="word-jp"><span class="w">${w.word}</span><span class="r">${w.hasKanji ? w.reading : toRomaji(w.pron)}</span></span>
          <span class="word-ko"><span class="m">${w.meaning}</span></span>
          ${krLine ? `<span class="word-extra">${krLine}</span>` : ''}
        </button>
        <button class="star" data-star="${w.id}" aria-pressed="${star}" aria-label="${w.word} 즐겨찾기">${star ? '★' : '☆'}</button>
      </li>`;
    }).join('') : `<li class="empty-msg">${this.query ? `"${escapeHtml(this.query)}"에 맞는 단어가 없어요.` : state.prefs.vocab.filter === 'star' ? '☆을 눌러 즐겨찾기를 담아 보세요.' : '아직 없어요.'}</li>`;
    $('#vocab-actions').hidden = list.length === 0;
  },
};
renderers.vocab = () => Vocab.render();
$('#vocab-filter').addEventListener('click', e => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  state.prefs.vocab.filter = b.dataset.filter;
  save();
  Vocab.render();
});
let searchTimer;
$('#vocab-search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { Vocab.query = e.target.value; Vocab.render(); }, 120);
});
$('#vocab-list').addEventListener('click', e => {
  const s = e.target.closest('[data-star]');
  if (!s) return;
  const on = toggleStar(s.dataset.star);
  s.setAttribute('aria-pressed', String(on));
  s.textContent = on ? '★' : '☆';
  Vocab.renderFilters();
  toast(on ? '즐겨찾기에 담았어요' : '즐겨찾기에서 뺐어요');
});
$('#sim-intro-close').addEventListener('click', () => { state.prefs.simIntroClosed = true; save(); $('#sim-intro').hidden = true; });
$('#vocab-cards').addEventListener('click', () => Cards.start({ kind: 'word', ids: Vocab.current().map(w => w.id), front: state.prefs.cards.front }));
$('#vocab-quiz').addEventListener('click', () => {
  Quiz.start({ kind: 'word', mode: state.prefs.quiz.wmode, ids: Vocab.current().map(w => w.id), total: Number(state.prefs.quiz.length) });
});

/* ---------- 10. 연습 — 고르기 화면 ---------- */
const Practice = {
  panels: ['practice-setup', 'cards-play', 'cards-done', 'quiz-play', 'quiz-result', 'write-play'],
  phase: 'practice-setup',
  show(panel) {
    this.phase = panel;
    for (const p of this.panels) $(`#${p}`).hidden = p !== panel;
    window.scrollTo(0, 0);
  },
  showSetup(tab) {
    Quiz.stopTimer();
    if (tab) state.prefs.practiceTab = tab;
    const t = state.prefs.practiceTab;
    $$('#practice-tab button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === t)));
    $('#cards-setup').hidden = t !== 'cards';
    $('#quiz-setup').hidden = t !== 'quiz';
    $('#write-setup').hidden = t !== 'write';
    this.refresh();
    this.show('practice-setup');
  },
  // 고른 값에 따라 보이는 칸을 바꾸고, 몇 개가 나올지 알려줘요
  refresh() {
    for (const [root, p] of [[$('#cards-setup'), state.prefs.cards], [$('#quiz-setup'), state.prefs.quiz]]) {
      $$('[data-show]', root).forEach(el => { el.hidden = el.dataset.show !== p.kind; });
      $$('[data-only]', root).forEach(el => { el.hidden = el.dataset.only !== p.kind; });
    }
    const c = state.prefs.cards;
    if (c.kind === 'kana' && (c.filter === 'star' || c.filter === 'sim')) { c.filter = 'all'; paintCards(); }
    const nc = Cards.pool().length;
    $('#cards-count-msg').innerHTML = nc ? `카드 <strong>${nc}</strong>장을 볼 거예요`
      : c.filter === 'weak' ? '여기에는 틀린 것이 없어요 👍'
      : c.filter === 'new' ? '여기 있는 것은 모두 외웠어요! 다른 범위를 골라 보세요'
      : c.filter === 'star' ? '즐겨찾기한 단어가 없어요. 단어장에서 ☆을 눌러 보세요'
      : '고른 범위에 카드가 없어요';
    $('#cards-start').disabled = nc === 0;

    const q = state.prefs.quiz;
    const nq = Quiz.poolFromPrefs().length;
    $('#quiz-count-msg').innerHTML = nq ? `<strong>${nq}</strong>개 중에서 ${q.length}문제가 나와요`
      : q.filter === 'weak' ? '여기에는 틀린 단어가 없어요 👍'
      : q.filter === 'star' ? '즐겨찾기한 단어가 없어요. 단어장에서 ☆을 눌러 보세요'
      : '고른 범위에 문제가 없어요';
    $('#quiz-start').disabled = nq === 0;

    $('#write-count-msg').innerHTML = `<strong>${Write.pool().length}</strong>글자를 써 볼 거예요`;
  },
};
// 주제 칩 만들기
$$('[data-setting="cats"]').forEach(box => {
  box.innerHTML = `<button data-value="all">전체</button>` +
    CAT_ORDER.map(c => `<button data-value="${c}">${VOCAB_CATS[c]}</button>`).join('');
});
const paintCards = bindChoices($('#cards-setup'), state.prefs.cards, () => Practice.refresh());
bindChoices($('#quiz-setup'), state.prefs.quiz, () => Practice.refresh());
const paintWrite = bindChoices($('#write-setup'), state.prefs.write, () => Practice.refresh());
$('#practice-tab').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) { Practice.showSetup(b.dataset.value); save(); }
});
renderers.practice = () => {
  if (['cards-done', 'quiz-result', 'practice-setup'].includes(Practice.phase)) Practice.showSetup();
  if (Practice.phase === 'write-play') Write.resize();   // 화면이 보인 뒤에 쓰는 칸 크기를 다시 재요
};
// 다른 화면에서 연습을 시작할 때 연습 탭으로 옮겨 가요
function enterPractice() { if (currentView !== 'practice') go('practice'); }

/* ---------- 11. 연습 — 플래시카드 ---------- */
const Cards = {
  deck: [], i: 0, flipped: false, kind: 'kana', front: 'jp', ids: [],
  known: new Set(), again: {}, dragged: false,

  pool() {
    const p = state.prefs.cards;
    const list = p.kind === 'kana' ? kanaPool(p.script, p.groups) : wordPool(p.cats);
    return applyFilter(list, p.filter);
  },
  // 설정을 바꾼 뒤 바로 시작 (홈의 "공부 순서" 버튼)
  startFromPrefs(over) {
    Object.assign(state.prefs.cards, over);
    save(); paintCards();
    const ids = this.pool().map(x => x.id);
    if (!ids.length) {   // 모두 외웠으면 전체로 복습
      state.prefs.cards.filter = 'all'; save(); paintCards();
      return this.start({ kind: state.prefs.cards.kind, ids: this.pool().map(x => x.id) });
    }
    this.start({ kind: state.prefs.cards.kind, ids });
  },
  startReview() {
    const ids = dueList().slice(0, 30).map(x => x.id);
    if (!ids.length) { toast('오늘 복습할 것이 없어요 👍'); return; }
    this.start({ kind: 'mixed', ids, front: 'jp', review: true });
  },
  start({ kind, ids, front, review }) {
    if (!ids || !ids.length) { toast('볼 카드가 없어요'); return; }
    enterPractice();
    if (kind === 'mixed') kind = ids.every(isWordId) ? 'word' : ids.some(isWordId) ? 'mixed' : 'kana';
    this.kind = kind;
    this.review = !!review;
    this.front = front || state.prefs.cards.front;
    this.ids = ids;
    this.deck = shuffle(ids);
    this.i = 0; this.known = new Set(); this.again = {};
    Practice.show('cards-play');
    this.show();
  },
  faceHtml(id, side) {
    if (!isWordId(id)) {
      const k = KANA_BY_ID[id];
      return side === 'front'
        ? `<span class="fc-tag">${SCRIPT_INFO[k.script].name}</span><span class="fc-kana">${k.kana}</span><span class="fc-hint">탭해서 읽는 법 보기</span>`
        : `<span class="fc-small-jp">${k.kana}</span><span class="fc-ko">${k.ko}</span><span class="fc-rom">${k.romaji}</span>${k.note ? `<span class="fc-note">${k.note}</span>` : ''}`;
    }
    const w = VOCAB_BY_ID[id];
    const long = w.word.length > 4 ? 'long' : '';
    const reading = w.hasKanji ? `<span class="fc-reading">${w.reading}</span>` : '';
    const pron = `<span class="fc-pron">발음: ${toKoPron(w.pron)} · ${toRomaji(w.pron)}</span>`;
    const kr = w.similar ? `<span class="badge-sim">한국어와 비슷해요 · ${w.kr}</span>`
      : w.kr ? `<span class="fc-pron">한자어: ${w.kr}</span>` : '';
    const tag = `<span class="fc-tag">${VOCAB_CATS[w.cat]}</span>`;
    if (this.front === 'ko') {
      return side === 'front'
        ? `${tag}<span class="fc-meaning-big">${w.meaning}</span><span class="fc-hint">탭해서 일본어 보기</span>`
        : `<span class="fc-word ${long}">${w.word}</span>${reading}${pron}${kr}`;
    }
    return side === 'front'
      ? `${tag}<span class="fc-word ${long}">${w.word}</span>${state.settings.furigana ? reading : ''}<span class="fc-hint">탭해서 뜻 보기</span>`
      : `<span class="fc-small-jp">${w.word}</span>${reading}<span class="fc-meaning">${w.meaning}</span>${pron}${kr}`;
  },
  show() {
    const id = this.deck[this.i];
    this.flipped = false;
    const card = $('#flashcard');
    card.classList.remove('flipped');
    card.style.transform = '';
    $('#flash-front').innerHTML = this.faceHtml(id, 'front');
    // 뒤집히는 애니메이션이 끝난 뒤 뒷면을 바꿔야 정답이 미리 안 비쳐요
    setTimeout(() => { if (!this.flipped) $('#flash-back').innerHTML = ''; }, 200);
    $('#flash-again').disabled = true;
    $('#flash-know').disabled = true;
    const star = $('#flash-star');
    star.hidden = !isWordId(id);
    if (isWordId(id)) {
      const on = !!state.stars[id];
      star.setAttribute('aria-pressed', String(on));
      star.textContent = on ? '★ 즐겨찾기' : '☆ 즐겨찾기';
    }
    $('#cards-progress-num').textContent = `${this.i + 1} / ${this.deck.length}`;
    $('#cards-progress').style.width = `${(this.i / this.deck.length) * 100}%`;
    if (this.kind === 'word' && this.front === 'jp' && state.settings.autoSpeak) { /* 앞면에서는 소리를 아껴 둬요 */ }
  },
  flip() {
    this.flipped = !this.flipped;
    const id = this.deck[this.i];
    if (this.flipped) $('#flash-back').innerHTML = this.faceHtml(id, 'back');
    $('#flashcard').classList.toggle('flipped', this.flipped);
    if (this.flipped) {
      if (state.settings.autoSpeak) speakId(id);
      $('#flash-again').disabled = false;
      $('#flash-know').disabled = false;
      $('#swipe-hint').hidden = this.i > 2;
    }
  },
  answer(know) {
    if (!this.flipped) return;
    const id = this.deck[this.i];
    setMastered(id, know);
    if (know) this.known.add(id);
    else {
      this.known.delete(id);
      this.again[id] = (this.again[id] || 0) + 1;
      // 모르는 카드는 3~5장 뒤에 다시 나와요 (한 카드당 최대 2번)
      if (this.again[id] <= 2) {
        const pos = Math.min(this.deck.length, this.i + 3 + Math.floor(Math.random() * 3));
        this.deck.splice(pos, 0, id);
      }
    }
    this.i++;
    if (this.i >= this.deck.length) this.finish();
    else this.show();
  },
  finish() {
    Practice.show('cards-done');
    const stillAgain = Object.keys(this.again).filter(id => !this.known.has(id));
    const word = this.kind === 'word' ? '단어' : this.kind === 'kana' ? '글자' : '것';
    const left = this.review ? dueList().filter(x => !stillAgain.includes(x.id)).length : 0;
    $('#cards-done-msg').textContent = `외운 ${word} ${this.known.size}개` +
      (stillAgain.length ? ` · 아래 ${stillAgain.length}개는 한 번 더 연습해요` : ' · 모두 외웠어요!') +
      (this.review ? (left ? ` · 남은 복습 ${left}개` : ' · 오늘 복습 끝!') : '');
    $('#cards-quiz-after').hidden = this.kind === 'mixed';
    $('#cards-restart').textContent = this.review && left ? '남은 복습 계속하기' : '한 번 더 보기';
    $('#cards-done-again').innerHTML = stillAgain.map(id => tileOf(id)).join('');
  },
};
$('#flashcard').addEventListener('click', () => {
  if (Cards.dragged) { Cards.dragged = false; return; }
  Cards.flip();
});
$('#flash-sound').addEventListener('click', () => speakId(Cards.deck[Cards.i]));
$('#flash-star').addEventListener('click', e => {
  const on = toggleStar(Cards.deck[Cards.i]);
  e.currentTarget.setAttribute('aria-pressed', String(on));
  e.currentTarget.textContent = on ? '★ 즐겨찾기' : '☆ 즐겨찾기';
});
$('#flash-know').addEventListener('click', () => Cards.answer(true));
$('#flash-again').addEventListener('click', () => Cards.answer(false));
$('#cards-quit').addEventListener('click', () => { if (Cards.i > 0) Cards.finish(); else Practice.showSetup(); });
$('#cards-restart').addEventListener('click', () => {
  if (Cards.review && dueList().length) Cards.startReview();
  else Cards.start({ kind: Cards.kind, ids: Cards.ids, front: Cards.front, review: Cards.review });
});
$('#cards-back').addEventListener('click', () => Practice.showSetup('cards'));
$('#cards-quiz-after').addEventListener('click', () => {
  const mode = Cards.kind === 'word' ? state.prefs.quiz.wmode : state.prefs.quiz.mode;
  Quiz.start({ kind: Cards.kind, mode, ids: Cards.ids, total: Math.min(Number(state.prefs.quiz.length), Math.max(5, Cards.ids.length)) });
});

// 카드 밀기(스와이프): 뒤집은 뒤 → 외웠어요, ← 아직 몰라요
(function enableSwipe() {
  const card = $('#flashcard');
  const labels = { left: $('.swipe-label.left'), right: $('.swipe-label.right') };
  let startX = null, dx = 0, pid = null;
  card.addEventListener('pointerdown', e => {
    if (!Cards.flipped || e.pointerType === 'mouse') return;
    startX = e.clientX; dx = 0; pid = e.pointerId;
  });
  card.addEventListener('pointermove', e => {
    if (startX === null || e.pointerId !== pid) return;
    dx = e.clientX - startX;
    if (Math.abs(dx) > 8) {
      card.classList.add('dragging');
      card.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
      labels.right.style.opacity = Math.min(1, Math.max(0, dx / 90));
      labels.left.style.opacity = Math.min(1, Math.max(0, -dx / 90));
    }
  });
  const end = () => {
    if (startX === null) return;
    card.classList.remove('dragging');
    labels.left.style.opacity = labels.right.style.opacity = 0;
    if (Math.abs(dx) > 8) Cards.dragged = true;
    if (Math.abs(dx) > 90) {
      card.style.transform = `translateX(${dx > 0 ? 120 : -120}%) rotate(${dx > 0 ? 12 : -12}deg)`;
      const know = dx > 0;
      setTimeout(() => Cards.answer(know), 180);
    } else {
      card.style.transform = '';
    }
    setTimeout(() => { Cards.dragged = false; }, 50);
    startX = null; dx = 0;
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
})();

/* ---------- 11-2. 연습 — 쓰기 ---------- */
const Write = {
  list: [], i: 0, strokes: [], guideOn: true, mode: 'trace', drawn: false, size: 300, dpr: 1,

  pool() {
    const p = state.prefs.write;
    return kanaPool(p.script, p.groups);
  },
  start() {
    const p = state.prefs.write;
    const list = this.pool();
    if (!list.length) return;
    enterPractice();
    this.list = p.order === 'random' ? shuffle(list) : list;   // KANA 는 원래 あいうえお 순서예요
    this.mode = p.guide;
    this.i = 0;
    Practice.show('write-play');
    this.resize();
    this.show();
  },
  show() {
    const k = this.list[this.i];
    this.strokes = [];
    this.drawn = false;
    this.guideOn = this.mode === 'trace';
    $('#write-ask-main').innerHTML = this.mode === 'trace'
      ? `<span class="kana-font">${k.kana}</span> · ${k.ko} · ${k.romaji}`
      : `${k.ko} · ${k.romaji}`;
    $('#write-ask-sub').textContent = this.mode === 'trace'
      ? '흐린 글자를 따라 써 보세요'
      : `${SCRIPT_INFO[k.script].name}로 써 본 뒤 "정답 보기"로 비교해요`;
    const g = $('#write-guide');
    g.textContent = k.kana;
    g.classList.toggle('two', k.kana.length > 1);
    this.paintGuide();
    this.redraw();
    $('#write-progress-num').textContent = `${this.i + 1} / ${this.list.length}`;
    $('#write-progress').style.width = `${(this.i / this.list.length) * 100}%`;
    $('#write-next').textContent = this.i === this.list.length - 1 ? '끝내기' : '다음 글자';
    if (this.mode === 'trace') speakId(k.id, 120);
  },
  paintGuide() {
    const g = $('#write-guide');
    g.classList.toggle('hidden', !this.guideOn);
    g.classList.toggle('reveal', this.guideOn && this.mode === 'recall');
    $('#write-toggle').textContent = this.mode === 'trace'
      ? (this.guideOn ? '가이드 숨기기' : '가이드 보이기')
      : (this.guideOn ? '정답 숨기기' : '정답 보기');
  },
  toggle() {
    this.guideOn = !this.guideOn;
    this.paintGuide();
    if (this.guideOn && this.mode === 'recall') speakId(this.list[this.i].id);
  },
  next() {
    if (this.drawn) { markStudied(); save(); }
    if (this.i >= this.list.length - 1) {
      toast(`${this.list.length}글자 쓰기를 마쳤어요! 👏`);
      Practice.showSetup('write');
      return;
    }
    this.i++;
    this.show();
  },
  // 쓰는 칸(canvas) 크기를 화면에 맞추고, 선명하게 보이도록 화면 배율만큼 키워요
  resize() {
    const cv = $('#write-canvas');
    const size = $('#write-pad').clientWidth || 300;
    this.size = size;
    this.dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size * this.dpr);
    cv.height = Math.round(size * this.dpr);
    $('#write-pad').style.setProperty('--pad', `${size}px`);
    this.redraw();
  },
  redraw() {
    const cv = $('#write-canvas');
    const ctx = cv.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1F1B16';
    const base = Math.max(6, this.size * 0.035);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of this.strokes) {
      const pts = st.pts;
      if (!st.pen) {
        ctx.lineWidth = base;
        ctx.beginPath();
        pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.1, pts[0][1]);   // 점 하나도 보이게
        ctx.stroke();
        continue;
      }
      // S펜: 누르는 힘(필압)에 따라 굵기가 달라져요 — 붓글씨처럼
      for (let j = 0; j < pts.length; j++) {
        const a = pts[Math.max(0, j - 1)], b = pts[j];
        ctx.lineWidth = base * (0.45 + ((a[2] + b[2]) / 2) * 1.1);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0] + (j ? 0 : 0.1), b[1]);
        ctx.stroke();
      }
    }
  },
};
// 손가락 · 마우스 · S펜으로 쓰기
(function enableDrawing() {
  const cv = $('#write-canvas');
  let cur = null, curId = null, lastPen = 0;
  const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, e.pressure || 0.5]; };
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    const pen = e.pointerType === 'pen';
    // 손바닥 무시: S펜으로 쓰는 중이거나 방금(1.5초 안) 썼다면 손가락·손바닥 터치는 무시해요
    if (!pen && (Date.now() - lastPen < 1500 || (cur && cur.pen))) return;
    if (pen) {
      lastPen = Date.now();
      // 펜보다 먼저 닿은 손바닥 자국(0.5초 안에 생긴 획)은 지워요
      Write.strokes = Write.strokes.filter(st => st.pen || Date.now() - st.t > 500);
    }
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 일부 기기에서는 지원하지 않아도 괜찮아요 */ }
    cur = { pts: [pt(e)], pen, t: Date.now() };
    curId = e.pointerId;
    Write.strokes.push(cur);
    Write.drawn = true;
    Write.redraw();
  });
  cv.addEventListener('pointermove', e => {
    if (!cur || e.pointerId !== curId) return;
    if (cur.pen) lastPen = Date.now();
    // 빠르게 써도 선이 끊기지 않도록 중간 점들까지 모두 받아요
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ce of (evs.length ? evs : [e])) cur.pts.push(pt(ce));
    Write.redraw();
  });
  const end = e => {
    if (e.pointerId !== curId) return;
    if (cur && cur.pen) lastPen = Date.now();
    cur = null; curId = null;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
})();
$('#write-start').addEventListener('click', () => Write.start());
$('#write-undo').addEventListener('click', () => { Write.strokes.pop(); Write.redraw(); });
$('#write-clear').addEventListener('click', () => { Write.strokes = []; Write.redraw(); });
$('#write-sound').addEventListener('click', () => speakId(Write.list[Write.i].id));
$('#write-toggle').addEventListener('click', () => Write.toggle());
$('#write-next').addEventListener('click', () => Write.next());
$('#write-quit').addEventListener('click', () => Practice.showSetup('write'));
$('#table-write').addEventListener('click', () => {
  state.prefs.write.script = state.prefs.table;
  save(); paintWrite();
  Write.start();
});
window.addEventListener('resize', () => { if (Practice.phase === 'write-play') Write.resize(); });

/* ---------- 11-3. 발음 규칙 미니 강의 ---------- */
renderers.lessons = function renderLessons() {
  $('#lessons-nav').innerHTML = LESSONS.map((l, i) => `<button data-jump-lesson="${l.key}">${i + 1}. ${l.tag}</button>`).join('');
  $('#lessons-body').innerHTML = LESSONS.map((l, i) => `
    <section class="card lesson" id="ls-${l.key}">
      <p class="eyebrow">${i + 1}강 · ${l.tag}</p>
      <h2 class="h2">${l.title}</h2>
      <p class="lesson-body">${l.body}</p>
      <div class="lesson-examples">${l.examples.map(ex => `
        ${ex.vs ? '<span class="lesson-vs" aria-hidden="true">vs</span>' : ''}
        <button class="lesson-ex ${ex.vs ? 'pair-b' : ''}" data-say="${ex.jp}" aria-label="${ex.jp}, ${ex.pron}, ${ex.mean}. 소리 듣기">
          <span class="ex-jp kana-font">${ex.jp}</span>
          <span class="ex-pron">${ex.pron}</span>
          <span class="ex-mean">${ex.mean}</span>
          <svg class="ex-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/></svg>
        </button>`).join('')}</div>
    </section>`).join('');
};
$('#lessons-nav').addEventListener('click', e => {
  const b = e.target.closest('[data-jump-lesson]');
  if (b) document.getElementById(`ls-${b.dataset.jumpLesson}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------- 12. 연습 — 퀴즈 ---------- */
const LISTEN_ICON = '<svg viewBox="0 0 24 24" width="54" height="54" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const Quiz = {
  kind: 'kana', mode: 'read', pool: [], total: 10, results: [],
  current: null, lastId: null, answered: false, timer: null, lastConfig: null, options: [],

  poolFromPrefs() {
    const p = state.prefs.quiz;
    return p.kind === 'kana' ? kanaPool(p.script, p.groups) : applyFilter(wordPool(p.cats), p.filter);
  },
  startFromPrefs() {
    const p = state.prefs.quiz;
    const ids = this.poolFromPrefs().map(x => x.id);
    if (!ids.length) { Practice.showSetup('quiz'); enterPractice(); toast('고른 범위에 문제가 없어요. 설정을 바꿔 주세요'); return; }
    this.start({ kind: p.kind, mode: p.kind === 'kana' ? p.mode : p.wmode, ids, total: Number(p.length) });
  },
  startWeak(kind) {
    const ids = weakList(kind).map(x => x.id);
    if (!ids.length) { toast('복습할 것이 없어요 👍'); return; }
    const mode = kind === 'word' ? state.prefs.quiz.wmode : (state.prefs.quiz.mode === 'input' ? 'read' : state.prefs.quiz.mode);
    this.start({ kind, mode, ids, total: Math.min(10, Math.max(5, ids.length * 2)) });
  },
  start(cfg) {
    if (!cfg.ids || !cfg.ids.length) { toast('풀 문제가 없어요'); return; }
    enterPractice();
    this.lastConfig = cfg;
    this.kind = cfg.kind;
    this.mode = cfg.mode;
    this.pool = cfg.ids;
    this.total = cfg.total;
    this.results = [];
    this.lastId = null;
    Practice.show('quiz-play');
    const isInput = this.kind === 'kana' && this.mode === 'input';
    $('#quiz-options').hidden = isInput;
    $('#quiz-input-form').hidden = !isInput;
    $('#quiz-kbd').textContent = isInput ? 'Enter: 확인 / 다음 문제' : '숫자 1~4: 보기 고르기 · Enter: 다음 문제';
    this.next();
  },
  stopTimer() { clearTimeout(this.timer); },
  next() {
    this.stopTimer();
    if (this.results.length >= this.total) { this.showResult(); return; }
    const id = pickWeighted(this.pool, this.lastId);
    this.current = itemOf(id);
    this.lastId = id;
    this.answered = false;
    $('#quiz-progress-num').textContent = `${this.results.length + 1} / ${this.total}`;
    $('#quiz-progress').style.width = `${(this.results.length / this.total) * 100}%`;
    $('#quiz-feedback').hidden = true;
    this.renderQuestion();
  },
  // 문제 모양 정하기: 질문 문구, 큰 글씨 부분, 보기
  renderQuestion() {
    const it = this.current;
    const sound = $('#quiz-sound');
    let ask, prompt, showSound = true, soundLabel = '소리 힌트', autoPlay = false;
    if (this.kind === 'kana') {
      if (this.mode === 'pick') {
        ask = '이 소리에 맞는 글자는 무엇일까요?';
        prompt = `<div class="qp-reading">${it.ko}<span>${it.romaji}</span></div>`;
        showSound = false;
      } else if (this.mode === 'listen') {
        ask = '소리를 듣고 맞는 글자를 고르세요';
        prompt = `<button class="qp-listen" id="qp-listen" aria-label="소리 다시 듣기">${LISTEN_ICON}</button>`;
        showSound = false; autoPlay = true;
      } else {
        ask = `${SCRIPT_INFO[it.script].name} · 이 글자는 어떻게 읽을까요?`;
        prompt = `<div class="qp-kana">${it.kana}</div>`;
      }
    } else {
      const long = it.word.length > 4 ? 'long' : '';
      if (this.mode === 'word') {
        ask = '이 뜻의 일본어는 무엇일까요?';
        prompt = `<div class="qp-meaning">${it.meaning}</div>`;
        showSound = false;
      } else if (this.mode === 'listen') {
        ask = '소리를 듣고 뜻을 고르세요';
        prompt = `<button class="qp-listen" id="qp-listen" aria-label="소리 다시 듣기">${LISTEN_ICON}</button>`;
        showSound = false; autoPlay = true;
      } else {
        ask = '이 단어의 뜻은 무엇일까요?';
        prompt = `<div class="qp-word ${long}">${it.word}</div>${it.hasKanji && state.settings.furigana ? `<div class="qp-sub">${it.reading}</div>` : ''}`;
        soundLabel = '소리 듣기';
      }
    }
    $('#quiz-ask').textContent = ask;
    $('#quiz-prompt').innerHTML = prompt;
    sound.hidden = !showSound;
    $('#quiz-sound-label').textContent = soundLabel;
    const lb = $('#qp-listen');
    if (lb) lb.addEventListener('click', () => speakId(it.id));
    if (autoPlay) speakId(it.id, 150);

    if (this.kind === 'kana' && this.mode === 'input') {
      const form = $('#quiz-input-form');
      form.classList.remove('correct', 'wrong');
      const input = $('#quiz-input');
      input.value = '';
      input.readOnly = false;
      input.focus({ preventScroll: true });
      return;
    }
    this.options = shuffle([it, ...this.distractors(it)]);
    const box = $('#quiz-options');
    box.classList.remove('locked');
    box.innerHTML = this.options.map((o, i) => `<button class="option" data-id="${o.id}"><span class="o-key">${i + 1}</span>${this.optionHtml(o)}</button>`).join('');
  },
  optionHtml(o) {
    if (this.kind === 'kana') {
      return this.mode === 'read'
        ? `<span class="o-ko">${o.ko}</span><span class="o-rom">${o.romaji}</span>`
        : `<span class="o-kana">${o.kana}</span>`;
    }
    return this.mode === 'word'
      ? `<span class="o-word">${o.word}</span>${o.hasKanji ? `<span class="o-sub">${o.reading}</span>` : ''}`
      : `<span class="o-meaning">${o.meaning}</span>`;
  },
  // 오답 보기 3개: 헷갈리는 글자 → 같은 종류 → 나머지 순서로 골라요
  distractors(ans) {
    const picks = [];
    if (this.kind === 'kana') {
      const confuse = CONFUSABLES[ans.script].filter(c => c.set.includes(ans.id)).flatMap(c => c.set);
      const others = KANA.filter(k => k.script === ans.script && k.id !== ans.id);
      const order = [
        ...shuffle(others.filter(k => confuse.includes(k.id))),
        ...shuffle(others.filter(k => k.group === ans.group)),
        ...shuffle(others),
      ];
      const used = new Set([ans.ko]);
      for (const k of order) {
        if (picks.length === 3) break;
        if (used.has(k.ko)) continue;
        used.add(k.ko); picks.push(k);
      }
    } else {
      const others = VOCAB.filter(w => w.id !== ans.id && w.reading !== ans.reading);
      const order = [...shuffle(others.filter(w => w.cat === ans.cat)), ...shuffle(others)];
      const used = new Set([ans.meaning]);
      for (const w of order) {
        if (picks.length === 3) break;
        if (used.has(w.meaning)) continue;
        used.add(w.meaning); picks.push(w);
      }
    }
    return picks;
  },
  choose(btn) {
    if (this.answered) return;
    const ok = btn.dataset.id === this.current.id;
    const box = $('#quiz-options');
    box.classList.add('locked');
    $$('.option', box).forEach(b => { if (b.dataset.id === this.current.id) b.classList.add('correct'); });
    if (!ok) btn.classList.add('wrong');
    this.finishQuestion(ok, btn.textContent.trim());
  },
  submitInput() {
    if (this.answered) { this.next(); return; }
    const input = $('#quiz-input');
    const raw = input.value.normalize('NFC').trim();
    if (!raw) {
      const form = $('#quiz-input-form');
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      toast('읽는 법을 한글이나 로마자로 써 주세요');
      return;
    }
    const v = raw.toLowerCase().replace(/\s+/g, '');
    const ok = this.current.romajiAnswers.includes(v) || this.current.koAnswers.includes(v);
    input.readOnly = true;
    $('#quiz-input-form').classList.add(ok ? 'correct' : 'wrong');
    this.finishQuestion(ok, raw);
  },
  finishQuestion(ok, given) {
    this.answered = true;
    const it = this.current;
    this.results.push({ id: it.id, ok, given });
    const reached = recordAnswer(it.id, ok);
    Sfx.play(ok);
    if (!ok) buzz();
    speakId(it.id, state.settings.sfx ? 280 : 0);

    // 듣기 문제는 답을 낸 뒤에 정체를 보여줘요
    if (this.mode === 'listen') {
      $('#quiz-prompt').insertAdjacentHTML('beforeend',
        `<p class="qp-revealed"><span class="kana-font">${it.kana || it.word}</span>${it.kana ? ` = ${it.ko} · ${it.romaji}` : it.hasKanji ? ` (${it.reading})` : ''}</p>`);
    }

    const fb = $('#quiz-feedback');
    fb.hidden = false;
    fb.className = `feedback ${ok ? 'good' : 'bad'}`;
    const cheers = ['정답이에요!', '잘했어요!', '완벽해요!', '좋아요!'];
    $('#quiz-feedback-title').textContent = ok ? cheers[Math.floor(Math.random() * cheers.length)] : '아쉬워요';
    let body;
    if (this.kind === 'kana') {
      body = `${ok ? '' : '정답은 '}<span class="kana-font">${it.kana}</span> = <strong>${it.ko} · ${it.romaji}</strong>`
        + (!ok && this.mode === 'input' ? `<br>내가 쓴 답: ${escapeHtml(given)}` : '')
        + (!ok && it.note ? `<br><span class="small">${it.note}</span>` : '');
    } else {
      body = `${ok ? '' : '정답은 '}<span class="kana-font">${it.word}</span>${it.hasKanji ? ` (${it.reading})` : ''} = <strong>${it.meaning}</strong>`
        + (it.similar ? `<br><span class="badge-sim">한국어와 비슷해요 · ${it.kr}</span>` : '');
    }
    $('#quiz-feedback-body').innerHTML = body;
    $('#quiz-next').textContent = this.results.length >= this.total ? '결과 보기' : '다음 문제';

    if (reached) celebrate();
    // 맞히면 잠깐 뒤 자동으로 다음 문제 (틀리면 직접 눌러서 넘어가요)
    if (ok) this.timer = setTimeout(() => this.next(), reached ? 1900 : 1200);
  },
  showResult() {
    this.stopTimer();
    Practice.show('quiz-result');
    const total = this.results.length;
    const good = this.results.filter(r => r.ok).length;
    const rate = total ? good / total : 0;
    $('#result-score').textContent = good;
    $('#result-total').textContent = total;
    // 결과 도장: 満(만점) 優(우수) 良(좋음) 進(성장 중)
    $('#result-seal').textContent = rate === 1 ? '満' : rate >= 0.8 ? '優' : rate >= 0.5 ? '良' : '進';
    $('#result-msg').textContent =
      total === 0 ? '푼 문제가 없어요.'
      : rate === 1 ? '하나도 안 틀렸어요! 정말 대단해요.'
      : rate >= 0.8 ? '거의 다 맞혔어요. 이 정도면 금방 외워요!'
      : rate >= 0.5 ? '잘하고 있어요. 틀린 것만 한 번 더 볼까요?'
      : '처음엔 누구나 어려워요. 카드로 한 번 보고 다시 도전해요.';

    const wrongCount = {};
    for (const r of this.results) if (!r.ok) wrongCount[r.id] = (wrongCount[r.id] || 0) + 1;
    const wrongIds = Object.keys(wrongCount);
    this.wrongIds = wrongIds;
    $('#result-wrong-title').textContent = this.kind === 'word' ? '틀린 단어' : '틀린 글자';
    $('#result-wrong-help').hidden = !wrongIds.length;
    $('#result-wrong').innerHTML = wrongIds.length
      ? wrongIds.map(id => tileOf(id, wrongCount[id] > 1 ? `<span class="cnt">${wrongCount[id]}번 틀림</span>` : '')).join('')
      : '<p class="empty-msg" style="grid-column:1/-1">틀린 것이 없어요 🎉</p>';
    $('#result-retry-wrong').hidden = wrongIds.length === 0;
  },
};
$('#quiz-start').addEventListener('click', () => Quiz.startFromPrefs());
$('#quiz-options').addEventListener('click', e => {
  const b = e.target.closest('.option');
  if (b) Quiz.choose(b);
});
$('#quiz-input-form').addEventListener('submit', e => { e.preventDefault(); Quiz.submitInput(); });
$('#quiz-next').addEventListener('click', () => Quiz.next());
$('#quiz-sound').addEventListener('click', () => speakId(Quiz.current.id));
$('#quiz-quit').addEventListener('click', () => { if (Quiz.results.length) Quiz.showResult(); else Practice.showSetup(); });
$('#result-retry-wrong').addEventListener('click', () => {
  const ids = Quiz.wrongIds;
  Quiz.start({ ...Quiz.lastConfig, ids, total: Math.min(10, Math.max(5, ids.length * 2)) });
});
$('#result-again').addEventListener('click', () => Quiz.start(Quiz.lastConfig));
$('#result-setup').addEventListener('click', () => Practice.showSetup('quiz'));
$('#cards-start').addEventListener('click', () => {
  const p = state.prefs.cards;
  Cards.start({ kind: p.kind, ids: Cards.pool().map(x => x.id), front: p.front });
});

// PC 키보드 단축키
document.addEventListener('keydown', e => {
  if (currentView !== 'practice' || e.altKey || e.ctrlKey || e.metaKey) return;
  if ($('#confirm-dialog').open) return;
  const inInput = e.target.matches('input, textarea, select');
  if (Practice.phase === 'cards-play') {
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.target.closest('#flash-actions, .card-tools, #flashcard')) return;   // 버튼 자체의 동작에 맡겨요
      e.preventDefault(); Cards.flip();
    }
    else if (e.key === 'ArrowRight') Cards.answer(true);
    else if (e.key === 'ArrowLeft') Cards.answer(false);
  } else if (Practice.phase === 'quiz-play' && !inInput) {
    if (/^[1-4]$/.test(e.key) && !Quiz.answered) {
      const b = $$('#quiz-options .option')[Number(e.key) - 1];
      if (b) Quiz.choose(b);
    } else if (e.key === 'Enter' && Quiz.answered && !e.target.closest('button:not(.option)')) {
      e.preventDefault(); Quiz.next();
    }
  }
});

/* ---------- 13. 기록 · 설정 ---------- */
let calOffset = 0;   // 0 = 이번 달, -1 = 지난달
renderers.stats = function renderStats() {
  $('#st-streak').textContent = currentStreak();
  $('#st-best').textContent = `최고 ${state.streak.best}일`;
  $('#st-total').textContent = state.totals.n;
  $('#st-days').textContent = `공부한 날 ${Object.values(state.days).filter(d => d.s || d.n).length}일`;
  $('#st-acc').textContent = state.totals.n ? Math.round((state.totals.ok / state.totals.n) * 100) : '–';
  $('#st-vocab-n').textContent = VOCAB.length;
  renderCalendar();

  // 복습 일정
  $('#st-srs').innerHTML = [['오늘 복습', dueList().length], ['내일까지', dueCountWithin(1)], ['7일 안', dueCountWithin(7)]]
    .map(([label, n]) => `<div class="srs-cell"><strong>${n}</strong><span>${label}</span></div>`).join('');

  // 최근 7일 막대그래프
  const goal = state.settings.goal;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = daysAgo(i);
    const rec = state.days[dateKey(d)] || { n: 0, ok: 0 };
    days.push({ d, n: rec.n, ok: rec.ok, isToday: i === 0 });
  }
  const max = Math.max(goal, ...days.map(x => x.n)) * 1.1;
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const plotH = 98;   // 막대가 그려지는 높이(px)
  $('#st-week').innerHTML =
    `<div class="week-goal-line" style="bottom:${(goal / max) * plotH + 26}px" aria-hidden="true"></div>` +
    days.map(x => {
      const label = `${x.d.getMonth() + 1}월 ${x.d.getDate()}일: ${x.n}문제` + (x.n ? ` (정답 ${x.ok})` : '');
      return `<div class="week-col ${x.isToday ? 'today' : ''}" role="listitem" title="${label}" aria-label="${label}">
        <span class="week-val">${x.n || ''}</span>
        <div class="week-bar-wrap"><div class="week-bar ${x.n ? '' : 'zero'}" style="height:${x.n ? Math.max(4, (x.n / max) * plotH) : 3}px"></div></div>
        <span class="week-day">${x.isToday ? '오늘' : DOW[x.d.getDay()]}</span>
      </div>`;
    }).join('');
  $('#st-goal-legend').textContent = `점선 = 하루 목표 ${goal}문제`;

  // 외운 것
  const meters = [
    ['히라가나', KANA.filter(k => k.script === 'h')],
    ['가타카나', KANA.filter(k => k.script === 'k')],
    ['N5 단어', VOCAB],
  ];
  $('#st-mastery').innerHTML = meters.map(([name, all]) => {
    const m = all.filter(x => isMastered(x.id)).length;
    return `<div><div class="meter-top"><span>${name}</span><strong>${m} / ${all.length}</strong></div>
      <div class="meter" role="progressbar" aria-label="${name} 외운 것" aria-valuemin="0" aria-valuemax="${all.length}" aria-valuenow="${m}">
      <div style="width:${(m / all.length) * 100}%"></div></div></div>`;
  }).join('');

  // 자주 틀리는 것
  const weak = weakList();
  $('#st-weak').innerHTML = weak.length
    ? weak.slice(0, 40).map(x => tileOf(x.id, `<span class="cnt">${state.chars[x.id].w}번 틀림</span>`)).join('')
    : '<p class="empty-msg" style="grid-column:1/-1">아직 없어요. 퀴즈를 풀면 여기에 모여요.</p>';
  $('#st-weak-msg').hidden = weak.length === 0;
  $('#st-weak-kana').hidden = !weakList('kana').length;
  $('#st-weak-words').hidden = !weakList('word').length;

  paintSettings();
  renderPackStatus();
};

function renderCalendar() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + calOffset, 1);
  const y = first.getFullYear(), m = first.getMonth();
  $('#cal-title').textContent = `${y}년 ${m + 1}월`;
  $('#cal-next').disabled = calOffset >= 0;
  const daysIn = new Date(y, m + 1, 0).getDate();
  const todayKey = dateKey();
  let html = ['일', '월', '화', '수', '목', '금', '토'].map(d => `<span class="cal-dow" aria-hidden="true">${d}</span>`).join('');
  for (let i = 0; i < first.getDay(); i++) html += '<span></span>';
  for (let d = 1; d <= daysIn; d++) {
    const key = dateKey(new Date(y, m, d));
    const rec = state.days[key];
    const studied = rec && (rec.s || rec.n);
    const goalMet = rec && rec.n >= (rec.g || state.settings.goal);
    const cls = [goalMet ? 'goal' : studied ? 'studied' : '', key === todayKey ? 'today' : '', key > todayKey ? 'future' : ''].join(' ');
    const label = `${m + 1}월 ${d}일${goalMet ? ', 목표 달성' : studied ? `, 공부함${rec.n ? ` ${rec.n}문제` : ''}` : ''}`;
    html += `<span class="cal-day ${cls}" role="gridcell" aria-label="${label}" title="${label}">${d}</span>`;
  }
  $('#calendar').innerHTML = html;
}
$('#cal-prev').addEventListener('click', () => { calOffset--; renderCalendar(); });
$('#cal-next').addEventListener('click', () => { if (calOffset < 0) { calOffset++; renderCalendar(); } });
$('#st-weak-kana').addEventListener('click', () => Quiz.startWeak('kana'));
$('#st-weak-words').addEventListener('click', () => Quiz.startWeak('word'));

function paintSettings() {
  const s = state.settings;
  const presets = $$('#set-goal button');
  presets.forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.value) === s.goal)));
  $('#set-goal-custom').value = presets.some(b => Number(b.dataset.value) === s.goal) ? '' : s.goal;
  $$('#set-rate button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.value) === s.rate)));
  $$('#set-gender button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === s.voiceGender)));
  $$('#set-pitch button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.value) === s.pitch)));
  $$('#set-theme button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === s.theme)));
  $$('.switch[data-setting]').forEach(b => b.setAttribute('aria-checked', String(!!s[b.dataset.setting])));
  $('#pack-box').hidden = !PACK;
  if (ANDROID) {   // 앱에서는 목소리를 휴대폰 설정에서 고르고, 소리 파일은 이미 앱 안에 있어요
    for (const id of ['#set-gender', '#set-voice-select']) {
      $(id).hidden = true;
      $(id).previousElementSibling.hidden = true;
    }
  }
  $('#pack-tts-note').hidden = !PACK || !s.voicePack;
}
function setGoal(n) {
  n = Math.round(Number(n));
  if (!n || n < 1) return;
  state.settings.goal = Math.min(500, n);
  save(); renderers.stats();
  toast(`오늘의 목표를 ${state.settings.goal}문제로 정했어요`);
}
$('#set-goal').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setGoal(b.dataset.value); });
$('#set-goal-custom').addEventListener('change', e => setGoal(e.target.value));
$('#set-rate').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  state.settings.rate = Number(b.dataset.value);
  save(); paintSettings();
  Speech.speak('あいうえお');
});
$('#set-gender').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  state.settings.voiceGender = b.dataset.value;
  state.settings.voice = '';                      // 종류를 바꾸면 목록 선택은 "자동"으로
  save(); Speech.choose(); renderVoiceStatus(); paintSettings();
  Speech.speak('こんにちは');
  if (b.dataset.value !== 'auto' && !Speech.genderMatched) {
    toast(`이 기기에서는 ${GENDER_LABEL[b.dataset.value]} 일본어 목소리를 찾지 못했어요. 아래 "여자 목소리로 바꾸는 법"을 봐 주세요`);
  }
});
$('#set-pitch').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  state.settings.pitch = Number(b.dataset.value);
  save(); paintSettings();
  Speech.speak('こんにちは');
});
$$('.switch[data-setting]').forEach(b => b.addEventListener('click', () => {
  const key = b.dataset.setting;
  state.settings[key] = !state.settings[key];
  save(); paintSettings();
  if (key === 'sfx' && state.settings.sfx) Sfx.play(true);
  if (key === 'petals') renderPetals();
  if (key === 'voicePack') { renderVoiceStatus(); Speech.speak('こんにちは'); }
  if (key === 'vibrate' && state.settings.vibrate) buzz();
}));

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  $$('meta[name="theme-color"]').forEach(m => {
    const darkMeta = m.media.includes('dark');
    m.content = t === 'auto' ? (darkMeta ? '#1C1218' : '#FDE8EF') : (t === 'dark' ? '#1C1218' : '#FDE8EF');
  });
}
$('#set-theme').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  state.settings.theme = b.dataset.value;
  save(); applyTheme(); paintSettings();
  if (Practice.phase === 'write-play') Write.redraw();
});

function renderVoiceStatus() {
  const el = $('#set-voice');
  const sel = $('#set-voice-select');
  sel.innerHTML = '<option value="">자동으로 고르기</option>' +
    Speech.voices.map(v => {
      const g = voiceGender(v);
      return `<option value="${escapeHtml(v.voiceURI)}">${escapeHtml(v.name)}${g ? ` (${GENDER_LABEL[g]})` : ''}</option>`;
    }).join('');
  sel.value = Speech.voices.some(v => v.voiceURI === state.settings.voice) ? state.settings.voice : '';
  sel.disabled = Speech.voices.length < 2;
  if (PACK && state.settings.voicePack) el.textContent = `지금 목소리: ${PACK.credit} (캐릭터 목소리)`;
  else if (ANDROID) el.textContent = '지금 목소리: 휴대폰 음성 (설정 › 일반 › 텍스트 음성 변환에서 바꿀 수 있어요)';
  else if (!Speech.supported) el.textContent = '이 브라우저는 소리 기능이 없어요. 크롬이나 사파리를 써 보세요.';
  else if (Speech.voice) {
    const g = voiceGender(Speech.voice);
    el.textContent = `지금 목소리: ${Speech.voice.name}${g ? ` (${GENDER_LABEL[g]})` : ''}` +
      (Speech.voices.length < 2 ? ' · 이 기기에서는 휴대폰 설정의 목소리를 그대로 써요' : '');
  }
  else if (Speech.loaded) el.textContent = '일본어 음성을 찾지 못했어요. 그래도 소리가 날 수 있으니 테스트해 보세요.';
  else el.textContent = '음성 확인 중…';
}
$('#set-voice-select').addEventListener('change', e => {
  state.settings.voice = e.target.value;
  save(); Speech.choose(); renderVoiceStatus();
  Speech.speak('こんにちは');
});
$('#set-voice-test').addEventListener('click', () => Speech.speak('こんにちは'));

// 캐릭터 목소리 파일을 한 번에 받아 두기 (인터넷 없이 듣기)
const AUDIO_CACHE = 'harukana-audio';
async function packCachedCount(files) {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(AUDIO_CACHE);
  const keys = new Set((await cache.keys()).map(r => new URL(r.url).pathname.split('/audio/')[1]));
  return files.filter(f => keys.has(f)).length;
}
function packFiles() { return PACK ? [...new Set([...Object.values(PACK.ids), ...Object.values(PACK.texts)])] : []; }
async function renderPackStatus() {
  if (!PACK) return;
  const btn = $('#pack-download');
  if (ANDROID || !('caches' in window)) { btn.hidden = true; return; }   // 앱에는 소리 파일이 이미 들어 있어요
  const files = packFiles();
  const n = await packCachedCount(files);
  btn.textContent = n >= files.length ? '인터넷 없이 들을 준비 완료 ✓'
    : `인터넷 없이 듣도록 미리 받기 (${(PACK.bytes / 1e6).toFixed(1)}MB${n ? `, ${Math.round(n / files.length * 100)}% 받음` : ''})`;
}
if (PACK) {
  $('#pack-credit').textContent = ` · 음성: ${PACK.credit}`;
  $('#pack-desc').textContent = `${PACK.credit} 목소리로 미리 만든 발음을 들려줘요`;
  $('#pack-download').addEventListener('click', async e => {
    const btn = e.currentTarget;
    const files = packFiles();
    const cache = await caches.open(AUDIO_CACHE);
    btn.disabled = true;
    let done = 0, failed = 0;
    for (let i = 0; i < files.length; i += 12) {
      await Promise.all(files.slice(i, i + 12).map(async f => {
        const url = `audio/${f}`;
        try {
          if (!(await cache.match(url))) {
            const r = await fetch(url);
            if (r.ok) await cache.put(url, r); else failed++;
          }
        } catch (err) { failed++; }
        done++;
      }));
      btn.textContent = `받는 중… ${Math.round(done / files.length * 100)}%`;
    }
    btn.disabled = false;
    await renderPackStatus();
    toast(failed ? `일부(${failed}개)를 받지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요` : '소리를 모두 받았어요. 이제 인터넷 없이도 들을 수 있어요');
  });
}

// 백업: 기록을 파일로 저장하고 불러오기
$('#backup-export').addEventListener('click', () => {
  const data = { app: 'harukana', version: 2, exportedAt: new Date().toISOString(), state };
  if (ANDROID) {
    ANDROID.shareFile(`harukana-backup-${dateKey()}.json`, JSON.stringify(data, null, 1));
    toast('저장할 곳(내 파일, 드라이브 등)을 골라 주세요');
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `harukana-backup-${dateKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('기록 파일을 저장했어요. 다운로드 폴더를 확인해 보세요');
});
$('#backup-import').addEventListener('click', () => $('#backup-file').click());
$('#backup-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'harukana' || !data.state || typeof data.state.chars !== 'object') throw new Error('형식이 달라요');
    const ok = await confirmBox('기록을 불러올까요?', '지금 이 기기에 있는 기록은 파일의 기록으로 바뀌어요.', '불러오기');
    if (!ok) return;
    state = normalize(data.state);
    save();
    location.reload();
  } catch (err) {
    toast('하루가나 기록 파일이 아니에요. 다시 확인해 주세요');
  }
});

$('#set-reset').addEventListener('click', async () => {
  const ok = await confirmBox('정말 지울까요?', '지운 기록은 되살릴 수 없어요. 먼저 "파일로 저장"을 해 두면 안전해요.', '지우기');
  if (!ok) return;
  const fresh = defaultState();
  Object.assign(state, { chars: fresh.chars, stars: fresh.stars, streak: fresh.streak, days: fresh.days, totals: fresh.totals });
  save();
  renderers.stats();
  toast('기록을 모두 지웠어요');
});

/* ---------- 14. 유튜브 강의 ---------- */
function openVideos(sectionKey) {
  go('videos');
  if (sectionKey) requestAnimationFrame(() => {
    const el = document.getElementById(`vs-${sectionKey}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
renderers.videos = function renderVideos() {
  $('#videos-nav').innerHTML = VIDEO_SECTIONS.map(s => `<button data-jump="${s.key}">${s.step} ${s.name.split(' ')[0]}</button>`).join('');
  $('#videos-body').innerHTML = VIDEO_SECTIONS.map(s => `
    <section class="video-section" id="vs-${s.key}">
      <div class="video-section-head"><span class="video-step">${s.step}</span><h2 class="h2">${s.name}</h2></div>
      <p class="muted small">${s.desc}</p>
      <div class="video-list">${s.videos.map(v => {
        const url = v.list ? `https://www.youtube.com/playlist?list=${v.list}` : `https://www.youtube.com/watch?v=${v.id}`;
        const thumb = v.id ? `<img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">` : '<span class="list-tag">재생목록</span>';
        return `<a class="video-card" href="${url}" target="_blank" rel="noopener noreferrer">
          <span class="video-thumb">${thumb}<span class="play" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5v14l11-7L8 5Z" fill="currentColor"/></svg></span></span>
          <span class="video-info"><strong>${escapeHtml(v.title)}</strong><span>${escapeHtml(v.channel)} · 유튜브에서 열기 ↗</span></span>
        </a>`;
      }).join('')}</div>
    </section>`).join('');
};
$('#videos-nav').addEventListener('click', e => {
  const b = e.target.closest('[data-jump]');
  if (b) document.getElementById(`vs-${b.dataset.jump}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$$('.sub-back').forEach(b => b.addEventListener('click', () => go(lastMainView)));

/* ---------- 15. 설치 · 업데이트 · 시작하기 ---------- */
let installPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isSamsungBrowser = () => /SamsungBrowser/i.test(navigator.userAgent);

function renderInstall() {
  const manual = !installPrompt && (isIOS() || isSamsungBrowser());   // 버튼 대신 방법을 안내해요
  const show = !ANDROID && !isStandalone() && !state.prefs.installClosed && (installPrompt || manual);
  $('#install-card').hidden = !show;
  if (!show) return;
  $('#install-btn').hidden = manual;
  $('#install-desc').textContent = !manual ? '앱처럼 바로 열고, 인터넷 없이도 공부할 수 있어요.'
    : isSamsungBrowser() ? '아래쪽 메뉴(≡) › "현재 페이지 추가" › "홈 화면"을 눌러 주세요.'
    : '사파리 아래쪽 공유 버튼(□↑) › "홈 화면에 추가"를 눌러 주세요.';
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  renderInstall();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  renderInstall();
  toast('설치됐어요! 홈 화면에서 하루가나를 열어 보세요');
});
$('#install-btn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  renderInstall();
});
$('#install-close').addEventListener('click', () => {
  state.prefs.installClosed = true;
  save();
  renderInstall();
  toast('나중에 설치하고 싶으면 브라우저 메뉴의 "홈 화면에 추가"를 써 주세요');
});

// 배경에 흩날리는 벚꽃잎 (설정에서 끌 수 있어요)
function renderPetals() {
  const layer = $('#sakura');
  if (!state.settings.petals) { layer.innerHTML = ''; return; }
  const count = window.innerWidth < 600 ? 9 : 14;
  let html = '';
  for (let i = 0; i < count; i++) {
    const r = (a, b) => a + Math.random() * (b - a);
    html += `<span class="petal" style="--x:${r(0, 100).toFixed(1)}%;--s:${r(9, 17).toFixed(1)}px;--d:${r(11, 20).toFixed(1)}s;--delay:${(-r(0, 20)).toFixed(1)}s;--drift:${r(-90, 90).toFixed(0)}px;--o:${r(.45, .8).toFixed(2)}"></span>`;
  }
  layer.innerHTML = html;
}

// 시작!
applyTheme();
renderPetals();
Speech.init();
Practice.showSetup();
showView(location.hash.slice(1) || 'home');

// 날짜가 바뀐 뒤 앱으로 돌아오면 숫자를 새로 계산해요
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (currentView === 'home' || currentView === 'stats')) renderers[currentView]();
});

// 서비스 워커: 인터넷 없이도 열리고, 새 버전이 나오면 알려줘요
if (!ANDROID && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'activated' && hadController) {
            toast('새 버전이 준비됐어요', { label: '새로고침', fn: () => location.reload() });
          }
        });
      });
    }).catch(err => console.warn('서비스 워커 등록 실패:', err));
  });
}
