const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const keyPath = path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(keyPath)) {
  console.error('❌ خطأ: ملف serviceAccountKey.json غير موجود في مجلد المشروع الرئيسي!');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateGroups() {
  console.log('🚀 بدء عملية ترحيل بيانات المجموعات...');
  
  try {
    const groupsSnapshot = await db.collection('groups').get();
    console.log(`📌 تم العثور على ${groupsSnapshot.size} مجموعة.`);

    let updatedCount = 0;

    for (const groupDoc of groupsSnapshot.docs) {
      const groupId = groupDoc.id;
      const groupData = groupDoc.data();

      // جلب جميع الأعضاء
      const membersSnapshot = await db.collection('groups').doc(groupId).collection('members').get();
      const memberUids = membersSnapshot.docs.map(doc => doc.id);
      const memberCount = memberUids.length;

      // تحديد createdBy أو استخدام العضو الأول كمنشئ للمجموعة إن لم توجد
      const fallbackCreatedBy = memberUids.length > 0 ? memberUids[0] : 'system_migrated';
      const createdBy = groupData.createdBy || fallbackCreatedBy;

      const inviteCode = groupData.inviteCode || Math.random().toString(36).substring(2, 8).toUpperCase();

      await db.collection('groups').doc(groupId).update({
        memberUids: memberUids,
        memberCount: memberCount,
        createdBy: createdBy,
        inviteCode: inviteCode
      });

      console.log(`✅ تم تحديث المجموعة [${groupId}]: ${memberCount} أعضاء.`);
      updatedCount++;
    }

    console.log(`🎉 اكتمل الترحيل بنجاح! تم تحديث ${updatedCount} مجموعة.`);
  } catch (error) {
    console.error('❌ حدث خطأ أثناء الترحيل:', error);
  } finally {
    process.exit(0);
  }
}

migrateGroups();node migrate-groups.cjs