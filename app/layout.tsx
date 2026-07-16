import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FrameUp — TikTok Cover Studio",
  description: "Composez des visuels TikTok 9:16 avec OpenAI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
