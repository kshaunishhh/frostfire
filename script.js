window.onload = () => {
  showScreen(loginScreen);
};

const guestBtn = document.getElementById("guestBtn");
const googleBtn = document.getElementById("googleBtn");

const loginScreen = document.getElementById("loginScreen");
const menuScreen = document.getElementById("menuScreen");
const gameScreen = document.getElementById("gameScreen");

function showScreen(screen) {
  loginScreen.classList.add("hidden");
  menuScreen.classList.add("hidden");
  gameScreen.classList.add("hidden");

  screen.classList.remove("hidden");
}
let user = null;
fetch("/auth/me")
  .then(res => {
    if (!res.ok) throw new Error();
    return res.json();
  })
  .then(data => {
    user = data.user;
    showScreen(menuScreen);
  })

    // document.getElementById("googleBtn").style.display = "none";
    // document.getElementById("guestBtn").textContent = "Continue";
    // document.getElementById("guestBtn").onclick = startGame;

  .catch(() => {
    // console.log("Not logged in");
    showScreen(loginScreen);
  });
fetch("/")
  .then(() => console.log("Server warm"))
  .catch(() => {});
  const socket = io({
  reconnection: true,
  reconnectionAttempts: 5,
});


guestBtn.onclick = () => {
  user = {
    id: "guest_" + Math.random(),
    name: "Guest"
  };

  showScreen(menuScreen);
};
googleBtn.onclick = () => {
  window.location.href = "/auth/google";
};
const roleSelect = document.getElementById("roleSelect");
const chooseFire = document.getElementById("chooseFire");
const chooseIce = document.getElementById("chooseIce");

let myId = null;
let myRole = null;
let onlineMode = false;
let winStats = {};

// ================= DOM ELEMENTS =================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

//const menu = document.getElementById("menu");
const turnDisplay = document.getElementById("turn");

const winModal = document.getElementById("winModal");
const winnerText = document.getElementById("winnerText");

const offlineBtn = document.getElementById("offlineBtn");
const onlineBtn = document.getElementById("onlineBtn");
const playAgainBtn = document.getElementById("playAgainBtn");
const mainMenuBtn = document.getElementById("mainMenuBtn");

// ================= GAME CONSTANTS =================
const SIZE = 6;

// ================= GAME STATE =================
let CELL;
let currentPlayer = "fire";
let grid = [];
let movingBalls = [];
let rotationAngle = 0;
let movesPlayed = 0;
let gameOver = false;



// ================= MENU BUTTONS =================
offlineBtn.onclick = () => {
  onlineMode = false;

  showScreen(gameScreen);

  resetGame();
  resizeCanvas();
};

onlineBtn.onclick = () => {
  onlineMode = true;
  roleSelect.classList.remove("hidden");
};

chooseFire.onclick = () => {
  socket.emit("chooseRole", "fire");
};

chooseIce.onclick = () => {
  socket.emit("chooseRole", "ice");
};


socket.on("roleAssigned", (role) => {
  myRole = role;
  roleSelect.classList.add("hidden");
  showScreen(gameScreen);
  resetGame();
  resizeCanvas();
});

socket.on("roleTaken", () => {
  alert("Role already taken!");
});

socket.on("roomFull", () => {
  alert("Room is full.");
});

socket.on("syncMove", ({ row, col, player, nextTurn, grid: serverGrid }) => {

  // 🔥 REPLACE LOCAL GRID WITH SERVER GRID
  grid = JSON.parse(JSON.stringify(serverGrid));

  // optional: clear animations
  movingBalls = [];

  movesPlayed++;

  currentPlayer = nextTurn;
  updateBoardGlow();
  updateTurnUI();
});

socket.on("gameOver", (winner) => {
  if (winner === "fire") {
    endGame("🔥 Fire Wins!");
  } else {
    endGame("❄ Ice Wins!");
  }
});

socket.on("updateScore", (scores) => {
  winStats = scores;
  updateScoreBoard();
  console.log("Win Stats:", winStats);
});

