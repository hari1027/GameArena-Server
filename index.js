require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const supabase = require("./supabase");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const {
  bindFiveAliveEngineEvents,
  registerFiveAliveGameSockets,
} = require("./sockets/fiveAliveGameSocket");
const {
  startFiveAliveGame,
  setFiveAliveGame,
  endFiveAliveGame,
  getFiveAliveGame,
} = require("./managers/fiveAliveGameManager");

const {
  bindFourCardChallengeEngineEvents,
  registerFourCardChallengeGameSockets,
} = require("./sockets/fourCardChallengeGameSocket");
const {
  startFourCardChallengeGame,
  setFourCardChallengeGame,
  getFourCardChallengeGame,
  endFourCardChallengeGame,
} = require("./managers/fourCardChallengeGameManager");

const {
  bindSevenCardChallengeEngineEvents,
  registerSevenCardChallengeGameSockets,
} = require("./sockets/sevenCardChallengeGameSocket");
const {
  startSevenCardChallengeGame,
  setSevenCardChallengeGame,
  getSevenCardChallengeGame,
  endSevenCardChallengeGame,
} = require("./managers/sevenCardChallengeGameManager");

const {
  bindAceEngineEvents,
  registerAceGameSockets,
} = require("./sockets/aceGameSocket");
const {
  startAceGame,
  setAceGame,
  endAceGame,
  getAceGame,
} = require("./managers/aceGameManager");

const {
  bindTicketToRideEngineEvents,
  registerTicketToRideGameSockets,
} = require("./sockets/ticketToRideGameSocket");
const {
  startTicketToRideGame,
  setTicketToRideGame,
  getTicketToRideGame,
  endTicketToRideGame,
} = require("./managers/ticketToRideGameManager");

const allowedOrigins = [
  "http://localhost:5173",
  "https://game-citadel.netlify.app",
];

const app = express();
app.use(
  cors({
    origin: allowedOrigins,
  }),
);
app.use(express.json());

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "1d";

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  },
});

// --- WebSocket runtime state
const socketUserMap = new Map(); // socketId -> { username, roomId }
const disconnectTimers = new Map(); // username -> { timer, roomId }

