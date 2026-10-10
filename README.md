# Relay — Real-Time Chat Application

A local, multi-room chat application built with **HTML, CSS, JavaScript, Node.js, Express, and native WebSockets (`ws`)**. It is intended for learning and demonstration in VS Code.

## Features

- Instant messages using a WebSocket connection (no page refresh)
- Four rooms: `lobby`, `technology`, `project-help`, and `random`
- Message history stored in `data/messages.json`
- Online members list for each room
- Typing indicators
- Responsive layout for desktop and mobile
- Empty initial state — no fake messages or activity counts
- Messages limited to 1,000 characters

## Requirements

Install **Node.js LTS** from https://nodejs.org/. npm is included with Node.js.

## Run in VS Code

1. Extract the ZIP file.
2. Open the extracted `real_time_chat_vscode` folder in VS Code.
3. Open **Terminal → New Terminal**.
4. Install dependencies:

   ```bash
   npm install
   ```

5. Start the server:

   ```bash
   npm start
   ```

6. Open http://localhost:3000 in your browser.
7. Enter a display name and start chatting. Open the same URL in a second browser tab (or another device on the same network using your computer's local IP) to test instant messages between users.

For automatic server restart while developing, use `npm run dev`.

## Project structure

```text
real_time_chat_vscode/
├── server.js
├── package.json
├── README.md
├── .gitignore
├── data/
│   └── messages.json
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## How it works

1. The browser opens a WebSocket connection to the Node.js server.
2. The user joins a room and receives that room's latest messages.
3. When someone sends a message, the server saves it to JSON and broadcasts it to all connected users in that room.
4. Presence and typing updates are sent over the same WebSocket connection.

## Important project-review note

This is a classroom/demo application. It uses display names rather than secure user accounts, and anyone who can access the app can read room messages. Do not expose it publicly or use it for private conversations without adding real authentication, authorization, validation, and production-grade storage.
