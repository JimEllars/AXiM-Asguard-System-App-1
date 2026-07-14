import re

with open("soc-cockpit/src/components/LiveThreatFeed.tsx", "r") as f:
    content = f.read()

# Update the useReadContract execution trigger criteria
search = """  const { data: sbtBalance, isLoading: isSbtLoading } = useReadContract({
    contract: adminSbtContract,
    method: "function balanceOf(address owner) view returns (uint256)",
    params: [activeAccount?.address || "0x0000000000000000000000000000000000000000"],
    queryOptions: {
      enabled: !!activeAccount?.address,
    },
  });"""

replace = """  const { data: sbtBalance, isLoading: isSbtLoading } = useReadContract({
    contract: adminSbtContract,
    method: "function balanceOf(address owner) view returns (uint256)",
    params: [activeAccount?.address || "0x0000000000000000000000000000000000000000"],
    queryOptions: {
      enabled: !!activeAccount?.address,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: false,
    },
  });"""

content = content.replace(search, replace)

with open("soc-cockpit/src/components/LiveThreatFeed.tsx", "w") as f:
    f.write(content)
