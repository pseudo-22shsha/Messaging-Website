/***********************
 *  CONFIG / CONSTANTS
 ***********************/
const OWNER_CODE = "owner22shasha";
const OWNER_PASSWORD = "elishamay22";

// 10 guest codes (you provided these)
const GUEST_CODES = [
  "1098630272",
  "7930752794",
  "1865390265",
  "3864962946",
  "3862847274",
  "4826549793",
  "8653986390",
  "0098265839",
  "8375290406",
  "9652975390"
];

// ----- Your Firebase config (you gave this) -----
// I added a reasonable Realtime DB URL using your project id (if your DB uses different url
// edit the databaseURL below to the correct one in this file).
const firebaseConfig = {
  apiKey: "AIzaSyB24xX3U2wItMaRQPoM48UVJrfHSlqXyd0",
  authDomain: "msgweb-9c933.firebaseapp.com",
  projectId: "msgweb-9c933",
  storageBucket: "msgweb-9c933.firebasestorage.app",
  messagingSenderId: "423078226035",
  appId: "1:423078226035:web:c682ffc7f547e233a46206",
  databaseURL: "https://msgweb-9c933-default-rtdb.firebaseio.com" // if different, change this
};

// Initialize Firebase (compat)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/***********************
 *  DOM REFERENCES
 ***********************/
const authScreen = document.getElementById("auth-screen");
const nameScreen = document.getElementById("name-screen");
const ownerScreen = document.getElementById("owner-screen");
const chatScreen = document.getElementById("chat-screen");

const accessCodeEl = document.getElementById("access-code");
const accessBtn = document.getElementById("access-btn");
const ownerPasswordRow = document.getElementById("owner-password-row");
const ownerPassInput = document.getElementById("owner-password");
const ownerPassBtn = document.getElementById("owner-pass-btn");
const authError = document.getElementById("auth-error");

const displayNameEl = document.getElementById("display-name");
const nameBtn = document.getElementById("name-btn");
const nameBackBtn = document.getElementById("name-back");

const roomListEl = document.getElementById("room-list");
const ownerLogoutBtn = document.getElementById("owner-logout");

const chatTitleEl = document.getElementById("chat-title");
const messagesEl = document.getElementById("messages");
const messageInputEl = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const chatExitBtn = document.getElementById("chat-exit");

/***********************
 *  STATE
 ***********************/
let isOwner = false;
let currentRoom = null;    // room id = for guests we use their access code; for owner we pick rooms
let currentName = null;
let roomsMetaWatcher = null;
let messagesWatcher = null;
let roomsCache = {}; // local cache of room meta

/***********************
 *  UTIL
 ***********************/
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }
function now() { return Date.now(); }
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
}

/***********************
 *  NOTIFICATIONS
 ***********************/
function askNotificationPermission() {
  if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission().catch(()=>{});
  }
}
function notify(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body: body, renotify: true });
  }
}

/***********************
 *  AUTH FLOW
 ***********************/
accessBtn.addEventListener("click", () => {
  authError.textContent = "";
  const code = (accessCodeEl.value || "").trim();

  if (code === OWNER_CODE) {
    // Hide normal access code input/button, show owner password input
    accessCodeEl.style.display = "none";
    accessBtn.style.display = "none";
    ownerPasswordRow.style.display = "flex";
    ownerPassInput.focus();
    return;
  }

  if (GUEST_CODES.includes(code)) {
    // guest — room = code
    isOwner = false;
    currentRoom = code; // guests will use their access code as room id
    localStorage.setItem("role", "guest");
    localStorage.setItem("room", currentRoom);
    hide(authScreen);
    show(nameScreen);
    // if we have a stored name for this room, auto-fill
    const savedName = localStorage.getItem("name_" + currentRoom);
    if (savedName) displayNameEl.value = savedName;
    return;
  }

  authError.textContent = "Invalid access code.";
});

ownerPassBtn.addEventListener("click", () => {
  const pass = (ownerPassInput.value || "").trim();
  if (pass === OWNER_PASSWORD) {
    isOwner = true;
    currentRoom = null;
    localStorage.setItem("role", "owner");
    hide(authScreen);
    show(ownerScreen);
    askNotificationPermission();
    startOwnerRoomWatcher();
  } else {
    authError.textContent = "Invalid password.";
  }
});

nameBackBtn.addEventListener("click", () => {
  // go back to auth
  hide(nameScreen);
  show(authScreen);
});

/***********************
 *  GUEST: SET NAME / JOIN
 ***********************/
