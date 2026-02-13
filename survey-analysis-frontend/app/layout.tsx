import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import Toasts from "@/components/layout/Toasts";

export const metadata: Metadata = {
  title: "Survey Platform",
  description: "AI-Powered Survey Platform",
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
        <main className="ml-[220px] min-h-screen">
          {children}
        </main>
        <Toasts />
      </body>
    </html>
  );
}