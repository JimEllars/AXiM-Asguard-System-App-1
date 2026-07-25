import re

with open('soc-cockpit/src/components/LiveThreatFeed.tsx', 'r') as f:
    content = f.read()

# Fix the auth header fallback to an empty string to avoid undefined
content = content.replace("'X-Asguard-Auth': apiKey,", "'X-Asguard-Auth': apiKey || '',")

with open('soc-cockpit/src/components/LiveThreatFeed.tsx', 'w') as f:
    f.write(content)
