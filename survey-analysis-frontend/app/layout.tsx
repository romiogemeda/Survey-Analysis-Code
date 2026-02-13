import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import Toasts from "@/components/layout/Toasts";

export const metadata: Metadata = {
  title: "Survey Analysis Engine",
  description: "AI-Powered Survey Analysis Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Sidebar />
        <TopBar />
        <main className="ml-[220px] mt-16 min-h-[calc(100vh-4rem)]">
          <div className="p-6 max-w-[1400px] mx-auto">{children}</div>
        </main>
        <Toasts />
      </body>
    </html>
  );
}