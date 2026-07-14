import re

with open("soc-cockpit/src/components/LiveThreatFeed.tsx", "r") as f:
    content = f.read()

# Fix eslint warning
search = """const sbtParams = React.useMemo(() => [activeAccount?.address || "0x0000000000000000000000000000000000000000"] as const, [activeAccount?.address, sbtEvalTrigger]);"""
replace = """// eslint-disable-next-line react-hooks/exhaustive-deps
  const sbtParams = React.useMemo(() => [activeAccount?.address || "0x0000000000000000000000000000000000000000"] as const, [activeAccount?.address, sbtEvalTrigger]);"""

content = content.replace(search, replace)

with open("soc-cockpit/src/components/LiveThreatFeed.tsx", "w") as f:
    f.write(content)
