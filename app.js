const list = document.getElementById('channel-list');
const search = document.getElementById('search');
const player = document.getElementById('player-container');

const overlay = document.getElementById("overlay");
const overlayName = document.getElementById("overlay-name");
const overlayLogo = document.getElementById("overlay-logo");
const overlayEpg = document.getElementById("overlay-epg");

let channels = [];
let hls;
let epgData = {};
let overlayTimeout;
let currentChannelIndex = 0;

// prealoader inicia
const preloader = document.getElementById("preloader");
const speedEl = document.getElementById("speed");

let lastLoaded = 0;
let lastTime = 0;
// prealoader fin

// datos fijos incia
const hudRes = document.getElementById("hud-resolution");
const hudBit = document.getElementById("hud-bitrate");
const hudMode = document.getElementById("hud-mode");
const hudSpeed = document.getElementById("hud-speed");
const hudQuality = document.getElementById("hud-quality");
// datos fijos fin


// 🔥 EPG URL
// const EPG_URL = "https://iptv-epg.org/files/epg-ar.xml";
const EPG_URL = "http://localhost:3000/epg";



// -----------------------------
// 🔥 NORMALIZAR TEXTO (CLAVE)
// -----------------------------
function normalize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}


// -----------------------------
// 🔥 PARSE TIME (ADAPTADO)
// -----------------------------
function parseTime(str) {
  if (!str) return null;

  // Ejemplo: "20260417010000 +0000"
  const match = str.match(
    /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s?([+-]\d{4})?/
  );

  if (!match) return null;

  const [, y, m, d, h, min, s, tz] = match;

  let date = new Date(Date.UTC(y, m - 1, d, h, min, s));

  if (tz) {
    const sign = tz[0] === "-" ? -1 : 1;
    const hh = parseInt(tz.slice(1, 3));
    const mm = parseInt(tz.slice(3, 5));
    const offset = sign * (hh * 60 + mm);
    date.setUTCMinutes(date.getUTCMinutes() - offset);
  }

  return date.getTime(); // timestamp en ms
}


// -----------------------------
// 🔥 CARGAR EPG
// -----------------------------
async function loadEPG() {
  try {
    const res = await fetch(EPG_URL);
    const xmlText = await res.text();

    const xml = new DOMParser().parseFromString(xmlText, "text/xml");
    const programmes = xml.getElementsByTagName("programme");

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    epgData = {}; // 🔥 importante: limpia antes de cargar

    // 🔥 obtiene texto por idioma (evita el problema del "lang")
    const getLangText = (p, tag, lang = "es") => {
      const nodes = p.getElementsByTagName(tag);

for (let n of nodes) {
  const langAttr =
    n.getAttribute("lang") ||
    n.getAttribute("xml:lang");

  if ((langAttr || "").trim().toLowerCase() === lang) {
    return n.textContent || "";
  }
}

      return nodes[0]?.textContent || "";
    };

    // 🔥 limpieza de texto
    const cleanText = (t) =>
      (t || "")
        .replace(/\s*\.\s*es\s*$/i, "") // elimina ".es"
        .replace(/\s*\s*es\s*$/i, "") // elimina "es"
        .replace(/\s+/g, " ")
        .trim();

    for (let p of programmes) {
      const channel = p.getAttribute("channel");
      if (!channel) continue;

      const start = parseTime(p.getAttribute("start"));
      const stop = parseTime(p.getAttribute("stop"));
      if (!start || !stop) continue;

      // 🔥 filtro temprano (mejora rendimiento)
      if (Math.abs(start - now) > 0.5 * DAY) continue;

      const titleRaw = getLangText(p, "title");
      const descRaw = getLangText(p, "desc");

      const title = cleanText(titleRaw);
      const desc = cleanText(descRaw);

      if (!epgData[channel]) epgData[channel] = [];

      epgData[channel].push({
        title,
        desc,
        start,
        stop
      });
    }

    // 🔥 ordenar cada canal
    for (let k in epgData) {
      epgData[k].sort((a, b) => a.start - b.start);
    }

    console.log("EPG cargado:", Object.keys(epgData));

  } catch (e) {
    console.warn("EPG error:", e);
  }
}
// -----------------------------
// 🔥 PROGRAMA ACTUAL
// -----------------------------
function getCurrentProgram(list) {
  if (!list) return null;

  const now = Date.now();

  for (let p of list) {
    if (!p.start || !p.stop) continue;

    if (now >= p.start && now <= p.stop) {
      return p;
    }
  }

  return null;
}


