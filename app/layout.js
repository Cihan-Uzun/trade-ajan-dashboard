export const metadata = {
  title: "Trade Ajanı • Paper Dashboard",
  description: "Binance, ABD ve BIST sanal 4000 USD paper defteri",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>{children}</body>
    </html>
  );
}
