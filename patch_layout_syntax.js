const fs = require('fs');
const file = 'soc-cockpit/src/app/layout.tsx';
let content = fs.readFileSync(file, 'utf8');

// I likely duplicated a return block when replacing or added it outside a function. Let's fix the syntax error.
// The file is currently:
/*
  if (!hasAccess) {
    return (
...
      </html>
    );
  }

  return (
    <html lang="en">
...
  );
}

  return (
...
  );
}
*/
// Let's just recreate layout.tsx exactly since it's simple enough.
const newContent = `import type { Metadata } from "next";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import "./globals.css";
import { ThirdwebProvider } from "thirdweb/react";

export const metadata: Metadata = {
  title: "AXiM Asguard SOC Cockpit",
  description: "Security Operations Center Cockpit",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get("asguard_auth_token")?.value;

  let hasAccess = false;

  if (token) {
    try {
      // Decode JWT safely and strictly check for the required claim
      const decoded = jwt.decode(token);
      if (decoded && typeof decoded === 'object' && 'axim_internal_admin' in decoded) {
        if (decoded.axim_internal_admin === true) {
          hasAccess = true;
        }
      }
    } catch (err) {
      hasAccess = false;
    }
  }

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

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-900 text-slate-50">
        <ThirdwebProvider>
          <div className="flex flex-col h-screen">
          <header className="border-b border-slate-800 bg-slate-950 p-4 flex justify-between items-center">
            <h1 className="text-xl font-bold tracking-tight text-blue-400">AXiM Asguard</h1>
            <nav className="flex gap-4">
              <a href="#" className="text-sm font-medium hover:text-blue-400 transition-colors">Dashboard</a>
              <a href="#" className="text-sm font-medium text-slate-400 hover:text-blue-400 transition-colors">Alerts</a>
              <a href="#" className="text-sm font-medium text-slate-400 hover:text-blue-400 transition-colors">Settings</a>
            </nav>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span>System Online</span>
            </div>
          </header>
          <main className="flex-1 overflow-hidden">
            {children}
          </main>
        </div>
        </ThirdwebProvider>
      </body>
    </html>
  );
}
`;
fs.writeFileSync(file, newContent);
console.log('patched layout.tsx syntax');