// -----------------------------
// 🔥 CARGAR CANALES
// -----------------------------
async function loadChannels() {
  try {
    const res = await fetch('./channels.json');
    channels = await res.json();

    renderChannels(channels);

  } catch (err) {
    console.error("Error channels:", err);
    list.innerHTML = "<p>Error cargando canales</p>";
  }
}


// -----------------------------
// 🔥 OBTENER EPG (ROBUSTO)
// -----------------------------
function getEPG(channel) {
  if (channel.epg_id && epgData[channel.epg_id]) {
    return epgData[channel.epg_id];
  }

  const keys = Object.keys(epgData);
  const foundKey = keys.find(k =>
    normalize(k) === normalize(channel.name)
  );

  if (foundKey) {
    return epgData[foundKey];
  }

  return null;
}


// -----------------------------
// 🔥 OVERLAY
// -----------------------------
// 🔥 PROGRESO
function getProgress(p) {
  if (!p?.start || !p?.stop) return 0;
  const now = Date.now();
  return Math.min(100, Math.max(0, ((now - p.start) / (p.stop - p.start)) * 100));
}

// 🔥 OVERLAY
function showOverlay(channel) {
  if (!overlay) return;

  const epgList = getEPG(channel);
  const current = getCurrentProgram(epgList);

  overlayName.textContent = channel.name;
  overlayLogo.src = channel.logo || '';

  if (!epgList || !current) {
    document.getElementById("overlay-title").textContent = "Sin programa actual";
    document.getElementById("overlay-start").textContent = "";
    document.getElementById("overlay-stop").textContent = "";
    document.getElementById("overlay-progress-bar").style.width = "0%";
    document.getElementById("overlay-category").textContent = "";
    document.getElementById("overlay-desc").textContent = "";
  } else {
    document.getElementById("overlay-title").textContent = current.title;
    document.getElementById("overlay-start").textContent =
      new Date(current.start).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    document.getElementById("overlay-stop").textContent =
      new Date(current.stop).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    document.getElementById("overlay-progress-bar").style.width = getProgress(current) + "%";
    document.getElementById("overlay-category").textContent = current.category || "";
    document.getElementById("overlay-desc").textContent = current.desc || "";
  }

  // Datos técnicos desde channels.json
const initialRes = "AUTO";
const initialBit = "0 Mbps";
const initialMode = "AUTO";

// OVERLAY
document.getElementById("overlay-resolution").textContent = initialRes;
document.getElementById("overlay-bitrate").textContent = initialBit;
document.getElementById("overlay-audio").textContent = initialMode;

// HUD (FIJO)
if (hudRes) hudRes.textContent = initialRes;
if (hudBit) hudBit.textContent = initialBit;
if (hudMode) hudMode.textContent = initialMode;

  overlay.classList.add("show");

  clearTimeout(overlayTimeout);

  // SOLO ocultar overlay visual, NO datos
  overlayTimeout = setTimeout(() => {
    overlay.classList.remove("show");
  }, 5000);
}


// -----------------------------
// 🔥 RENDER
// -----------------------------
function renderChannels(data) {
  list.innerHTML = '';

  if (!data || data.length === 0) {
    list.innerHTML = "<p>No hay canales</p>";
    return;
  }

  data.forEach(channel => {
    const div = document.createElement('div');
    div.className = 'channel';

    const epgList = getEPG(channel);
    const current = getCurrentProgram(epgList);

    console.log(
      "CANAL:", channel.name,
      "| epg_id:", channel.epg_id,
      "| EPG:", epgList?.length,
      "| CURRENT:", current
    );

    let epgText = "Sin informacion";

    if (epgList && current?.title) {
      epgText = current.title;
    } else if (epgList) {
      epgText = "Sin programa actual";
    }

    // 🔥 IMG FIX
    const img = document.createElement("img");
    img.src = channel.logo || "https://via.placeholder.com/40";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      img.src = "https://via.placeholder.com/40";
    };

    // 🔥 TEXTO
    const info = document.createElement("div");
    info.innerHTML = `
      <span>${channel.name}</span>
      <small style="display:block;color:${epgList ? '#00ef03' : ''};">
        ${epgText}
      </small>
    `;

    div.appendChild(img);
    div.appendChild(info);

    div.onclick = () => playChannel(channel);

    list.appendChild(div);
  });
}

