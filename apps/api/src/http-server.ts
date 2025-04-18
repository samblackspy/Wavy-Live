import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { HLS_OUTPUT_DIR } from './config';
import fs from 'fs';

export function startHttpServer(port: number): http.Server {
    const app = express();

    // Enable CORS 
    app.use(cors());

    // --- Serve HLS files ---
    const staticPath = path.resolve(HLS_OUTPUT_DIR);
    console.log(`Serving HLS files from: ${staticPath}`);

    // Create directory if it doesn't exist (important!)
    if (!fs.existsSync(staticPath)) {
        console.log(`Creating HLS output directory: ${staticPath}`);
        fs.mkdirSync(staticPath, { recursive: true });
    }


    // Serve static files from the HLS output directory under the '/hls' route
    app.use('/hls', express.static(staticPath, {
        setHeaders: (res, filePath) => {
            if (path.extname(filePath) === '.m3u8') {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            } else if (path.extname(filePath) === '.ts') {
                res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache segments for 1 hour
            }
        },
    }));
    // --- End HLS Serving ---

    //  testing
    app.get('/', (req, res) => {
        res.send('HLS Server is running. Access stream at /hls/stream.m3u8');
    });

    // Start the HTTP server
    const httpServer = app.listen(port, () => {
        console.log(`HTTP Server listening on http://localhost:${port}`);
    });

    httpServer.on('error', (error) => {
        console.error(`HTTP Server error:`, error);
    });

    //   graceful shutdown
    return httpServer;
}