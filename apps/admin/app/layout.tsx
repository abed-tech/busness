import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Cérémonia · Administration", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#070b14" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Jost:wght@400;500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
