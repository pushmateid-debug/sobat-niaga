const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');

initializeApp({
  databaseURL: 'https://sobatniaga-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const database = getDatabase();
const firestore = getFirestore();
const chatImageBucket = getStorage().bucket('sobatniaga.firebasestorage.app');

const NIAGAGO_CHAT_ACTIVE_STATUSES = new Set(['accepted', 'paid', 'verified', 'ongoing']);
const NIAGAGO_CHAT_CLOSED_STATUSES = new Set(['completed', 'cancelled', 'expired', 'payment_rejected']);

const syncNiagaGoChatRoom = async (orderId, order) => {
  const { userId, driverId, status } = order;
  if (typeof userId !== 'string' || typeof driverId !== 'string' || userId === driverId) return;

  const roomRef = database.ref(`niagago_chats/${orderId}`);
  if (NIAGAGO_CHAT_ACTIVE_STATUSES.has(status)) {
    await Promise.all([
      roomRef.update({ members: { [userId]: true, [driverId]: true }, canSend: true }),
      roomRef.child('createdAt').transaction((current) => current || Date.now())
    ]);
  } else if (
    NIAGAGO_CHAT_CLOSED_STATUSES.has(status) &&
    (await roomRef.child('canSend').get()).exists()
  ) {
    await roomRef.child('canSend').set(false);
  }
};

const openNiagaGoChat = onCall({ region: 'asia-southeast1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Silakan masuk untuk membuka chat perjalanan.');
  }

  const orderId = request.data?.orderId;
  if (typeof orderId !== 'string' || !orderId || orderId.includes('/')) {
    throw new HttpsError('invalid-argument', 'ID pesanan tidak valid.');
  }

  const orderSnapshot = await firestore.collection('ojek_orders').doc(orderId).get();
  if (!orderSnapshot.exists) {
    throw new HttpsError('not-found', 'Pesanan tidak ditemukan.');
  }

  const order = orderSnapshot.data();
  if (![order.userId, order.driverId].includes(request.auth.uid)) {
    throw new HttpsError('permission-denied', 'Chat ini bukan milik akun Anda.');
  }
  if (typeof order.userId !== 'string' || typeof order.driverId !== 'string') {
    throw new HttpsError('failed-precondition', 'Pesanan belum memiliki driver dan penumpang yang terhubung.');
  }

  const active = NIAGAGO_CHAT_ACTIVE_STATUSES.has(order.status);
  const closed = NIAGAGO_CHAT_CLOSED_STATUSES.has(order.status);
  const roomRef = database.ref(`niagago_chats/${orderId}`);
  if (!active && !closed) {
    throw new HttpsError('failed-precondition', 'Chat tersedia setelah driver dan penumpang menyetujui pesanan.');
  }

  if (active) {
    await syncNiagaGoChatRoom(orderId, order);
  } else {
    await Promise.all([
      roomRef.update({ members: { [order.userId]: true, [order.driverId]: true }, canSend: false }),
      roomRef.child('createdAt').transaction((current) => current || Date.now())
    ]);
  }

  return { orderId, canSend: active };
});

