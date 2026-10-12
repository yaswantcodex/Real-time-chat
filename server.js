
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const ROOMS = new Set(["lobby", "technology", "project-help", "random"]);
const MAX_HISTORY = 100;
const clients = new Map();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it in Render Environment.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 10000
});

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload, room) {
  for (const [client, info] of clients.entries()) {
    if (
      client.readyState === WebSocket.OPEN &&
      (!room || info.room === room)
    ) {
      send(client, payload);
    }
  }
}

function activePeople(room) {
  const people = [];

  for (const info of clients.values()) {
    if (
      info.room === room &&
      !people.some(person => person.name === info.name)
    ) {
      people.push({ name: info.name, room: info.room });
    }
  }

  return people;
}

function updatePresence(room) {
  broadcast({ type: "presence", people: activePeople(room) }, room);
}

// Convert a PostgreSQL row to the message format used by the frontend.
function formatMessage(row) {
  return {
    id: String(row.id),
    room: row.room,
    name: row.username,
    content: row.message,
    createdAt: row.created_at
  };
}

// Read recent messages from PostgreSQL.
async function getMessages(room) {
  const result = await pool.query(
    `SELECT id, username, room, message, created_at
     FROM public.messages
     WHERE room = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [room, MAX_HISTORY]
  );

  return result.rows.reverse().map(formatMessage);
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "Relay Chat", database: "connected" });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    res.status(503).json({
      ok: false,
      service: "Relay Chat",
      database: "disconnected"
    });
  }
});

wss.on("connection", (ws) => {
  const info = { name: "Guest", room: "lobby", typing: false };
  clients.set(ws, info);

  ws.on("message", async (raw) => {
    let packet;

    try {
      packet = JSON.parse(raw.toString());
    } catch {
      return send(ws, {
        type: "error",
        message: "Invalid message format."
      });
    }

    if (!packet || typeof packet.type !== "string") return;

    try {
      if (packet.type === "join") {
        const name = String(packet.name || "Guest")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 24) || "Guest";

        const room = ROOMS.has(packet.room) ? packet.room : "lobby";
        const oldRoom = info.room;

        info.name = name;
        info.room = room;
        info.typing = false;

        const messages = await getMessages(room);

        send(ws, { type: "joined", name, room, messages });

        if (oldRoom !== room) updatePresence(oldRoom);
        updatePresence(room);
        return;
      }

      if (packet.type === "message") {
        const content = String(packet.content || "").trim();

        if (!content) return;

        if (content.length > 1000) {
          return send(ws, {
            type: "error",
            message: "Messages must be 1,000 characters or fewer."
          });
        }

        // Save the message to PostgreSQL before broadcasting it.
        const result = await pool.query(
          `INSERT INTO public.messages (username, room, message)
           VALUES ($1, $2, $3)
           RETURNING id, username, room, message, created_at`,
          [info.name, info.room, content]
        );

        const message = formatMessage(result.rows[0]);

        broadcast({ type: "message", message }, info.room);
        return;
      }

      if (packet.type === "typing") {
        info.typing = !!packet.isTyping;

        broadcast({
          type: "typing",
          name: info.name,
          isTyping: info.typing
        }, info.room);

        return;
      }

      if (packet.type === "switch-room") {
        const oldRoom = info.room;
        const room = ROOMS.has(packet.room) ? packet.room : "lobby";

        info.room = room;
        info.typing = false;

        const messages = await getMessages(room);

        send(ws, {
          type: "joined",
          name: info.name,
          room,
          messages
        });

        updatePresence(oldRoom);
        updatePresence(room);
      }
    } catch (error) {
      console.error("Chat/database operation failed:", error.message);

      send(ws, {
        type: "error",
        message: "The operation failed. Please try again."
      });
    }
  });

  ws.on("close", () => {
    const room = info.room;
    clients.delete(ws);
    updatePresence(room);

    broadcast({
      type: "typing",
      name: info.name,
      isTyping: false
    }, room);
  });

  ws.on("error", () => {});
});

server.listen(PORT, () => {
  console.log(`Relay Chat is running on port ${PORT}`);
});
