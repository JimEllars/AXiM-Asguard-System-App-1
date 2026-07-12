import re

file_path = 'soc-cockpit/src/components/LiveThreatFeed.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Replace <div key={i} in telemetry skeletons (there are a couple of them)
# But wait, telemetry list doesn't have sourceIp etc in the skeletons, so for the skeleton we might keep as is or just change to something else. The instructions say: "Where the JSX loop checks for unique identifiers to set container parameters (key={event.id || idx}), replace the un-indexed sequence with a strict unique composite key generator string pattern. Construct a deterministic composite trace signature combining layout variables: ${event.sourceIp}-${event.timestamp}-${idx}."

pattern = r'key=\{event\.id \|\| idx\}'
replace_pattern = r'key={`${event.sourceIp}-${event.timestamp}-${idx}`}'

# Let's verify the main loops:
if re.search(pattern, content):
    content = re.sub(pattern, replace_pattern, content)
    with open(file_path, 'w') as f:
        f.write(content)
    print("Patched successfully")
else:
    print("Could not find the exact pattern.")
