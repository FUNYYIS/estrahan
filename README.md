# Estraha PWA

تطبيق PWA خاص لإدارة الاستراحة: الأعضاء، القطة، الدردشة، المباريات، الأخبار، مواقيت الصلاة، الإشعارات، ولوحة التحكم.

## التقنية

- Static SPA يعمل على Netlify.
- Firebase Authentication لرقم الجوال.
- Firestore للبيانات.
- Firebase Storage لأصول الثيم والسبلاش.
- Firebase Cloud Messaging للإشعارات.
- Firebase Functions للعمليات الموثوقة والمجدولة.

## التشغيل المحلي

افتح المشروع عبر خادم static محلي حتى تعمل مسارات الصفحات وService Worker بشكل صحيح:

```bash
npx serve .
```

أو استخدم أي خادم static مشابه. لا تفتح `index.html` مباشرة من `file://`.

## Firebase

ملفات النشر المهمة:

- `firebase.json`
- `firestore.rules`
- `storage.rules`
- `functions/index.js`

لا تنقل Firebase Web API key أو VAPID key إلى متغيرات frontend. هذه القيم عامة بطبيعتها في تطبيقات الويب. لا تضف أي Firebase Admin credentials إلى المستودع.

## حماية Cloud Functions

- الدوال المجدولة مثل تذكير المباريات والصلاة والقطة لا تستخدم rate limit لأنها تعمل داخلياً حسب الجدولة.
- الدوال القابلة للاستدعاء من الواجهة تتطلب Firebase Authentication، والدوال الإدارية تبقى محمية بـ `assertAdmin`.
- يوجد best-effort per-instance throttle داخل ذاكرة كل Function instance للعمليات الحساسة مثل التسجيل، الاختبارات الإدارية، البث العام، وإدارة الأعضاء. هذا يخفف الضغط والنقرات المتكررة، لكنه ليس حداً موزعاً أو دائماً ولا يُعد بديلاً عن App Check أو مراقبة Firebase/Cloud Logging.
- لم يتم تفعيل `enforceAppCheck` حالياً حتى لا تنكسر نسخة الواجهة الحالية. فعّل App Check لاحقاً تدريجياً من Firebase Console بعد إضافة تهيئة frontend واختبار PWA المثبتة والمتصفحات المدعومة.

## الأسرار المطلوبة

رمز الدعوة لا يجب أن يكون في JavaScript أو Firestore المقروء من العميل. اضبطه كـ Firebase Secret:

```bash
firebase functions:secrets:set ESTRAHA_INVITE_CODE
```

بعد تدوير الرمز، انشر الدوال:

```bash
firebase deploy --only functions
```

## النشر

قواعد Firestore:

```bash
firebase deploy --only firestore:rules
```

قواعد Storage:

```bash
firebase deploy --only storage
```

Cloud Functions:

```bash
firebase deploy --only functions
```

Netlify ينشر ملفات الواجهة الثابتة ويستخدم `netlify.toml` للـ redirects والـ headers.

## الإصدارات والكاش

عند تعديل CSS أو JS أو Service Worker:

- شغّل `npm run bump:version -- <number>` لتحديث `APP_ASSET_VERSION` وquery strings و`CACHE_NAME` معاً.
- شغّل `npm run build` بعد أي تعديل على إعدادات runtime أو ملفات JavaScript المقسمة.

لا تستخدم cache طويل immutable لملفات JS/CSS غير content-hashed.

الإصدار الحالي المتزامن بين الواجهة والـ Service Worker هو `277`.

## المجموعات الرئيسية

- `users`: ملفات الأعضاء وحالة السداد والتعطيل.
- `settings/app`: إعدادات التطبيق والثيم والدفع والسبلاش.
- `chat`: رسائل الدردشة.
- `payments`: سجل القطة.
- `fcmTokens`: رموز الإشعارات.
- `adminNotifications`: سجل تنبيهات الإدارة.
- `matchNotificationState`: حالة إشعارات المباريات المجدولة.

## التفويض

واجهة الإدارة تخفي الأزرار للمستخدم العادي، لكن التفويض الفعلي يجب أن يبقى في:

- Firestore Security Rules.
- Storage Security Rules.
- Cloud Functions المحمية بـ `assertAdmin`.

لا تعتمد على `ADMIN_UID` الموجود في الواجهة كحماية وحيدة.

## الاختبارات السريعة

```bash
node --check assets/js/page-fixes.js
node --check assets/js/main.js
node --check functions/index.js
node --check functions/match-helpers.js
node --check functions/test/match-helpers.test.js
node --check service-worker.js
node --check firebase-messaging-sw.js
cd functions && npm test
git diff --check
```

يمكن تشغيل الحزمة المختصرة من جذر المشروع:

```bash
npm run validate
```

تبويبات لوحة التحكم تتبع نمط ARIA tabs. بسبب اتجاه الواجهة RTL، زر السهم يمين ينقل التركيز للتبويب السابق في ترتيب DOM، وزر السهم يسار ينقله للتبويب التالي مع الالتفاف عند الطرفين.

اختبر يدوياً:

- تسجيل الدخول برقم جوال موجود.
- تحويل رقم جديد إلى التسجيل.
- رفض رمز دعوة خاطئ.
- إنشاء عضو برمز صحيح.
- منع العضو المعطل من الدخول.
- إرسال إشعارات الإدارة.
- عمل الدردشة بدون تحميل كل السجل.
- عمل التبويبات الإدارية على 320px و360px و390px و430px.
- عدم وجود أخطاء Console واضحة.
