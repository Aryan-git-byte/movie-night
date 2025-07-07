// public/script.js - ✨ Fresh Code with Shared Control and UI Updates ✨

let ws;
let player;
let clientId = Math.random().toString(36).substring(2, 15); // Generate a unique ID for this client
let currentRoomId;
let isApplyingRemoteChange = false; // Flag to prevent self-broadcasting events triggered by remote control

// UI Elements
const chatBox = document.getElementById('chatBox');
const messageInput = document.getElementById('messageInput');
const usernameInput = document.getElementById('usernameInput');
const sendMessageButton = document.getElementById('sendMessageButton');
const youtubeUrlInput = document.getElementById('youtubeUrlInput');
const loadVideoButton = document.getElementById('loadVideoButton');
const playPauseButton = document.getElementById('playPauseButton');
const syncButton = document.getElementById('syncButton');

// Utility function to extract YouTube Video ID from various URLs
function getYouTubeVideoId(url) {
    if (!url) return null;
    const regExp = /(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|)([\w-]{11})(?:\S+)?/i;
    const match = url.match(regExp);
    return (match && match[1]) ? match[1] : null;
}

// 1. WebSocket Connection Management
function connectWebSocket() {
    const urlParams = new URLSearchParams(window.location.search);
    currentRoomId = urlParams.get('room');

    // If no room ID in URL, generate one and redirect
    if (!currentRoomId) {
        currentRoomId = Math.random().toString(36).substring(2, 9); // Simple random ID
        window.location.search = `?room=${currentRoomId}`;
        return; // Page will reload with new URL
    }

    // Determine WebSocket protocol (ws for http, wss for https)
    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(`${wsProtocol}${window.location.host}?room=${currentRoomId}`);

    ws.onopen = () => {
        console.log(`[WebSocket] Connected to server for room: ${currentRoomId}`);
        appendChatMessage('System', `You've joined room: ${currentRoomId}. Share this URL to invite a friend!`, 'system');
        // Send initial join message with clientId
        if (ws.readyState === WebSocket.OPEN) {
             ws.send(JSON.stringify({ type: 'initialJoin', roomId: currentRoomId, clientId: clientId }));
        }
    };

    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        console.log('[WebSocket] Received:', data);

        switch (data.type) {
            case 'chatMessage':
                appendChatMessage(data.username, data.message, data.clientId === clientId ? 'self' : '');
                break;
            case 'videoEvent':
                handleVideoEvent(data);
                break;
            case 'userJoined':
                appendChatMessage('System', `${data.username} joined the room.`, 'system');
                // When a new user joins, if a video is loaded, the current user (if they just played/paused etc)
                // should sync the new user. Simplest is for the *first* person who has the video loaded
                // to resync when someone new joins.
                // Or simply, any active user can hit 'sync'.
                if (player && player.getPlayerState() !== -1 && data.senderId !== clientId) { // -1 means unstarted
                    // Small delay to allow new user's player to initialize
                    setTimeout(() => syncVideo(true), 1000); // true means forced sync broadcast
                }
                break;
            case 'userLeft':
                appendChatMessage('System', `${data.username} left the room.`, 'system');
                break;
            case 'roomInfo': // Could be used to initially display user count etc.
                console.log(`[Room Info] Users in room: ${data.usersInRoom}`);
                break;
            case 'error':
                appendChatMessage('System', `Error: ${data.message}`, 'error');
                ws.close();
                break;
        }
    };

    ws.onclose = () => {
        console.log('[WebSocket] Disconnected from server.');
        appendChatMessage('System', 'Disconnected from room. Please refresh to rejoin.', 'error');
    };

    ws.onerror = error => {
        console.error('[WebSocket] Error:', error);
        appendChatMessage('System', 'WebSocket error occurred. Check console.', 'error');
    };
}

// 2. YouTube IFrame API Loading & Player Control
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '360',
        width: '640',
        videoId: '', // Initial empty, load dynamically
        playerVars: {
            'autoplay': 0,
            'controls': 1,
            'modestbranding': 1,
            'rel': 0,
            'showinfo': 0,
            'iv_load_policy': 3
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log('[YouTube Player] Player ready.');
    // Load video from URL param if available
    const urlParams = new URLSearchParams(window.location.search);
    const videoIdFromUrl = urlParams.get('v');
    if (videoIdFromUrl) {
        player.loadVideoById(videoIdFromUrl);
    }
}

function onPlayerStateChange(event) {
    // If this state change was caused by a remote event, don't broadcast it back
    if (isApplyingRemoteChange) {
        isApplyingRemoteChange = false; // Reset the flag
        return;
    }

    const playerState = event.data;
    let action = '';
    let currentTime = 0;

    // Only send relevant states for sync
    switch (playerState) {
        case YT.PlayerState.PLAYING:
            action = 'play';
            currentTime = player.getCurrentTime();
            break;
        case YT.PlayerState.PAUSED:
            action = 'pause';
            currentTime = player.getCurrentTime();
            break;
        case YT.PlayerState.ENDED:
            action = 'ended';
            currentTime = player.getCurrentTime(); // Send final time just in case
            break;
        // YT.PlayerState.BUFFERING (3) can also be handled if more granular sync is needed
    }

    if (action && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'videoEvent',
            action: action,
            time: currentTime,
            senderId: clientId // Include our client ID
        }));
    }
}

