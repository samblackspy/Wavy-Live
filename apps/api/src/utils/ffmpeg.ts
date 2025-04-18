import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { 
    HLS_OUTPUT_DIR,
    HLS_SEGMENT_DURATION,
    HLS_PLAYLIST_SIZE,
    VIDEO_WIDTH,
    VIDEO_HEIGHT,
    VIDEO_FRAMERATE,
    VIDEO_FORMAT,
    FFMPEG_CRF,
    FFMPEG_PRESET,
    FFMPEG_GOP_SIZE,
    FFMPEG_MAX_BITRATE,
    FFMPEG_THREADS,
    FFMPEG_TUNE,
    FFMPEG_BUFSIZE,
    FFMPEG_PIXEL_FORMAT,
    FFMPEG_PROFILE,
    FFMPEG_LEVEL,
    FFMPEG_X264_OPTS
} from '../config';

// Types import for wrtc
import wrtc from '@koush/wrtc';
const { nonstandard: { RTCVideoSink, RTCAudioSink } } = wrtc;

// Global state variables
let ffmpegProcess: ChildProcessWithoutNullStreams | null = null;
let ffmpegStarted = false;
let videoSink: InstanceType<typeof RTCVideoSink> | null = null;
let audioSink: InstanceType<typeof RTCAudioSink> | null = null;

// Minimal buffer management with direct streaming
let directWriteMode = true; // By default use direct write mode
let frameBuffer: Buffer[] = [];
const MAX_BUFFER_SIZE = 10; // Much smaller buffer for emergency use only
let processingFrame = false;
let ffmpegWritable = true;
let frameCount = 0;
let droppedFrames = 0;
let lastPerformanceLog = Date.now();
let lastFrameCount = 0;
let consecutiveBackpressure = 0;
let lastFfmpegSpeed = 0;

// Performance monitoring
let performanceMonitorInterval: NodeJS.Timeout | null = null;

// Ensures outdir for HLS segment exists
export function ensureOutputDirectoryExists() {
    if (!fs.existsSync(HLS_OUTPUT_DIR)) {
        console.log(`Creating HLS output directory: ${HLS_OUTPUT_DIR}`);
        fs.mkdirSync(HLS_OUTPUT_DIR, { recursive: true });
    }
}

// Process frame directly or from minimal buffer
function processFrame(frameData: Buffer) {
    if (!ffmpegProcess || !ffmpegProcess.stdin || ffmpegProcess.stdin.writableEnded) {
        return false;
    }
    
    try {
        // Direct write to FFmpeg
        return ffmpegProcess.stdin.write(frameData, (err) => {
            if (err) {
                console.error("Write error:", err.message);
                ffmpegWritable = false;
            }
        });
    } catch (err) {
        console.error("Error writing to FFmpeg:", err);
        ffmpegWritable = false;
        return false;
    }
}

// Handle backpressure by switching to minimal buffering
function handleBackpressure() {
    directWriteMode = false;
    consecutiveBackpressure++;
    
    // Set up drain handler to resume direct writing
    if (ffmpegProcess?.stdin) {
        ffmpegProcess.stdin.once('drain', () => {
            ffmpegWritable = true;
            // After 3 consecutive drains, switch back to direct mode
            if (++consecutiveBackpressure >= 3) {
                directWriteMode = true;
                consecutiveBackpressure = 0;
                console.log('Switching back to direct write mode');
                
                // Process any remaining frames in buffer
                if (frameBuffer.length > 0) {
                    drainBuffer();
                }
            }
        });
    }
}

// Drain buffer when FFmpeg is ready
function drainBuffer() {
    if (!ffmpegWritable || !ffmpegProcess?.stdin || frameBuffer.length === 0) return;
    
    while (frameBuffer.length > 0 && ffmpegWritable) {
        const frameData = frameBuffer.shift();
        if (frameData) {
            const canWrite = processFrame(frameData);
            if (!canWrite) {
                handleBackpressure();
                break;
            }
        }
    }
}