socket.on("playerStats", (data) => {
document.getElementById("scoreBoard").textContent =
  `Total Wins: ${data.totalWins} | Vs Opponent: ${data.vsOpponentWins}`;
});


socket.on("resetGame", () => {
  resetGame();
});

socket.on("startRematch", () => {
  resetGame();
});

playAgainBtn.onclick = () => {
  winModal.classList.add("hidden");
  resetGame();
};

document.getElementById("rematchBtn").onclick = () => {
  socket.emit("rematchRequest");
};

mainMenuBtn.onclick = () => {
  winModal.classList.add("hidden");
  showScreen(menuScreen);
  // canvas.style.display = "none";
  // menu.style.display = "flex";
};

// ================= INITIALIZATION =================

function initGrid() {
  for (let r = 0; r < SIZE; r++) {
    grid[r] = [];
    for (let c = 0; c < SIZE; c++) {
      grid[r][c] = { count: 0, owner: null };
    }
  }
}

function resizeCanvas() {
  const size = canvas.clientWidth;

  canvas.width = size;
  canvas.height = size;

  CELL = canvas.width / SIZE;
}


// function startGame() {
//   menu.style.display = "none";
//   canvas.style.display = "block";

//   resetGame();
// }

function resetGame() {
  gameOver = false;
  movesPlayed = 0;
  currentPlayer = "fire";
  movingBalls = [];
  initGrid();
  winModal.classList.add("hidden");
  updateBoardGlow();
  updateTurnUI();
}


// ================= CLICK HANDLER =================
canvas.addEventListener("click", (e) => {
  if (gameOver) return;
  if (movingBalls.length > 0) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const row = Math.floor(y / CELL);
const col = Math.floor(x / CELL);

// ✅ FIRST check bounds
if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return;

if (onlineMode) {
  if (!myRole) return;
  if (myRole !== currentPlayer) return;

  socket.emit("move", {
    row,
    col,
    player: myRole
  });

  return;
}
  const cell = grid[row][col];

  if (cell.owner && cell.owner !== currentPlayer) return;

  addEnergy(row, col, currentPlayer);
  movesPlayed++;
  switchTurn();
});

window.addEventListener("resize", () => {
  resizeCanvas();
});


// ================= GAME LOGIC =================
function addEnergy(row, col, player) {
  if (gameOver) return; // ADD THIS LINE

  if (!grid[row] || !grid[row][col]) return;
  const cell = grid[row][col];
  cell.count++;
  cell.owner = player;

  if (cell.count >= criticalMass(row, col)) {
    explode(row, col, player);
  }
}

function criticalMass(r, c) {
  let n = 4;
  if (r === 0 || r === SIZE - 1) n--;
  if (c === 0 || c === SIZE - 1) n--;
  return n;
}

function updateScoreBoard() {
  const scoreBoard = document.getElementById("scoreBoard");
  if (!onlineMode) return;

  scoreBoard.textContent =
    `Your Wins: ${winStats[socket.id] || 0}`;
}

function updateTurnUI() {
  turnDisplay.textContent =
    currentPlayer === "fire" ? "🔥 Fire Turn" : "❄ Ice Turn";
}

function explode(row, col, player) {
  const cx = col * CELL + CELL / 2;
  const cy = row * CELL + CELL / 2;

  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 }
  ];

  dirs.forEach(d => {
    movingBalls.push({
      x: cx,
      y: cy,
      vx: d.dx * 6,
      vy: d.dy * 6,
      targetRow: row + d.dy,
      targetCol: col + d.dx,
      player
    });
  });

  grid[row][col].count = 0;
  grid[row][col].owner = null;
}

function updateBalls() {
  for (let i = movingBalls.length - 1; i >= 0; i--) {
    const b = movingBalls[i];
    b.x += b.vx;
    b.y += b.vy;

    const targetX = b.targetCol * CELL + CELL / 2;
    const targetY = b.targetRow * CELL + CELL / 2;

    if (Math.abs(b.x - targetX) < 5 && Math.abs(b.y - targetY) < 5) {

  // 🚨 STOP energy transfer if game ended
  if (!gameOver) {
    if (
      b.targetRow >= 0 &&
      b.targetRow < SIZE &&
      b.targetCol >= 0 &&
      b.targetCol < SIZE
    ) {
      addEnergy(b.targetRow, b.targetCol, b.player);
    }
  }

  movingBalls.splice(i, 1);
}
  }

  if (movingBalls.length === 0 && !gameOver && movesPlayed > 1) {
    
  }
}

