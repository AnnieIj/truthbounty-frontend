import React from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import TrustWarningBanner from "@/components/ui/TrustWarningBanner";
import OfflineBanner from "@/components/ui/OfflineBanner";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex h-screen bg-background">
      {/* Skip link for keyboard users */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
      {/* global offline / low-bandwidth read notice (V2-FE-129) */}
      <OfflineBanner />
      {/* banner warns about Sybil/low-trust accounts */}
      <TrustWarningBanner />
        <main 
          id="main-content"
          role="main"
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-background"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
