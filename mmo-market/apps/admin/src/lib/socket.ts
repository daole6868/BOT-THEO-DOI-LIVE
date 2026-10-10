'use client';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Kết nối realtime của nhân sự (cookie admin_sid, phòng staff). */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_WS_URL || window.location.origin, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      auth: { area: 'admin' },
    });
    setInterval(() => socket?.connected && socket.emit('presence:ping'), 30_000);
  }
  return socket;
}

export function resetSocket() {
  socket?.disconnect();
  socket = null;
}