const getNiagaGoChatImageUrl = onCall({ region: 'asia-southeast1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Silakan masuk untuk melihat gambar chat.');
  }

  const { orderId, messageId, storagePath } = request.data || {};
  if (typeof orderId !== 'string' || !orderId ||
      typeof messageId !== 'string' || !messageId ||
      orderId.includes('/') || !/^[A-Za-z0-9_-]+$/.test(messageId) ||
      typeof storagePath !== 'string') {
    throw new HttpsError('invalid-argument', 'Data gambar chat tidak valid.');
  }

  const orderSnapshot = await firestore.collection('ojek_orders').doc(orderId).get();
  if (!orderSnapshot.exists) throw new HttpsError('not-found', 'Pesanan tidak ditemukan.');
  const order = orderSnapshot.data();
  const participantIds = [order.userId, order.driverId];
  if (!participantIds.includes(request.auth.uid)) {
    throw new HttpsError('permission-denied', 'Anda bukan anggota percakapan ini.');
  }

  const roomSnapshot = await database.ref(`niagago_chats/${orderId}/members`).get();
  if (roomSnapshot.child(request.auth.uid).val() !== true) {
    throw new HttpsError('permission-denied', 'Anda bukan anggota percakapan ini.');
  }

  const messageSnapshot = await database.ref(`niagago_chats/${orderId}/messages/${messageId}`).get();
  const message = messageSnapshot.val();
  const pathParts = storagePath.split('/');
  if (pathParts.length !== 4 || pathParts[0] !== 'niagago_chats' ||
      pathParts[1] !== orderId || pathParts[3] !== messageId ||
      !participantIds.includes(pathParts[2]) ||
      message?.senderId !== pathParts[2] ||
      message?.imagePath !== storagePath ||
      message?.type !== 'image' ||
      !/^[A-Za-z0-9_-]+$/.test(pathParts[3])) {
    throw new HttpsError('invalid-argument', 'Lokasi file chat tidak valid.');
  }

  const file = chatImageBucket.file(storagePath);
  const [metadata] = await file.getMetadata();
  const fileSize = Number(metadata.size);
  if (metadata.metadata?.orderId !== orderId ||
      metadata.metadata?.senderId !== pathParts[2] ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(metadata.contentType) ||
      !Number.isFinite(fileSize) || fileSize > 5 * 1024 * 1024) {
    throw new HttpsError('permission-denied', 'File tidak memenuhi kebijakan keamanan chat.');
  }

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000
  });
  return { url };
});

const syncNiagaGoChatRoomOnOrderUpdate = onDocumentUpdated(
  { document: 'ojek_orders/{orderId}', region: 'asia-southeast1' },
  async (event) => {
    const orderId = event.params.orderId;
    const currentOrder = await firestore.collection('ojek_orders').doc(orderId).get();
    if (currentOrder.exists) await syncNiagaGoChatRoom(orderId, currentOrder.data());
  }
);

const toItems = (items) => (Array.isArray(items) ? items : Object.values(items || {}))
  .filter((item) => item && typeof item === 'object');