// function checkWin() {
//   if (movesPlayed < 2) return;

//   let fire = 0;
//   let ice = 0;

//   for (let r = 0; r < SIZE; r++) {
//     for (let c = 0; c < SIZE; c++) {
//       if (grid[r][c].owner === "fire") fire++;
//       if (grid[r][c].owner === "ice") ice++;
//     }
//   }

//   if (fire > 0 && ice === 0) endGame("🔥 Fire Wins!");
//   if (ice > 0 && fire === 0) endGame("❄ Ice Wins!");
// }

function endGame(text) {
  gameOver = true;
  movingBalls.length = 0;

  winnerText.textContent = text;
  winnerText.style.color =
    text.includes("Fire") ? "#ff4500" : "#00cfff";

  winModal.classList.remove("hidden");

  if (onlineMode && myRole) {
    if (
      (text.includes("Fire") && myRole === "fire") ||
      (text.includes("Ice") && myRole === "ice")
    ) {
      
    }
  }
}


function switchTurn() {
  currentPlayer = currentPlayer === "fire" ? "ice" : "fire";
  updateBoardGlow();
}

function updateBoardGlow() {
  canvas.style.transition = "box-shadow 0.3s ease";

  if (currentPlayer === "fire") {
    canvas.style.boxShadow = `
      0 0 30px rgba(0,0,0,0.6),
      0 0 35px rgba(255, 69, 0, 0.6)
    `;
  } else {
    canvas.style.boxShadow = `
      0 0 30px rgba(0,0,0,0.6),
      0 0 35px rgba(0, 207, 255, 0.6)
    `;
  }
}



// ================= DRAWING =================
function drawGrid() {
  let lineColor =
    currentPlayer === "fire"
      ? "rgba(255, 69, 0, 0.6)"
      : "rgba(0, 207, 255, 0.6)";

  ctx.shadowBlur = 8;
  ctx.shadowColor = lineColor;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;

  for (let i = 0; i <= SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL, 0);
    ctx.lineTo(i * CELL, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i * CELL);
    ctx.lineTo(canvas.width, i * CELL);
    ctx.stroke();
  }

  ctx.shadowBlur = 0; // IMPORTANT reset
}


function drawStaticBalls() {
  rotationAngle %= Math.PI * 2;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = grid[r][c];
      if (!cell.owner) continue;

      const cx = c * CELL + CELL / 2;
      const cy = r * CELL + CELL / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotationAngle);

      const ballRadius = 12;
      const orbitRadius = 9;

      for (let i = 0; i < cell.count; i++) {
        const angle = (Math.PI * 2 / cell.count) * i;
        const x = Math.cos(angle) * orbitRadius;
        const y = Math.sin(angle) * orbitRadius;

        ctx.beginPath();
        ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
        ctx.fillStyle =
          cell.owner === "fire" ? "#ff4500" : "#00cfff";
        ctx.shadowBlur = 15;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    }
  }
}

function drawMovingBalls() {
  movingBalls.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 12, 0, Math.PI * 2);
    ctx.fillStyle =
      b.player === "fire" ? "#ff4500" : "#00cfff";
    ctx.shadowBlur = 20;
    ctx.shadowColor = ctx.fillStyle;
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  drawStaticBalls();

  if (!gameOver) {
    updateBalls();
  }

  drawMovingBalls();

  requestAnimationFrame(loop);
}

initGrid();
resizeCanvas();
loop();

// async function waitForServer() {
//   let ready = false;

//   while (!ready) {
//     try {
//       await fetch("/");
//       ready = true;
//     } catch {
//       await new Promise(r => setTimeout(r, 1000));
//     }
//   }

//   document.getElementById("loadingScreen").style.display = "none";
// }

// waitForServer();