// -----------------------------
// 🔥 PLAYER
// -----------------------------
function playChannel(channel) {
  currentChannelIndex = channels.indexOf(channel);

  if (hls) {
    hls.destroy();
    hls = null;
  }

  let video = document.getElementById('video');

  if (!video) {
    video = document.createElement("video");
    video.id = "video";
    video.controls = true;
    video.autoplay = true;
    player.prepend(video);
  }

if (channel.type === "youtube" || channel.url.includes("youtube")) {
  const id = channel.url.match(/(?:youtu\.be\/|v=)([^&]+)/)?.[1];
  if (!id) return;

  player.innerHTML = `
    <iframe width="100%" height="100%"
    src="https://www.youtube.com/embed/${id}?autoplay=1"
    allowfullscreen></iframe>
  `;
  return;
}

// 🔥 NUEVO: soporte iframe genérico
if (channel.type === "iframe") {
  player.innerHTML = `
    <iframe 
      width="100%" 
      height="100%" 
      src="${channel.url}"
      frameborder="0"
      allow="autoplay; encrypted-media; fullscreen"
      allowfullscreen>
    </iframe>
  `;

  showOverlay(channel);
  return;
}

  if (window.Hls && Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(channel.url);
    hls.attachMedia(video);
  } else {
    video.src = channel.url;
  }

  showOverlay(channel);
}


// -----------------------------
// 🔥 TECLADO
// -----------------------------
document.addEventListener("keydown", (e) => {
  if (!channels.length) return;

  if (e.key === "ArrowUp") {
    currentChannelIndex =
      (currentChannelIndex - 1 + channels.length) % channels.length;
    showOverlay(channels[currentChannelIndex]);
  }

  if (e.key === "ArrowDown") {
    currentChannelIndex =
      (currentChannelIndex + 1) % channels.length;
    showOverlay(channels[currentChannelIndex]);
  }

  if (e.key === "Enter") {
    playChannel(channels[currentChannelIndex]);
  }
});


// -----------------------------
// 🔥 FULLSCREEN
// -----------------------------
player.addEventListener("dblclick", () => {
  if (!document.fullscreenElement) {
    player.requestFullscreen();
  }
});


// -----------------------------
// 🔥 SEARCH
// -----------------------------
search?.addEventListener('input', () => {
  const v = search.value.toLowerCase();

  renderChannels(
    channels.filter(c =>
      c.name?.toLowerCase().includes(v)
    )
  );
});

// -----------------------------
// 🔥 INIT
// -----------------------------
async function init() {
  await loadEPG();
  await loadChannels();
}

init();

// -----------------------------
// 🔥 Local Time
// -----------------------------
function actualizarHora() {
  const now = new Date();

  const horaLocal = now.toLocaleString("es-AR", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hour: "2-digit",
    minute: "2-digit"
  });

  document.getElementById("hora").textContent = horaLocal;
}

// Ejecutar una vez inmediatamente
actualizarHora();

// Actualizar cada segundo
setInterval(actualizarHora, 1000);



//prealoader inicia

let netSpeedInterval = null;

function showLoader() {
  preloader.classList.add("active");
  speedEl.textContent = "Midiendo conexión...";
  startInternetSpeedTest();
}

function hideLoader() {
  preloader.classList.remove("active");

  if (netSpeedInterval) {
    clearInterval(netSpeedInterval);
    netSpeedInterval = null;
  }
}

