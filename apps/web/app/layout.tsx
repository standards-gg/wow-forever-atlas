import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WoW Forever Atlas",
  description: "An interactive atlas and discovery graph for World of Warcraft: Forever.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-dvh overflow-hidden bg-[#0f0b09] text-[#f2e9e4] antialiased">{children}</body>
    </html>
  );
}
