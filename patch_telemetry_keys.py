import re

file_path = 'soc-cockpit/src/components/LiveThreatFeed.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# I also need to make sure the main telemetry feed gets the updated key.
# Let's search for the mapped elements and check what they are looping over.
# It seems "event" is used in the telemetry loop too.
# Let's check `paginatedData.map` or `telemetryData.map`
