import re

with open("soc-cockpit/src/components/LiveThreatFeed.tsx", "r") as f:
    content = f.read()

# Only enabled, refetchInterval, retry exist in thirdweb useReadContract queryOptions
search = """    queryOptions: {
      enabled: !!activeAccount?.address,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: false,
    },"""

replace = """    queryOptions: {
      enabled: !!activeAccount?.address,
    },"""

content = content.replace(search, replace)

with open("soc-cockpit/src/components/LiveThreatFeed.tsx", "w") as f:
    f.write(content)