function startInternetSpeedTest() {

  async function measure() {
    try {
      const start = performance.now();

      const res = await fetch(
        "https://speed.cloudflare.com/__down?bytes=500000",
        { cache: "no-store" }
      );

      const blob = await res.blob();

      const end = performance.now();

      const bytes = blob.size;
      let seconds = (end - start) / 1000;

      // 🔥 FIX anti NaN
      if (!seconds || seconds <= 0) seconds = 0.1;

      // 🔥 velocidad en Mbps reales
      const speedMBs = (bytes * 8) / (seconds * 1000000);

      if (!isFinite(speedMBs) || speedMBs < 0) {
        speedEl.textContent = "Sin señal";
        return;
      }

      // 🔥 texto de velocidad (bonito y consistente)
      let text;

      if (speedMBs >= 1) {
        text = speedMBs.toFixed(2) + " Mbps";
      } else {
        text = (speedMBs * 1000).toFixed(0) + " Kbps";
      }

      speedEl.textContent = text;

      // 🔥 calidad de conexión
      const quality = getQualityLabel(speedMBs);

      if (hudQuality) {
        hudQuality.textContent = quality.text;
        hudQuality.style.color = quality.color;
      }

    } catch (e) {
      speedEl.textContent = "Sin conexión";

      if (hudQuality) {
        hudQuality.textContent = "🔴 Sin conexión";
        hudQuality.style.color = "#ff3b3b";
      }
    }
  }

  // 🔥 primera medición inmediata
  measure();

  // 🔥 actualización cada 2s
  netSpeedInterval = setInterval(measure, 2000);
}

function playChannel(channel) {

  currentChannelIndex = channels.indexOf(channel);

  if (hls) {
    hls.destroy();
    hls = null;
  }

  showLoader(); // 🔥 SOLO al click

  let video = document.getElementById('video');

  if (!video) {
    video = document.createElement("video");
    video.id = "video";
    video.autoplay = true;
    player.prepend(video);
  }

  if (window.Hls && Hls.isSupported()) {

    hls = new Hls();

hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {

  const level = hls.levels[data.level];
  if (!level) return;

  const resolution =
  level.height && level.height > 0
    ? level.height + "p"
    : "AUTO";
  let bitrateValue = level.bitrate;

  let bitrate =
    bitrateValue && bitrateValue > 0
      ? (bitrateValue / 1000000).toFixed(2) + " Mbps"
      : "AUTO / N/A";
  const mode = hls.autoLevelEnabled ? "AUTO" : "MANUAL";

  // =========================
  // OVERLAY (si está visible)
  // =========================
  const overlayRes = document.getElementById("overlay-resolution");
  const overlayBit = document.getElementById("overlay-bitrate");
  const overlayMode = document.getElementById("overlay-audio");

  if (overlayRes) overlayRes.textContent = resolution;
  if (overlayBit) overlayBit.textContent = bitrate;
  if (overlayMode) overlayMode.textContent = mode;

  // =========================
  // HUD (siempre visible)
  // =========================
  if (hudRes) hudRes.textContent = resolution;
  if (hudBit) hudBit.textContent = bitrate;
  if (hudMode) hudMode.textContent = mode;
});

    // 🔥 SOLO dejamos eventos básicos (SIN velocidad acá)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      // no tocar loader acá
    });

    video.addEventListener("playing", () => {
      hideLoader();
    }, { once: true });

    hls.loadSource(channel.url);
    hls.attachMedia(video);

  } else {

    video.src = channel.url;

    video.onplaying = () => hideLoader();
  }

  showOverlay(channel);
}

//prealoader fin


// calidad de conexion inicia
function getQualityLabel(mbps) {

  if (mbps >= 20) return { text: "🟢 Excelente", color: "#00ff88" };
  if (mbps >= 10) return { text: "🔵 Buena", color: "#00d4ff" };
  if (mbps >= 5)  return { text: "🟡 Aceptable", color: "#ffd000" };
  if (mbps >= 2)  return { text: "🟠 Mala", color: "#ff8800" };
  return { text: "🔴 Muy Mala", color: "#ff3b3b" };
}
// calidad de conexion fin

// ocultar|mostrar hora|info inicia

const clock = document.getElementById("hora");
const hud = document.getElementById("hud");

const toggleClock = document.getElementById("toggle-clock");
const toggleHud = document.getElementById("toggle-hud");

// reloj
toggleClock.addEventListener("change", () => {
  clock.style.display = toggleClock.checked ? "block" : "none";
});

// hud
toggleHud.addEventListener("change", () => {
  hud.style.display = toggleHud.checked ? "block" : "none";
});

// ocultar|mostrar hora|info fin

// prealoder del home inicia

document.addEventListener("DOMContentLoaded", () => {
  const intro = document.getElementById("intro-overlay");

  const TIME = 7000; // 5–10s (ajustable)

  setTimeout(() => {
    intro.classList.add("hide");

    setTimeout(() => {
      intro.style.display = "none";
    }, 1200);

  }, TIME);
});

// prealoder del home fin