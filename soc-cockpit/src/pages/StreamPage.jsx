import LiveChat from "../components/Stream/LiveChat";
import React, { useState } from 'react';

const MOCK_VODS = [
  {
    id: 1,
    title: "Hurricane Alpha Update",
    thumbnail: "https://via.placeholder.com/320x180/0f172a/38bdf8?text=Hurricane+Alpha",
    timestamp: "2023-10-27T14:30:00Z",
    duration: "14:20"
  },
  {
    id: 2,
    title: "Tornado Warning Central",
    thumbnail: "https://via.placeholder.com/320x180/0f172a/38bdf8?text=Tornado+Warning",
    timestamp: "2023-10-26T09:15:00Z",
    duration: "08:45"
  },
  {
    id: 3,
    title: "Winter Storm Beta Coverage",
    thumbnail: "https://via.placeholder.com/320x180/0f172a/38bdf8?text=Winter+Storm",
    timestamp: "2023-10-25T18:00:00Z",
    duration: "22:10"
  },
  {
    id: 4,
    title: "Flash Flood Watch",
    thumbnail: "https://via.placeholder.com/320x180/0f172a/38bdf8?text=Flash+Flood",
    timestamp: "2023-10-24T11:45:00Z",
    duration: "05:30"
  }
];

export default function StreamPage() {
  // Toggle this to test online/offline state
  const [isLive] = useState(false);
  const streamUrl = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

  return (
    <div className="h-full p-6 flex flex-col gap-8 overflow-y-auto bg-slate-900 text-slate-50">

      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-blue-400">Live Weather Broadcast</h2>
          <p className="text-slate-400 text-sm mt-1">Real-time analysis from the Streamlabs studio.</p>
        </div>
        <div className={`text-xs px-3 py-1.5 rounded-md font-mono border ${isLive ? 'bg-emerald-950/50 border-emerald-900 text-emerald-400' : 'bg-red-950/50 border-red-900 text-red-400'}`}>
          STATUS: {isLive ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-7xl mx-auto">
        <div className="flex-1">
      <div className="w-full max-w-5xl mx-auto">
        <div className="relative aspect-video rounded-xl overflow-hidden border-2 border-slate-700 bg-black/50 backdrop-blur-md shadow-2xl">
          {isLive ? (
            <video
              controls
              className="w-full h-full object-cover"
              src={streamUrl}
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950">
              <div className="w-16 h-16 mb-4 rounded-full bg-slate-800 flex items-center justify-center border-2 border-slate-700">
                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-400 tracking-widest">BROADCAST OFFLINE</h3>
              <p className="text-slate-500 mt-2 font-mono text-sm">Awaiting signal from studio...</p>
            </div>
          )}
        </div>
      </div>

      </div>
        <div className="w-full lg:w-96 h-[600px] lg:h-auto">
          <LiveChat isAuthenticated={false} />
        </div>
      </div>

      {/* VOD Grid */}
      <div className="w-full max-w-7xl mx-auto mt-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-slate-200">Recent Updates (VOD)</h3>
          <div className="text-xs text-slate-500 font-mono">ARCHIVE ACCESS ENABLED</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {MOCK_VODS.map((vod) => (
            <div key={vod.id} className="group flex flex-col gap-3 rounded-lg overflow-hidden bg-slate-800/30 border border-slate-800 hover:border-slate-600 transition-colors cursor-pointer">
              <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                <img
                  src={vod.thumbnail}
                  alt={vod.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80 group-hover:opacity-100"
                />
                <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs font-mono text-slate-300">
                  {vod.duration}
                </div>
              </div>
              <div className="p-3 pt-0">
                <h4 className="font-medium text-slate-200 line-clamp-2 leading-snug group-hover:text-blue-400 transition-colors">
                  {vod.title}
                </h4>
                <div className="text-xs text-slate-500 mt-2 font-mono">
                  {new Date(vod.timestamp).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
