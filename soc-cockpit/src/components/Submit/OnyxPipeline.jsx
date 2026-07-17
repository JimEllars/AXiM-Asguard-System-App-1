import React, { useState, useRef } from 'react';

export default function OnyxPipeline() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [location, setLocation] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    setError(null);
    const selectedFile = e.target.files[0];
    validateAndSetFile(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setError(null);
    const droppedFile = e.dataTransfer.files[0];
    validateAndSetFile(droppedFile);
  };

  const validateAndSetFile = (selectedFile) => {
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
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Capture Geolocation
      if (!navigator.geolocation) {
         throw new Error('Geolocation is not supported by your browser.');
      }

      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
           timeout: 5000,
           maximumAge: 0,
           enableHighAccuracy: true
        });
      });

      const { latitude, longitude } = position.coords;
      setLocation({ lat: latitude, lng: longitude });

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

      // Reset after success
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      alert('Media successfully submitted to the Onyx Pipeline.');

    } catch (err) {
      setError(err.message || 'Failed to capture location or upload file.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-xl max-w-2xl mx-auto">
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

        {error && (
          <div className="bg-red-950/50 border border-red-900 text-red-400 px-4 py-3 rounded text-sm font-mono">
            [ERROR] {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!file || isUploading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium py-3 rounded-lg transition-colors flex justify-center items-center gap-2"
        >
          {isUploading ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
              <span>Processing...</span>
            </>
          ) : (
             <>
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
               <span>Submit with Geo-Tag</span>
             </>
          )}
        </button>
      </form>
    </div>
  );
}
