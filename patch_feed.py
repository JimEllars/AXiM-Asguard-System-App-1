import re

with open("soc-cockpit/src/components/LiveThreatFeed.tsx", "r") as f:
    content = f.read()

schema_search = r"(colo: z\.string\(\)\.optional\(\),)(\s*\}\);)"
schema_replace = r"\1\n  edgeBotScore: z.number().optional(),\2"

content = re.sub(schema_search, schema_replace, content)

badge_search = r'(<div className="flex justify-between items-center mb-2">\s*<div className="text-xs text-slate-500 uppercase tracking-wider">Raw Payload Inspector</div>)'
badge_replace = r'''{typeof event.edgeBotScore === 'number' && (
                           <div className="mb-2">
                             {event.edgeBotScore < 30 ? (
                               <span className="inline-block bg-red-950/50 text-red-500 font-bold border border-red-900 px-2 py-1 rounded text-xs">
                                 [ ANTIBOT TRIAGE &mdash; BOT SCORE: {event.edgeBotScore} ]
                               </span>
                             ) : (
                               <span className="inline-block bg-slate-800 text-slate-400 border border-slate-700 px-2 py-1 rounded text-xs">
                                 [ BOT SCORE: {event.edgeBotScore} ]
                               </span>
                             )}
                           </div>
                         )}
                         \1'''

content = re.sub(badge_search, badge_replace, content)

with open("soc-cockpit/src/components/LiveThreatFeed.tsx", "w") as f:
    f.write(content)
