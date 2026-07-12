import re

file_path = 'soc-cockpit/src/components/LiveThreatFeed.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Update filteredDlq key, fixing TS error since dlq event doesn't have sourceIp
pattern3 = r'key=\{`\$\{event\.sourceIp\}-\$\{event\.timestamp\}-\$\{idx\}`\} className="grid grid-cols-5 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-mono"'
replace_pattern3 = r'key={`${event.originNode || "origin"}-${event.timestamp}-${idx}`} className="grid grid-cols-5 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-mono"'

if re.search(pattern3, content):
    content = re.sub(pattern3, replace_pattern3, content)
    with open(file_path, 'w') as f:
        f.write(content)
    print("Patched dlq successfully")
else:
    print("Could not find the dlq pattern.")
