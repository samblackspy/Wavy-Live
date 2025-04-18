# WebRTC to HLS Live Streaming System (Assignment)

## Description

This project implements a basic live streaming system as part of an assignment. It allows a user to broadcast live video from their web browser using WebRTC. The stream is sent to a Node.js backend server, which then uses FFmpeg to transcode the raw video feed into the HLS (HTTP Live Streaming) format. The backend also serves these HLS files via an HTTP server, allowing other users to watch the live stream in their browsers using an HLS player.

The primary goal was to demonstrate the end-to-end pipeline:
**Browser (WebRTC Ingest) -> Node.js Backend (Signaling, WebRTC Server, FFmpeg Control) -> FFmpeg (Transcoding) -> HLS Files -> Node.js Backend (HTTP Serving) -> Browser (HLS Playback)**

Built with TypeScript, Next.js (for frontend), Node.js (for backend), and managed using Turborepo.

## Features

* **Browser-based Broadcasting:** Start a live video stream directly from a web page using your webcam.
* **WebRTC Ingest:** Uses standard WebRTC `RTCPeerConnection` to send media to the backend.
* **Server-Side Processing:** Node.js backend receives the WebRTC stream.
* **Dynamic FFmpeg Transcoding:** Spawns FFmpeg dynamically based on the incoming video's resolution.
* **Performance Optimizations:** Includes frame skipping, resolution scaling, and optimized FFmpeg parameters (`ultrafast` preset, reduced FPS) to manage CPU load during transcoding.
* **HLS Generation:** FFmpeg outputs HLS (`.m3u8` playlist and `.ts` segments).
* **HLS Serving:** Backend uses Express to serve the generated HLS files over HTTP.
* **Browser-based Viewing:** A dedicated page uses `hls.js` to play the HLS stream.
* **Offline/Retry Handling:** Viewer page includes basic retries and status updates if the stream isn't immediately available.

## Architecture Overview

1.  **Broadcaster Client (`apps/web/app/broadcast`):**
    * Uses `getUserMedia` to access camera.
    * Establishes WebSocket connection to Backend for signaling.
    * Creates WebRTC `RTCPeerConnection`.
    * Sends SDP offer and ICE candidates.
    * Receives SDP answer and ICE candidates.
    * Sends video track over the established WebRTC connection.
2.  **Backend Server (`apps/api`):**
    * **WebSocket Server:** Handles signaling between broadcaster and backend (`offer`, `answer`, `ice-candidate`).
    * **WebRTC Handling (`@koush/wrtc`):** Creates server-side `RTCPeerConnection`, performs SDP/ICE exchange.
    * **Track Handling (`ontrack`):** Receives the video `MediaStreamTrack`.
    * **Sink & Piping (`RTCVideoSink`):** Creates an `RTCVideoSink` to get raw video frames from the track.
    * **FFmpeg Control:** Spawns an FFmpeg process when the first video frame arrives, using the frame's dimensions.
    * **Data Piping:** The `onframe` handler pipes raw video frame data to FFmpeg's standard input, implementing frame skipping to handle backpressure.
    * **HLS Output:** FFmpeg transcodes the raw video and outputs HLS files to the `./apps/api/output` directory.
    * **HTTP Server (Express):** Serves static files from the `./apps/api/output` directory under the `/hls` route (e.g., `http://localhost:8001/hls/stream.m3u8`).
3.  **Viewer Client (`apps/web/app/watch`):**
    * Uses `hls.js` library.
    * Connects to the backend's HLS URL (`/hls/stream.m3u8`).
    * Plays the live stream in an HTML `<video>` element.
    * Handles stream loading, offline states, and retries.

## Technology Stack

* **Monorepo:** Turborepo
* **Language:** TypeScript
* **Frontend:** Next.js (App Router), React
* **Backend:** Node.js, Express.js
* **Real-time Communication:** WebRTC (`@koush/wrtc` for server-side), WebSockets (`ws` library for signaling)
* **Media Processing:** FFmpeg (requires separate installation)
* **HLS Playback:** `hls.js` library
* **Package Manager:** pnpm (can be adapted for npm/yarn)

