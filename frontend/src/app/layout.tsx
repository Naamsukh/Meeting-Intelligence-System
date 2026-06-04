import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Meeting Intelligence",
  description: "Upload meetings and ask questions about decisions and action items.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Inline script prevents flash of unstyled content on dark-mode preference */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('mis-theme');var p=s||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');if(p==='dark')document.documentElement.classList.add('dark');})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
