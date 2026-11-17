import React, { useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOfflineCacheStatus } from '../pwa/offlineCache';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const offlineCache = useOfflineCacheStatus();
  const [showGuideModal, setShowGuideModal] = useState(false);

  const isEmbeddedFrame =
    typeof window !== 'undefined' && window.self !== window.top;

  if (isInstalled) {
    return null;
  }

  // If viewed inside AI Studio's wrapper frame, warn user NOT to add the wrapper ("ZStudio")
  if (isEmbeddedFrame && (isAndroid || isIOS)) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuideModal(true)}
          style={{ touchAction: 'manipulation' }}
          title="Open standalone TAREK tab to install offline app"
          className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-[#E08A3C] hover:bg-[#F59E0B] border border-[#FDE68A]/50 text-xs font-display font-bold text-[#120A05] cursor-pointer whitespace-nowrap shrink-0 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Install TAREK</span>
        </button>

        {showGuideModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Open Standalone TAREK App"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          >
            <div className="w-full max-w-md rounded-2xl border border-[#5B3A22] bg-[#140B06] p-5 text-[#F6E2CE] shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-base font-bold text-[#FDE68A]">
                  Install Standalone Offline TAREK
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  aria-label="Close install instructions"
                  className="w-7 h-7 rounded-md bg-[#24150C] hover:bg-[#3A2112] flex items-center justify-center text-[#D7B899] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 space-y-2.5 text-xs text-[#D7B899] leading-relaxed">
                <p className="text-[#FCA5A5] font-semibold">
                  Do not tap Chrome &ldquo;Add to Home screen&rdquo; while inside the AI Studio preview frame — that installs AI Studio (&ldquo;ZStudio&rdquo;) instead of TAREK, which cannot run offline.
                </p>
                <p>
                  <strong className="text-[#FDE68A]">1.</strong> Open your deployed TAREK app in its own{' '}
                  <strong className="text-white">standalone Chrome tab</strong> (using the &ldquo;Open in new tab&rdquo; button at the top of the preview).
                </p>
                <p>
                  <strong className="text-[#FDE68A]">2.</strong> Wait 3 seconds until TAREK caches all DSP &amp; plugin files locally.
                </p>
                <p>
                  <strong className="text-[#FDE68A]">3.</strong> Tap{' '}
                  <strong className="text-[#2EE59D]">Install App</strong> in TAREK&apos;s header (or Chrome&apos;s ⋮ menu → <strong className="text-white">Install app</strong>). Your home screen icon will show <strong className="text-white">TAREK</strong> with the gold <strong className="text-white">T</strong> icon and work offline.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="mt-4 w-full py-2 rounded-lg bg-[#E08A3C] hover:bg-[#F59E0B] font-display text-xs font-bold text-[#120A05] cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (isInstallable) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        {offlineCache.status === 'ready' && (
          <span
            title="All TAREK audio engines, worklets, and plugins cached for offline use"
            className="hidden md:inline-flex items-center gap-1 px-2 h-8 rounded-md bg-[#0E1E16] border border-[#2EE59D]/40 text-[11px] font-display font-semibold text-[#2EE59D] whitespace-nowrap"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Offline Ready</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => void install()}
          style={{ touchAction: 'manipulation' }}
          title="Install TAREK Offline App"
          className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-[#E08A3C] hover:bg-[#F59E0B] border border-[#FDE68A]/50 text-xs font-display font-bold text-[#120A05] cursor-pointer whitespace-nowrap shrink-0 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
      </div>
    );
  }

  if (!isAndroid && !isIOS) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuideModal(true)}
        style={{ touchAction: 'manipulation' }}
        title={isIOS ? 'Install TAREK on iOS' : 'Install TAREK on Android'}
        className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-[#1D110A] hover:bg-[#2C1A0F] border border-[#7E502C] text-xs font-display font-semibold text-[#FDE68A] cursor-pointer whitespace-nowrap shrink-0 transition-colors"
      >
        <Smartphone className="w-3.5 h-3.5 text-[#E08A3C]" />
        <span className="hidden sm:inline">
          {offlineCache.status === 'ready' ? 'Offline Ready' : 'Install'}
        </span>
      </button>

      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Install TAREK"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#5B3A22] bg-[#140B06] p-5 text-[#F6E2CE] shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-base font-bold text-[#FDE68A]">
                {isIOS ? 'Install TAREK on iPhone / iPad' : 'Install Offline TAREK on Android'}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Close install instructions"
                className="w-7 h-7 rounded-md bg-[#24150C] hover:bg-[#3A2112] flex items-center justify-center text-[#D7B899] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-2.5 flex items-center gap-2 text-[11px] font-display">
              <CheckCircle2
                className={`w-4 h-4 shrink-0 ${
                  offlineCache.status === 'ready' ? 'text-[#2EE59D]' : 'text-[#E08A3C]'
                }`}
              />
              <span className="text-[#D7B899]">
                Offline Cache Status:{' '}
                <strong
                  className={
                    offlineCache.status === 'ready' ? 'text-[#2EE59D]' : 'text-[#FDE68A]'
                  }
                >
                  {offlineCache.status === 'ready'
                    ? `Ready (${offlineCache.cachedCount}/${offlineCache.totalEssential} core modules cached)`
                    : `Caching (${offlineCache.cachedCount}/${offlineCache.totalEssential})`}
                </strong>
              </span>
            </div>

            {isIOS ? (
              <div className="mt-3 space-y-2 text-xs text-[#D7B899] leading-relaxed">
                <p>1. Open TAREK directly in Safari.</p>
                <p>
                  2. Tap the <strong className="text-[#FDE68A]">Share</strong> icon in Safari.
                </p>
                <p>
                  3. Tap <strong className="text-[#FDE68A]">Add to Home Screen</strong> for offline fullscreen launch.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-2.5 text-xs text-[#D7B899] leading-relaxed">
                <p>
                  <strong className="text-[#FDE68A]">Install Offline Android App:</strong>{' '}
                  Tap Chrome&apos;s <strong className="text-white">⋮ menu</strong> and choose{' '}
                  <strong className="text-[#2EE59D]">Install app</strong> (not &ldquo;Add to Home screen&rdquo; on a wrapper site). Look for the gold <strong className="text-white">T</strong> icon named <strong className="text-white">TAREK</strong> with no Chrome corner badge.
                </p>
                <p>
                  <strong className="text-[#FDE68A]">Before Turning On Airplane Mode:</strong>{' '}
                  Wait until Offline Cache Status above shows <strong className="text-[#2EE59D]">Ready</strong>, then launch TAREK once from its home-screen icon.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="mt-4 w-full py-2 rounded-lg bg-[#E08A3C] hover:bg-[#F59E0B] font-display text-xs font-bold text-[#120A05] cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
