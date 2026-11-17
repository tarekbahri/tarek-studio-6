import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileArchive,
  Smartphone,
  Terminal,
  WifiOff,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOfflineCacheStatus } from '../pwa/offlineCache';

interface AndroidExportModalProps {
  open: boolean;
  onClose: () => void;
}

type ModalTab = 'zip' | 'apk' | 'pwa';

const TERMUX_COMMANDS = `pkg update && pkg install -y git unzip
mkdir -p ~/tarek-studio && cd ~/tarek-studio
unzip -o ~/storage/downloads/tarek-complete-source.zip
rm -f tarek-complete-source.zip
git init -b main
git add . && git commit -m "TAREK Studio"
git remote add origin https://github.com/YOUR_USER/tarek-studio.git
git push -u origin main`;

const CODESPACE_COMMANDS = `unzip -o tarek-complete-source.zip
rm -f tarek-complete-source.zip
git add . && git commit -m "TAREK Studio"
git push origin main`;

export const AndroidExportModal: React.FC<AndroidExportModalProps> = ({ open, onClose }) => {
  const [tab, setTab] = useState<ModalTab>('zip');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const offlineCache = useOfflineCacheStatus();

  if (!open) return null;

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // Clipboard blocked on restricted context
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="تصدير الكود المصدري وبناء APK لأندرويد"
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92dvh] flex flex-col rounded-2xl border border-[#5B3A22] bg-[#130B06] text-[#F6E2CE] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#1A0F08] border-b border-[#4D301C] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Smartphone className="w-4 h-4 text-[#E08A3C] shrink-0" />
            <h2 className="font-display text-sm sm:text-base font-bold tracking-wide text-[#FDE68A] truncate">
              تصدير TAREK وبناء APK مجاني لأندرويد
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة التصدير"
            className="w-7 h-7 rounded-md bg-[#24150C] hover:bg-[#3A2112] flex items-center justify-center text-[#D7B899] hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-[#0E0704] border-b border-[#3E2616] shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab('zip')}
            className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-display font-bold cursor-pointer whitespace-nowrap transition-colors ${
              tab === 'zip'
                ? 'bg-[#E08A3C] text-[#120A05]'
                : 'bg-[#1B1009] text-[#D7B899] hover:text-white border border-[#4D301C]'
            }`}
          >
            <FileArchive className="w-3.5 h-3.5" />
            <span>١. تنزيل الكود المصدري ZIP</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('apk')}
            className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-display font-bold cursor-pointer whitespace-nowrap transition-colors ${
              tab === 'apk'
                ? 'bg-[#E08A3C] text-[#120A05]'
                : 'bg-[#1B1009] text-[#D7B899] hover:text-white border border-[#4D301C]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>٢. بناء APK مجاناً من الهاتف</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('pwa')}
            className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-display font-bold cursor-pointer whitespace-nowrap transition-colors ${
              tab === 'pwa'
                ? 'bg-[#E08A3C] text-[#120A05]'
                : 'bg-[#1B1009] text-[#D7B899] hover:text-white border border-[#4D301C]'
            }`}
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span>٣. وضع الأوفلاين والقيود</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto synth-scroll p-4 space-y-3.5 text-xs leading-relaxed">
          {tab === 'zip' && (
            <>
              <div className="rounded-xl border border-[#5B3A22] bg-[#1A0F08] p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-sm font-bold text-[#FDE68A]">
                      الأرشيف الكامل للكود المصدري لبرنامج TAREK
                    </h3>
                    <p className="text-[#C8A482] mt-1">
                      يتضمن جميع الإضافات الست (SUBSYNTH و 666TS و BEATBOX و SERUM 2 و SEQUENCER و BASS REMIX)، وجهاز المزج Studio Mixer، والمؤثرات المعيارية، ومحركات الصوت AudioWorklet DSP، والشخصية ثلاثية الأبعاد، وإعدادات PWA أوفلاين، وقوالب Capacitor لأندرويد، وملف بناء APK المجاني عبر GitHub Actions.
                    </p>
                  </div>
                </div>

                <a
                  href="/tarek-complete-source.zip"
                  download="tarek-complete-source.zip"
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#E08A3C] hover:bg-[#F59E0B] text-[#120A05] font-display font-bold text-xs shadow-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>تنزيل tarek-complete-source.zip</span>
                </a>
              </div>

              <div className="rounded-xl border border-[#3E2616] bg-[#0D0704] p-3.5 space-y-1.5 text-[#D7B899]">
                <div className="font-display font-bold text-[#F9EAD9]">
                  الملفات المشمولة للبناء والأندرويد
                </div>
                <ul dir="ltr" className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] font-mono-num text-[#C8A482] text-left">
                  <li>• src/ (all engines, plugins, UI, 3D)</li>
                  <li>• public/worklets/*.js (DSP threads)</li>
                  <li>• public/pwa-*.png &amp; icon.svg</li>
                  <li>• .github/workflows/android-apk.yml</li>
                  <li>• android/AndroidManifest.tarek.template.xml</li>
                  <li>• android/MainActivity.tarek.java</li>
                  <li>• android/patch-capacitor-android.py</li>
                  <li>• capacitor.config.ts &amp; vite.config.ts</li>
                </ul>
              </div>
            </>
          )}

          {tab === 'apk' && (
            <>
              <div className="rounded-xl border border-[#2EE59D]/35 bg-[#0D1A13] p-3 text-[#D1FAE5]">
                <strong className="text-[#2EE59D]">بدون Google Cloud Billing وبدون كمبيوتر:</strong>{' '}
                تمنحك خطة GitHub المجانية 2,000 دقيقة بناء مجانية شهرياً و60 ساعة Codespaces مجانية بدون طلب أي بطاقة بنكية.
              </div>

              <div className="rounded-xl border border-[#4D301C] bg-[#190E08] p-3.5 space-y-2">
                <h3 className="font-display text-xs font-bold text-[#FDE68A]">
                  الطريقة أ — من متصفح الهاتف فقط (GitHub Codespaces + Actions)
                </h3>
                <ol className="list-decimal list-inside space-y-1 text-[#D7B899]">
                  <li>حمّل ملف <code dir="ltr" className="text-[#FDE68A]">tarek-complete-source.zip</code> من التبويب الأول.</li>
                  <li>سجّل الدخول إلى <strong className="text-white">github.com</strong> من متصفح Chrome ← اضغط <strong className="text-white">+ ← New repository</strong> (وفعّل خيار <em>Add a README file</em>).</li>
                  <li>اضغط <strong className="text-white">Code ← Codespaces ← Create codespace on main</strong>.</li>
                  <li>ارفع ملف <code dir="ltr" className="text-[#FDE68A]">tarek-complete-source.zip</code> إلى Codespace، ثم نفّذ في الطرفية:</li>
                </ol>
                <div dir="ltr" className="relative rounded-lg bg-[#090503] border border-[#3E2616] p-2.5 font-mono-num text-[11px] text-[#FDE68A] overflow-x-auto text-left">
                  <pre className="whitespace-pre">{CODESPACE_COMMANDS}</pre>
                  <button
                    type="button"
                    onClick={() => void copyText('codespace', CODESPACE_COMMANDS)}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded bg-[#24150C] hover:bg-[#3A2112] text-[10px] text-[#F6E2CE] cursor-pointer"
                  >
                    {copiedId === 'codespace' ? <Check className="w-3 h-3 text-[#2EE59D]" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId === 'codespace' ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                </div>
                <p className="text-[#D7B899]">
                  5. افتح تبويب <strong className="text-white">Actions</strong> ← <strong className="text-white">Build TAREK Android APK</strong> ← حمّل ملف <strong className="text-[#2EE59D]">TAREK-android-apk</strong> ← فك الضغط وثبّت <code dir="ltr" className="text-white">app-debug.apk</code>.
                </p>
              </div>

              <div className="rounded-xl border border-[#4D301C] bg-[#190E08] p-3.5 space-y-2">
                <h3 className="font-display text-xs font-bold text-[#FDE68A]">
                  الطريقة ب — عبر تطبيق Termux على أندرويد (متوفر مجاناً على F-Droid)
                </h3>
                <div dir="ltr" className="relative rounded-lg bg-[#090503] border border-[#3E2616] p-2.5 font-mono-num text-[11px] text-[#FDE68A] overflow-x-auto text-left">
                  <pre className="whitespace-pre">{TERMUX_COMMANDS}</pre>
                  <button
                    type="button"
                    onClick={() => void copyText('termux', TERMUX_COMMANDS)}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded bg-[#24150C] hover:bg-[#3A2112] text-[10px] text-[#F6E2CE] cursor-pointer"
                  >
                    {copiedId === 'termux' ? <Check className="w-3 h-3 text-[#2EE59D]" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId === 'termux' ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'pwa' && (
            <>
              <div className="rounded-xl border border-[#4D301C] bg-[#190E08] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-bold text-[#FDE68A]">
                    حالة التخزين أوفلاين (Service Worker)
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono-num text-[11px] ${
                      offlineCache.status === 'ready'
                        ? 'bg-[#0E1E16] text-[#2EE59D] border border-[#2EE59D]/40'
                        : 'bg-[#24150C] text-[#FDE68A] border border-[#7E502C]'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {offlineCache.status === 'ready'
                        ? `جاهز أوفلاين (${offlineCache.cachedCount}/${offlineCache.totalEssential})`
                        : `تم تخزين ${offlineCache.cachedCount}/${offlineCache.totalEssential}`}
                    </span>
                  </span>
                </div>
                <p className="text-[#C8A482]">
                  يتم تخزين جميع ملفات HTML و JS و CSS والخطوط والأيقونات ومعالجات AudioWorklet DSP محلياً عبر Workbox (<code dir="ltr" className="text-[#FDE68A]">manifest.json</code> + <code dir="ltr" className="text-[#FDE68A]">sw.js</code>)، كما تُحفظ مشاريعك تلقائياً في قاعدة IndexedDB.
                </p>

                {!isInstalled && isInstallable && (
                  <button
                    type="button"
                    onClick={() => void install()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2EE59D] hover:bg-[#34D399] text-[#09140E] font-display font-bold text-xs cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>تثبيت تطبيق الأوفلاين الآن (PWA)</span>
                  </button>
                )}

                {!isInstalled && !isInstallable && (
                  <p className="text-[11px] text-[#D7B899]">
                    {isIOS
                      ? 'في متصفح Safari على iOS، اضغط مشاركة ← إضافة إلى الشاشة الرئيسية.'
                      : 'في متصفح Chrome على أندرويد (عند فتحه في تبويب مستقل)، اضغط ⋮ ← تثبيت التطبيق (Install app).'}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-amber-500/35 bg-[#1C1209] p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 font-display font-bold text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>القيود والملاحظات المهمة</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[#D7B899]">
                  <li>
                    هذه النافذة تصدّر الكود المصدري ZIP فقط — بينما يتم تجميع ملف <code dir="ltr" className="text-white">.apk</code> الفعلي عبر GitHub Actions (<code dir="ltr" className="text-white">app-debug.apk</code>) باستخدام Capacitor و Gradle.
                  </li>
                  <li>
                    يتطلب تثبيت ملف APK ذي التوقيع التجريبي السماح بخيار <strong>تثبيت التطبيقات غير المعروفة</strong> في أندرويد (بدون حاجة لمتجر Google Play).
                  </li>
                  <li>
                    إذا حدث تقطيع في الصوت على الهواتف الاقتصادية، افتح أيقونة مراقب المعالج (CPU) واختر <strong>Stable (Anti-Crackle)</strong>.
                  </li>
                  <li>
                    داخل حزمة Capacitor WebView APK يعمل استيراد الملفات المحلية (<code dir="ltr" className="text-white">&lt;input type="file"&gt;</code>) وتسجيل الميكروفون والتخزين المحلي في IndexedDB؛ أما تنزيل ملفات <code dir="ltr" className="text-white">blob:</code> (تصدير WAV/MP3/JSON) فيعمل بأفضل موثوقية عند استخدام TAREK كتطبيق Chrome PWA مثبت.
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-2.5 bg-[#1A0F08] border-t border-[#4D301C] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-8 rounded-lg bg-[#24150C] hover:bg-[#3A2112] border border-[#5B3A22] font-display font-bold text-xs text-[#FDE68A] cursor-pointer"
          >
            تم
          </button>
        </div>
      </div>
    </div>
  );
};
