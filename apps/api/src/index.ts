import { startWebSocketServer } from './ws-server';
import { startHttpServer } from './http-server';  
import { stopFFmpeg } from './utils/ffmpeg';
import { resetPeerConnection } from './utils/webrtc';
import { WS_PORT, HTTP_PORT } from './config';  
import http from 'http';  

 
console.log(`Starting WebRTC to HLS streaming server...`);

// Start the WebSocket server
const wss = startWebSocketServer();

// Start the HTTP server
let httpServer: http.Server | null = null; 
try {
    httpServer = startHttpServer(HTTP_PORT);
} catch (error) {
    console.error("Failed to start HTTP server:", error);
    process.exit(1);
}

function handleShutdown() {
    console.log('Shutting down server...');

    // --- Close HTTP Server First (allows pending requests to finish) ---
    if (httpServer) {
        console.log('Closing HTTP server...');
        httpServer.close((err) => {
            if (err) {
                console.error("Error closing HTTP server:", err);
            } else {
                console.log('HTTP server closed.');
            }
            // --- Then close WebSocket server ---
            closeWebSocketServer();
        });
    } else {
        // If HTTP server didn't start, just close WebSocket server
        closeWebSocketServer();
    }
}

// Helper to close WebSocket server and exit
function closeWebSocketServer() {
     // Stop FFmpeg processes
     stopFFmpeg(); 

     // Close all WebRTC connections
     resetPeerConnection(); 

    if (wss) {
        console.log('Closing WebSocket server...');
        wss.close(() => {
            console.log('WebSocket server closed.');
            console.log('Shutdown complete.');
            process.exit(0);
        });
        // Force close connections if server doesn't close quickly
        wss.clients.forEach(client => client.terminate());
    } else {
        console.log('Shutdown complete (no servers running).');
        process.exit(0);
    }
}


// Register shutdown handlers
process.on('SIGINT', handleShutdown);   
process.on('SIGTERM', handleShutdown); 
process.on('uncaughtException', (error) => {
    console.error('FATAL: Uncaught exception:', error);
    // Attempt graceful shutdown, but might fail
    handleShutdown();
    // Force exit after a delay if graceful shutdown hangs
    setTimeout(() => process.exit(1), 5000).unref();
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('FATAL: Unhandled promise rejection:', reason);
    setTimeout(() => process.exit(1), 5000).unref();
});

console.log(`WebSocket Server starting on port ${WS_PORT}.`);
console.log(`HTTP HLS Server configured for port ${HTTP_PORT}.`);
console.log('Server is running. Press Ctrl+C to stop.');