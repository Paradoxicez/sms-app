import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SMS Platform',
  description: 'Surveillance Management System - Live CCTV Stream Platform',
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
