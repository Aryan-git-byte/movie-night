// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = new Map(); // Stores room codes and connected WebSocket clients

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', (ws, req) => {
    // Extract room ID from the URL (e.g., ws://localhost:8080/?room=xyz)
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const roomId = urlParams.get('room') || 'default_room'; // Default room for simplicity if not provided

    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set()); // Create a new set to hold clients for this room
    }

    const roomClients = rooms.get(roomId);

    // Limit to 2 users per room
    if (roomClients.size >= 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        ws.close();
        return;
    }

    roomClients.add(ws);
    console.log(`Client connected to room: ${roomId}. Total clients in room: ${roomClients.size}`);

    // Notify new user about current users in the room (optional, for displaying user count)
    ws.send(JSON.stringify({ type: 'roomInfo', usersInRoom: roomClients.size }));

    // Inform existing users in the room that a new user has joined
    roomClients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'userJoined', username: 'Guest' + roomClients.size })); // You might add actual usernames later
        }
    });

    ws.on('message', message => {
        // Parse the incoming message
        const data = JSON.parse(message);

        // Broadcast the message to all other clients in the same room
        roomClients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });

        // Special handling for video events if needed by the server (e.g., logging)
        if (data.type === 'videoEvent') {
            console.log(`Video event in room ${roomId}:`, data.action, data.time);
        } else if (data.type === 'chatMessage') {
            console.log(`Chat message in room ${roomId} from ${data.username || 'Guest'}:`, data.message);
        }
    });

    ws.on('close', () => {
        roomClients.delete(ws);
        console.log(`Client disconnected from room: ${roomId}. Remaining clients: ${roomClients.size}`);

        // If no clients left in a room, you might clean up the room
        if (roomClients.size === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} is empty and has been removed.`);
        } else {
            // Inform remaining users that a user has left
            roomClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'userLeft', username: 'A Guest' }));
                }
            });
        }
    });

    ws.on('error', error => {
        console.error('WebSocket error:', error);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Open your browser to http://localhost:${PORT}`);
});