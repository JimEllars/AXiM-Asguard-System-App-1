const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

const search = `
function formatTimeLeft(ms: number) {
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return \`Expires in ~\${hours}h\`;
  return \`Lease: \${mins}m left\`;
}

function LeaseTimer({ expiration }: { expiration: number }) {
  const [timeLeft, setTimeLeft] = useState(() => {
    // expiration is a unix timestamp in seconds
    const expiresAt = expiration * 1000;
    return expiresAt - Date.now();
  });

  useEffect(() => {
    const expiresAt = expiration * 1000;
    const interval = setInterval(() => {
      setTimeLeft(expiresAt - Date.now());
    }, 60000); // update every minute
    return () => clearInterval(interval);
  }, [expiration]);

  if (timeLeft <= 0) return null;

  return (
    <span className="text-[10px] text-amber-500/80 font-mono tracking-tighter border border-amber-900/50 bg-amber-950/20 px-1.5 py-0.5 rounded ml-2">
      {formatTimeLeft(timeLeft)}
    </span>
  );
}
`;

const replace = `
function formatTimeLeft(ms: number) {
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return \`Expires in ~\${hours}h \${remainingMins}m\`;
}

function LeaseTimer({ expiration }: { expiration: number | null | undefined }) {
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!expiration) return Infinity;
    const expiresAt = expiration * 1000;
    return expiresAt - Date.now();
  });

  useEffect(() => {
    if (!expiration) return;
    const expiresAt = expiration * 1000;
    const interval = setInterval(() => {
      setTimeLeft(expiresAt - Date.now());
    }, 60000); // update every minute
    return () => clearInterval(interval);
  }, [expiration]);

  if (timeLeft === Infinity) {
    return (
      <span className="text-[10px] text-amber-500/80 font-mono tracking-tighter border border-amber-900/50 bg-amber-950/20 px-1.5 py-0.5 rounded ml-2">
        PERMANENT
      </span>
    );
  }

  if (timeLeft <= 0) return null;

  return (
    <span className="text-[10px] text-amber-500/80 font-mono tracking-tighter border border-amber-900/50 bg-amber-950/20 px-1.5 py-0.5 rounded ml-2">
      {formatTimeLeft(timeLeft)}
    </span>
  );
}
`;

code = code.replace(search, replace);

// Let's modify the place where LeaseTimer is used just in case
const searchLeaseTimerUsage = `
                         {blockItem.expiration && (
                           <LeaseTimer expiration={blockItem.expiration} />
                         )}
`;
const replaceLeaseTimerUsage = `
                         <LeaseTimer expiration={blockItem.expiration} />
`;

code = code.replace(searchLeaseTimerUsage, replaceLeaseTimerUsage);

// Add the Global Threat Level badge to the top header status control bar
const searchHeaderBar = `
          <div className="flex gap-4 mb-4 p-4 border border-slate-800/50 rounded-lg bg-slate-950/40 relative overflow-hidden">
             <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: \`radial-gradient(circle at center, #334155 1px, transparent 1px)\`, backgroundSize: '24px 24px' }}></div>
             <div className="flex-1 z-10">
                <h1 className="text-xl font-bold font-mono tracking-tighter text-slate-200">
                  ONYX PERIMETER SHIELD
                </h1>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-mono">
                  Autonomous Web3 Security Operations Center
                </p>
             </div>
             <div className="z-10 flex gap-4 text-right items-center">
`;

// Wait, I need to check the file for the actual header HTML. Let's do a more precise string replacement.
fs.writeFileSync('patch_timer.js_temp', searchHeaderBar); // Just to verify we have it.
