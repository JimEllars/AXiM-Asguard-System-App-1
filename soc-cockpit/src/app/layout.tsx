import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AXiM Asguard SOC Cockpit",
  description: "Security Operations Center Cockpit",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
