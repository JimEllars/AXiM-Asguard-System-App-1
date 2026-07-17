import React, { useState, useEffect } from 'react';

// For simplicity in this scaffolding phase, we pass a prop or use a local state.
// In a full implementation, this would read from the auth context or cookies.
export default function LiveChat({ isAuthenticated = false }) {
  const [messages, setMessages] = useState([
    { id: 1, user: 'System', text: 'Chat active. Awaiting broadcast.', time: '12:00 PM', isSystem: true },
    { id: 2, user: 'WeatherWatcher99', text: 'Looks like the storm front is shifting west.', time: '12:01 PM' },
    { id: 3, user: 'StormChaserBob', text: 'Checking radar now, massive cell developing.', time: '12:03 PM' }
  ]);
  const [inputValue, setInputValue] = useState('');

  // Auto-scroll to bottom dummy ref logic could go here

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !isAuthenticated) return;

    setMessages([...messages, {
      id: Date.now(),
      user: 'You', // Placeholder for current user name
      text: inputValue.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    setInputValue('');
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">

      {/* Chat Header */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-200 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"></path></svg>
          Ecosystem Comms
        </h3>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-emerald-400">142 ONLINE</span>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.map((msg) => (
          <div key={msg.id} className="text-sm">
            {msg.isSystem ? (
              <div className="text-center font-mono text-xs text-slate-500 my-2">
                --- {msg.text} ---
              </div>
            ) : (
              <div>
                <span className="text-xs text-slate-500 mr-2">{msg.time}</span>
                <span className="font-semibold text-blue-400 mr-2">{msg.user}:</span>
                <span className="text-slate-300">{msg.text}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-900 border-t border-slate-800">
        {isAuthenticated ? (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Send message to ecosystem..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded text-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              Send
            </button>
          </form>
        ) : (
          <div className="flex flex-col items-center justify-center p-3 border border-slate-800 border-dashed rounded bg-slate-950/50">
            <p className="text-sm text-slate-400 mb-2">You must be logged in to chat.</p>
            <button className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-1.5 rounded transition-colors border border-slate-700">
              Access Terminal
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
