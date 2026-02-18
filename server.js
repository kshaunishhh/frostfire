const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// ===== GAME STATE =====
let roles = {
  fire: null,
  ice: null
};

let currentTurn = "fire";
let winCount = {}; // { socketId: number }

// ===== CONNECTION =====
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // initialize win counter for this user
  winCount[socket.id] = winCount[socket.id] || 0;

  // ===== ROLE SELECTION =====
  socket.on("chooseRole", (role) => {
    if (role !== "fire" && role !== "ice") return;

    if (!roles[role]) {
      roles[role] = socket.id;
      socket.emit("roleAssigned", role);
      io.emit("rolesUpdate", roles);
    } else {
      socket.emit("roleTaken");
    }
  });

  // ===== MOVE HANDLING =====
  socket.on("move", ({ row, col, player }) => {
    // validate turn
    if (player !== currentTurn) return;

    // validate player owns this role
    if (roles[player] !== socket.id) return;

    currentTurn = currentTurn === "fire" ? "ice" : "fire";

    io.emit("syncMove", { row, col, player });
  });

  // ===== WIN TRACKING =====
  socket.on("gameWon", (winnerId) => {
    if (winCount[winnerId] !== undefined) {
      winCount[winnerId]++;
      io.emit("updateScore", winCount);
    }

    // reset turn after game ends
    currentTurn = "fire";
  });

  // ===== RESET GAME =====
  socket.on("resetGame", () => {
    currentTurn = "fire";
    io.emit("resetGame");
  });

  // ===== DISCONNECT =====
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    if (roles.fire === socket.id) roles.fire = null;
    if (roles.ice === socket.id) roles.ice = null;

    delete winCount[socket.id];

    currentTurn = "fire";

    io.emit("rolesUpdate", roles);
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
