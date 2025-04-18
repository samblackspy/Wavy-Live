import wrtc from '@koush/wrtc';
import { WebSocket } from 'ws';
import { ServerSignalingMessage } from '../types';
import { setVideoSink, startFFmpeg, stopFFmpeg } from './ffmpeg';

const {
    RTCPeerConnection,
    RTCSessionDescription,
    RTCIceCandidate,
    nonstandard: { RTCVideoSink, RTCAudioSink }
} = wrtc;

// State management
let peerConnection: RTCPeerConnection | null = null;
const receivedTracks = new Map<string, MediaStreamTrack>();

// Handles ICE candidate events
export function onIceCandidate(event: RTCPeerConnectionIceEvent, ws: WebSocket) {
    if (event.candidate && ws.readyState === WebSocket.OPEN) {
        console.log('Server generated ICE candidate:', event.candidate.candidate.substring(0, 20) + '...');
        
        //  don't use toJSON() on RTCIceCandidate objects
        //  use the candidate object directly as it's already in RTCIceCandidateInit format
        const iceMessage: ServerSignalingMessage = { 
            type: 'ice-candidate', 
            candidate: event.candidate 
        };
        
        ws.send(JSON.stringify(iceMessage));
    }
}

// Handle track events when media tracks are received
export function onTrackReceived(event: RTCTrackEvent) {
    const track = event.track;
    console.log(`Track received: ${track.kind} - ID: ${track.id}`);
    
    // Check if we already have this track (might be a reconnection)
    const existingTrack = receivedTracks.get(track.id);
    if (existingTrack) {
        console.log(`Track ${track.id} already exists - handling reconnection`);
        // Remove the old track first
        receivedTracks.delete(track.id);
    }
    
    // Store the new track
    receivedTracks.set(track.id, track);
    console.log(`Stored track ${track.id}. Total tracks: ${receivedTracks.size}`);

    // Add event handlers to detect track ending
    track.onended = () => {
        console.log(`Track ${track.id} ended, but not removing from tracking - may reconnect`);
        // Don't remove from receivedTracks to support quick reconnection
    };
    
    track.onmute = () => {
        console.log(`Track ${track.id} muted, maintaining connection`);
    };
    
    track.onunmute = () => {
        console.log(`Track ${track.id} unmuted, stream is active again`);
    };

    // Create Sinks
    if (track.kind === 'video') {
        let videoSink: InstanceType<typeof RTCVideoSink> | null = null;
        
        try {
            console.log(`Creating RTCVideoSink for track ${track.id}`);
            videoSink = new RTCVideoSink(track);
            videoSink.onstopped = () => { 
                console.log(`VideoSink stopped event for track ${track.id}`); 
                // Don't stop FFmpeg immediately - give time for reconnection
                setTimeout(() => {
                    // Only stop if we don't have this track anymore
                    if (!receivedTracks.has(track.id)) {
                        console.log(`No reconnection detected for track ${track.id}, stopping FFmpeg`);
                    }
                }, 10000); // 10 seconds grace period for reconnection
            };
            console.log("RTCVideoSink created.");
            
            // Set the video sink in FFmpeg
            setVideoSink(videoSink);
            
            // Start FFmpeg
            startFFmpeg();
        } catch(e) {
            console.error("Error creating RTCVideoSink:", e);
            setVideoSink(null);
        }
    } else if (track.kind === 'audio') {
        // Audio sink implementation (no need for now)
    }
}

// Handles connection state changes
export function onConnectionStateChange(pc: RTCPeerConnection) {
    console.log(`Server PeerConnection state: ${pc.connectionState}`);
    if (pc.connectionState === 'disconnected' || 
        pc.connectionState === 'failed' || 
        pc.connectionState === 'closed') {
        
        console.log("Server PeerConnection disconnected/closed/failed.");
        stopFFmpeg();
        
        if (peerConnection === pc) {
            peerConnection = null;
            receivedTracks.clear();
        }
    }
}

// Create a new RTCPeerConnection with optimized settings
export function createPeerConnection(iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
]) {
    // Create peer connection with optimized configuration
    const pc = new RTCPeerConnection({ 
        iceServers,
        // RTCPeerConnection configuration to reduce latency
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        // Set ICE candidate pool size to speed up connection establishment
        iceCandidatePoolSize: 1,
        // Prioritize performance over bandwidth saving
        sdpSemantics: 'unified-plan'
    });
    
    // Add event handlers for better monitoring
    pc.addEventListener('iceconnectionstatechange', () => {
        console.log(`ICE connection state changed to: ${pc.iceConnectionState}`);
    });
    
    pc.addEventListener('icegatheringstatechange', () => {
        console.log(`ICE gathering state changed to: ${pc.iceGatheringState}`);
    });
    
    pc.addEventListener('signalingstatechange', () => {
        console.log(`Signaling state changed to: ${pc.signalingState}`);
    });
    
    // Store the peer connection
    peerConnection = pc;
    console.log('Server PeerConnection created with optimized settings');
    return pc;
}

// cleanup when WRTC connection ends 
export function cleanupWebRTC(specificPc?: RTCPeerConnection, fullCleanup: boolean = true) {
    if (fullCleanup) {
        // Only stop FFmpeg if we're doing a full cleanup
        stopFFmpeg();
    }
    
    if (specificPc) {
        if (fullCleanup) {
            specificPc.close();
            if (peerConnection === specificPc) {
                peerConnection = null;
                receivedTracks.clear();
            }
        } else {
            // Partial cleanup - don't close connection
            console.log('Performing partial cleanup, keeping connection alive for reconnection');
            // Just perform minimal cleanup without fully closing the connection
        }
    } else if (peerConnection) {
        if (fullCleanup) {
            peerConnection.close();
            peerConnection = null;
            receivedTracks.clear();
        } else {
            // Partial cleanup
            console.log('Performing partial cleanup on global connection, keeping resources alive');
        }
    }
}

// Get  current peer connection
export function getPeerConnection() {
    return peerConnection;
}

// Clear the current peer connection
export function resetPeerConnection(fullReset: boolean = true) {
    if (peerConnection) {
        if (fullReset) {
            peerConnection.close();
            peerConnection = null;
            receivedTracks.clear();
        } else {
            // Soft reset - keep the connection alive but reset internal state
            console.log('Performing soft reset on peer connection');
            // Don't clear tracks to maintain session persistence
        }
    }
}

