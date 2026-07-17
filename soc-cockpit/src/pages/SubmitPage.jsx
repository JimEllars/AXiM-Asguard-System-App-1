import React from 'react';
import OnyxPipeline from '../components/Submit/OnyxPipeline';

export default function SubmitPage() {
  return (
    <div className="h-full p-6 flex flex-col gap-8 overflow-y-auto bg-slate-900 text-slate-50">

      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-blue-400">Operative Intel Submission</h2>
          <p className="text-slate-400 text-sm mt-1">Upload verified field media with strict geographic metadata.</p>
        </div>
        <div className="text-xs bg-blue-950/50 border border-blue-900 px-3 py-1.5 rounded-md text-blue-400 font-mono">
          SYSTEM: ONYX ACTIVE
        </div>
      </div>

      <div className="mt-8 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
        <OnyxPipeline />
      </div>

    </div>
  );
}
