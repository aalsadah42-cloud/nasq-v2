'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`ERROR: Service account key not found at ${serviceAccountPath}`);
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
} catch (error) {
  console.error('ERROR: Could not read or parse serviceAccountKey.json:', error.message);
  process.exit(1);
}

const app = getApps().find((firebaseApp) => firebaseApp.name === '[DEFAULT]')
  || initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const inviteCodeCharacters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const validInviteCode = /^[A-HJ-NP-Z2-9]{8}$/;
const writeBatchSize = 250;

function createInviteCode(reservedCodes) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let index = 0; index < 8; index += 1) {
      code += inviteCodeCharacters[randomInt(inviteCodeCharacters.length)];
    }
    if (!reservedCodes.has(code)) {
      reservedCodes.add(code);
      return code;
    }
  }
  throw new Error('Could not generate a unique invite code after 100 attempts.');
}

async function buildMigrationPlan() {
  const [groupsSnapshot, inviteCodesSnapshot] = await Promise.all([
    db.collection('groups').get(),
    db.collection('inviteCodes').get(),
  ]);
  const inviteCodesById = new Map(
    inviteCodesSnapshot.docs.map((inviteDoc) => [inviteDoc.id, inviteDoc.data()]),
  );
  const groupCodeOwners = new Map();
  const reservedCodes = new Set(inviteCodesById.keys());

  for (const groupDoc of groupsSnapshot.docs) {
    const joinCode = groupDoc.data().joinCode;
    if (typeof joinCode === 'string') {
      const owners = groupCodeOwners.get(joinCode) || new Set();
      owners.add(groupDoc.id);
      groupCodeOwners.set(joinCode, owners);
      reservedCodes.add(joinCode);
    }
  }

  const canUseCode = (code, groupId) => {
    if (typeof code !== 'string' || !validInviteCode.test(code)) return false;
    const owners = groupCodeOwners.get(code);
    const invite = inviteCodesById.get(code);
    return (!owners || (owners.size === 1 && owners.has(groupId)))
      && (!invite || invite.groupId === groupId);
  };

  const plan = [];
  for (const groupDoc of groupsSnapshot.docs) {
    const membersSnapshot = await groupDoc.ref.collection('members').get();
    const memberUids = membersSnapshot.docs.map((memberDoc) => memberDoc.id);
    const currentJoinCode = groupDoc.data().joinCode;
    const existingGroupInvite = inviteCodesSnapshot.docs.find((inviteDoc) => (
      inviteDoc.data().groupId === groupDoc.id
      && canUseCode(inviteDoc.id, groupDoc.id)
    ));

    let joinCode;
    if (canUseCode(currentJoinCode, groupDoc.id)) {
      joinCode = currentJoinCode;
    } else if (existingGroupInvite) {
      joinCode = existingGroupInvite.id;
    } else {
      joinCode = createInviteCode(reservedCodes);
    }
    reservedCodes.add(joinCode);

    plan.push({
      groupId: groupDoc.id,
      groupRef: groupDoc.ref,
      createdBy: groupDoc.data().createdBy,
      memberUids,
      memberCount: memberUids.length,
      joinCode,
      inviteRef: db.collection('inviteCodes').doc(joinCode),
      inviteExists: inviteCodesById.has(joinCode),
    });
  }

  return plan;
}

async function migrateGroups() {
  console.log('Starting groups migration...');
  const plan = await buildMigrationPlan();
  console.log(`Prepared migration for ${plan.length} group(s).`);

  let updatedCount = 0;
  for (let offset = 0; offset < plan.length; offset += writeBatchSize) {
    const chunk = plan.slice(offset, offset + writeBatchSize);
    const batch = db.batch();

    for (const group of chunk) {
      batch.update(group.groupRef, {
        memberUids: group.memberUids,
        memberCount: group.memberCount,
        joinCode: group.joinCode,
      });

      const inviteData = {
        groupId: group.groupId,
        memberCount: group.memberCount,
      };
      if (typeof group.createdBy === 'string' && group.createdBy) {
        inviteData.createdBy = group.createdBy;
      }

      if (group.inviteExists) {
        batch.set(group.inviteRef, inviteData, { merge: true });
      } else {
        inviteData.createdAt = FieldValue.serverTimestamp();
        batch.create(group.inviteRef, inviteData);
      }
    }

    await batch.commit();
    updatedCount += chunk.length;
    console.log(`Updated ${updatedCount}/${plan.length} group(s).`);
  }

  console.log(`Groups migration completed successfully (${updatedCount} group(s)).`);
}

async function main() {
  try {
    await migrateGroups();
  } catch (error) {
    console.error('Groups migration failed:', error);
    process.exitCode = 1;
  } finally {
    try {
      await app.delete();
    } catch (error) {
      console.error('Could not close the Firebase Admin app:', error);
      process.exitCode = 1;
    }
  }
}

void main();
