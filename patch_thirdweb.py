import re

file_path = 'soc-cockpit/src/components/LiveThreatFeed.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Add import
import_str = "import { useActiveAccount } from 'thirdweb/react';\n"
if "import { useActiveAccount }" not in content:
    content = content.replace("import { supabase } from '@/utils/supabaseClient';", "import { supabase } from '@/utils/supabaseClient';\n" + import_str)

# Add hook call
hook_str = "  const activeAccount = useActiveAccount();\n"
if hook_str not in content:
    content = content.replace("  const [realtimeStatus, setRealtimeStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'ERROR'>('DISCONNECTED');", "  const [realtimeStatus, setRealtimeStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'ERROR'>('DISCONNECTED');\n" + hook_str)

# Add UI string
ui_str = """
        {/* Wallet Status Badge */}
        <div className="text-xs font-mono border px-3 py-1.5 rounded transition-colors duration-300 flex items-center gap-2 bg-slate-950/80 border-slate-700 text-slate-300">
          {activeAccount ? (
            <span>WALLET: {activeAccount.address.slice(0, 4)}...{activeAccount.address.slice(-2)}</span>
          ) : (
            <span>[ AUTH: WEB2 PROXIED GATEWAY MODE ]</span>
          )}
        </div>
"""

# Replace in content where realtimeStatus badge is located
search_pattern = """        <div className={`text-xs font-mono border px-3 py-1.5 rounded transition-colors duration-300 flex items-center gap-2 ${
          realtimeStatus === 'CONNECTED'
            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
            : 'bg-amber-950/80 border-amber-500 text-amber-300'
        }`}>"""

if search_pattern in content:
    content = content.replace(search_pattern, ui_str + search_pattern)
    with open(file_path, 'w') as f:
        f.write(content)
    print("Patched successfully")
else:
    print("Could not find the search pattern for realtimeStatus")
