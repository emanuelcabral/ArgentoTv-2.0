import express from "express";
import fetch from "node-fetch";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import cors from "cors";

const app = express();
app.use(cors());

// 🧠 SERVIR ARCHIVOS DESDE LA RAÍZ (index.html en root)
app.use(express.static("."));

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const builder = new XMLBuilder({ ignoreAttributes: false });

// 🧠 CACHE EN MEMORIA
let cachedEPG = null;
let lastUpdate = 0;
const CACHE_TIME = 1000 * 60 * 30;

const feeds = [
  { url: "https://argentotv.up.railway.app/epg", tag: "AR" }
];

// ⏱ FETCH CON TIMEOUT
const fetchWithTimeout = (url, ms = 10000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timeout));
};

async function buildEPG() {
  const responses = await Promise.all(
    feeds.map(f => fetchWithTimeout(f.url))
  );

  const xmls = await Promise.all(responses.map(r => r.text()));
  const epgs = xmls.map(x => parser.parse(x));

  const channelsMap = new Map();
  const programmes = [];

  epgs.forEach((epg, i) => {
    if (!epg.tv) return;

    const chs = [].concat(epg.tv.channel || []);
    const progs = [].concat(epg.tv.programme || []);

    chs.forEach(ch => ch?.id && channelsMap.set(ch.id, ch));
    progs.forEach(p => p?.channel && programmes.push(p));

    console.log(`Feed ${feeds[i].tag}: ${chs.length} canales`);
  });

  return builder.build({
    tv: {
      "@_source-info-name": "IPTV-EPG",
      "@_source-info-url": "https://iptv-epg.org",

      channel: [...channelsMap.values()].map(ch => ({
        "@_id": ch.id,
        "display-name": ch["display-name"],
        icon: { "@_src": ch.icon?.src || "" }
      })),

      programme: programmes.map(p => ({
        "@_start": p.start,
        "@_stop": p.stop,
        "@_channel": p.channel,
        title: p.title,
        desc: p.desc
      }))
    }
  });
}

// 🌐 INDEX DIRECTO (sin carpeta public)
app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/index.html");
});

// 📺 EPG ENDPOINT
app.get("/epg", async (req, res) => {
  try {
    const now = Date.now();

    if (cachedEPG && now - lastUpdate < CACHE_TIME) {
      res.set("Content-Type", "application/xml");
      return res.send(cachedEPG);
    }

    console.log("Generando EPG nueva...");

    cachedEPG = await buildEPG();
    lastUpdate = now;

    res.set("Content-Type", "application/xml");
    res.send(cachedEPG);

  } catch (err) {
    console.error("Error cargando EPG:", err);
    res.status(500).send("Error cargando EPG");
  }
});

// 🚀 PORT para Railway/Render
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("EPG server running on port", PORT);
});