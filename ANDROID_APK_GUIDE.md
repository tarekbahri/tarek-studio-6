# دليل بناء تطبيق أندرويد APK لبرنامج TAREK مجاناً (من الهاتف فقط بدون Google Cloud Billing)

يحتوي هذا الأرشيف على الكود المصدري الكامل لاستوديو **TAREK** لإنتاج الموسيقى، ومحركات الصوت AudioWorklet DSP، والشخصية ثلاثية الأبعاد، وإعدادات PWA للعمل بدون إنترنت، وإعدادات Capacitor لأندرويد، وسير عمل **GitHub Actions** المجاني لبناء ملف APK.

**بدون Google Cloud Billing، وبدون بطاقة بنكية، وبدون كمبيوتر.**

---

## الخيار 1: بناء ملف APK من هاتف أندرويد فقط (GitHub المجاني + Codespaces)

توفر خطة GitHub المجانية **2,000 دقيقة بناء Linux مجانية شهرياً** في GitHub Actions و **60 ساعة مجانية شهرياً** في GitHub Codespaces (بدون إدخال أي بطاقة بنكية أو تفعيل فواتير Google Cloud).

1. **أنشئ حساب GitHub مجاني** على `https://github.com` من متصفح Chrome على هاتفك.
2. **أنشئ مستودعاً جديداً (New repository)**: اضغط علامة `+` ← **New repository**، سمّه مثلاً `tarek-studio`، اختر Public أو Private، وفعّل خيار **Add a README file**.
3. **افتح Codespace مجاني من متصفح الهاتف**:
   - اضغط **Code** ← تبويب **Codespaces** ← **Create codespace on main**.
4. **ارفع ملف `tarek-complete-source.zip` وادفعه للمستودع**:
   - ارفع ملف `tarek-complete-source.zip` من مجلد التنزيلات (Downloads) إلى قائمة الملفات في Codespace.
   - افتح الطرفية (Terminal) داخل Codespace ونفّذ الأوامر التالية:
     ```bash
     unzip -o tarek-complete-source.zip
     rm -f tarek-complete-source.zip
     git add .
     git commit -m "Add complete TAREK Studio source"
     git push origin main
     ```
5. **شغّل البناء السحابي المجاني لملف APK**:
   - ارجع إلى صفحة المستودع على `github.com` ← اضغط تبويب **Actions**.
   - اختر **Build TAREK Android APK** (`.github/workflows/android-apk.yml`).
   - اضغط **Run workflow** (كما يعمل تلقائياً عند كل `push`).
6. **حمّل ملف APK وثبّته على هاتفك**:
   - انتظر حوالي 3 إلى 4 دقائق حتى تظهر علامة الصح الخضراء.
   - انزل إلى قسم **Artifacts** ← اضغط **TAREK-android-apk** لتنزيل ملف ZIP الخاص بالتطبيق.
   - فك الضغط عن ملف `app-debug.apk` عبر تطبيق الملفات أو ZArchiver، ثم اضغط عليه للتثبيت (اسمح بخيار **تثبيت التطبيقات غير المعروفة / Install unknown apps** عند الطلب).

---

## الخيار 2: البناء باستخدام تطبيق Termux على أندرويد

إذا كنت تفضل رفع الكود عبر تطبيق **Termux** على هاتفك (مجاني على F-Droid):

```bash
termux-setup-storage
pkg update && pkg install -y git unzip
mkdir -p ~/tarek-studio && cd ~/tarek-studio
unzip -o ~/storage/downloads/tarek-complete-source.zip
rm -f tarek-complete-source.zip
git init -b main
git add .
git commit -m "TAREK Studio"
git remote add origin https://github.com/YOUR_USERNAME/tarek-studio.git
git push -u origin main
```

بعدها افتح تبويب **Actions** في مستودعك على GitHub وحمّل ملف **TAREK-android-apk**.

---

## الخيار 3: أوامر البناء الدقيقة (للكمبيوتر أو خوادم البناء CI)

```bash
npm install
npm run build
npm install --no-save @capacitor/core@6.2.0 @capacitor/cli@6.2.0 @capacitor/android@6.2.0
npx cap add android
npx cap sync android
python3 android/patch-capacitor-android.py
cd android && chmod +x gradlew && ./gradlew assembleDebug
```

مسار ملف APK الناتج:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## التثبيت المباشر كتطبيق ويب أوفلاين (PWA) بدون بناء APK

إذا تم استضافة TAREK على أي استضافة HTTPS مجانية (مثل GitHub Pages أو Cloudflare Pages أو Netlify Free):
1. افتح رابط التطبيق المستقل في **متصفح Chrome على أندرويد**.
2. انتظر بضع ثوانٍ حتى يكتمل تخزين الملفات الأساسية أوفلاين (`manifest.json` و `sw.js` ومحركات AudioWorklets والخطوط والأيقونات).
3. اضغط **Install App** داخل شريط TAREK (أو قائمة Chrome `⋮` ← **تثبيت التطبيق / Install app**).
4. شغّل التطبيق من الشاشة الرئيسية بوضع ملء الشاشة الأفقي مع دعم العمل بدون إنترنت.

---

## القيود والملاحظات المتبقية

- **التوقيع التجريبي (Debug Signing):** الأمر `assembleDebug` ينشئ ملف APK بتوقيع تجريبي يثبّت مباشرة على هواتف أندرويد عبر التثبيت اليدوي (Sideloading)، ولا يُرفع مباشرة إلى متجر Google Play (حيث يتطلب المتجر مفتاح توقيع Release وحساب مطور).
- **أداء الصوت في Android System WebView:** يتطلب عمل AudioWorklet DSP والميكروفون نظام أندرويد 7 فأحدث مع تحديث **Android System WebView** من متجر Play. إذا حدث تقطيع صوتي في الهواتف الضعيفة، افتح أيقونة مراقب المعالج (CPU Monitor) واختر وضع **Stable (Anti-Crackle)**.
- **تصدير الملفات في WebView APK:** داخل حزمة Capacitor WebView APK، يعمل استيراد الملفات المحلية (`<input type="file">`) وتسجيل الميكروفون وحفظ المشاريع في IndexedDB بشكل طبيعي؛ أما تنزيل ملفات WAV/MP3/JSON عبر روابط `blob:` فقد تتجاهله بعض متصفحات WebView المدمجة في أنظمة أندرويد، ويكون مدعوماً بأفضل شكل عند تشغيل TAREK كتطبيق PWA مثبت من Chrome أو بإضافة `@capacitor/filesystem`.