nameBtn.addEventListener("click", () => {
  const name = (displayNameEl.value || "").trim();
  if (!name) return;
  currentName = name;
  localStorage.setItem("name", name);
  if (currentRoom) localStorage.setItem("name_" + currentRoom, name);

  // set room meta (name if first time)
  const metaRef = db.ref(`rooms/${currentRoom}/meta`);
  metaRef.update({
    name: currentName,
    lastMessageAt: roomsCache[currentRoom]?.lastMessageAt || 0,
    ownerLastOpened: roomsCache[currentRoom]?.ownerLastOpened || 0
  }).catch(()=>{});
  hide(nameScreen);
  showChatFor(currentRoom, currentName, false);
});

/***********************
 *  OWNER: ROOMS LIST + UNREAD
 ***********************/
function startOwnerRoomWatcher() {
  // listen for rooms metadata changes
  const roomsRef = db.ref("rooms");
  // unsub any previous
  if (roomsMetaWatcher) roomsRef.off("value", roomsMetaWatcher);
  roomsMetaWatcher = roomsRef.on("value", snapshot => {
    roomListEl.innerHTML = "";
    roomsCache = {};
    snapshot.forEach(roomSnap => {
      const roomId = roomSnap.key;
      const meta = roomSnap.child("meta").val() || {};
      roomsCache[roomId] = meta;
      const li = document.createElement("li");
      li.className = "room";
      const left = document.createElement("div");
      left.className = "left";
      const nameSpan = document.createElement("div");
      nameSpan.className = "name";
      nameSpan.textContent = meta.name || roomId;
      left.appendChild(nameSpan);

      const right = document.createElement("div");
      right.className = "right";

      // unread badge if lastMessageAt > ownerLastOpened
      const last = meta.lastMessageAt || 0;
      const ownerOpened = meta.ownerLastOpened || 0;
      if (last > ownerOpened) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "new";
        right.appendChild(badge);
      }

      li.appendChild(left);
      li.appendChild(right);

      li.addEventListener("click", () => {
        hide(ownerScreen);
        isOwner = true;
        showChatFor(roomId, "Owner", true);
        // mark owner opened
        db.ref(`rooms/${roomId}/meta/ownerLastOpened`).set(now());
      });

      roomListEl.appendChild(li);
    });
  });
}

ownerLogoutBtn.addEventListener("click", () => {
  isOwner = false;
  localStorage.removeItem("role");
  hide(ownerScreen);
  show(authScreen);
});

/***********************
 *  CHAT: open, send, receive
 ***********************/
function showChatFor(roomId, displayName, asOwner) {
  currentRoom = roomId;
  currentName = displayName;
  isOwner = !!asOwner;
  chatTitleEl.textContent = (asOwner ? "Chat with: " : "Chat room: ") + (roomsCache[roomId]?.name || roomId);
  show(chatScreen);
  messagesEl.innerHTML = "";
  askNotificationPermission();

  // mark owner last opened if owner
  if (asOwner) {
    db.ref(`rooms/${roomId}/meta/ownerLastOpened`).set(now()).catch(()=>{});
  }

  // detach previous listener
  if (messagesWatcher) {
    const prevRef = db.ref(`rooms/${messagesWatcher.room}/messages`);
    prevRef.off("child_added", messagesWatcher.fn);
    messagesWatcher = null;
  }

  // listen for messages
  const messagesRef = db.ref(`rooms/${roomId}/messages`);
  const onChildAdded = (snap) => {
    const msg = snap.val();
    appendMessageToUI(msg);
    // if the new message belongs to someone else, and they are away, notify
    const isOwn = (msg.sender === currentName) || (isOwner && msg.sender === "Owner");
    const visibleRoom = (currentRoom === roomId);
    if (!isOwn && (!document.hasFocus() || !visibleRoom)) {
      // Owner: show badge in room list (handled by meta update)
      notify(msg.sender, msg.text);
    }
  };
  messagesRef.on("child_added", onChildAdded);
  messagesWatcher = { room: roomId, fn: onChildAdded };

  // ensure meta.lastMessageAt exists
  db.ref(`rooms/${roomId}/meta/lastMessageAt`).once("value").then(()=>{}).catch(()=>{});
}

