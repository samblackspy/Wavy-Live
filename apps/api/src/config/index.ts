import * as path from 'path';
// Server configuration
export const WS_PORT = 8080;
export const HTTP_PORT = 8001;
// HLS output configuration
export const HLS_OUTPUT_DIR = path.join(__dirname, '..', 'output'); // Directory for HLS output
// Video settings
export const VIDEO_WIDTH = 640;  // Match input resolution (from logs)
export const VIDEO_HEIGHT = 360; // Match input resolution (from logs)
export const VIDEO_FRAMERATE = 15; // Lower framerate for better performance while maintaining quality
export const VIDEO_FORMAT = 'yuv420p'; // Pixel format for input video
// FFmpeg settings
export const FFMPEG_CRF = 28;          // Higher CRF (lower quality) for much faster encoding
export const FFMPEG_PRESET = 'ultrafast'; // Fastest encoding preset
export const FFMPEG_GOP_SIZE = 15;     // Very small GOP size for lower latency
export const FFMPEG_MAX_BITRATE = '1000k'; // Lower bitrate for faster encoding
export const FFMPEG_THREADS = 8;      // Increased thread count for better parallelization
export const FFMPEG_TUNE = 'zerolatency'; // Optimize for low-latency streaming
export const FFMPEG_BUFSIZE = '2000k'; // Buffer size (larger than max bitrate for smoother encoding)
export const FFMPEG_PIXEL_FORMAT = 'yuv420p'; // Pixel format
export const FFMPEG_PROFILE = 'baseline'; // Use baseline profile for faster encoding
export const FFMPEG_LEVEL = '3.0';    // Lower level for better compatibility and speed
export const FFMPEG_X264_OPTS = 'no-cabac:no-8x8dct:partitions=none:ref=1:scenecut=0:me=dia:subme=0:trellis=0'; // Extreme performance options
// HLS settings
export const HLS_SEGMENT_DURATION = 2; // Shorter segments for lower latency
export const HLS_PLAYLIST_SIZE = 10;   // Number of segments to keep in the playlist (increased for better buffering)gg
