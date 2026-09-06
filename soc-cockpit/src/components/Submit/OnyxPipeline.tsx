import React, { useState, useRef } from 'react';

export type PipelineStage = 'idle' | 'uploading' | 'analyzing' | 'mitigated' | 'failed';

interface LocationData {
  lat: number;
  lng: number;
}

interface ToastData {
  type: 'success' | 'error';
  message: string;
}

export default function OnyxPipeline() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<PipelineStage>('idle');
  const [location, setLocation] = useState<LocationData | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const [quarantineIp, setQuarantineIp] = useState('');
  const [isQuarantining, setIsQuarantining] = useState(false);

  const handleQuarantine = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!quarantineIp) return;
    setIsQuarantining(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_INTERCEPTOR_URL}/api/v1/blocklist/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Asguard-Auth': process.env.NEXT_PUBLIC_ASGUARD_API_KEY || ''
        },
        body: JSON.stringify({ ip: quarantineIp, reason: "Manual 1-Click Quarantine from SOC Cockpit", duration_hours: 24 })
      });
      if (res.ok) {
        setToast({ type: 'success', message: `[ IP ${quarantineIp} QUARANTINED FOR 24H ]` });
        setQuarantineIp('');
      } else {
        throw new Error('Failed to quarantine IP');
      }
    } catch (err: any) {
      setToast({ type: 'error', message: `[ ERROR ] ${err.message}` });
    } finally {
      setIsQuarantining(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setError(null);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    if (!selectedFile) return;

    // Client-side validation
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (!validTypes.includes(selectedFile.type)) {
      setError('Invalid file type. Only images and videos are allowed.');
      return;
    }

    if (selectedFile.size > maxSize) {
      setError('File size exceeds the 50MB limit.');
      return;
    }

    setFile(selectedFile);
    setStage('idle');
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload.');
      setStage('failed');
      return;
    }

    setStage('uploading');
    setError(null);

    try {
      // Capture Geolocation
      if (!navigator.geolocation) {
         throw new Error('Geolocation is not supported by your browser.');
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
           timeout: 5000,
           maximumAge: 0,
           enableHighAccuracy: true
        });
      });

      const { latitude, longitude } = position.coords;
      setLocation({ lat: latitude, lng: longitude });

      // Dispatch initial telemetry
      fetch(`${process.env.NEXT_PUBLIC_INTERCEPTOR_URL}/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'onyx_pipeline_job_executed',
          severity: 'info',
          appOrigin: 'AXiM Onyx Pipeline',
          details: {
            fileName: file.name,
            fileSize: file.size,
            location: { lat: latitude, lng: longitude },
            status: 'submitted',
            timestamp: Date.now()
          }
        })
      }).catch(console.error);

      setStage('analyzing');

      // Mock payload construction
      const payload = {
        file: file.name,
        type: file.type,
        size: file.size,
        metadata: {
           lat: latitude,
           lng: longitude,
           timestamp: Date.now()
        }
      };

      console.log('Onyx Pipeline Payload:', payload);

      // Simulate network request
      await new Promise(resolve => setTimeout(resolve, 1500));

      setStage('mitigated');

      // Reset after success
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setToast({ type: 'success', message: '[ MEDIA SUBMITTED TO ONYX PIPELINE ]' });
      setTimeout(() => {
          setToast(null);
          setStage('idle');
      }, 5000);

      // Dispatch completion telemetry
      fetch(`${process.env.NEXT_PUBLIC_INTERCEPTOR_URL}/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'onyx_pipeline_job_executed',
          severity: 'info',
          appOrigin: 'AXiM Onyx Pipeline',
          details: {
            fileName: file.name,
            fileSize: file.size,
            location: { lat: latitude, lng: longitude },
            status: 'completed',
            timestamp: Date.now()
          }
        })
      }).catch(console.error);

    } catch (err: any) {
      setStage('failed');
      setError(err.message || 'Failed to capture location or upload file.');

      if (file) {
        // Dispatch failure telemetry
        fetch(`${process.env.NEXT_PUBLIC_INTERCEPTOR_URL}/telemetry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'onyx_pipeline_job_executed',
            severity: 'info',
            appOrigin: 'AXiM Onyx Pipeline',
            details: {
              fileName: file.name,
              fileSize: file.size,
              location: null,
              status: 'failed',
              timestamp: Date.now(),
              errorReason: err.message
            }
          })
        }).catch(console.error);
      }

      setToast({ type: 'error', message: `[ ERROR ] ${err.message || 'Failed to upload'}` });
      setTimeout(() => setToast(null), 5000);
    }
  };

  const isProcessing = stage === 'uploading' || stage === 'analyzing';

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-xl max-w-2xl mx-auto relative">
      {toast && (
        <div className={`absolute top-4 right-4 px-4 py-2 rounded text-sm font-mono z-50 shadow-lg border ${toast.type === 'success' ? 'bg-emerald-950/90 text-emerald-400 border-emerald-900' : 'bg-red-950/90 text-red-400 border-red-900'}`}>
          {toast.message}
        </div>
      )}
      <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
        <div className="w-8 h-8 rounded bg-blue-900/50 flex items-center justify-center border border-blue-700 text-blue-400">
           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
           </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-200">Onyx Pipeline Ingestion</h3>
          <p className="text-xs text-slate-500 font-mono">Secure Geo-Tagged Media Upload (Max 50MB)</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Dropzone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center transition-colors cursor-pointer ${file ? 'border-emerald-600 bg-emerald-950/20' : 'border-slate-700 hover:border-slate-500 bg-slate-950/50'}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
        >
           <input
             type="file"
             className="hidden"
             ref={fileInputRef}
             onChange={handleFileChange}
             accept="image/*,video/*"
           />

           {file ? (
             <div className="text-center">
               <div className="text-emerald-400 font-mono text-sm mb-1">{file.name}</div>
               <div className="text-slate-500 text-xs">{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
             </div>
           ) : (
             <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-slate-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-slate-300 font-medium">Click to select or drag and drop</p>
                <p className="text-slate-500 text-xs mt-1">PNG, JPG, GIF, MP4, WEBM up to 50MB</p>
             </div>
           )}
        </div>

        {error && stage === 'failed' && (
          <div className="bg-red-950/50 border border-red-900 text-red-400 px-4 py-3 rounded text-sm font-mono flex justify-between items-center">
            <span>[ERROR] {error}</span>
            <button type="button" onClick={handleSubmit} className="text-xs bg-red-900 hover:bg-red-800 px-2 py-1 rounded transition-colors">Retry</button>
          </div>
        )}

        {stage === 'mitigated' && (
          <div className="bg-emerald-950/50 border border-emerald-900 text-emerald-400 px-4 py-3 rounded text-sm font-mono flex justify-between items-center">
            <span>[SUCCESS] File successfully analyzed and mitigated.</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!file || isProcessing}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium py-3 rounded-lg transition-colors flex justify-center items-center gap-2"
        >
          {isProcessing ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
              <span>Processing ({stage})...</span>
            </>
          ) : (
             <>
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
               <span>Submit with Geo-Tag</span>
             </>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-800">
        <h4 className="text-md font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          1-Click IP Quarantine
        </h4>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter IP (e.g. 203.0.113.1)"
            value={quarantineIp}
            onChange={(e) => setQuarantineIp(e.target.value)}
            className="flex-1 bg-slate-950/50 border border-slate-700 rounded px-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-red-500 font-mono"
          />
          <button
            type="button"
            onClick={handleQuarantine}
            disabled={!quarantineIp || isQuarantining}
            className="bg-red-900/80 hover:bg-red-800 text-red-100 px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isQuarantining ? 'Processing...' : 'Quarantine (24h)'}
          </button>
        </div>
      </div>

    </div>
  );
}
