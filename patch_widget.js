const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'soc-cockpit/src/components/LiveThreatFeed.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Update AuditEventSchema to include signature
content = content.replace(
  "timestamp: z.number(),\n});",
  "timestamp: z.number(),\n  signature: z.string().optional(),\n});"
);

// 2. Add useMemo for the flood count
const calculatedMetrics = `
  const floodMitigationCount = React.useMemo(() => {
    return auditLog.filter(event => event.signature === 'FLOOD_CONTROL_MITIGATION').length;
  }, [auditLog]);
`;
// Let's insert it before the return
content = content.replace(
  "return (\n    <div className=\"flex flex-col gap-4 h-full flex-1 min-h-0 relative\">",
  `${calculatedMetrics}\n  return (\n    <div className="flex flex-col gap-4 h-full flex-1 min-h-0 relative">`
);

// 3. Update the UI
const uiToReplace = `<div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Active Edge Drops</div>
          <div className="text-2xl font-mono text-slate-200">{isLoading ? '-' : blocklist.length}</div>`;

const newUI = `<div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 flex justify-between items-center">
            <span>Active Edge Drops</span>
            {floodMitigationCount > 0 && (
              <span className="text-[10px] bg-red-950/50 text-red-400 border border-red-900 px-1.5 py-0.5 rounded font-mono">
                {floodMitigationCount} FLOOD BLOCKS
              </span>
            )}
          </div>
          <div className="text-2xl font-mono text-slate-200 flex items-center gap-2">
             {isLoading ? '-' : blocklist.length}
          </div>`;

content = content.replace(uiToReplace, newUI);

fs.writeFileSync(filePath, content);
