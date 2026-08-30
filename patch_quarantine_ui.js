const fs = require('fs');
const file = 'soc-cockpit/src/components/Submit/OnyxPipeline.jsx';
let content = fs.readFileSync(file, 'utf8');

const quarantineStateAndFunc = `
  const [quarantineIp, setQuarantineIp] = useState('');
  const [isQuarantining, setIsQuarantining] = useState(false);

  const handleQuarantine = async (e) => {
    e.preventDefault();
    if (!quarantineIp) return;
    setIsQuarantining(true);
    try {
      const res = await fetch(\`\${process.env.NEXT_PUBLIC_INTERCEPTOR_URL}/api/v1/blocklist/add\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Asguard-Auth': process.env.NEXT_PUBLIC_ASGUARD_API_KEY || ''
        },
        body: JSON.stringify({ ip: quarantineIp, reason: "Manual 1-Click Quarantine from SOC Cockpit", duration_hours: 24 })
      });
      if (res.ok) {
        setToast({ type: 'success', message: \`[ IP \${quarantineIp} QUARANTINED FOR 24H ]\` });
        setQuarantineIp('');
      } else {
        throw new Error('Failed to quarantine IP');
      }
    } catch (err) {
      setToast({ type: 'error', message: \`[ ERROR ] \${err.message}\` });
    } finally {
      setIsQuarantining(false);
      setTimeout(() => setToast(null), 5000);
    }
  };
`;

content = content.replace(
  "const [toast, setToast] = useState(null);",
  "const [toast, setToast] = useState(null);\n" + quarantineStateAndFunc
);

const quarantineHtml = `
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
`;

content = content.replace(
  "</form>",
  `</form>\n${quarantineHtml}`
);

fs.writeFileSync(file, content);
console.log('patched OnyxPipeline.jsx for 1-click quarantine');
