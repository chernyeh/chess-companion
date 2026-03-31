import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Companion",
  description: "Tactics · Openings · Endgames · Spaced Repetition · AI Coach",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
