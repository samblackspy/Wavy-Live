import { WebSocketServer, WebSocket } from 'ws';
import wrtc from '@koush/wrtc';
import { WS_PORT } from './config';
import { ClientSignalingMessage, ServerSignalingMessage } from './types';
import { 
    createPeerConnection, 
    onIceCandidate, 
    onTrackReceived, 
    onConnectionStateChange,
    cleanupWebRTC,
    resetPeerConnection
} from './utils/webrtc';

const { RTCSessionDescription, RTCIceCandidate } = wrtc;

 
export function startWebSocketServer() {
    const wss = new WebSocketServer({ port: WS_PORT });
    console.log(`WebSocket Signaling Server started on ws://localhost:${WS_PORT}`);

    wss.on('connection', handleClientConnection);
    wss.on('error', (error: Error) => {
        console.error('WebSocket Server error:', error.message);
    });

    return wss;
}

 
function handleClientConnection(ws: WebSocket) {
    console.log('Client connected via WebSocket');
    
    // Don't reset existing connections - allow multiple concurrent streams
    // We'll create a new peer connection but not reset existing ones
    
    // Create a new peer connection that's specific to this client
    let currentPeerConnection: RTCPeerConnection | null = null;

    // Set up message handling
    ws.on('message', async (message: Buffer) => {
        await handleClientMessage(message, ws, (pc) => {
            currentPeerConnection = pc;
        }, currentPeerConnection);
    });

    // Handle connection close
    ws.on('close', () => {
        console.log('Client connection closed, but keeping WebRTC state for reconnection');
        // Don't cleanup the WebRTC connection completely on websocket close
        // Just mark the peer connection as inactive but leave resources allocated
        if (currentPeerConnection && currentPeerConnection.connectionState === 'failed') {
            cleanupWebRTC(currentPeerConnection, false); // Pass false to indicate partial cleanup
        }
        // Keep currentPeerConnection reference for possible reconnections
    });

    // Handle errors
    ws.on('error', (error: Error) => {
        console.error('WebSocket error:', error.message);
        // Only cleanup on critical errors, not transient ones
        if (currentPeerConnection && error.message.includes('ECONNRESET')) {
            // For connection reset errors, don't fully cleanup
            console.log('Connection reset error - keeping resources for reconnection');
        } else if (currentPeerConnection) {
            // For other errors, perform cleanup but leave possibility for reconnection
            cleanupWebRTC(currentPeerConnection, false);
        }
        // Don't set currentPeerConnection to null to allow reconnection
    });
}

 
async function handleClientMessage(
    message: Buffer, 
    ws: WebSocket, 
    setPeerConnection: (pc: RTCPeerConnection) => void,
    currentPeerConnection: RTCPeerConnection | null
) {
    let data: ClientSignalingMessage;
    
    try {
        data = JSON.parse(message.toString());
        console.log('Received message type:', data.type);
    } catch (error: unknown) {
        console.error('Failed to parse message:', error instanceof Error ? error.message : error);
        return;
    }

    try {
        if (data.type === 'offer') {
            await handleOfferMessage(data, ws, setPeerConnection);
        } else if (data.type === 'ice-candidate' && currentPeerConnection) {
            await handleIceCandidateMessage(data, currentPeerConnection);
        } else {
            console.warn('Unknown message type received:', data.type);
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error handling message type ${data?.type}:`, message);
    }
}
// SDP offer from client
async function handleOfferMessage(
    data: ClientSignalingMessage, 
    ws: WebSocket,
    setPeerConnection: (pc: RTCPeerConnection) => void
) {
    if (!data.sdp) {
        console.error("Offer message received without SDP.");
        return;
    }
    
    // Create a new peer connection
    const pc = createPeerConnection();
    setPeerConnection(pc);
    
    // Set up event handlers
    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => onIceCandidate(event, ws);
    pc.ontrack = onTrackReceived;
    pc.onconnectionstatechange = () => onConnectionStateChange(pc);
    
    // Set remote description (the offer)
    await pc.setRemoteDescription(new RTCSessionDescription({ 
        type: 'offer', 
        sdp: data.sdp 
    }));
    console.log('Remote description (offer) set.');
    
    // Create and send answer
    const answer = await pc.createAnswer();
    console.log('Answer created.');
    await pc.setLocalDescription(answer);
    console.log('Local description (answer) set.');
    
    const answerMessage: ServerSignalingMessage = { 
        type: 'answer', 
        sdp: answer.sdp 
    };
    ws.send(JSON.stringify(answerMessage));
    console.log('Answer sent.');
}

// Handle ICE candidate from client
async function handleIceCandidateMessage(
    data: ClientSignalingMessage,
    pc: RTCPeerConnection
) {
    if (!data.candidate) {
        console.error("ice-candidate message received without candidate data.");
        return;
    }
    
    if (!pc) {
        console.error("Received ICE candidate but PeerConnection for this session does not exist or is closed.");
        return;
    }
    
    try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log('Added received client ICE candidate.');
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Ignore errors
        if (!errorMessage.includes("Cannot add ICE candidate before setting remote description") &&
            !errorMessage.includes("Error processing ICE candidate")) {
            console.error('Error adding received client ICE candidate:', errorMessage);
        }
    }
}

