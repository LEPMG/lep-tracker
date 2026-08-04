import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEP Tracker",
  description: "Well downtime, work orders, production & cost tracking",
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
