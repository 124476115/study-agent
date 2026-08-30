import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Study Agent",
  description: "LAN-only mistake-analysis and review assistant",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
