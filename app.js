// Mi Audioship: convierte audios en videos (imagen fija o video en bucle) dentro del navegador
// con ffmpeg.wasm y los sube a YouTube con la YouTube Data API v3.
import { FFmpeg } from './vendor/ffmpeg/index.js';

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';
const $ = (id) => document.getElementById(id);

// ---------- Preferencias (solo en este navegador) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('aship:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('aship:' + k, JSON.stringify(v)); } catch { } },
};
const DEFAULTS = {
  artista: '', album: '', privacidad: 'private', crearPlaylist: true, playlist: '{artista} - {album}',
  tTitulo: '{artista} - {titulo}',
  tDesc: '{titulo} - {artista}\nDel álbum "{album}" (pista {pista} de {total}).\n\n#{artista} #{album}',
  tTags: '{artista}, {album}, {titulo}, música', calidad: '1080', intervalo: '',
};
const campos = Object.keys(DEFAULTS);
for (const k of campos) {
  const el = $(k), v = store.get('f:' + k, DEFAULTS[k]);
  if (el.type === 'checkbox') el.checked = v; else el.value = v;
  el.addEventListener('input', () => store.set('f:' + k, el.type === 'checkbox' ? el.checked : el.value));
}

// ---------- Estado ----------
const state = { visual: null, tracks: [], running: false, stop: false, token: null, tokenExp: 0, user: null };
let tokenClient = null, pendingToken = null;

const statusEl = $('status'), logEl = $('log');
function setStatus(msg, kind = '') { statusEl.textContent = msg; statusEl.className = 'status ' + kind; }
function log(msg) { logEl.textContent += msg + '\n'; if (logEl.textContent.length > 60000) logEl.textContent = logEl.textContent.slice(-40000); logEl.scrollTop = logEl.scrollHeight; }

// ---------- Google ----------
$('originHint').textContent = location.origin;
function clientId() { return store.get('clientId', ''); }

