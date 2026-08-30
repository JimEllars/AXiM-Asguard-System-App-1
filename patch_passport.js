const fs = require('fs');
const file = 'soc-cockpit/src/app/layout.tsx';
let content = fs.readFileSync(file, 'utf8');

const ssoGate = `
  if (!hasAccess) {
    return (
      <html lang="en">
        <head>
          <meta httpEquiv="refresh" content="0; url=https://passport.axim.us.com?redirect=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback" />
        </head>
        <body className="min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center">
          <div className="bg-black border-2 border-red-600 p-8 rounded-none max-w-2xl w-full text-center">
             <div className="font-mono text-red-500 text-lg md:text-xl font-bold tracking-widest whitespace-pre-wrap">
                [ REDIRECTING TO PASSPORT SSO... ]
             </div>
             <p className="mt-4 text-slate-400 font-mono text-sm">Validating AXiM internal whitelist...</p>
             <p className="mt-2 text-slate-500 font-mono text-xs">If you are not redirected automatically, <a href="https://passport.axim.us.com?redirect=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback" className="text-blue-400 hover:underline">click here</a>.</p>
          </div>
        </body>
      </html>
    );
  }
`;

content = content.replace(/if \(!hasAccess\) \{[\s\S]*?return \([\s\S]*?\}\s*;/g, ssoGate.trim());
if (!content.includes("REDIRECTING TO PASSPORT SSO")) {
    const start = content.indexOf('if (!hasAccess) {');
    const end = content.indexOf('return (', start + 1000); // just to find the start of the next return
    const after = content.substring(content.indexOf('  return (', start));

    // Manual replacement
    const before = content.substring(0, start);
    content = before + ssoGate.trim() + "\n\n" + after;
}


fs.writeFileSync(file, content);
console.log('patched layout.tsx for passport SSO');
