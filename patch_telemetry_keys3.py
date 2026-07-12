import re

file_path = 'soc-cockpit/src/components/LiveThreatFeed.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Update paginatedTelemetry key
pattern = r'<div key=\{idx\} className="flex flex-col border border-slate-800 rounded bg-slate-900/40 hover:bg-slate-800/50 transition-colors">'
replace_pattern = r'<div key={`${event.sourceIp}-${event.timestamp}-${idx}`} className="flex flex-col border border-slate-800 rounded bg-slate-900/40 hover:bg-slate-800/50 transition-colors">'

if pattern in content:
    content = content.replace(pattern, replace_pattern)
    with open(file_path, 'w') as f:
        f.write(content)
    print("Patched telemetry successfully")
else:
    print("Could not find the telemetry pattern.")