function initTokenClient() {
  if (tokenClient || !clientId() || !window.google?.accounts?.oauth2) return !!tokenClient;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId(), scope: SCOPES,
    callback: (r) => {
      const p = pendingToken; pendingToken = null;
      if (r.error) { p?.reject(new Error(r.error_description || r.error)); return; }
      state.token = r.access_token; state.tokenExp = Date.now() + (r.expires_in - 120) * 1000;
      p?.resolve(state.token);
    },
    error_callback: (e) => { const p = pendingToken; pendingToken = null; p?.reject(new Error(e.message || e.type || 'login cancelado')); },
  });
  return true;
}
function requestToken(prompt) {
  if (!initTokenClient()) throw new Error('Configura primero tu ID de cliente de Google (botón ⚙).');
  return new Promise((resolve, reject) => { pendingToken = { resolve, reject }; tokenClient.requestAccessToken({ prompt }); });
}
async function token() {
  if (state.token && Date.now() < state.tokenExp) return state.token;
  const e = new Error('La sesión de Google expiró. Pulsa «Continuar» para seguir.'); e.needLogin = true; throw e;
}
async function login() {
  if (!clientId()) { openSettings(); return; }
  try {
    await requestToken(state.user ? '' : 'consent');
    const r = await api('GET', 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true');
    const ch = r.items?.[0];
    state.user = ch ? { name: ch.snippet.title, img: ch.snippet.thumbnails?.default?.url } : { name: 'Cuenta sin canal' };
    renderUser();
    if (!ch) setStatus('Esta cuenta de Google no tiene canal de YouTube. Crea uno o entra con otra cuenta.', 'warn');
  } catch (e) { setStatus('No se pudo iniciar sesión: ' + e.message, 'err'); }
}
function renderUser() {
  const u = state.user;
  $('userInfo').innerHTML = u ? (u.img ? `<img src="${u.img}" alt="">` : '') + `<span>${esc(u.name)}</span>` : 'Sin sesión';
  $('btnLogin').textContent = u ? 'Cambiar' : 'Entrar con Google';
}
async function api(method, url, body) {
  const r = await fetch(url, {
    method, headers: { Authorization: 'Bearer ' + await token(), ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch { }
  if (!r.ok) throw apiError(r.status, j, txt);
  return j;
}
function apiError(status, j, txt) {
  const reason = j?.error?.errors?.[0]?.reason || j?.error?.status || '';
  const e = new Error(`${status} ${reason}: ${j?.error?.message || txt || ''}`.trim());
  e.reason = reason;
  e.quota = /quotaExceeded|uploadLimitExceeded|dailyLimitExceeded|rateLimitExceeded/.test(reason);
  if (status === 401) e.needLogin = true, state.token = null;
  return e;
}

// ---------- Configuración ----------
const dlg = $('dlgSettings');
function openSettings() { $('clientId').value = clientId(); dlg.showModal(); }
$('btnSettings').onclick = openSettings;
$('btnSettingsCancel').onclick = () => dlg.close();
$('btnSettingsSave').onclick = () => {
  store.set('clientId', $('clientId').value.trim()); tokenClient = null; dlg.close();
  setStatus('ID de cliente guardado. Ahora pulsa «Entrar con Google».');
};
$('btnLogin').onclick = login;
if (!clientId()) setStatus('Primero configura tu cuenta de Google con el botón ⚙ (se hace una sola vez).', 'warn');

// ---------- Visual ----------
function pick(dropEl, inputEl, onFiles) {
  dropEl.onclick = () => inputEl.click();
  inputEl.onchange = () => { onFiles([...inputEl.files]); inputEl.value = ''; };
  dropEl.ondragover = (e) => { e.preventDefault(); dropEl.classList.add('over'); };
  dropEl.ondragleave = () => dropEl.classList.remove('over');
  dropEl.ondrop = (e) => { e.preventDefault(); dropEl.classList.remove('over'); onFiles([...e.dataTransfer.files]); };
}
pick($('dropVisual'), $('fileVisual'), (files) => {
  const f = files.find((f) => /^(image|video)\//.test(f.type) || /\.(jpe?g|png|webp|gif|mp4|mov|webm|mkv|m4v)$/i.test(f.name));
  if (!f) return setStatus('Ese archivo no es una imagen ni un video.', 'err');
  const kind = f.type.startsWith('image/') && f.type !== 'image/gif' ? 'image' : 'video';
  state.visual = { file: f, kind }; prepared.key = null;
  const box = $('visualPrev'), url = URL.createObjectURL(f);
  box.innerHTML = kind === 'image' ? `<img src="${url}" alt="">` : `<video src="${url}" autoplay muted loop playsinline></video>`;
  box.style.display = 'block';
  $('dropVisual').innerHTML = `<strong>${esc(f.name)}</strong><br><span class="hint">Clic para cambiar</span>`;
});

// ---------- Canciones ----------
const AUDIO_RE = /\.(mp3|wav|flac|m4a|aac|ogg|oga|opus|wma)$/i;
pick($('dropAudios'), $('fileAudios'), async (files) => {
  const nuevos = files.filter((f) => f.type.startsWith('audio/') || AUDIO_RE.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const f of nuevos) {
    if (state.tracks.some((t) => t.file.name === f.name && t.file.size === f.size)) continue;
    const titulo = (await readId3Title(f)) || f.name.replace(/\.[^.]+$/, '').replace(/^\s*\d+\s*[-._)]\s*/, '');
    state.tracks.push({ file: f, titulo, st: '', stKind: '', pct: 0, videoId: null });
  }
  renderTracks();
});
$('btnClear').onclick = () => { if (!state.running) { state.tracks = []; renderTracks(); } };

function doneKey(t) { return `done:${$('artista').value}|${$('album').value}|${t.file.name}|${t.file.size}`; }

function renderTracks() {
  const ul = $('tracks'); ul.innerHTML = '';
  $('empty').style.display = state.tracks.length ? 'none' : 'block';
  state.tracks.forEach((t, i) => {
    const prev = store.get(doneKey(t), null);
    if (prev && !t.videoId) { t.videoId = prev; t.st = 'Ya subido'; t.stKind = 'ok'; }
    const li = document.createElement('li'); li.className = 'track' + (t.working ? ' working' : '');
    li.innerHTML = `
      <div class="n">${i + 1}</div>
      <div style="min-width:0">
        <input type="text" value="${esc(t.titulo)}" aria-label="Título" ${state.running ? 'disabled' : ''}>
        <div class="meta">${esc(t.file.name)} · ${(t.file.size / 1048576).toFixed(1)} MB
          ${t.st ? ` · <span class="st ${t.stKind}">${t.videoId ? `<a href="https://youtu.be/${t.videoId}" target="_blank" rel="noopener">${esc(t.st)}</a>` : esc(t.st)}</span>` : ''}</div>
        <div class="bar"><div style="width:${t.pct}%"></div></div>
      </div>
      <div class="acts">
        <button class="btn small" data-a="up" title="Subir" ${i === 0 || state.running ? 'disabled' : ''}>↑</button>
        <button class="btn small" data-a="down" title="Bajar" ${i === state.tracks.length - 1 || state.running ? 'disabled' : ''}>↓</button>
        <button class="btn small" data-a="del" title="Quitar" ${state.running ? 'disabled' : ''}>✕</button>
      </div>`;
    li.querySelector('input').oninput = (e) => { t.titulo = e.target.value; };
    li.querySelectorAll('button').forEach((b) => b.onclick = () => {
      const a = b.dataset.a, arr = state.tracks;
      if (a === 'up') [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      if (a === 'down') [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      if (a === 'del') arr.splice(i, 1);
      renderTracks();
    });
    t.li = li; ul.appendChild(li);
  });
}
function updateTrack(t, patch) {
  Object.assign(t, patch);
  if (!t.li) return;
  t.li.classList.toggle('working', !!t.working);
  t.li.querySelector('.bar > div').style.width = (t.pct || 0) + '%';
  const meta = t.li.querySelector('.meta');
  meta.innerHTML = `${esc(t.file.name)} · ${(t.file.size / 1048576).toFixed(1)} MB` + (t.st ? ` · <span class="st ${t.stKind}">${t.videoId ? `<a href="https://youtu.be/${t.videoId}" target="_blank" rel="noopener">${esc(t.st)}</a>` : esc(t.st)}</span>` : '');
}

// ---------- ffmpeg.wasm ----------
let ff = null, ffProgress = null;
async function blobURL(url, type, label) {
  const r = await fetch(url); if (!r.ok) throw new Error('No se pudo descargar ' + url);
  const total = +r.headers.get('content-length') || 0, reader = r.body.getReader(), parts = []; let got = 0;
  for (; ;) {
    const { done, value } = await reader.read(); if (done) break;
    parts.push(value); got += value.length;
    if (label && total) setStatus(`${label} ${Math.round(got / total * 100)}%`);
  }
  return URL.createObjectURL(new Blob(parts, { type }));
}
// Cada operacion pesada usa un motor recien cargado: ffmpeg.wasm puede quedar con la memoria
// danada despues de un filtro grande. El nucleo se descarga una sola vez y se reutiliza.
let core = null;
async function freshFF() {
  if (!core) {
    setStatus('Cargando el motor de video (≈32 MB, solo la primera vez)…');
    core = {
      coreURL: await blobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await blobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm', 'Cargando el motor de video…'),
    };
  }
  try { ff?.terminate(); } catch { }
  const f = new FFmpeg();
  f.on('log', ({ message }) => log(message));
  f.on('progress', ({ time }) => ffProgress?.(time / 1e6));
  await f.load(core);
  ff = f; return ff;
}
async function run(args) {
  log('> ffmpeg ' + args.join(' '));
  const code = await ff.exec(args);
  if (code !== 0) throw new Error('ffmpeg falló (código ' + code + '). Mira «Detalles técnicos».');
}
const ext = (name) => (name.match(/\.[^.]+$/)?.[0] || '').toLowerCase();

// Prepara UNA vez el visual como clip en bucle (1920x1080 o 1280x720) + miniatura.
const prepared = { key: null, loop: null, thumb: null };
async function prepareVisual(onPct) {
  const v = state.visual, q = $('calidad').value, key = `${v.file.name}|${v.file.size}|${q}`;
  if (prepared.key === key) return;
  const [W, H] = q === '720' ? [1280, 720] : [1920, 1080];
  const { w, h, dur: vdur } = await mediaInfo(v.file, v.kind);
  await freshFF();
  const vin = 'visual' + ext(v.file.name);
  await ff.writeFile(vin, new Uint8Array(await v.file.arrayBuffer()));
  // Si ya es 16:9 solo se escala; si no, se centra sobre un fondo desenfocado de si mismo.
  const es169 = w && h && Math.abs(w / h - 16 / 9) < 0.03;
  const filtro = es169 ? `[0:v]scale=${W}:${H},setsar=1,format=yuv420p[v]`
    : `[0:v]split[a][b];[a]scale=${W / 4}:${H / 4}:force_original_aspect_ratio=increase,crop=${W / 4}:${H / 4},boxblur=8:2,eq=brightness=-0.25,scale=${W}:${H}[bg];` +
      `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`;
  const dur = v.kind === 'video' ? Math.min(vdur || 10, 60) : 10;
  ffProgress = (s) => onPct(Math.min(99, s / dur * 100));
  if (v.kind === 'video') {
    await run(['-i', vin, '-t', String(dur), '-filter_complex', filtro, '-map', '[v]', '-an',
      '-c:v', 'libx264', '-preset', 'superfast', '-crf', '22', '-g', '48', 'loop.mp4']);
  } else {
    await run(['-loop', '1', '-framerate', '1', '-t', '10', '-i', vin, '-filter_complex', filtro, '-map', '[v]',
      '-r', '1', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', 'loop.mp4']);
  }
  ffProgress = null;
  prepared.loop = await ff.readFile('loop.mp4');
  prepared.thumb = null;
  try {
    await run(['-y', '-ss', '0.5', '-i', 'loop.mp4', '-frames:v', '1', '-update', '1', '-vf', 'scale=1280:-2', '-q:v', '3', 'thumb.jpg']);
    prepared.thumb = await ff.readFile('thumb.jpg');
  } catch { }
  prepared.key = key;
}

// Une el bucle con el audio (sin recodificar el video) -> Blob MP4
async function buildVideo(t, onPct) {
  await freshFF();
  await ff.writeFile('loop.mp4', prepared.loop.slice());
  const ain = 'audio' + ext(t.file.name);
  await ff.writeFile(ain, new Uint8Array(await t.file.arrayBuffer()));
  const dur = await mediaDuration(t.file, 'audio');
  if (!dur) throw new Error('No se pudo leer la duración del audio');
  const copiar = ['.mp3', '.m4a', '.aac'].includes(ext(t.file.name));
  ffProgress = (s) => onPct(Math.min(99, s / dur * 100));
  try {
    await run(['-y', '-stream_loop', '-1', '-i', 'loop.mp4', '-i', ain, '-map', '0:v', '-map', '1:a', '-t', dur.toFixed(3),
      '-c:v', 'copy', ...(copiar ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '320k']), '-movflags', '+faststart', 'out.mp4']);
  } finally { ffProgress = null; await ff.deleteFile(ain).catch(() => { }); }
  const data = await ff.readFile('out.mp4'); await ff.deleteFile('out.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}
async function mediaDuration(file, kind) { return (await mediaInfo(file, kind)).dur; }
function mediaInfo(file, kind) {
  return new Promise((res) => {
    const url = URL.createObjectURL(file), done = (r) => { URL.revokeObjectURL(url); res(r); };
    if (kind === 'image') {
      const img = new Image();
      img.onload = () => done({ w: img.naturalWidth, h: img.naturalHeight, dur: 0 });
      img.onerror = () => done({ w: 0, h: 0, dur: 0 });
      img.src = url; return;
    }
    const el = document.createElement(kind);
    el.preload = 'metadata'; el.muted = true;
    el.onloadedmetadata = () => done({ w: el.videoWidth || 0, h: el.videoHeight || 0, dur: isFinite(el.duration) ? el.duration : 0 });
    el.onerror = () => done({ w: 0, h: 0, dur: 0 });
    el.src = url;
  });
}

// ---------- YouTube ----------
function fill(tpl, d) { return tpl.replace(/\{(artista|album|titulo|pista|total)\}/g, (_, k) => d[k] ?? ''); }
function clean(s, max) { s = String(s).replace(/[<>]/g, '').trim(); return s.length > max ? s.slice(0, max) : s; }

function snippetFor(t, i, total) {
  const d = { artista: $('artista').value.trim(), album: $('album').value.trim(), titulo: t.titulo.trim(), pista: i + 1, total };
  let tags = $('tTags').value.split(',').map((x) => clean(fill(x, d), 100)).filter(Boolean), len = 0;
  tags = tags.filter((x) => (len += x.length + 3) <= 480);
  const status = { privacyStatus: $('privacidad').value, selfDeclaredMadeForKids: false, embeddable: true };
  const prog = $('programar').value;
  if (prog) {
    const horas = parseFloat($('intervalo').value) || 0;
    const when = new Date(new Date(prog).getTime() + horas * 3600e3 * i);
    if (when > new Date()) { status.privacyStatus = 'private'; status.publishAt = when.toISOString(); }
  }
  return {
    snippet: {
      title: clean(fill($('tTitulo').value || DEFAULTS.tTitulo, d), 100) || clean(t.titulo, 100) || 'Sin título',
      description: clean(fill($('tDesc').value, d), 5000), tags, categoryId: '10',
      defaultLanguage: 'es', defaultAudioLanguage: 'es',
    },
    status,
  };
}

async function uploadVideo(blob, meta, onPct) {
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json; charset=utf-8',
      'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify(meta),
  });
  if (!init.ok) { const txt = await init.text(); let j = {}; try { j = JSON.parse(txt); } catch { } throw apiError(init.status, j, txt); }
  const url = init.headers.get('Location');
  log(url ? '  YouTube aceptó la subida, enviando el video…' : '  YouTube no devolvió la dirección de subida (Location).');
  if (!url) throw new Error('YouTube no devolvió la dirección de subida.');
  const tok = await token();
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url); x.setRequestHeader('Authorization', 'Bearer ' + tok); x.setRequestHeader('Content-Type', 'video/mp4');
    x.upload.onprogress = (e) => e.lengthComputable && onPct(e.loaded / e.total * 100);
    x.onload = () => {
      let j = {}; try { j = JSON.parse(x.responseText); } catch { }
      if (x.status >= 200 && x.status < 300 && j.id) resolve(j.id); else reject(apiError(x.status, j, x.responseText));
    };
    x.onerror = () => reject(new Error('Se cortó la conexión durante la subida.'));
    x.send(blob);
  });
}

let thumbWarned = false;
async function setThumbnail(videoId) {
  if (thumbWarned || !prepared.thumb) return;
  const data = prepared.thumb;
  const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'image/jpeg' }, body: data,
  });
  if (!r.ok) { thumbWarned = true; log('Miniatura no aplicada (tu canal necesita verificación por teléfono para miniaturas personalizadas): ' + await r.text()); }
}

async function ensurePlaylist() {
  if (!$('crearPlaylist').checked) return null;
  const title = clean(fill($('playlist').value || DEFAULTS.playlist, { artista: $('artista').value.trim(), album: $('album').value.trim() }), 150);
  if (!title) return null;
  const cacheKey = 'pl:' + title, cached = store.get(cacheKey, null);
  if (cached) return cached;
  let page = '';
  do {
    const r = await api('GET', `https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50${page ? '&pageToken=' + page : ''}`);
    const hit = r.items?.find((p) => p.snippet.title === title);
    if (hit) { store.set(cacheKey, hit.id); return hit.id; }
    page = r.nextPageToken || '';
  } while (page);
  const priv = $('programar').value ? 'public' : $('privacidad').value;
  const r = await api('POST', 'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
    { snippet: { title, defaultLanguage: 'es' }, status: { privacyStatus: priv } });
  log('Playlist creada: ' + title);
  store.set(cacheKey, r.id); return r.id;
}

// ---------- Proceso ----------
let wakeLock = null;
async function process(mode) {
  if (state.running) return;
  if (!state.visual) return setStatus('Falta el visual: arrastra una imagen o un video.', 'err');
  if (!state.tracks.length) return setStatus('Falta agregar canciones.', 'err');
  if (mode === 'upload') {
    if (!$('artista').value.trim()) return setStatus('Escribe el nombre del artista.', 'err');
    if (!state.token || Date.now() >= state.tokenExp) {
      if (!clientId()) return openSettings();
      try { await requestToken(state.user ? '' : 'consent'); if (!state.user) await login(); }
      catch (e) { return setStatus('Necesitas entrar con Google: ' + e.message, 'err'); }
    }
  }
  state.running = true; state.stop = false; setButtons(); renderTracks();
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { }
  const total = state.tracks.length; let hechos = 0;
  try {
    setStatus('Preparando el visual (solo una vez)…');
    await prepareVisual((p) => setStatus(`Preparando el visual (solo una vez)… ${Math.round(p)}%`));
    const playlistId = mode === 'upload' ? await ensurePlaylist() : null;

    for (let i = 0; i < total; i++) {
      if (state.stop) break;
      const t = state.tracks[i];
      if (mode === 'upload' && t.videoId) continue;
      setStatus(`Canción ${i + 1} de ${total}: ${t.titulo}`);
      updateTrack(t, { working: true, pct: 0, st: 'Creando video…', stKind: '' });
      const blob = await buildVideo(t, (p) => updateTrack(t, { pct: p * (mode === 'upload' ? 0.15 : 1) }));

      if (mode === 'download') {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = t.file.name.replace(/\.[^.]+$/, '') + '.mp4'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        updateTrack(t, { working: false, pct: 100, st: 'Descargado', stKind: 'ok' }); hechos++;
        continue;
      }

      const mb = (blob.size / 1048576).toFixed(0);
      updateTrack(t, { st: `Subiendo a YouTube… 0% de ${mb} MB` });
      log(`Subiendo "${t.titulo}" (${mb} MB)…`);
      const meta = snippetFor(t, i, total);
      let ultimo = -1;
      const id = await uploadVideo(blob, meta, (p) => {
        const r = Math.floor(p);
        updateTrack(t, { pct: 15 + p * 0.85, st: `Subiendo a YouTube… ${r}% de ${mb} MB` });
        setStatus(`Canción ${i + 1} de ${total}: ${t.titulo} — subiendo ${r}%`);
        if (r >= ultimo + 25) { ultimo = r; log(`  ${r}%`); }
      });
      store.set(doneKey(t), id);
      updateTrack(t, { videoId: id, st: meta.status.publishAt ? 'Subido (programado)' : 'Subido', stKind: 'ok', pct: 100 });
      log(`Subido: ${meta.snippet.title} -> https://youtu.be/${id}`);
      try { await setThumbnail(id); } catch (e) { log('Miniatura: ' + e.message); }
      if (playlistId) {
        try { await api('POST', 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
          { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId: id } } }); }
        catch (e) { if (e.quota) throw e; log('Playlist: ' + e.message); }
      }
      updateTrack(t, { working: false }); hechos++;
    }
    if (state.stop) setStatus(`Detenido. Listas: ${hechos}.`, 'warn');
    else setStatus(mode === 'upload' ? `¡Listo! ${hechos} video(s) subido(s) a YouTube.` : `¡Listo! ${hechos} video(s) descargado(s).`);
  } catch (e) {
    console.error(e); log(String(e?.stack || e));
    if (!(e instanceof Error)) e = new Error(String(e?.message || e || 'error desconocido'));
    const t = state.tracks.find((x) => x.working); if (t) updateTrack(t, { working: false, st: e.quota ? 'Pendiente' : 'Error', stKind: e.quota ? 'warn' : 'err' });
    if (e.quota) setStatus(`Se acabó la cuota diaria de YouTube (llevas ${hechos} hoy). Vuelve mañana con los mismos archivos y sigue donde quedó.`, 'warn');
    else if (e.needLogin) { setStatus(e.message, 'warn'); $('btnUpload').textContent = 'Continuar'; }
    else setStatus('Error: ' + e.message, 'err');
  } finally {
    state.running = false; setButtons(); renderTracks();
    try { ff?.terminate(); } catch { } ff = null;
    try { await wakeLock?.release(); } catch { }
  }
}
function setButtons() {
  $('btnUpload').disabled = $('btnDownload').disabled = $('btnClear').disabled = state.running;
  $('btnStop').disabled = !state.running;
  if (!state.running && !/Continuar/.test($('btnUpload').textContent)) $('btnUpload').textContent = 'Crear y subir a YouTube';
}
$('btnUpload').onclick = () => { $('btnUpload').textContent = 'Crear y subir a YouTube'; process('upload'); };
$('btnDownload').onclick = () => process('download');
$('btnStop').onclick = () => { state.stop = true; setStatus('Deteniendo al terminar la canción actual…', 'warn'); };
window.addEventListener('beforeunload', (e) => { if (state.running) { e.preventDefault(); e.returnValue = ''; } });

// ---------- Utilidades ----------
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Lee el título (TIT2) de la etiqueta ID3v2 de un MP3, si existe.
async function readId3Title(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return '';
    const ver = head[3], size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
    const tag = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
    let p = 0;
    while (p + 10 <= tag.length) {
      const id = String.fromCharCode(...tag.slice(p, p + 4));
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fs = ver >= 4 ? (tag[p + 4] << 21) | (tag[p + 5] << 14) | (tag[p + 6] << 7) | tag[p + 7]
        : (tag[p + 4] << 24) | (tag[p + 5] << 16) | (tag[p + 6] << 8) | tag[p + 7];
      if (id === 'TIT2') {
        const b = tag.slice(p + 10, p + 10 + fs), enc = b[0], body = b.slice(1);
        const dec = enc === 0 ? 'latin1' : enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : 'utf-8';
        return new TextDecoder(dec).decode(body).replace(/\0/g, '').trim();
      }
      p += 10 + fs;
    }
  } catch { }
  return '';
}

renderTracks();
window.addEventListener('load', () => initTokenClient());