const toInteger = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getCompetitionActive = (settings, now) => {
  if (!settings?.isActive || !settings.startDate || !settings.endDate) return false;
  const start = new Date(settings.startDate);
  const end = new Date(settings.endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return now >= start && now <= end;
};

const writeNotification = async (notificationRef, data, warnings, label) => {
  try {
    await notificationRef.set(data);
  } catch (error) {
    console.error(`${label}:`, error);
    warnings.push(label);
  }
};

const settleDriverDeliveryFee = async (orderId, driverId, amount, timestamp) => {
  const deliveryFee = Number(amount);
  if (!driverId || !Number.isSafeInteger(deliveryFee) || deliveryFee < 0) {
    throw new HttpsError('failed-precondition', 'Data ongkos kirim atau driver tidak valid.');
  }

  const driverRef = database.ref(`users/${driverId}`);
  const driverSnapshot = await driverRef.transaction((current) => {
    if (!current) return;
    const payouts = current.foodDeliveryPayouts || {};
    const existingPayout = payouts[orderId];
    if (existingPayout) {
      if (Number(existingPayout.amount) !== deliveryFee) return;
      return current;
    }

    return {
      ...current,
      balance: toInteger(current.balance) + deliveryFee,
      foodDeliveryPayouts: {
        ...payouts,
        [orderId]: { amount: deliveryFee, paidAt: timestamp }
      }
    };
  });

  const payout = driverSnapshot.snapshot.val()?.foodDeliveryPayouts?.[orderId];
  if (!payout || Number(payout.amount) !== deliveryFee) {
    throw new HttpsError('aborted', 'Saldo driver belum dapat diperbarui. Silakan coba lagi.');
  }

  return deliveryFee;
};

const settleOrder = async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Silakan masuk untuk menyelesaikan pesanan.');
  }

  const orderId = request.data?.orderId;
  if (typeof orderId !== 'string' || !orderId) {
    throw new HttpsError('invalid-argument', 'ID pesanan tidak valid.');
  }

  const orderRef = database.ref(`orders/${orderId}`);
  const orderSnapshot = await orderRef.get();
  if (!orderSnapshot.exists()) {
    throw new HttpsError('not-found', 'Pesanan tidak ditemukan.');
  }

  const order = orderSnapshot.val();
  if (order.buyerId !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Hanya pembeli pesanan ini yang dapat mengonfirmasi penerimaan.');
  }
  if (order.driverId && order.deliveryFee == null) {
    throw new HttpsError('failed-precondition', 'Data ongkos kirim driver tidak ditemukan pada pesanan.');
  }
  if (order.driverId) {
    const fee = Number(order.deliveryFee);
    if (!Number.isSafeInteger(fee) || fee < 0) {
      throw new HttpsError('failed-precondition', 'Nominal ongkos kirim pada pesanan tidak valid.');
    }
  }

  if (order.status === 'completed' && order.settlementStatus === 'completed') {
    return { status: 'completed', alreadyCompleted: true };
  }

  if (order.status === 'completed' && !order.settlementStatus) {
    throw new HttpsError(
      'failed-precondition',
      'Pesanan ini sudah ditandai selesai oleh versi lama, tetapi pencairan dananya belum dapat diverifikasi. Jangan konfirmasi ulang; minta Admin memeriksa saldo pesanan ini.'
    );
  }

  const claimSnapshot = await orderRef.transaction((current) => {
    if (!current || current.buyerId !== request.auth.uid) return;
    if (current.status === 'completed' && current.settlementStatus === 'completed') return current;
    const waitingForBuyer = ['shipped', 'delivering'].includes(current.status) ||
      (current.status === 'completed' && current.settlementStatus === 'pending');
    if (!waitingForBuyer && current.settlementStatus !== 'processing') return;
    return {
      ...current,
      settlementStatus: 'processing'
    };
  });

  if (!claimSnapshot.committed) {
    throw new HttpsError('failed-precondition', 'Status pesanan belum siap dikonfirmasi atau sedang berubah.');
  }

  const claimedOrder = claimSnapshot.snapshot.val();
  if (claimedOrder.status === 'completed' && claimedOrder.settlementStatus === 'completed') {
    return { status: 'completed', alreadyCompleted: true };
  }

  const items = toItems(claimedOrder.items);
  if (items.length === 0) {
    throw new HttpsError('failed-precondition', 'Pesanan tidak memiliki data produk yang dapat diselesaikan.');
  }

  const sellerTotals = new Map();
  const productTotals = new Map();
  for (const item of items) {
    const sellerId = item.sellerId;
    const quantity = item.quantity == null ? 1 : Number(item.quantity);
    const price = Number(item.price);
    if (typeof sellerId !== 'string' || !sellerId ||
        !Number.isSafeInteger(quantity) || quantity <= 0 ||
        !Number.isSafeInteger(price) || price < 0) {
      throw new HttpsError('failed-precondition', 'Rincian produk pada pesanan tidak valid.');
    }

    const totals = sellerTotals.get(sellerId) || { amount: 0, quantity: 0 };
    totals.amount += price * quantity;
    totals.quantity += quantity;
    if (!Number.isSafeInteger(totals.amount) || !Number.isSafeInteger(totals.quantity)) {
      throw new HttpsError('failed-precondition', 'Total rincian pesanan melebihi batas yang didukung.');
    }
    sellerTotals.set(sellerId, totals);

    const productId = item.productId || item.id;
    if (productId) {
      productTotals.set(productId, (productTotals.get(productId) || 0) + quantity);
    }
  }

  if (sellerTotals.size === 0) {
    throw new HttpsError('failed-precondition', 'Data penjual pada pesanan tidak ditemukan.');
  }

  if (sellerTotals.has(claimedOrder.buyerId)) {
    throw new HttpsError('failed-precondition', 'Pembeli tidak dapat menyelesaikan pesanan dari tokonya sendiri.');
  }

  const expectedSellerIds = [...sellerTotals.keys()].sort();
  const sellerAccess = claimedOrder.sellerAccess;
  const legacySellerIds = Array.isArray(claimedOrder.involvedSellerIds)
    ? claimedOrder.involvedSellerIds
    : Object.values(claimedOrder.involvedSellerIds || {});
  const recordedSellerIds = sellerAccess
    ? Object.keys(sellerAccess).filter((sellerId) => sellerAccess[sellerId] === true).sort()
    : [...new Set(legacySellerIds.length ? legacySellerIds : (claimedOrder.sellerId ? [claimedOrder.sellerId] : []))].sort();
  if (expectedSellerIds.length !== recordedSellerIds.length ||
      expectedSellerIds.some((sellerId, index) => sellerId !== recordedSellerIds[index])) {
    throw new HttpsError('failed-precondition', 'Data penjual pada pesanan tidak cocok dengan item yang dipesan.');
  }

  const now = new Date();
  const timestamp = now.toISOString();
  const notificationWarnings = [];
  const competitionSnapshot = await database.ref('admin/competitionSettings').get();
  const competitionActive = getCompetitionActive(competitionSnapshot.val(), now);

  for (const [sellerId, totals] of sellerTotals.entries()) {
    const sellerInfoRef = database.ref(`users/${sellerId}/sellerInfo`);
    const sellerSnapshot = await sellerInfoRef.get();
    if (!sellerSnapshot.exists()) {
      throw new HttpsError('failed-precondition', `Profil penjual ${sellerId} tidak ditemukan; pencairan belum dapat diproses.`);
    }

    const adminFee = totals.amount < 15000 ? 500 : 2000;
    const netIncome = totals.amount - adminFee;
    const loyaltyPoints = 10;
    const eventPoints = competitionActive
      ? Math.floor((totals.amount / 10000) + (totals.quantity * 5))
      : 0;

    const settlementSnapshot = await sellerInfoRef.transaction((current) => {
      if (!current) return;
      if (current.settledOrders?.[orderId]) return current;

      return {
        ...current,
        balance: toInteger(current.balance) + netIncome,
        points_loyalty: toInteger(current.points_loyalty) + loyaltyPoints,
        points_event: toInteger(current.points_event) + eventPoints,
        competitionRevenue: toInteger(current.competitionRevenue) + totals.amount,
        competitionQty: toInteger(current.competitionQty) + totals.quantity,
        settledOrders: {
          ...(current.settledOrders || {}),
          [orderId]: { amount: totals.amount, netIncome, createdAt: timestamp }
        }
      };
    });

    if (!settlementSnapshot.committed && !settlementSnapshot.snapshot.child(`settledOrders/${orderId}`).exists()) {
      throw new HttpsError('aborted', 'Saldo penjual belum dapat diperbarui. Silakan coba lagi.');
    }

    await writeNotification(database.ref(`notifications/settlement_${orderId}_${sellerId}`), {
      userId: sellerId,
      title: 'Saldo Masuk',
      message: `Saldo Rp ${netIncome.toLocaleString('id-ID')} masuk! (+${loyaltyPoints} Poin Seller)`,
      type: 'success',
      targetView: 'dashboard-seller',
      createdAt: timestamp,
      isRead: false
    }, notificationWarnings, `Gagal mengirim notifikasi pencairan seller untuk order ${orderId}`);
  }

  for (const [productId, quantity] of productTotals.entries()) {
    const productRef = database.ref(`products/${productId}`);
    const productSnapshot = await productRef.transaction((current) => {
      if (!current || current.soldOrders?.[orderId]) return current;
      return {
        ...current,
        sold: toInteger(current.sold) + quantity,
        soldOrders: {
          ...(current.soldOrders || {}),
          [orderId]: true
        }
      };
    });
    if (!productSnapshot.committed && !productSnapshot.snapshot.exists()) continue;
  }

  let driverPayoutAmount = claimedOrder.driverPayoutAmount;
  if (claimedOrder.deliveryFee != null && claimedOrder.driverId) {
    driverPayoutAmount = await settleDriverDeliveryFee(
      orderId,
      claimedOrder.driverId,
      claimedOrder.deliveryFee,
      timestamp
    );
    await writeNotification(database.ref(`notifications/settlement_${orderId}_driver`), {
      userId: claimedOrder.driverId,
      title: 'Ongkir Masuk',
      message: `Ongkir sebesar Rp ${driverPayoutAmount.toLocaleString('id-ID')} dari order #${orderId.slice(-6)} telah masuk ke saldo.`,
      type: 'success',
      createdAt: timestamp,
      isRead: false
    }, notificationWarnings, `Gagal mengirim notifikasi ongkir untuk order ${orderId}`);
  }

  const completedSnapshot = await orderRef.transaction((current) => {
    if (!current || current.buyerId !== request.auth.uid) return;
    if (current.settlementStatus === 'completed') return current;
    if (current.settlementStatus !== 'processing') return;
    return {
      ...current,
      status: 'completed',
      fundsReleased: true,
      settlementStatus: 'completed',
      completedAt: current.completedAt || timestamp,
      ...(driverPayoutAmount == null ? {} : {
        driverPayoutStatus: 'paid',
        driverPayoutAmount
      })
    };
  });

  if (!completedSnapshot.committed && completedSnapshot.snapshot.val()?.settlementStatus !== 'completed') {
    throw new HttpsError('aborted', 'Pencairan dana sedang diproses; silakan muat ulang riwayat pesanan.');
  }

  return { status: 'completed', alreadyCompleted: false, notificationWarnings };
};

