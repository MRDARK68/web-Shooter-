const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Serve static files
app.use(express.static(__dirname));

const rooms = {};

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', (username) => {
        const code = generateCode();
        rooms[code] = {
            host: socket.id,
            players: [{ id: socket.id, username, isHost: true }],
            gameState: {}
        };
        socket.join(code);
        socket.emit('roomCreated', { code, isHost: true });
        console.log(`Room ${code} created by ${username}`);
    });

    socket.on('joinRoom', ({ code, username }) => {
        if (rooms[code]) {
            rooms[code].players.push({ id: socket.id, username, isHost: false });
            socket.join(code);
            socket.emit('roomJoined', { code, isHost: false });
            io.to(code).emit('playerJoined', { username });
            console.log(`${username} joined room ${code}`);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    // Relay Player Movement
    socket.on('playerMove', (data) => {
        // data: { code, x, y, z, yaw, pitch }
        socket.to(data.code).emit('updatePlayer', { id: socket.id, ...data });
    });

    // Relay World State (From Host)
    socket.on('hostUpdate', (data) => {
        // data: { code, enemies: [], round: 1 }
        socket.to(data.code).emit('worldUpdate', data);
    });

    // Relay Events (Shoot, Chat)
    socket.on('gameEvent', (data) => {
        socket.to(data.code).emit('gameEvent', { id: socket.id, ...data });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Clean up rooms... logic to be added
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
