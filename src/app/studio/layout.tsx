import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-studio-display",
  weight: ["500", "600", "700", "800"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-studio-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Wan Studio — AI Video",
  description: "Kling風 UI で Wan 2.2（RunPod）を操作するビデオスタジオ",
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${syne.variable} ${dmSans.variable} studio-root min-h-screen`}
    >
      {children}
    </div>
  );
}