const completeOrderTransaction = onCall({ region: 'asia-southeast1' }, async (request) => {
  const orderId = request.data?.orderId;
  try {
    return await settleOrder(request);
  } catch (error) {
    console.error('Order settlement failed', {
      orderId,
      uid: request.auth?.uid,
      code: error.code || 'unknown',
      message: error.message,
      stack: error.stack
    });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      'internal',
      'Server gagal memproses pencairan pesanan. Silakan coba lagi; jika masih gagal, hubungi Admin dengan ID pesanan.',
      { orderId }
    );
  }
});

const completeFoodDelivery = onCall({ region: 'asia-southeast1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Silakan masuk untuk menyelesaikan pengantaran.');
  }

  const orderId = request.data?.orderId;
  if (typeof orderId !== 'string' || !orderId) {
    throw new HttpsError('invalid-argument', 'ID pesanan tidak valid.');
  }

  const orderRef = database.ref(`orders/${orderId}`);
  const orderSnapshot = await orderRef.get();
  if (!orderSnapshot.exists()) {
    throw new HttpsError('not-found', 'Pesanan tidak ditemukan.');
  }

  const order = orderSnapshot.val();
  if (order.driverId !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Hanya driver pesanan ini yang dapat menyelesaikan pengantaran.');
  }
  if (order.status === 'completed' && order.driverPayoutStatus === 'paid') {
    return {
      status: 'completed',
      alreadyCompleted: true,
      deliveryFee: toInteger(order.driverPayoutAmount ?? order.deliveryFee)
    };
  }
  if (!['delivering', 'completing'].includes(order.status)) {
    throw new HttpsError('failed-precondition', 'Pesanan tidak lagi dalam status pengantaran.');
  }

  const timestamp = new Date().toISOString();
  const deliveryFee = await settleDriverDeliveryFee(orderId, order.driverId, order.deliveryFee, timestamp);
  const completionSnapshot = await orderRef.transaction((current) => {
    if (!current || current.driverId !== request.auth.uid) return;
    if (current.status === 'completed' && current.driverPayoutStatus === 'paid') return current;
    if (!['delivering', 'completing'].includes(current.status)) return;

    return {
      ...current,
      status: 'completed',
      completedAt: current.completedAt || timestamp,
      driverPayoutStatus: 'paid',
      driverPayoutAmount: deliveryFee,
      settlementStatus: current.settlementStatus || 'pending'
    };
  });

  if (!completionSnapshot.committed &&
      !(completionSnapshot.snapshot.val()?.status === 'completed' &&
        completionSnapshot.snapshot.val()?.driverPayoutStatus === 'paid')) {
    throw new HttpsError('aborted', 'Status pengantaran berubah. Muat ulang pesanan dan coba lagi.');
  }

  const notificationWarnings = [];
  await writeNotification(database.ref('notifications').push(), {
    recipientId: order.buyerId,
    title: 'Pesanan Selesai',
    message: 'Pesanan Niaga Food kamu sudah diantar.',
    type: 'success',
    targetView: 'history',
    orderId,
    createdAt: timestamp,
    status: 'unread'
  }, notificationWarnings, `Gagal mengirim notifikasi selesai untuk order ${orderId}`);

  return { status: 'completed', alreadyCompleted: false, deliveryFee, notificationWarnings };
});

