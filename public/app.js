
(() => {
  const $ = (id) => document.getElementById(id);

  const rooms = {
    lobby: "A friendly place to start a conversation.",
    technology: "Discuss tools, code, and new technology.",
    "project-help": "Ask questions and help each other build.",
    random: "Anything interesting goes here."
  };

  let name = "";
  let room = "lobby";
  let socket = null;
  let connected = false;
  let typingTimer = null;
  let reconnectTimer = null;
  let typingNames = new Set();

  const seen = new Set();

  function initials(value) {
    return (value || "G")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function setConnection(label, state = "") {
    $("connection").className = "connection " + state;
    $("connection").querySelector("span").textContent = label;
  }

  function send(packet) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(packet));
    }
  }

  function connect() {
    clearTimeout(reconnectTimer);

    const protocol =
      location.protocol === "https:" ? "wss:" : "ws:";

    setConnection("Connecting...", "");

    try {
      const currentSocket = new WebSocket(
        `${protocol}//${location.host}`
      );

      socket = currentSocket;

      currentSocket.addEventListener("open", () => {
        if (socket !== currentSocket) return;

        connected = true;

        // Updated connection status.
        setConnection("Live channel active", "connected");

        send({
          type: "join",
          name,
          room
        });

        updateComposer();
      });

      currentSocket.addEventListener("message", (event) => {
        if (socket !== currentSocket) return;

        let packet;

        try {
          packet = JSON.parse(event.data);
        } catch {
          return;
        }

        handlePacket(packet);
      });

      currentSocket.addEventListener("close", () => {
        if (socket !== currentSocket) return;

        connected = false;
        typingNames.clear();
        updateTyping("");
        updateComposer();

        setConnection("Reconnecting...", "error");

        reconnectTimer = setTimeout(connect, 2000);
      });

      currentSocket.addEventListener("error", () => {
        if (socket !== currentSocket) return;

        setConnection("Connection issue", "error");
      });
    } catch (error) {
      connected = false;
      updateComposer();
      setConnection("Connection issue", "error");

      reconnectTimer = setTimeout(connect, 2000);
    }
  }

  function handlePacket(packet) {
    if (packet.type === "joined") {
      room = packet.room;
      setRoomUI();

      $("messages").replaceChildren();
      seen.clear();

      const messages = packet.messages || [];
      messages.forEach(renderMessage);

      if (!messages.length) renderWelcome();

      updateTyping("");
      updateComposer();

    } else if (packet.type === "message") {
      if (packet.message && packet.message.room === room) {
        $("welcome")?.remove();
        renderMessage(packet.message);
      }

    } else if (packet.type === "presence") {
      renderPeople(packet.people || []);

    } else if (packet.type === "typing") {
      if (packet.name !== name) {
        if (packet.isTyping) {
          typingNames.add(packet.name);
        } else {
          typingNames.delete(packet.name);
        }

        updateTyping();
      }

    } else if (packet.type === "error") {
      showToast(packet.message || "Something went wrong.");
    }
  }

  function setRoomUI() {
    $("room-title").textContent = room;
    $("room-description").textContent = rooms[room] || "";
    $("about-title").textContent = room;

    $("about-copy").textContent =
      (rooms[room] || "") +
      " Messages are stored locally in this project.";

    $("message-input").placeholder = `Message #${room}…`;

    document.querySelectorAll(".room-link").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.room === room
      );
    });
  }

  function renderWelcome() {
    const messages = $("messages");
    messages.replaceChildren();

    const welcome = document.createElement("div");
    welcome.className = "welcome";
    welcome.id = "welcome";

    welcome.innerHTML = `
      <div class="welcome-icon">#</div>
      <p class="eyebrow">YOU FOUND YOUR PEOPLE</p>
      <h1>Every great idea<br>starts with <em>hello.</em></h1>
      <p>
        This room is a blank page. Start the conversation —
        your message appears instantly for everyone here.
      </p>
      <button id="say-hello" type="button">
        Say hello <span>↗</span>
      </button>
    `;

    messages.appendChild(welcome);

    $("say-hello").addEventListener("click", () => {
      $("message-input").value = "Hello everyone! 👋";
      updateComposer();
      $("message-input").focus();
    });
  }

  function renderMessage(message) {
    if (!message || seen.has(message.id)) return;

    seen.add(message.id);
    $("welcome")?.remove();

    const row = document.createElement("article");
    row.className =
      "message" + (message.name === name ? " mine" : "");

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = initials(message.name);

    const body = document.createElement("div");
    body.className = "message-body";

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const sender = document.createElement("span");
    sender.className = "message-name";
    sender.textContent = message.name || "Guest";

    const time = document.createElement("time");
    time.className = "message-time";

    const date = new Date(message.createdAt || Date.now());

    time.dateTime = date.toISOString();
    time.textContent = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = message.content || "";

    meta.append(sender, time);
    body.append(meta, content);
    row.append(avatar, body);

    $("messages").appendChild(row);
    $("messages").scrollTop = $("messages").scrollHeight;
  }

  function renderPeople(people) {
    $("people-count").textContent = people.length;

    const list = $("people-list");
    list.replaceChildren();

    if (!people.length) {
      const empty = document.createElement("p");
      empty.className = "empty-people";
      empty.textContent =
        "You're early. Others will appear here when they join.";

      list.appendChild(empty);
      return;
    }

    people.forEach((person) => {
      const row = document.createElement("div");
      row.className = "person";

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = initials(person.name);

      const copy = document.createElement("div");
      copy.textContent = person.name;

      const status = document.createElement("small");
      status.textContent =
        person.name === name ? "You · online" : "Online now";

      copy.appendChild(status);
      row.append(avatar, copy);
      list.appendChild(row);
    });
  }

  function updateTyping(custom) {
    const label = $("typing-text");

    if (custom) {
      label.textContent = custom;
    } else if (!typingNames.size) {
      $("typing").hidden = true;
      return;
    } else {
      const names = Array.from(typingNames).slice(0, 2);

      label.textContent =
        `${names.join(", ")} ` +
        `${typingNames.size === 1 ? "is" : "are"} typing`;
    }

    $("typing").hidden = false;
  }

  function updateComposer() {
    const input = $("message-input");

    $("char-count").textContent =
      `${input.value.length} / 1000`;

    $("send-button").disabled =
      !input.value.trim() || !connected;

    input.style.height = "auto";
    input.style.height =
      Math.min(input.scrollHeight, 150) + "px";
  }

  // Join workspace.
  $("join-form").addEventListener("submit", (event) => {
    event.preventDefault();

    name = $("display-name").value
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 24);

    if (!name) return;

    $("login-overlay").hidden = true;
    $("profile-name").textContent = name;
    $("profile-avatar").textContent = initials(name);

    connect();
  });

  // Switch rooms.
  document.querySelectorAll(".room-link").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.room === room) return;

      typingNames.clear();
      updateTyping("");

      send({
        type: "switch-room",
        room: button.dataset.room
      });
    });
  });

  // Send messages.
  $("message-form").addEventListener("submit", (event) => {
    event.preventDefault();

    const input = $("message-input");
    const content = input.value.trim();

    if (!content || !connected) return;

    send({
      type: "message",
      content
    });

    input.value = "";
    updateComposer();

    send({
      type: "typing",
      isTyping: false
    });
  });

  // Typing indicator.
  $("message-input").addEventListener("input", () => {
    updateComposer();

    send({
      type: "typing",
      isTyping: !!$("message-input").value.trim()
    });

    clearTimeout(typingTimer);

    typingTimer = setTimeout(() => {
      send({
        type: "typing",
        isTyping: false
      });
    }, 1200);
  });

  // Enter sends; Shift + Enter creates a new line.
  $("message-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("message-form").requestSubmit();
    }
  });

  // Change display name.
  $("change-name").addEventListener("click", () => {
    const next = prompt("Enter your display name", name);

    if (!next || !next.trim()) return;

    name = next.trim()
      .replace(/\s+/g, " ")
      .slice(0, 24);

    $("profile-name").textContent = name;
    $("profile-avatar").textContent = initials(name);

    send({
      type: "join",
      name,
      room
    });
  });

  $("dismiss-announcement").addEventListener("click", () => {
    $("announcement").remove();
  });

  $("message-tip").addEventListener("click", () => {
    showToast(
      "Be kind, stay curious, and keep messages under 1,000 characters."
    );
  });

  $("display-name").focus();
  setConnection("Not connected", "");
  updateComposer();
})();
