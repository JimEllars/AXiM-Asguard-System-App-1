import type { Metadata } from "next";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import "./globals.css";

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
      const decoded = jwt.decode(token) as { axim_internal_admin?: boolean } | null;
      if (decoded && decoded.axim_internal_admin === true) {
        hasAccess = true;
      }
    } catch {
      hasAccess = false;
    }
  }

  if (!hasAccess) {
    return (
      <html lang="en">
        <body className="min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center">
          <div className="bg-slate-950 border border-slate-800 p-8 rounded-lg max-w-md w-full text-center">
             <div className="text-red-500 mb-4">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
             </div>
             <h1 className="text-xl font-bold tracking-tight text-slate-200 mb-2">ACCESS DENIED</h1>
             <p className="text-slate-400 text-sm">Valid axim_internal_admin claim required.</p>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-900 text-slate-50">
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
      </body>
    </html>
  );
}