function appendMessageToUI(msg) {
  const div = document.createElement("div");
  div.className = "message";
  if ( (msg.sender === currentName) || (isOwner && msg.sender === "Owner") ) div.classList.add("me");
  const content = document.createElement("div");
  content.innerHTML = `<strong>${msg.sender}:</strong> ${escapeHtml(msg.text)}`;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = formatTime(msg.timestamp || now());
  div.appendChild(content);
  div.appendChild(meta);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

sendBtn.addEventListener("click", () => {
  const text = (messageInputEl.value || "").trim();
  if (!text || !currentRoom) return;
  const sender = isOwner ? "Owner" : (currentName || "Guest");
  const ts = now();
  const msgRef = db.ref(`rooms/${currentRoom}/messages`).push();
  msgRef.set({
    sender: sender,
    text: text,
    timestamp: ts
  }).then(() => {
    // update lastMessageAt
    db.ref(`rooms/${currentRoom}/meta/lastMessageAt`).set(ts);
    // if owner isn't viewing this room, leave unread badge (owner checks it)
    messageInputEl.value = "";
  }).catch(err => {
    console.error("send err", err);
  });
});

// helper to escape simple HTML
function escapeHtml(s){ return String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/***********************
 *  ROOM CREATION: ensure meta exists for guest
 ***********************/
function ensureRoomMetaForGuest(roomId, name) {
  const metaRef = db.ref(`rooms/${roomId}/meta`);
  metaRef.once("value").then(snap => {
    const val = snap.val();
    if (!val || !val.name) {
      metaRef.set({
        name: name || roomId,
        lastMessageAt: 0,
        ownerLastOpened: 0
      }).catch(()=>{});
    }
  });
}

/***********************
 *  REJOIN ON LOAD
 ***********************/
window.addEventListener("load", () => {
  askNotificationPermission();

  const savedRole = localStorage.getItem("role");
  const savedRoom = localStorage.getItem("room");
  if (savedRole === "owner") {
    // owner persisted
    isOwner = true;
    hide(authScreen);
    show(ownerScreen);
    startOwnerRoomWatcher();
    return;
  }

  // guest persisted?
  if (savedRole === "guest" && savedRoom) {
    const savedName = localStorage.getItem("name_" + savedRoom) || localStorage.getItem("name");
    if (savedName) {
      currentName = savedName;
      currentRoom = savedRoom;
      // make sure meta exists
      ensureRoomMetaForGuest(currentRoom, currentName);
      hide(authScreen);
      showChatFor(currentRoom, currentName, false);
      return;
    } else {
      // room saved but name missing -> show name screen
      currentRoom = savedRoom;
      hide(authScreen);
      show(nameScreen);
      return;
    }
  }
});

/***********************
 *  ROOM EXIT / OWNER BACK
 ***********************/
chatExitBtn.addEventListener("click", () => {
  // stop listening to messages for this room
  if (messagesWatcher) {
    db.ref(`rooms/${messagesWatcher.room}/messages`).off("child_added", messagesWatcher.fn);
    messagesWatcher = null;
  }
  hide(chatScreen);
  if (isOwner) {
    show(ownerScreen);
  } else {
    // guest returns to name screen (to rejoin or exit)
    show(nameScreen);
  }
});

/***********************
 *  Owner: update meta when new messages arrive so unread works
 ***********************/
// Watch messages across rooms to update each room meta's lastMessageAt
db.ref("rooms").on("child_added", snap => {
  // ensure meta exists
  const metaRef = db.ref(`rooms/${snap.key}/meta`);
  metaRef.once("value").then(mv => {
    if (!mv.exists()) {
      metaRef.set({ name: snap.key, lastMessageAt: 0, ownerLastOpened: 0 }).catch(()=>{});
    }
  });
});

// track new messages to update meta.lastMessageAt automatically (if not set by sender)
db.ref("rooms").on("child_changed", snap => {
  // nothing by default — messages update handler below will set lastMessageAt on send via sendBtn
});

// Also ensure that when messages are pushed (even externally), lastMessageAt is updated.
// We'll attach listener per room when owner loads the rooms list (above) OR when a guest creates.
// But to be safe, listen to every room's messages->child_added and set lastMessageAt
db.ref("rooms").on("child_added", roomSnap => {
  const roomId = roomSnap.key;
  const messagesRef = db.ref(`rooms/${roomId}/messages`);
  messagesRef.on("child_added", ms => {
    const msg = ms.val();
    if (msg && msg.timestamp) {
      db.ref(`rooms/${roomId}/meta/lastMessageAt`).set(msg.timestamp).catch(()=>{});
    }
  });
});

/***********************
 *  Helpers: create room when guest code first used
 ***********************/
accessBtn.addEventListener("click", () => {
  const code = (accessCodeEl.value || "").trim();
  if (GUEST_CODES.includes(code)) {
    // create room meta if not exists
    const metaRef = db.ref(`rooms/${code}/meta`);
    metaRef.once("value").then(snap => {
      if (!snap.exists()) {
        metaRef.set({ name: code, lastMessageAt: 0, ownerLastOpened: 0 }).catch(()=>{});
      }
    });
    localStorage.setItem("room", code);
  }
});

/***********************
 *  Small UX niceties
 ***********************/
// allow pressing Enter on inputs
[accessCodeEl, ownerPassInput].forEach(el => {
  el.addEventListener("keyup", e => { if (e.key === "Enter") accessBtn.click(); });
});
ownerPassInput.addEventListener("keyup", e => { if (e.key === "Enter") ownerPassBtn.click(); });
displayNameEl.addEventListener("keyup", e => { if (e.key === "Enter") nameBtn.click(); });
messageInputEl.addEventListener("keyup", e => { if (e.key === "Enter") sendBtn.click(); });

// small focus
accessCodeEl.focus();