app.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const { error } = await supabase
      .from("Users")
      .insert([{ username, password: hashedPassword }]);

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ message: "Username already exists" });
      }
      return res.status(500).json({ message: error.message });
    }

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/signin", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password required" });
  }

  try {
    const { data: user, error } = await supabase
      .from("Users")
      .select("*")
      .eq("username", username)
      .single();

    if (error || !user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    if (user.active) {
      return res
        .status(403)
        .json({ message: "User already logged in elsewhere" });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    await supabase.from("Users").update({ active: true }).eq("id", user.id);

    res.status(200).json({
      message: "Login successful",
      data: {
        userId: user.id,
        username: user.username,
        token: token,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

//------------------------------------------------------------------------------

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Access denied" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
};

app.post("/logout", authenticateToken, async (req, res) => {
  const { username } = req.body;

  await supabase
    .from("Users")
    .update({ active: false })
    .eq("username", username);

  res.status(201).json({ message: "Logged out successfully" });
});

app.post("/makeUserActiveToFalse", authenticateToken, async (req, res) => {
  const { username } = req.body;

  await supabase
    .from("Users")
    .update({ active: false })
    .eq("username", username);

  res.status(201).json({ message: "user is InActive" });
});

app.post("/makeUserActiveToTrue", authenticateToken, async (req, res) => {
  const { username } = req.body;

  await supabase
    .from("Users")
    .update({ active: true })
    .eq("username", username);

  res.status(201).json({ message: "user is Active" });
});

//----------------------------------------------------------------------------------

const emitRoomUpdate = async (roomId) => {
  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("room_id", roomId)
    .single();

  const { data: players } = await supabase
    .from("room_players")
    .select("username")
    .eq("room_id", roomId);

  if (room && room !== null) {
    io.to(roomId).emit("room_update", {
      roomId,
      gameName: room.game_name,
      gameType: room.game_type,
      host: room.host,
      players: players.map((p) => p.username),
      message: room.message,
      maxPlayers: room.MaxPlayers,
      minPlayers: room.MinPlayers,
      isEvenPlayersReq: room.is_Even_Players,
      createdAt: room.created_at,
      timeNow: new Date().toISOString(),
    });
  }
};

async function handleFinalDisconnect(username, roomId, socket) {
  clearDisconnectTimer(username, roomId);

  const { data: room } = await supabase
    .from("rooms")
    .select("host, state, game_name")
    .eq("room_id", roomId)
    .single();

  // GAME STARTED → REPLACE WITH BOT
  if (room?.state === "Closed") {
    const botName = `BOT_${roomId}_${username}_${uuidv4().slice(0, 4)}`;

    await supabase
      .from("room_players")
      .update({ username: botName })
      .eq("room_id", roomId)
      .eq("username", username);

    if (room.game_name === "Five Alive") {
      const engine = getFiveAliveGame(roomId);
      if (engine) {
        engine.replacePlayerWithBot(username, botName);
      }
    }

    if (room.game_name === "Four Card Challenge") {
      const engine = getFourCardChallengeGame(roomId);
      if (engine) {
        engine.replacePlayerWithBot(username, botName);
      }
    }

    if (room.game_name === "Seven Card Challenge") {
      const engine = getSevenCardChallengeGame(roomId);
      if (engine) {
        engine.replacePlayerWithBot(username, botName);
      }
    }

    if (room.game_name === "Ace") {
      const engine = getAceGame(roomId);
      if (engine) {
        engine.replacePlayerWithBot(username, botName);
      }
    }

    if (room.game_name === "Ticket To Ride") {
      const engine = getTicketToRideGame(roomId);
      if (engine) {
        engine.replacePlayerWithBot(username, botName);
      }
    }

    // await supabase
    //   .from("rooms")
    //   .update({ message: `${username} has been replace by the BOT ${botName}` })
    //   .eq("room_id", roomId);

    await emitRoomUpdate(roomId);

    // HOST LEFT DURING GAME
    if (room.host === username) {
      const { data: realPlayers } = await supabase
        .from("room_players")
        .select("username")
        .eq("room_id", roomId)
        .not("username", "like", "BOT_%");

      if (realPlayers.length === 0) {
        await supabase.from("rooms").delete().eq("room_id", roomId);
        io.to(roomId).emit("room_deleted", {
          message: "Game ended. No real players left.",
        });
        if (room.game_name === "Five Alive") {
          endFiveAliveGame(roomId);
        }
        if (room.game_name === "Four Card Challenge") {
          endFourCardChallengeGame(roomId);
        }
        if (room.game_name === "Seven Card Challenge") {
          endSevenCardChallengeGame(roomId);
        }
        if (room.game_name === "Ace") {
          endAceGame(roomId);
        }
        if (room.game_name === "Ticket To Ride") {
          endTicketToRideGame(roomId);
        }
        return;
      }

      const newHost = realPlayers[0].username;

      await supabase
        .from("rooms")
        .update({
          host: newHost,
          message: `${newHost} is the new host`,
        })
        .eq("room_id", roomId);

      // io.to(roomId).emit("host_changed", { host: newHost });

      await emitRoomUpdate(roomId);
    }

    return;
  }

  // ─────────────────────────────
  // LOBBY LOGIC (UNCHANGED)
  // ─────────────────────────────

  // remove player
  await supabase
    .from("room_players")
    .delete()
    .eq("room_id", roomId)
    .eq("username", username);

  await supabase
    .from("rooms")
    .update({ message: `${username} disconnected from the room` })
    .eq("room_id", roomId);

  await emitRoomUpdate(roomId);

  const { data: players } = await supabase
    .from("room_players")
    .select("username")
    .eq("room_id", roomId);

  // HOST MIGRATION (LOBBY)
  if (room?.host === username && players.length > 0) {
    const newHost = players[0].username;

    await supabase
      .from("rooms")
      .update({
        host: newHost,
        message: `${newHost} is the new host`,
      })
      .eq("room_id", roomId);

    // io.to(roomId).emit("host_changed", { host: newHost });
    await emitRoomUpdate(roomId);
  }

  // DELETE ROOM IF EMPTY
  if (players.length === 0) {
    await supabase.from("rooms").delete().eq("room_id", roomId);
    io.to(roomId).emit("room_deleted", {
      message: "Room deleted due to no players",
    });
    return;
  }

  socket.to(roomId).emit("user_left_audio", socket.id);
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.isAlive = true;

  registerFiveAliveGameSockets(io, socket);
  registerFourCardChallengeGameSockets(io, socket);
  registerSevenCardChallengeGameSockets(io, socket);
  registerAceGameSockets(io, socket);
  registerTicketToRideGameSockets(io, socket);

  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("join_room", async ({ roomId, username, gameType }) => {
    try {
      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("room_id, game_type, MaxPlayers, state")
        .eq("room_id", roomId)
        .single();

      if (roomError || !roomData) {
        socket.emit("join_error", {
          message: "Room does not exist",
          to: username,
        });
        return;
      }

      if (roomData.game_type !== gameType) {
        if (gameType === "Play With Mates") {
          socket.emit("join_error", {
            message:
              "You cannot join in a Online Room . Since you Choosed Play With Mates",
            to: username,
          });
          return;
        } else {
          socket.emit("join_error", {
            message:
              "You cannot join in a Private Room . Since you Choosed Play Online",
            to: username,
          });
          return;
        }
      }

      if (roomData.state === "Closed") {
        socket.emit("join_error", {
          message: "Room is already Closed",
          to: username,
        });
        return;
      }

      const { data: existing } = await supabase
        .from("room_players")
        .select("username")
        .eq("room_id", roomId)
        .eq("username", username)
        .single();

      if (existing) {
        socket.emit("join_error", {
          message: `Username ${username} already exists in this room`,
          to: username,
        });
        return;
      }

      const { count, error: countError } = await supabase
        .from("room_players")
        .select("*", { count: "exact", head: true })
        .eq("room_id", roomId);

      if (countError) {
        socket.emit("join_error", {
          message: "Please try again . Unable to validate room capacity",
          to: username,
        });
        return;
      }

      if (count >= roomData.MaxPlayers) {
        socket.emit("join_error", {
          message: `Room is already full. Max of ${roomData.MaxPlayers} players allowed for this game`,
          to: username,
        });
        return;
      }

      socket.username = username;

      socket.join(roomId);

      socketUserMap.set(socket.id, { username, roomId });

      // cancel pending disconnect timer (refresh case)
      if (disconnectTimers.has(username)) {
        clearDisconnectTimer(username, roomId);
      }

      await supabase.from("room_players").insert({
        room_id: roomId,
        username,
        joined_at: new Date().toISOString(),
      });

      await supabase
        .from("rooms")
        .update({ message: `${username} joined the room` })
        .eq("room_id", roomId);

      await emitRoomUpdate(roomId);

      socket.to(roomId).emit("user_joined_audio", {
        socketId: socket.id,
        username,
      });

      socket.on("audio_offer", ({ to, offer }) => {
        io.to(to).emit("audio_offer", {
          from: socket.id,
          offer,
        });
      });

      socket.on("audio_answer", ({ to, answer }) => {
        io.to(to).emit("audio_answer", {
          from: socket.id,
          answer,
        });
      });

      socket.on("ice_candidate", ({ to, candidate }) => {
        io.to(to).emit("ice_candidate", {
          from: socket.id,
          candidate,
        });
      });

      // socket.on("speaking", ({ roomId, speaking }) => {
      //   socket.to(roomId).emit("speaking_update", {
      //     username: socket.username,
      //     speaking,
      //   });
      // });
    } catch (err) {
      socket.emit("join_error", {
        message: "Unable to join the room",
        to: username,
      });
    }
  });

  socket.on("rejoin_room", async ({ roomId, username }) => {
    const { data: room } = await supabase
      .from("rooms")
      .select("room_id, game_name, state")
      .eq("room_id", roomId)
      .single();

    if (!room) return;

    const { data: player } = await supabase
      .from("room_players")
      .select("username")
      .eq("room_id", roomId)
      .eq("username", username)
      .single();

    if (!player) return;
    socket.username = username;
    socket.join(roomId);
    for (const [socketId, user] of socketUserMap.entries()) {
      if (user.username === username && user.roomId === roomId) {
        // const userSocket = io.sockets.sockets.get(socketId);
        // if (userSocket) {
        //   userSocket.intentionalDisconnect = true;
        //   userSocket.leave(roomId);
        //   userSocket.disconnect(true);
        // }
        socketUserMap.delete(socketId);
      }
    }
    socketUserMap.set(socket.id, { username, roomId });

    if (disconnectTimers.has(username)) {
      clearDisconnectTimer(username, roomId);
    }

    socket.to(roomId).emit("user rejoined", {
      message: `${username} rejoined successfully`,
      roomId: room.room_id,
      // gameName: room.game_name,
      // gameType: room.game_name,
      // host: room.host,
      // players: playerUsernames,
      // maxPlayers: room.MaxPlayers,
      // minPlayers: room.MinPlayers,
      // isEvenPlayersReq: room.is_Even_Players,
      // createdAt: room.created_at,
      // timeNow: new Date().toISOString(),
    });

    await supabase
      .from("rooms")
      .update({ message: `${username} rejoined successfully` })
      .eq("room_id", roomId);

    emitRoomUpdate(roomId);

    socket.once("audio_ready", async () => {
      socket.emit("reset_audio_peers");

      const clients = await io.in(roomId).fetchSockets();

      clients.forEach((client) => {
        if (client.id !== socket.id) {
          client.emit("request_audio_offer", {
            to: socket.id,
          });
        }
      });

      socket.to(roomId).emit("user_joined_audio", {
        socketId: socket.id,
        username,
      });
    });

    socket.on("audio_offer", ({ to, offer }) => {
      io.to(to).emit("audio_offer", {
        from: socket.id,
        offer,
      });
    });

    socket.on("audio_answer", ({ to, answer }) => {
      io.to(to).emit("audio_answer", {
        from: socket.id,
        answer,
      });
    });

    socket.on("ice_candidate", ({ to, candidate }) => {
      io.to(to).emit("ice_candidate", {
        from: socket.id,
        candidate,
      });
    });

    if (room.game_name === "Five Alive" && room.state === "Closed") {
      const engine = getFiveAliveGame(roomId);
      if (!engine) return;
      const gameObj = engine.snapshot();
      gameObj["to"] = username;
      socket.emit("FiveAlive Game Object", gameObj);
    }
    if (room.game_name === "Four Card Challenge" && room.state === "Closed") {
      const engine = getFourCardChallengeGame(roomId);
      if (!engine) return;
      const gameObj = engine.snapshot();
      gameObj["to"] = username;
      socket.emit("FourCardChallenge Game Object", gameObj);
    }
    if (room.game_name === "Seven Card Challenge" && room.state === "Closed") {
      const engine = getSevenCardChallengeGame(roomId);
      if (!engine) return;
      const gameObj = engine.snapshot();
      gameObj["to"] = username;
      socket.emit("SevenCardChallenge Game Object", gameObj);
    }
    if (room.game_name === "Ace" && room.state === "Closed") {
      const engine = getAceGame(roomId);
      if (!engine) return;
      const gameObj = engine.snapshot();
      gameObj["to"] = username;
      socket.emit("Ace Game Object", gameObj);
    }
    if (room.game_name === "Ticket To Ride" && room.state === "Closed") {
      const engine = getTicketToRideGame(roomId);
      if (!engine) return;
      const gameObj = engine.snapshot();
      gameObj["to"] = username;
      socket.emit("TicketToRide Game Object", gameObj);
    }

    // socket.on("speaking", ({ roomId, speaking }) => {
    //   socket.to(roomId).emit("speaking_update", {
    //     username: socket.username,
    //     speaking,
    //   });
    // });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    const user = socketUserMap.get(socket.id);
    if (!user) return;

    const { username, roomId } = user;
    socketUserMap.delete(socket.id);

    if (socket.intentionalDisconnect) {
      return;
    }

    // delay removal (refresh / network blip safe)
    const timer = setTimeout(async () => {
      await handleFinalDisconnect(username, roomId, socket);
    }, 5000); // 5 sec grace

    disconnectTimers.set(username, { timer, roomId });

    socket.to(roomId).emit("user disconnection", {
      message: `${username} disconnected let's wait for 5 seconds for him/her to be back . Players Please dont do any actions now`,
    });
  });
});

setInterval(() => {
  io.sockets.sockets.forEach((socket) => {
    if (!socket.isAlive) {
      socket.disconnect(true);
      return;
    }
    socket.isAlive = false;
    socket.emit("ping");
  });
}, 10000); // 10 sec

function clearDisconnectTimer(username, roomId) {
  const entry = disconnectTimers.get(username);
  if (entry && entry.roomId === roomId) {
    clearTimeout(entry.timer);
    disconnectTimers.delete(username);
  }
}

app.post("/create_room", authenticateToken, async (req, res) => {
  const {
    username,
    gameName,
    gameType,
    minPlayers,
    maxPlayers,
    isEvenPlayersReq,
  } = req.body;
  const roomId = uuidv4().slice(0, 4);

  await supabase.from("rooms").insert({
    room_id: roomId,
    game_name: gameName,
    game_type: gameType,
    host: username,
    MinPlayers: minPlayers,
    MaxPlayers: maxPlayers,
    is_Even_Players: isEvenPlayersReq,
    message: "Room created",
    created_at: new Date().toISOString(),
    state: "Open",
  });

  res.status(201).json({
    message: "Room has been Created Successfully",
    data: {
      roomId: roomId,
    },
  });
});

app.post("/leave_room", authenticateToken, async (req, res) => {
  const { username, roomId } = req.body;

  await supabase
    .from("room_players")
    .delete()
    .eq("room_id", roomId)
    .eq("username", username);

  const { data: room } = await supabase
    .from("rooms")
    .select("state")
    .eq("room_id", roomId)
    .maybeSingle();

  if (room?.state === "Closed") {
    await supabase
      .from("rooms")
      .update({ message: `${username} disconnected from the room` })
      .eq("room_id", roomId);
  } else {
    await supabase
      .from("rooms")
      .update({ message: `${username} left the room` })
      .eq("room_id", roomId);
  }

  await emitRoomUpdate(roomId);

  for (const [socketId, user] of socketUserMap.entries()) {
    if (user.username === username && user.roomId === roomId) {
      const userSocket = io.sockets.sockets.get(socketId);
      if (userSocket) {
        if (room.state !== "Closed") {
          userSocket.intentionalDisconnect = true;
        } else {
          userSocket.intentionalDisconnect = false;
        }
        userSocket.leave(roomId);
        userSocket.disconnect(true);
      }
      socketUserMap.delete(socketId);
    }
  }

  clearDisconnectTimer(username);

  res.status(201).json({ message: `${username} left the room` });
});

app.post("/kick_player", authenticateToken, async (req, res) => {
  const { username, roomId, usernameToKick } = req.body;

  const { data: room } = await supabase
    .from("rooms")
    .select("host")
    .eq("room_id", roomId)
    .single();

  if (room.host !== username) {
    return res.status(403).json({ message: "Only host can kick players" });
  }

  await supabase
    .from("room_players")
    .delete()
    .eq("room_id", roomId)
    .eq("username", usernameToKick);

  await supabase
    .from("rooms")
    .update({ message: `${usernameToKick} was kicked by host` })
    .eq("room_id", roomId);

  await emitRoomUpdate(roomId);

  for (const [socketId, user] of socketUserMap.entries()) {
    if (user.username === usernameToKick && user.roomId === roomId) {
      const userSocket = io.sockets.sockets.get(socketId);
      if (userSocket) {
        userSocket.intentionalDisconnect = true;
        userSocket.leave(roomId);
        userSocket.disconnect(true);
      }
      socketUserMap.delete(socketId);
    }
  }

  clearDisconnectTimer(usernameToKick);

  res.status(201).json({ message: `${usernameToKick} was kicked by host` });
});

app.post("/delete_room", authenticateToken, async (req, res) => {
  const { username, roomId } = req.body;

  const { data: room } = await supabase
    .from("rooms")
    .select("host")
    .eq("room_id", roomId)
    .single();

  if (room.host !== username) {
    return res.status(403).json({ message: "Only host can delete room" });
  }

  await supabase.from("rooms").delete().eq("room_id", roomId);

  io.to(roomId).emit("room_deleted", {
    message: "Room was deleted by host",
  });

  for (const [u, timer] of disconnectTimers.entries()) {
    clearTimeout(timer);
    disconnectTimers.delete(u);
  }

  for (const [sid, data] of socketUserMap.entries()) {
    if (data.roomId === roomId) {
      const userSocket = io.sockets.sockets.get(sid);
      if (userSocket) {
        userSocket.intentionalDisconnect = true;
        userSocket.leave(roomId);
        userSocket.disconnect(true);
      }
      socketUserMap.delete(sid);
    }
  }

  res.status(201).json({ message: "Room was deleted by host" });
});

app.post("/gameCompleted/:roomId", async (req, res) => {
  const { roomId } = req.params;

  // const { data: room } = await supabase
  //   .from("rooms")
  //   .select("host")
  //   .eq("room_id", roomId)
  //   .single();

  await supabase.from("rooms").delete().eq("room_id", roomId);

  io.to(roomId).emit("room_deleted", {
    message: "Game Over and room removed",
  });

  for (const [u, timer] of disconnectTimers.entries()) {
    clearTimeout(timer);
    disconnectTimers.delete(u);
  }

  for (const [sid, data] of socketUserMap.entries()) {
    if (data.roomId === roomId) {
      const userSocket = io.sockets.sockets.get(sid);
      if (userSocket) {
        userSocket.intentionalDisconnect = true;
        userSocket.leave(roomId);
        userSocket.disconnect(true);
      }
      socketUserMap.delete(sid);
    }
  }

  res.status(201).json({ message: "Game Over and room deleted" });
});

app.get("/rooms/game/:gameName", authenticateToken, async (req, res) => {
  const { gameName } = req.params;

  try {
    const { data, error } = await supabase
      .from("rooms")
      .select(
        `
        room_id,
        game_name,
        MaxPlayers,
        game_type,
        created_at,
        state,
        room_players(count)
      `,
      )
      .eq("game_name", gameName)
      .eq("game_type", "Play Online")
      .eq("state", "Open");

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    const response = data.map((room) => ({
      roomId: room.room_id,
      gameName: room.game_name,
      maxPlayers: room.MaxPlayers,
      createdAt: room.created_at,
      playersCount: room.room_players?.[0]?.count || 0,
    }));

    res.json({
      message: "Rooms fetched successfully",
      data: response,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/rooms/other-games/:gameName", authenticateToken, async (req, res) => {
  const { gameName } = req.params;

  try {
    const { data, error } = await supabase
      .from("rooms")
      .select(
        `
        room_id,
        game_name,
        game_type,
        MaxPlayers,
        created_at,
        state,
        room_players(count)
      `,
      )
      .neq("game_name", gameName)
      .eq("game_type", "Play Online")
      .eq("state", "Open");

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    const response = data.map((room) => ({
      roomId: room.room_id,
      gameName: room.game_name,
      maxPlayers: room.MaxPlayers,
      createdAt: room.created_at,
      playersCount: room.room_players?.[0]?.count || 0,
    }));

    res.json({
      message: "Other game rooms fetched successfully",
      data: response,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.patch("/rooms/:roomId/game-type", authenticateToken, async (req, res) => {
  const { roomId } = req.params;

  try {
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("game_type")
      .eq("room_id", roomId)
      .single();

    if (fetchError || !room) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    const updatedGameType = "Play Online";

    const { error: updateError } = await supabase
      .from("rooms")
      .update({
        game_type: updatedGameType,
        created_at: new Date().toISOString(),
        message: "Room has been successfully hosted to Online by the host",
      })
      .eq("room_id", roomId);

    if (updateError) {
      return res.status(500).json({
        message: "Failed to Host the Room in Online",
      });
    }

    await supabase
      .from("rooms")
      .update({
        message: "Room has been successfully hosted to Online by the host",
      })
      .eq("room_id", roomId);

    await emitRoomUpdate(roomId);

    return res.json({
      roomId,
      game_type: updatedGameType,
      message: "Room has been successfully hosted in online",
    });
  } catch (err) {
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

app.post("/rooms/change-game", authenticateToken, async (req, res) => {
  const { roomId, username, gameName, maxPlayers, minPlayers, isEvenPlayers } =
    req.body;

  if (!roomId || !username || !gameName || !maxPlayers || !minPlayers) {
    return res.status(400).json({
      message: "roomId, username and game details are required",
    });
  }

  try {
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("room_id, host, game_type")
      .eq("room_id", roomId)
      .single();

    if (roomError || !room) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    if (room.game_type !== "Play With Mates") {
      return res.status(403).json({
        message: "Game can be changed only in Private rooms",
      });
    }

    if (room.host !== username) {
      return res.status(403).json({
        message: "Only host can change the game",
      });
    }

    const { count: currentPlayers, error: countError } = await supabase
      .from("room_players")
      .select("*", { count: "exact", head: true })
      .eq("room_id", roomId);

    if (countError) {
      return res.status(500).json({
        message: "Failed to fetch players count",
      });
    }

    if (currentPlayers > maxPlayers) {
      return res.status(409).json({
        message: `Cannot change game. ${currentPlayers} players already in room, but ${maxPlayers} max allowed for ${gameName}`,
      });
    }

    const { error: updateError } = await supabase
      .from("rooms")
      .update({
        game_name: gameName,
        message: "Game has been changed successfully",
        MaxPlayers: maxPlayers,
        MinPlayers: minPlayers,
        is_Even_Players: isEvenPlayers,
      })
      .eq("room_id", roomId);

    if (updateError) {
      return res.status(500).json({
        message: "Failed to change game",
      });
    }

    await emitRoomUpdate(roomId);

    return res.json({
      roomId,
      gameName,
      message: "Game changed successfully",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

app.post("/rooms/:roomId/startGame", authenticateToken, async (req, res) => {
  const { roomId } = req.params;

  try {
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select(
        "room_id, MinPlayers, MaxPlayers, is_Even_Players,game_name, message",
      )
      .eq("room_id", roomId)
      .single();

    if (roomError) {
      return res.status(404).json({ message: "Room not found" });
    }

    const { count: playerCount, error: countError } = await supabase
      .from("room_players")
      .select("*", { count: "exact", head: true })
      .eq("room_id", roomId);

    if (countError) {
      return res.status(500).json({
        message: "Failed to fetch players count",
      });
    }

    if (playerCount < room.MinPlayers) {
      return res.status(400).json({
        message: `Not enough players to start the game. Minimum required: ${room.MinPlayers}`,
      });
    }

    if (playerCount > room.MaxPlayers) {
      return res.status(400).json({
        message: `Too many players to start the game. Maximum allowed: ${room.MaxPlayers}`,
      });
    }

    if (room.is_Even_Players && playerCount % 2 !== 0) {
      return res.status(400).json({
        message: "Number of players must be even to start this game",
      });
    }

    const { error: updateError } = await supabase
      .from("rooms")
      .update({ message: "Game started", state: "Closed" })
      .eq("room_id", roomId);

    if (updateError) {
      return res.status(500).json({ message: "Failed to update room" });
    }

    const { data: players } = await supabase
      .from("room_players")
      .select("username")
      .eq("room_id", roomId);

    const playerIds = players.map((p) => p.username);

    if (room.game_name === "Five Alive") {
      // ✅ START ENGINE NOW — SAFE POINT
      const engine = await setFiveAliveGame(roomId, playerIds);
      bindFiveAliveEngineEvents(io, roomId, engine);
      startFiveAliveGame(engine);
    }

    if (room.game_name === "Four Card Challenge") {
      // ✅ START ENGINE NOW — SAFE POINT
      const engine = await setFourCardChallengeGame(roomId, playerIds);
      bindFourCardChallengeEngineEvents(io, roomId, engine);
      startFourCardChallengeGame(engine);
    }

    if (room.game_name === "Seven Card Challenge") {
      // ✅ START ENGINE NOW — SAFE POINT
      const engine = await setSevenCardChallengeGame(roomId, playerIds);
      bindSevenCardChallengeEngineEvents(io, roomId, engine);
      startSevenCardChallengeGame(engine);
    }

    if (room.game_name === "Ace") {
      // ✅ START ENGINE NOW — SAFE POINT
      const engine = await setAceGame(roomId, playerIds);
      bindAceEngineEvents(io, roomId, engine);
      startAceGame(engine);
    }

    if (room.game_name === "Ticket To Ride") {
      const engine = await setTicketToRideGame(roomId, playerIds);
      bindTicketToRideEngineEvents(io, roomId, engine);
      startTicketToRideGame(engine);
    }

    emitRoomUpdate(roomId);

    return res
      .status(200)
      .json({ message: "Game started successfully", gameName: room.gameName });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
