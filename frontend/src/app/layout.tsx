import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Meeting Intelligence",
  description: "Upload meetings and ask questions about decisions and action items.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
