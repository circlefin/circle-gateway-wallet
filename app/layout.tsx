import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { WagmiProvider } from "@/components/wagmi-provider";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Multichain Gateway Wallet",
  description: "Demo for wallet with unified cross-chain USDC balances and transfers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <WagmiProvider>
            {children}
          </WagmiProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
