const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp({
  databaseURL: 'https://sobatniaga-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const database = getDatabase();

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

const completeOrderTransaction = onCall({ region: 'asia-southeast1' }, async (request) => {
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

module.exports = { completeOrderTransaction, completeFoodDelivery, updateSellerOrderStatus };
