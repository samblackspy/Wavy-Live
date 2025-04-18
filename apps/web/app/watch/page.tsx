'use client'; 
import React, { useEffect, useRef, useState } from 'react'; 
import Hls from 'hls.js';  
import styles from "./page.module.css"

// URL where the backend serves the HLS playlist
const HLS_STREAM_URL = '/hls/stream.m3u8'; 
const MAX_LOAD_RETRIES = 5; //  (Attempts will be 1 through 6)
const RETRY_DELAY_MS = 3000; // Wait 3 seconds between retries

type StreamStatus = 'loading' | 'playing' | 'offline' | 'error';

export default function WatchPage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsInstanceRef = useRef<Hls | null>(null); 
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);  

     const [retryCount, setRetryCount] = useState<number>(0); 
    const retryCountRef = useRef<number>(0); 
    const [streamStatus, setStreamStatus] = useState<StreamStatus>('loading');
    // ----------------------------------------------------------

    useEffect(() => {
        const videoElement = videoRef.current;
        let hls: Hls | null = null;  
        if (!videoElement) {
            console.error("Video element not found");
            return;
        }

        // Function to start loading the stream
        const startLoadingStream = () => { 
            if (!hlsInstanceRef.current) {
                console.log("HLS instance not available for loading (might be destroyed).");
                return;
            } 
            console.log(`Attempting to load stream (Attempt: ${retryCountRef.current + 1})...`);
            hlsInstanceRef.current.loadSource(HLS_STREAM_URL);
        };

        //  HLS.js Setup
        if (Hls.isSupported()) {
            console.log("hls.js is supported, initializing...");
            hls = new Hls({
                 debug: false,
                 fragLoadingMaxRetry: 4,
                 manifestLoadingMaxRetry: 1, // Handle main retries manually
                 manifestLoadingRetryDelay: 500,
            });
            hlsInstanceRef.current = hls;

            hls.attachMedia(videoElement);

            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                console.log('hls.js attached. Starting initial load.');
                retryCountRef.current = 0; // Reset Ref
                setRetryCount(0);          // Reset State
                setStreamStatus('loading');
                startLoadingStream();
            });

            hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                console.log(`Manifest loaded, levels found: ${data.levels.length}`);
                setStreamStatus('playing');
                retryCountRef.current = 0; // Reset Ref on success
                setRetryCount(0);          // Reset State on success
                if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

                videoElement.play().catch(e => {
                    console.error("Autoplay failed (user interaction likely needed):", e);
                });
            });
 
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.warn(`HLS Error: Type=${data.type}, Details=${data.details}, Fatal=${data.fatal}`);

                 if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                             if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
                                data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT ||
                                (data.response?.code === 404))
                            {
                                //  Check the REF for the limit
                                if (retryCountRef.current < MAX_LOAD_RETRIES) {
                                    // Increment the Ref IMMEDIATELY
                                    retryCountRef.current++;
                                    // Update the State to trigger UI refresh
                                    setRetryCount(retryCountRef.current);

                                    console.warn(`Manifest load error (${data.details}). Retry count: ${retryCountRef.current}`);
                                    const delay = RETRY_DELAY_MS;
                                    console.log(`Retrying load in ${delay / 1000} seconds...`);
                                    // Clearing previous timer before setting new one
                                    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
                                    retryTimeoutRef.current = setTimeout(() => {
                                        // Check if instance still exists before retrying
                                        if(hlsInstanceRef.current) {
                                            startLoadingStream();
                                        } else {
                                             console.log("Retry skipped: HLS instance was destroyed.");
                                        }
                                    }, delay);
                                    setStreamStatus('loading'); 
                                } else {
                                    
                                    console.error(`Max retries (${MAX_LOAD_RETRIES}) reached for manifest load. Assuming stream is offline.`);
                                    setStreamStatus('offline');
                                    hlsInstanceRef.current?.destroy(); // Destroy on max retries
                                    hlsInstanceRef.current = null;
                                }
                            } else {
                                console.error(`Fatal network error encountered: ${data.details}. Cannot recover.`);
                                setStreamStatus('error');
                                hlsInstanceRef.current?.destroy();
                                hlsInstanceRef.current = null;
                            }
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error(`Fatal media error encountered: ${data.details}. Cannot recover.`);
                            setStreamStatus('error'); // Treat fatal media errors as unrecoverable for now
                            hlsInstanceRef.current?.destroy();
                            hlsInstanceRef.current = null;
                            break;
                        default:
                            console.error(`Unrecoverable fatal error: ${data.details}. Destroying hls instance.`);
                            setStreamStatus('error');
                            hlsInstanceRef.current?.destroy();
                            hlsInstanceRef.current = null;
                            break;
                    }
                }
            });
 

        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
          
            console.log("Native HLS supported. Setting src directly.");
            videoElement.src = HLS_STREAM_URL;
            videoElement.addEventListener('loadedmetadata', () => {
                console.log("Native HLS metadata loaded.");
                setStreamStatus('playing');
                // Reset retries if somehow they ran before native loaded
                retryCountRef.current = 0;
                setRetryCount(0);
                videoElement.play().catch(e => console.error("Autoplay failed:", e));
            });
            videoElement.addEventListener('error', (e) => {
                console.error("Native video element error:", videoElement.error);
                // Simple fallback for native errors
                if (videoElement.networkState === videoElement.NETWORK_NO_SOURCE || videoElement.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                     setStreamStatus('offline');
                } else {
                    setStreamStatus('error');
                }
            });
            
        } else {
            console.error('HLS is not supported in this browser.');
            setStreamStatus('error');
        }
 
        return () => {
            console.log("Watch page unmounting. Cleaning up resources...");
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                console.log("Cleared pending retry timer.");
            }
            const hlsToDestroy = hlsInstanceRef.current;
            if (hlsToDestroy) {
                hlsToDestroy.destroy();
                console.log("hls.js instance destroyed.");
            }
            hlsInstanceRef.current = null;
        };

    }, []); // Empty array so effect runs only once on mount

    const renderContent = () => {
        switch (streamStatus) {
            case 'loading':
                return (
                    <div className={styles.loadingContainer}>
                        <div className={styles.spinner}></div>
                        <p>Loading stream, please wait... (Attempt: {retryCount + 1}/{MAX_LOAD_RETRIES + 1})</p>
                    </div>
                );
            case 'playing':
                return null; // No message needed when playing
            case 'offline':
                return <p className={styles.offline}>Stream is currently offline.</p>;
            case 'error':
                return <p className={styles.error}>An error occurred loading the stream.</p>;
            default:
                return null;
        }
    };

    return (
        <div className={styles.container}>
        <h1 className={styles.heading}>Watch Live Stream</h1>
        <div className={styles.wrapper}>
             <video
                ref={videoRef}
                controls
                className={styles.video}
                muted // Keep muted for autoplay policy
                // Removed autoPlay attribute - relying on .play() call after manifest load
                playsInline
             >
                Your browser does not support the video tag.
             </video>
             {/* Overlay status message when not playing */}
             {(streamStatus !== 'playing') && (
                 <div className={styles.overlay}>
                     {renderContent()}
                 </div>
             )}
        </div>

        <div className={styles.streamInfo}>
            <span>Stream URL:</span>
            <div className={styles.streamUrl}>{HLS_STREAM_URL}</div>
        </div>
    </div>
    );
}