function handleVideoEvent(data) {
    // Ignore events sent by self to prevent echo/loop
    if (data.senderId === clientId) {
        return;
    }

    if (player) {
        isApplyingRemoteChange = true; // Set flag before applying remote change

        switch (data.action) {
            case 'play':
                // Check if already playing close enough to avoid unnecessary seek/play
                if (Math.abs(player.getCurrentTime() - data.time) > 1 || player.getPlayerState() !== YT.PlayerState.PLAYING) {
                    player.seekTo(data.time, true);
                    player.playVideo();
                }
                break;
            case 'pause':
                // Check if already paused close enough
                if (Math.abs(player.getCurrentTime() - data.time) > 1 || player.getPlayerState() !== YT.PlayerState.PAUSED) {
                    player.seekTo(data.time, true);
                    player.pauseVideo();
                }
                break;
            case 'seek':
                player.seekTo(data.time, true);
                // After seeking, ensure state matches sender's state (play/pause)
                if (data.playerState === YT.PlayerState.PLAYING) {
                    player.playVideo();
                } else if (data.playerState === YT.PlayerState.PAUSED) {
                    player.pauseVideo();
                }
                break;
            case 'loadVideo':
                // Only load if it's a different video or not loaded yet
                if (player.getVideoData().video_id !== data.videoId) {
                    player.loadVideoById(data.videoId, data.time);
                } else {
                    // If same video, just seek and sync state
                    player.seekTo(data.time, true);
                    if (data.playerState === YT.PlayerState.PLAYING) {
                        player.playVideo();
                    } else if (data.playerState === YT.PlayerState.PAUSED) {
                        player.pauseVideo();
                    }
                }
                break;
            case 'sync': // Explicit sync action
                player.seekTo(data.time, true);
                if (data.playerState === YT.PlayerState.PLAYING) {
                    player.playVideo();
                } else if (data.playerState === YT.PlayerState.PAUSED) {
                    player.pauseVideo();
                }
                break;
        }
        // isApplyingRemoteChange will be reset by onPlayerStateChange for play/pause.
        // For seek or loadVideo that might not trigger an immediate state change,
        // it's reset when the next onPlayerStateChange occurs.
        // A more robust solution might involve a timeout or more granular state tracking.
    }
}

// 3. UI Event Listeners and Chat/Video Functions

// Chat System
sendMessageButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const message = messageInput.value.trim();
    let username = usernameInput.value.trim();
    if (!username) {
        username = 'Guest ' + clientId.substring(0,4); // A simple default username
    }

    if (message && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'chatMessage',
            username: username,
            message: message,
            clientId: clientId // Include sender's ID for styling
        }));
        messageInput.value = ''; // Clear input
    }
}

function appendChatMessage(username, message, type = '') {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    if (type) {
        messageElement.classList.add(type);
    }

    const bubble = document.createElement('div');
    bubble.classList.add('chat-bubble');
    bubble.textContent = message;

    const meta = document.createElement('div');
    meta.classList.add('message-meta');
    meta.textContent = `${username} at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    messageElement.appendChild(bubble);
    messageElement.appendChild(meta);
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to bottom
}

// Video Controls
loadVideoButton.addEventListener('click', () => {
    const youtubeUrl = youtubeUrlInput.value.trim();
    const videoId = getYouTubeVideoId(youtubeUrl);

    if (videoId && player && ws && ws.readyState === WebSocket.OPEN) {
        player.loadVideoById(videoId); // Load locally immediately

        // Update URL for easy sharing of current video
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('v', videoId);
        window.history.replaceState(null, '', `?${urlParams.toString()}`);

        // Broadcast to other users
        ws.send(JSON.stringify({
            type: 'videoEvent',
            action: 'loadVideo',
            videoId: videoId,
            time: 0, // Start from beginning
            playerState: YT.PlayerState.PAUSED, // Assume paused until played
            senderId: clientId
        }));
    } else if (!videoId) {
        alert('Please enter a valid YouTube URL.');
    }
});

playPauseButton.addEventListener('click', () => {
    if (!player || !ws || ws.readyState !== WebSocket.OPEN) return;

    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
        player.pauseVideo();
        // onPlayerStateChange will handle broadcasting the 'pause' event
    } else {
        player.playVideo();
        // onPlayerStateChange will handle broadcasting the 'play' event
    }
});

syncButton.addEventListener('click', () => {
    syncVideo(true); // Force a sync broadcast
});

function syncVideo(forceBroadcast = false) {
    if (!player || !ws || ws.readyState !== WebSocket.OPEN) return;

    const currentTime = player.getCurrentTime();
    const playerState = player.getPlayerState();
    let action = '';

    // Decide action based on current local state
    if (playerState === YT.PlayerState.PLAYING) {
        action = 'play';
    } else if (playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.BUFFERING) {
        action = 'pause';
    } else {
        action = 'seek'; // For other states, just seek to current time
    }

    if (action || forceBroadcast) { // Always broadcast if forced
        ws.send(JSON.stringify({
            type: 'videoEvent',
            action: 'sync', // Use a specific 'sync' action
            time: currentTime,
            playerState: playerState, // Send current play/pause state
            senderId: clientId
        }));
        appendChatMessage('System', 'Video sync initiated!', 'system');
    }
}


// Initial WebSocket connection when the script loads
document.addEventListener('DOMContentLoaded', connectWebSocket);