const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// تهيئة تطبيق Firebase Admin
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

      // جلب جميع الأعضاء من الـ subcollection الخاطة بالمجموعة
      const membersSnapshot = await db.collection('groups').doc(groupId).collection('members').get();
      const memberUids = membersSnapshot.docs.map(doc => doc.id);
      const memberCount = memberUids.length;

      // التأكد من وجود رمز دعوة أو توليد رمز افتراضي إذا لم يوجد
      const inviteCode = groupData.inviteCode || Math.random().toString(36).substring(2, 8).toUpperCase();

      // تحديث وثيقة المجموعة بالحقول الجديدة
      await db.collection('groups').doc(groupId).update({
        memberUids: memberUids,
        memberCount: memberCount,
        inviteCode: inviteCode
      });

      console.log(`✅ تم تحديث المجموعة [${groupId}]: ${memberCount} أعضاء.`);
      updatedCount++;
    }

    console.log(`🎉 اكتمل الترحيل بنجاح! تم تحديث ${updatedCount} مجموعة.`);
  } catch (error) {
    console.error('❌ حدث خطأ أثناء الترحيل:', error);
  } finally {
    process.exit();
  }
}

migrateGroups();