## Prerequisites

* **Node.js:** v18 or later recommended.
* **pnpm:** (or npm/yarn) - Installation guide: [https://pnpm.io/installation](https://pnpm.io/installation)
* **FFmpeg:** Must be installed on your system and accessible via the command line (i.e., in your system's PATH).
    * Check installation: `ffmpeg -version`
    * Download: [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html) (Gyan.dev builds are often recommended for Windows).

## Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone [Your Repository Link Here]
    cd [your-project-directory]
    ```
2.  **Install dependencies:** From the root directory of the project:
    ```bash
    pnpm install
    ```
    *(This will install dependencies for all apps and packages in the Turborepo setup).*

## Running the Application Locally

You need to run both the backend and frontend servers.

1.  **Start the Backend Server:**
    ```bash
    # From the project root directory
    pnpm --filter api run dev
    # OR: cd apps/api && pnpm dev
    ```
    *This will start the Node.js server (WebSocket on port 8080, HTTP on port 8001 by default) using `tsx` for live reload.*

2.  **Start the Frontend Server:** In a **separate terminal**:
    ```bash
    # From the project root directory
    pnpm --filter web run dev
    # OR: cd apps/web && pnpm dev
    ```
    *This will start the Next.js development server (usually on port 3000).*

3.  **(Alternative) Run Both Concurrently (if configured):** If your root `package.json` and `turbo.json` are set up for concurrent execution, you might be able to run from the root:
    ```bash
    # From the project root directory
    pnpm run dev
    ```

## Usage

1.  **Broadcaster:** Open your web browser and navigate to `http://localhost:3000/broadcast` (adjust port if needed).
2.  Click the "Start Stream" button. Allow camera/microphone permissions if prompted.
3.  Check the backend console logs to confirm the WebRTC connection is established and FFmpeg has started processing frames.
4.  **Viewer:** Wait ~10-15 seconds after starting the broadcast for HLS segments to generate. Then, open a new browser tab and navigate to `http://localhost:3000/watch`.
5.  The video player should load and start playing the stream after a short buffering delay inherent to HLS.

## Known Issues & Limitations

* **Performance Bottleneck:** The server-side FFmpeg transcoding process is CPU-intensive. On many systems, it cannot process the incoming raw video feed (even at reduced resolution/FPS) in real-time indefinitely.
* **Stream Stability:** Due to the performance bottleneck, aggressive frame skipping is implemented on the backend. While this helps prevent crashes, it results in a **choppy/laggy viewing experience** with a reduced frame rate. The WebRTC connection may still eventually enter a `failed` state if the bottleneck persists.
* **Audio Not Implemented:** This implementation focuses on the video pipeline. Audio track handling (`RTCAudioSink`) and piping/encoding audio in FFmpeg are not included. The current FFmpeg command uses `-an` (no audio).
* **Basic Error Handling:** Error handling is basic, primarily focused on console logging. Production systems would require more robust error recovery and user feedback.
* **No Security:** No authentication or authorization is implemented. Signaling and media endpoints are unprotected.
* **Scalability:** Designed for a single broadcaster and local testing only. Does not scale to multiple broadcasters or viewers without significant architectural changes (e.g., using an SFU like Mediasoup).
* **Configuration:** Resolution, FPS, and FFmpeg parameters are currently hardcoded (though resolution detection is implemented).

## Future Improvements (Optional)

* Implement audio track handling and processing.
* Investigate hardware-accelerated encoding (e.g., NVENC, QSV, VAAPI) in FFmpeg to reduce CPU load.
* Implement more robust error handling and recovery.
* Add user authentication and stream management.
* Improve UI/UX for broadcaster and viewer.
* Explore using WHIP for direct WebRTC ingest into compatible media servers.
* Integrate an SFU like Mediasoup for multi-party or more scalable scenarios.