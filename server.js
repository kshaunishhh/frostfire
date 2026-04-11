const express = require("express");
const mongoose = require("mongoose");
const User = require("./models/User");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.set("trust proxy",1)
const server = http.createServer(app);
const io = new Server(server);
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));


app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://frostfire.onrender.com/auth/google/callback"
},
(accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.use(express.static(__dirname));

app.get("/auth/me", (req, res) => {
  if (req.user) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ user: null });
  }
});

app.get("/", (req, res) => {
  res.send("Server is alive 🚀");
});

app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/");
  }
);

// ===== GAME STATE =====
let rooms = {}; // { roomId: { players, currentTurn, rematchRequests } }

function findOpponent(room, id) {
  if (room.players.fire === id) return room.players.ice;
  if (room.players.ice === id) return room.players.fire;
  return null;
}

// ===== CONNECTION =====
io.on("connection", (socket) => {
  let roomId = null;

  socket.on("rematchRequest", () => {
  const room = rooms[roomId];
if (!room) return;

room.rematchRequests[socket.id] = true;

const opponent = findOpponent(room, socket.id);
if (!opponent) return;

if (room.rematchRequests[opponent]) {
  room.currentTurn = "fire";

  io.to(roomId).emit("startRematch");

  room.rematchRequests = {}; // 🔥 reset properly
}
});

  console.log("User connected:", socket.id);

  // ===== ROLE SELECTION =====
  socket.on("chooseRole", (role) => {
    if (role !== "fire" && role !== "ice") return;

  // find available room
  for (let id in rooms) {
    const room = rooms[id];
    if (!room.players[role]) {
      roomId = id;
      break;
    }
  }

  // if no room → create one
  if (!roomId) {
    roomId = "room_" + socket.id;
    rooms[roomId] = {
  players: { fire: null, ice: null },
  currentTurn: "fire",
  rematchRequests: {},
  grid: Array(6).fill().map(() =>
    Array(6).fill().map(() => ({ count: 0, owner: null }))
  )
};
  }

  const room = rooms[roomId];

  if (room.players.fire && room.players.ice) {
    socket.emit("roomFull");
    return;
  }

  if (!room.players[role]) {
    room.players[role] = socket.id;
    socket.join(roomId);
    socket.emit("roleAssigned", role);
  } else {
    socket.emit("roleTaken");
  }
  });

  // ===== MOVE HANDLING =====
socket.on("move", ({ row, col, player }) => {

  const room = rooms[roomId];
  if (!room) return;

  // ❌ invalid cell
  if (row < 0 || row >= 6 || col < 0 || col >= 6) return;

  // ❌ not your turn
  if (player !== room.currentTurn) return;

  // ❌ wrong player
  if (room.players[player] !== socket.id) return;

  if (!room.grid[row] || !room.grid[row][col]) return;

  const cell = room.grid[row][col];

  // ❌ enemy cell click
  if (cell.owner && cell.owner !== player) return;

  // ✅ update
  cell.owner = player;
  cell.count++;

  // ✅ switch turn
  room.currentTurn = room.currentTurn === "fire" ? "ice" : "fire";

  io.to(roomId).emit("syncMove", {
    row,
    col,
    player,
    nextTurn: room.currentTurn
  });
});

  // ===== WIN TRACKING =====
  socket.on("gameWon", async () => {

  const room = rooms[roomId];
if (!room) return;

const opponentId = findOpponent(room, socket.id);
if (!opponentId) return;
  if (!socket.request.user) return;

    const winner = await User.findOne({ googleId: socket.request.user?.id });

    if (winner) {
      winner.totalWins++;

      const match = winner.matches.find(m => m.opponentId === opponentId);

      let vsWins = 0;

        if (match) {
          match.wins++;
          vsWins = match.wins;
        } else {
          winner.matches.push({ opponentId, wins: 1 });
          vsWins = 1;
        }

        await winner.save();

        socket.emit("playerStats", {
          totalWins: winner.totalWins,
          vsOpponentWins: vsWins
  });
      
    
    }
    


    // reset turn after game ends
if (room) room.currentTurn = "fire";
  });

  // ===== RESET GAME =====
  socket.on("resetGame", () => {
    const room = rooms[roomId];
if (room) room.currentTurn = "fire";
    io.to(roomId).emit("resetGame");
  });

  // ===== DISCONNECT =====
  socket.on("disconnect", () => {
    const room = rooms[roomId];
if (!room) return;

if (room.players.fire === socket.id) room.players.fire = null;
if (room.players.ice === socket.id) room.players.ice = null;

// delete empty room
if (!room.players.fire && !room.players.ice) {
  delete rooms[roomId];
  }
});

});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
