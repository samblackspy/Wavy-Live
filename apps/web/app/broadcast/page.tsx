'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import styles from './page.module.css';
// message structure 
interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit | RTCIceCandidate;
}

// WebRTC config - using Google's public STUN servers for now
const peerConnectionConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// WebSocket URL
const WEBSOCKET_URL = 'wss://wavylive.xyz/ws'; 

export default function BroadcastPage() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);

   const sendMessage = useCallback((message: SignalingMessage) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      webSocketRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected.');
    }
  }, []);

  // WebSocket Setup
  useEffect(() => {
    console.log('Setting up WebSocket...');
    const ws = new WebSocket(WEBSOCKET_URL);
    webSocketRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setSocketConnected(true);
    };

    ws.onmessage = async (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data);
        const pc = peerConnectionRef.current;

        if (!pc) {
          console.error('PeerConnection not initialized');
          return;
        }

        console.log('Received message:', message.type);

        if (message.type === 'answer') {
          if (message.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
            console.log('Remote description (answer) set.');
          } else {
             console.error('Received answer without SDP');
          }
        } else if (message.type === 'ice-candidate') {
          if (message.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
              console.log('Added received ICE candidate');
            } catch (error) {
              console.error('Error adding received ICE candidate:', error);
            }
          } else {
             console.error('Received ice-candidate without candidate data');
          }
        }
      } catch (error) {
        console.error('Failed to parse message or handle incoming signaling:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setSocketConnected(false);
      webSocketRef.current = null;
   if (isStreaming) {
     handleStopStreaming(); // Stop stream if socket disconnects unexpectedly
   }
};

    // Cleanup function
    return () => {
      console.log('Cleaning up WebSocket.');
      ws.close();
      webSocketRef.current = null;
       if (peerConnectionRef.current) {
           peerConnectionRef.current.close();
           peerConnectionRef.current = null;
       }
       stream?.getTracks().forEach(track => track.stop());
       setStream(null);
       setIsStreaming(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Dependency array is empty, runs once on mount/unmount

  // Start Camera and Stream Logic
  const handleStartStreaming = useCallback(async () => {
    console.log('Attempting to start stream...');
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
        console.error("WebSocket not connected, cannot start stream.");
        return;
    }

    setIsStreaming(true); // Set streaming state

    try {
      // Get User Media
      console.log('Requesting user media...');
     // const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
     const constraints = {
      audio: true,
      video: {
        width: { ideal: 640, max: 640 },
        height: { ideal: 360, max: 360 },
        frameRate: { ideal: 15, max: 15 },
      },
    };
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
     
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
         console.log('Media stream attached to video element.');
      }

      // start PeerConnection
      console.log('Initializing PeerConnection...');
      const pc = new RTCPeerConnection(peerConnectionConfig);
      peerConnectionRef.current = pc;
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
 if (event.candidate) {
   console.log('Generated ICE candidate:', event.candidate.candidate.substring(0, 20) + '...'); 
   sendMessage({ type: 'ice-candidate', candidate: event.candidate });
 }
      };
      pc.onconnectionstatechange = () => {
          console.log(`Peer connection state: ${pc.connectionState}`);
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
              
              console.warn(`Peer connection state changed to ${pc.connectionState}. Might need intervention.`);
          }
      };

       pc.ontrack = (event) => {
           console.log('Received remote track:', event.track.kind);
           // anyways the broadcaster will not receive tracks
       };

      // Add Tracks
      console.log('Adding tracks to PeerConnection...');
      mediaStream.getTracks().forEach(track => {
        pc.addTrack(track, mediaStream);
        console.log(`Track added: ${track.kind}`);
      });

      // Create and Send Offer
      console.log('Creating SDP offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('Local description (offer) set.');
      sendMessage({ type: 'offer', sdp: offer.sdp });
      console.log('Offer sent.');


    } catch (error) {
      console.error('Error starting streaming:', error);
      alert(`Error starting stream: ${error instanceof Error ? error.message : String(error)}`); // Basic user feedback
    }
  }, [sendMessage]); 

  // Stop Streaming Logic
  const handleStopStreaming = useCallback(() => {
    console.log('Stopping stream...');
    setIsStreaming(false);

    // Stop media tracks
    stream?.getTracks().forEach(track => track.stop());
    setStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null; // Clear video preview
    }

    // Close PeerConnection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
       console.log('PeerConnection closed.');
    }

    // // Close WebSocket
    // if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
    //   webSocketRef.current.close();
    //   webSocketRef.current = null;
    //   console.log('WebSocket closed.');
    // }
  }, [stream]);

  return (
    <div className={styles.container}>
    <div className={styles.header}>
      <h1 className={styles.title}>Broadcast Stream</h1>
      <div className={styles.statusContainer}>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>WebSocket Status:</span>
          <span className={`${styles.statusValue} ${socketConnected ? styles.connected : styles.disconnected}`}>
            {socketConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>Streaming Status:</span>
          {isStreaming ? (
            <div className={styles.liveIndicator}>
              <div className={styles.liveIndicatorDot}></div>
              <span className={`${styles.statusValue} ${styles.live}`}>Live</span>
            </div>
          ) : (
            <span className={`${styles.statusValue} ${styles.idle}`}>Idle</span>
          )}
        </div>
      </div>
    </div>
    
    <div className={styles.videoContainer}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={styles.video}
      ></video>
      {!stream && (
        <div className={styles.noVideoOverlay}>
          Camera preview will appear here
        </div>
      )}
    </div>
    
    <div className={styles.controlsContainer}>
      {!isStreaming ? (
        <button 
          className={`${styles.button} ${styles.startButton}`}
          onClick={handleStartStreaming} 
          disabled={!socketConnected || isStreaming}
        >
          {socketConnected ? 'Start Stream' : 'Connecting...'}
        </button>
      ) : (
        <button 
          className={`${styles.button} ${styles.stopButton}`}
          onClick={handleStopStreaming} 
          disabled={!isStreaming}
        >
          Stop Stream
        </button>
      )}
    </div>
    
    <p className={styles.statusMessage}>
      {isStreaming ? 'Broadcasting...' : 'Click "Start Stream" to begin.'}
      {!socketConnected && !isStreaming && ' Waiting for server connection...'}
    </p>
  </div>
  );
}
