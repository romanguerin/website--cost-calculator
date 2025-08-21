import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  metadataBase: new URL("https://codecost.io")
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
