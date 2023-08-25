const express = require("express");
let app = express();
const cors = require("cors");
const https = require("https");
const { MongoClient } = require("mongodb");
const fs = require("fs");
const { Server } = require("socket.io");

const client = new MongoClient(
  "mongodb+srv://aankit8295:TPxqK9rP5VBrB0Um@resume.xaexoic.mongodb.net/?retryWrites=true&w=majority"
);

const https_options = {
  ca: fs.readFileSync("./ca_bundle.crt"),
  key: fs.readFileSync("./private.key"),
  cert: fs.readFileSync("./certificate.crt"),
};

const secureServer = https.createServer(https_options, function (req, res) {
  res.writeHead(200);
  res.end("Welcome to Xenon chat HTTPS Server");
});

const corsOpts = {
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOpts));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

async function connectToDB() {
  try {
    const dbClient = await client.connect();
    console.log("Connected to MongoDB Atlas");
    const db = dbClient.db("data");
    return db;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const io = new Server(secureServer, {
  cors: {
    origin: "*",
  },
});

let users = [];

io.on("connection", async (socket) => {
  console.log("A user connected", socket.id);

  const db = await connectToDB();

  const messageCollection = db.collection("messages");

  socket.on("join", (roomsId) => {
    if (users.find((user) => user.socketId === socket.id)) {
      const user = users.find((user) => user.socketId === socket.id);
      if (user.roomId === roomsId) return;
      socket.leave(user.roomId);
      users = users.filter((user) => user.socketId !== socket.id);
      const updateUser = { socketId: socket.id, roomId: roomsId };
      users.push(updateUser);
      return socket.join(roomsId);
    } else {
      const newUser = { socketId: socket.id, roomId: roomsId };
      users.push(newUser);
      return socket.join(roomsId);
    }
  });

  socket.on("private_message", async (data) => {
    const updateSender = {
      [`messages.${data.messageBy}.${data.messageId}`]: data,
    };

    const updateReceiver = {
      [`messages.${data.messageTo}.${data.messageId}`]: data,
    };

    messageCollection.findOneAndUpdate(
      { userName: data.messageTo },
      { $set: updateSender }
    );

    messageCollection.findOneAndUpdate(
      { userName: data.messageBy },
      { $set: updateReceiver }
    );

    const usersRoomId = [data.messageTo, data.messageBy].sort().join("-");

    io.in(usersRoomId).emit("recieve_message", data);
  });

  socket.on("disconnect", () => {
    users = users.filter((user) => user.socketId !== socket.id);
    console.log("A user disconnected", socket.id);
  });
});

secureServer.listen(8443, function () {
  console.log("server listening at port 8443");
});