// Start performance monitoring
function startPerformanceMonitoring() {
    if (performanceMonitorInterval) clearInterval(performanceMonitorInterval);
    
    performanceMonitorInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastPerformanceLog > 5000) {
            const elapsedSeconds = (now - lastPerformanceLog) / 1000;
            const newFrames = frameCount - lastFrameCount;
            const fps = Math.round(newFrames / elapsedSeconds);
            
            console.log(`-------- Performance Stats --------`);
            console.log(`Input FPS: ${fps}, Dropped: ${droppedFrames}`);
            console.log(`Buffer Mode: ${directWriteMode ? 'Direct' : 'Buffered'}`);
            console.log(`Buffer Size: ${frameBuffer.length}/${MAX_BUFFER_SIZE}`);
            console.log(`FFmpeg Speed: ${lastFfmpegSpeed}x`);
            console.log(`-----------------------------------`);
            
            lastFrameCount = frameCount;
            lastPerformanceLog = now;
            droppedFrames = 0; // Reset dropped frames counter
        }
    }, 5000);
}

// Spawns FFmpeg process with ultra-optimized parameters
export function spawnAndAttachListeners(width: number, height: number) {
    if (ffmpegProcess) {
        console.log('FFmpeg process already running.');
        return;
    }

    ensureOutputDirectoryExists();
    
    // Use config parameters imported at the top level
    console.log(`Using configured video settings: ${VIDEO_WIDTH}x${VIDEO_HEIGHT} at ${VIDEO_FRAMERATE}fps`);

    // Ultra low-latency FFmpeg arguments
    const args = [
        // Input settings - use native format without conversion
        '-f', 'rawvideo',
        '-pix_fmt', VIDEO_FORMAT,
        '-s', `${width}x${height}`,
        '-r', String(VIDEO_FRAMERATE),
        '-i', 'pipe:0',
        
        // Skip audio for now
        '-an',
        
        // Scale only if necessary
        ...(width !== VIDEO_WIDTH || height !== VIDEO_HEIGHT ? 
            ['-vf', `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`] : []),
        
        // Ultra-fast encoding
        '-c:v', 'libx264',
        '-preset', 'ultrafast',  // Override to fastest preset for low CPU usage
        '-tune', 'zerolatency',  // Essential for low latency
        
        // Optimize for speed over quality
        '-crf', '28',  // Use higher CRF (lower quality) for faster encoding
        '-g', '30',     // Shorter GOP for lower latency
        '-keyint_min', '15',
        '-sc_threshold', '0',    // Disable scene detection for speed
        
        // Reduced bitrate for faster processing
        '-maxrate', '1500k',
        '-bufsize', '500k',
        
        // Use multiple threads
        '-threads', String(FFMPEG_THREADS),

        // Extreme low-latency optimizations
        '-fflags', 'nobuffer',  // Critically important - disable input buffering
        '-flags', 'low_delay',  // Prioritize low delay
        '-strict', 'experimental',
        '-avioflags', 'direct',
        
        // Minimize pre/post processing
        '-profile:v', 'baseline',
        '-level', '3.0',
        '-x264opts', 'no-scenecut:vbv-maxrate=1500:vbv-bufsize=500:no-mbtree:sliced-threads:sync-lookahead=0',
        
        // Very small HLS segments for lower latency
        '-f', 'hls',
        '-hls_time', '1',  // 1-second segments
        '-hls_list_size', '5',  // Keep only 5 segments
        '-hls_flags', 'delete_segments+independent_segments+append_list',
        '-hls_segment_filename', path.join(HLS_OUTPUT_DIR, 'segment%03d.ts'),
        path.join(HLS_OUTPUT_DIR, 'stream.m3u8'),
    ];

    console.log(`Spawning FFmpeg with ultra-optimized settings...`);

    try {
        // Spawn with higher process priority
        const process = spawn('ffmpeg', args, { 
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        ffmpegProcess = process;
        ffmpegWritable = true;
        directWriteMode = true;

        // Attach optimized listeners
        process.stderr.on('data', (data) => {
            const output = data.toString();
            
            // Extract speed without logging all FFmpeg output
            const speedMatch = output.match(/speed=\s*([0-9.]+)x/);
            if (speedMatch && speedMatch[1]) {
                lastFfmpegSpeed = parseFloat(speedMatch[1]);
            }
            
            // Only log errors and warnings
            if (output.includes('Error') || output.includes('Warning')) {
                console.log(`FFmpeg: ${output}`);
            }
        });
        
        process.on('close', (code) => {
            console.log(`FFmpeg process exited with code ${code}`);
            cleanup();
        });
        
        process.on('error', (err) => {
            console.error('FFmpeg process error:', err);
            cleanup();
        });
        
        process.stdin.on('error', (err) => {
            console.error('FFmpeg stdin error:', err.message);
            ffmpegWritable = false;
            cleanup();
        });

        console.log("FFmpeg process spawned successfully.");
        startPerformanceMonitoring();
        
    } catch (spawnError) {
        console.error("Error spawning FFmpeg:", spawnError);
        cleanup();
    }
    
    function cleanup() {
        if (videoSink) videoSink.onframe = null;
        ffmpegProcess = null;
        ffmpegStarted = false;
        ffmpegWritable = false;
    }
}

// Start the FFmpeg processing with direct writing preferred
export function startFFmpeg() {
    if (!videoSink) {
        console.error("Cannot start FFmpeg handling: Video sink not ready.");
        return;
    }
    
    if (videoSink.onframe) {
        console.log("FFmpeg handler already attached.");
        return;
    }

    console.log("Attaching ultra-optimized video sink handler...");
    
    // Reset statistics
    frameCount = 0;
    droppedFrames = 0;
    lastPerformanceLog = Date.now();
    lastFrameCount = 0;
    frameBuffer = [];
    ffmpegWritable = true;
    directWriteMode = true;

    // Main frame handling function - optimized for ultra-low latency
    videoSink.onframe = ({ frame }: { frame: { width: number, height: number, data: Buffer } }) => {
        // Initialize FFmpeg on first frame
        if (!ffmpegStarted) {
            console.log(`First frame received (${frame.width}x${frame.height}). Starting FFmpeg...`);
            ffmpegStarted = true;
            spawnAndAttachListeners(frame.width, frame.height);
        }

        frameCount++;
        
        // Only process 1 in 2 frames for smoother performance
        if (frameCount % 2 !== 0) {
            return;
        }
        
        // If in direct write mode, try to write immediately
        if (directWriteMode && ffmpegWritable) {
            const canWrite = processFrame(frame.data);
            if (!canWrite) {
                // If write fails, switch to buffer mode and save frame
                handleBackpressure();
                if (frameBuffer.length < MAX_BUFFER_SIZE) {
                    frameBuffer.push(frame.data);
                } else {
                    droppedFrames++;
                }
            }
        }
        // Otherwise use small emergency buffer
        else if (frameBuffer.length < MAX_BUFFER_SIZE) {
            frameBuffer.push(frame.data);
            // Try to drain buffer if possible
            if (ffmpegWritable) {
                drainBuffer();
            }
        } else {
            droppedFrames++;
        }
    };
}

// Stops the FFmpeg process and cleans up resources
export function stopFFmpeg() {
    console.log('Stopping FFmpeg and cleaning up...');

    // Clear performance monitor
    if (performanceMonitorInterval) {
        clearInterval(performanceMonitorInterval);
        performanceMonitorInterval = null;
    }
    
    // Clear frame buffer
    frameBuffer = [];
    
    // Stop video sink
    if (videoSink) {
        console.log("Stopping VideoSink...");
        videoSink.onframe = null;
        if (!videoSink.stopped) videoSink.stop();
    }
    videoSink = null;

    // Stop FFmpeg process
    if (ffmpegProcess) {
        console.log("Stopping FFmpeg process...");
        
        // Close stdin first
        if (ffmpegProcess.stdin && !ffmpegProcess.stdin.destroyed) {
            ffmpegProcess.stdin.end();
        }

        // Force kill after timeout
        const killTimeout = setTimeout(() => {
            if (ffmpegProcess && !ffmpegProcess.killed) {
                console.log('Sending SIGKILL to FFmpeg.');
                ffmpegProcess.kill('SIGKILL');
            }
        }, 2000);

        // Send SIGINT
        if (ffmpegProcess && !ffmpegProcess.killed) {
            ffmpegProcess.kill('SIGINT');
        } else {
            clearTimeout(killTimeout);
        }
    }

    ffmpegProcess = null;
    ffmpegStarted = false;
    ffmpegWritable = false;
    console.log("Cleanup complete.");
}

// Set video sink to be used by FFmpeg
export function setVideoSink(sink: InstanceType<typeof RTCVideoSink> | null) {
    videoSink = sink;
}

/**
 * Gets the current state of the FFmpeg process
 */
export function getFfmpegState() {
    return {
        isRunning: !!ffmpegProcess,
        ffmpegStarted,
        directWriteMode,
        bufferSize: frameBuffer.length,
        ffmpegSpeed: lastFfmpegSpeed
    };
}
