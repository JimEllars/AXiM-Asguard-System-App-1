import re

file_path = 'soc-cockpit/src/components/LiveThreatFeed.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Update paginatedAudit key
pattern2 = r'<div key=\{idx\} className="grid grid-cols-4 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-mono">'
replace_pattern2 = r'<div key={`${event.target || event.sourceIp || "target"}-${event.timestamp}-${idx}`} className="grid grid-cols-4 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-mono">'

if re.search(pattern2, content):
    content = re.sub(pattern2, replace_pattern2, content)
    with open(file_path, 'w') as f:
        f.write(content)
    print("Patched audit successfully")
else:
    print("Could not find the audit pattern.")
