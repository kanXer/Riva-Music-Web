import type { Metadata, Viewport } from "next";
import { MusicProvider } from "@/context/MusicContext";
import { LoginGate } from "@/components/LoginGate";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://riva-music-web.vercel.app'),
  title: "Riva Music — Stream Without Limits",
  description: "A sleek, ultra-fast music streaming web app with synchronized real-time lyrics, offline downloads, personalized mixes, and high-fidelity audio.",
  applicationName: "Riva Music",
  authors: [{ name: "Nexus Digital" }],
  generator: "Next.js",
  keywords: ["music streaming", "riva music", "offline music", "synced lyrics", "youtube music web", "free music app"],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Riva Music",
    title: "Riva Music — Stream Without Limits",
    description: "Stream millions of songs with real-time synchronized lyrics, offline downloads, personalized radio, and zero clutter.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Riva Music — Stream Without Limits",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Riva Music — Stream Without Limits",
    description: "Stream millions of songs with real-time synchronized lyrics, offline downloads, and zero clutter.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#140A0A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('riva_theme') || 'SYSTEM';
                  var isDark = saved === 'DARK' || (saved === 'SYSTEM' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased min-h-screen">
        <MusicProvider>
          <LoginGate>
            {children}
            <PwaRegister />
          </LoginGate>
        </MusicProvider>
      </body>
    </html>
  );
}
