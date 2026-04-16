import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow any origin — restrict in production
    },
});

// Define a basic route to handle GET requests
app.get("/", (req, res) => {
    res.send("Hello, welcome to the Socket.IO server!");
});

// Handle WebSocket connections
io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle room joining
    socket.on("join-room", (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room: ${roomId}`);
    });

    // Handle element selection
    socket.on("element-selected", (data) => {
        socket.to("demo-project-room").emit("element-selected", data);
    });

    // Handle user disconnection
    socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// Start the server
server.listen(3002, () => {
    console.log("Socket.IO server running at http://localhost:3002");
});
