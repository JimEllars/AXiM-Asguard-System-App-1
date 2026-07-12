import re

file_path = 'soc-cockpit/src/components/LiveThreatFeed.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Update paginatedAudit key, fixing TS error since audit event doesn't have sourceIp
pattern2 = r'key=\{`\$\{event\.target \|\| event\.sourceIp \|\| "target"\}-\$\{event\.timestamp\}-\$\{idx\}`\}'
replace_pattern2 = r'key={`${event.target || "target"}-${event.timestamp}-${idx}`}'

if re.search(pattern2, content):
    content = re.sub(pattern2, replace_pattern2, content)
    with open(file_path, 'w') as f:
        f.write(content)
    print("Patched audit successfully")
else:
    print("Could not find the audit pattern.")