const updateSellerOrderStatus = onCall({ region: 'asia-southeast1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Silakan masuk untuk memperbarui pesanan.');
  }

  const { orderId, status } = request.data || {};
  if (typeof orderId !== 'string' || !orderId || !['being_prepared', 'shipped'].includes(status)) {
    throw new HttpsError('invalid-argument', 'Data perubahan status pesanan tidak valid.');
  }

  const orderRef = database.ref(`orders/${orderId}`);
  const orderSnapshot = await orderRef.get();
  if (!orderSnapshot.exists()) {
    throw new HttpsError('not-found', 'Pesanan tidak ditemukan.');
  }

  const order = orderSnapshot.val();
  const sellerItems = toItems(order.items).filter((item) => item.sellerId === request.auth.uid);
  if (sellerItems.length === 0) {
    throw new HttpsError('permission-denied', 'Anda bukan penjual pada pesanan ini.');
  }

  const ownedProducts = await Promise.all(sellerItems.map(async (item) => {
    const productId = item.productId || item.id;
    if (typeof productId !== 'string' || !productId) return false;
    const productSnapshot = await database.ref(`products/${productId}`).get();
    return productSnapshot.exists() && productSnapshot.child('sellerId').val() === request.auth.uid;
  }));
  if (!ownedProducts.every(Boolean)) {
    throw new HttpsError('permission-denied', 'Produk pada pesanan tidak cocok dengan toko Anda.');
  }

  const currentStatus = order.status;
  const isAlreadyUpdated = currentStatus === status;
  const canUpdate = status === 'being_prepared'
    ? currentStatus === 'processed'
    : ['processed', 'being_prepared'].includes(currentStatus);
  if (!isAlreadyUpdated && !canUpdate) {
    throw new HttpsError('failed-precondition', 'Status pesanan sudah berubah dan tidak dapat diperbarui.');
  }

  const resi = status === 'shipped' ? request.data.resi : undefined;
  if (resi !== undefined && (typeof resi !== 'string' || resi.length > 100)) {
    throw new HttpsError('invalid-argument', 'Nomor resi tidak valid.');
  }

  const timestamp = new Date().toISOString();
  const updateSnapshot = await orderRef.transaction((current) => {
    if (!current || current.buyerId !== order.buyerId) return;
    if (current.status === status) return current;
    if (status === 'being_prepared' && current.status !== 'processed') return;
    if (status === 'shipped' && !['processed', 'being_prepared'].includes(current.status)) return;

    return {
      ...current,
      status,
      ...(status === 'shipped' ? {
        ...(resi === undefined ? {} : { resi }),
        shippedAt: current.shippedAt || timestamp
      } : {})
    };
  });

  if (!updateSnapshot.committed && updateSnapshot.snapshot.val()?.status !== status) {
    throw new HttpsError('aborted', 'Status pesanan berubah. Muat ulang dan coba lagi.');
  }

  return { status, alreadyUpdated: isAlreadyUpdated };
});

module.exports = {
  completeOrderTransaction,
  completeFoodDelivery,
  updateSellerOrderStatus,
  openNiagaGoChat,
  getNiagaGoChatImageUrl,
  syncNiagaGoChatRoomOnOrderUpdate
};
