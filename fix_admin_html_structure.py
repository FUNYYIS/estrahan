from pathlib import Path

p = Path("pages/admin-notifications.html")
if not p.exists():
    raise SystemExit("ما لقيت pages/admin-notifications.html")

text = p.read_text(encoding="utf-8")

backup = p.with_suffix(".html.backup-before-structure-fix")
if not backup.exists():
    backup.write_text(text, encoding="utf-8")

# إصلاح section الناقصة بعد فورم إدارة الرئيسية
text = text.replace(
'''        <button type="submit" class="btn">حفظ إدارة الرئيسية</button>
        <p id="admin-home-sections-status" class="text-sm"></p>
    </form>
<section class="panel">''',
'''        <button type="submit" class="btn">حفظ إدارة الرئيسية</button>
        <p id="admin-home-sections-status" class="text-sm"></p>
    </form>
</section>

<section class="panel">'''
)

# إصلاح النصوص والمسافات
fixes = {
    "إحصائياتالاستراحة": "إحصائيات الاستراحة",
    "بدونتفعيلها": "بدون تفعيلها",
    "مبلغ القطةالشهري": "مبلغ القطة الشهري",
    "رابط صورةQR": "رابط صورة QR",
    'type="url"maxlength': 'type="url" maxlength',
    "يتعبأتلقائياً": "يتعبأ تلقائياً",
    "لوحةالتحكم": "لوحة التحكم",
}
for a, b in fixes.items():
    text = text.replace(a, b)

p.write_text(text, encoding="utf-8")
print("تم إصلاح بنية لوحة التحكم ✅")
print("تم حفظ نسخة احتياطية:", backup)
