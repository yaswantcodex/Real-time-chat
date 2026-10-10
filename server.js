const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "messages.json");
const ROOMS = new Set(["lobby", "technology", "project-help", "random"]);
const MAX_HISTORY = 100;
const clients = new Map();

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");

function readMessages() {
  try {
    const value = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function saveMessages(messages) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(messages.slice(-1000), null, 2), "utf8");
}
function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function broadcast(payload, room) {
  for (const [client, info] of clients.entries()) {
    if (client.readyState === WebSocket.OPEN && (!room || info.room === room)) send(client, payload);
  }
}
function activePeople(room) {
  const people = [];
  for (const info of clients.values()) {
    if (info.room === room && !people.some(p => p.name === info.name)) {
      people.push({ name: info.name, room: info.room });
    }
  }
  return people;
}
function updatePresence(room) {
  broadcast({ type: "presence", people: activePeople(room) }, room);
}
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, service: "Relay Chat WebSocket Server" }));

wss.on("connection", (ws) => {
  const info = { name: "Guest", room: "lobby", typing: false };
  clients.set(ws, info);

  ws.on("message", (raw) => {
    let packet;
    try { packet = JSON.parse(raw.toString()); } catch { return send(ws, { type: "error", message: "Invalid message format." }); }
    if (!packet || typeof packet.type !== "string") return;

    if (packet.type === "join") {
      const name = String(packet.name || "Guest").trim().replace(/\s+/g, " ").slice(0, 24) || "Guest";
      const room = ROOMS.has(packet.room) ? packet.room : "lobby";
      const oldRoom = info.room;
      info.name = name;
      info.room = room;
      info.typing = false;
      send(ws, { type: "joined", name, room, messages: readMessages().filter(m => m.room === room).slice(-MAX_HISTORY) });
      if (oldRoom !== room) updatePresence(oldRoom);
      updatePresence(room);
      return;
    }

    if (packet.type === "message") {
      const content = String(packet.content || "").trim();
      if (!content) return;
      if (content.length > 1000) return send(ws, { type: "error", message: "Messages must be 1,000 characters or fewer." });
      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        room: info.room,
        name: info.name,
        content,
        createdAt: new Date().toISOString()
      };
      const history = readMessages();
      history.push(message);
      saveMessages(history);
      broadcast({ type: "message", message }, info.room);
      return;
    }

    if (packet.type === "typing") {
      info.typing = !!packet.isTyping;
      broadcast({ type: "typing", name: info.name, isTyping: info.typing }, info.room);
      return;
    }

    if (packet.type === "switch-room") {
      const oldRoom = info.room;
      const room = ROOMS.has(packet.room) ? packet.room : "lobby";
      info.room = room;
      info.typing = false;
      send(ws, { type: "joined", name: info.name, room, messages: readMessages().filter(m => m.room === room).slice(-MAX_HISTORY) });
      updatePresence(oldRoom);
      updatePresence(room);
    }
  });

  ws.on("close", () => {
    const room = info.room;
    clients.delete(ws);
    updatePresence(room);
    broadcast({ type: "typing", name: info.name, isTyping: false }, room);
  });
  ws.on("error", () => {});
});

server.listen(PORT, () => {
  console.log(`Relay Chat is running at http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop the server.");
});