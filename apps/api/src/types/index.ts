// Types for client-server communication
export interface ClientSignalingMessage {
  type: 'offer' | 'ice-candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

export interface ServerSignalingMessage {
  type: 'answer' | 'ice-candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

// FFmpeg status type
export type FFmpegStatus = 'initial' | 'running' | 'stopping' | 'stopped';
