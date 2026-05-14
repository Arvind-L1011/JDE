import { eq, desc, asc, and, gte, lte, like, sql, or, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  ensureUsersTableExists,
  getUserByOpenId as getMssqlUserByOpenId,
  upsertUserByOpenId as upsertMssqlUserByOpenId,
} from "./mssqlUsers";

import {
  InsertUser, users,

  suppliers, InsertSupplier, Supplier,
  inventoryItems, InsertInventoryItem, InventoryItem,
  purchaseOrders, InsertPurchaseOrder, PurchaseOrder,
  salesOrders, InsertSalesOrder, SalesOrder,
  shipments, InsertShipment, Shipment,
  alerts, InsertAlert, Alert,
  demandHistory, InsertDemandHistory,
  remediationActions, InsertRemediationAction
} from "../drizzle/schema";
import { ENV } from './_core/env';
import * as jdeDb from "./jdeDb";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ USER FUNCTIONS ============
export async function upsertUser(user: InsertUser): Promise<void> {
  // Auth persistence moved to MSSQL (server/mssqlUsers.ts)
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  await ensureUsersTableExists();

  const resolvedRole =
    user.role ??
    (user.openId === ENV.ownerOpenId ? ("admin" as const) : undefined);


  await upsertMssqlUserByOpenId({
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: resolvedRole as any,
    lastSignedIn: user.lastSignedIn ?? new Date(),
  });
}



export async function getUserByOpenId(openId: string) {
  // Auth persistence moved to MSSQL (server/mssqlUsers.ts)
  await ensureUsersTableExists();

  const user = await getMssqlUserByOpenId(openId);
  if (!user) return undefined;

  return {
    id: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    loginMethod: user.loginMethod,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSignedIn: user.lastSignedIn,
  };
}


// ============ SUPPLIER FUNCTIONS ============
export async function getSuppliers(filters?: { status?: string; category?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(suppliers);
  const conditions = [];
  
  if (filters?.status) {
    conditions.push(eq(suppliers.status, filters.status as any));
  }
  if (filters?.category) {
    conditions.push(eq(suppliers.category, filters.category));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(suppliers.reliabilityScore));
}

export async function getSupplierById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  return result[0];
}

export async function getAlternativeSuppliers(category: string, excludeId: number, limit = 3) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(suppliers)
    .where(and(
      eq(suppliers.category, category),
      eq(suppliers.status, 'active'),
      sql`${suppliers.id} != ${excludeId}`
    ))
    .orderBy(desc(suppliers.reliabilityScore), asc(suppliers.leadTimeDays))
    .limit(limit);
}

export async function createSupplier(data: InsertSupplier) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(suppliers).values(data);
  return result[0].insertId;
}

// ============ INVENTORY FUNCTIONS ============
export async function getInventoryItems(filters?: { stockoutRisk?: string; category?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(inventoryItems);
  const conditions = [];
  
  if (filters?.stockoutRisk) {
    conditions.push(eq(inventoryItems.stockoutRisk, filters.stockoutRisk as any));
  }
  if (filters?.category) {
    conditions.push(eq(inventoryItems.category, filters.category));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(asc(inventoryItems.daysOfSupply));
}

export async function getInventoryItemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);
  return result[0];
}

export async function getStockoutRiskItems(daysThreshold = 14) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(inventoryItems)
    .where(or(
      eq(inventoryItems.stockoutRisk, 'high'),
      eq(inventoryItems.stockoutRisk, 'critical'),
      lte(inventoryItems.daysOfSupply, daysThreshold)
    ))
    .orderBy(asc(inventoryItems.daysOfSupply));
}

export async function updateInventoryItem(id: number, data: Partial<InsertInventoryItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(inventoryItems).set(data).where(eq(inventoryItems.id, id));
}

export async function createInventoryItem(data: InsertInventoryItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(inventoryItems).values(data);
  return result[0].insertId;
}

// ============ PURCHASE ORDER FUNCTIONS ============
export async function getPurchaseOrders(filters?: { status?: string; riskLevel?: string; supplierId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(purchaseOrders);
  const conditions = [];
  
  if (filters?.status) {
    conditions.push(eq(purchaseOrders.status, filters.status as any));
  }
  if (filters?.riskLevel) {
    conditions.push(eq(purchaseOrders.riskLevel, filters.riskLevel as any));
  }
  if (filters?.supplierId) {
    conditions.push(eq(purchaseOrders.supplierId, filters.supplierId));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(purchaseOrders.createdAt));
}

export async function getPurchaseOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  return result[0];
}

export async function getDelayedPurchaseOrders() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(purchaseOrders)
    .where(or(
      eq(purchaseOrders.riskLevel, 'red'),
      eq(purchaseOrders.riskLevel, 'yellow'),
      gte(purchaseOrders.delayProbability, '50.00')
    ))
    .orderBy(desc(purchaseOrders.delayProbability));
}

export async function updatePurchaseOrder(id: number, data: Partial<InsertPurchaseOrder>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(purchaseOrders).set(data).where(eq(purchaseOrders.id, id));
}

export async function createPurchaseOrder(data: InsertPurchaseOrder) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(purchaseOrders).values(data);
  return result[0].insertId;
}

// ============ SALES ORDER FUNCTIONS ============
export async function getSalesOrders(filters?: { status?: string; customerName?: string; priority?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(salesOrders);
  const conditions = [];
  
  if (filters?.status) {
    conditions.push(eq(salesOrders.status, filters.status as any));
  }
  if (filters?.customerName) {
    conditions.push(like(salesOrders.customerName, `%${filters.customerName}%`));
  }
  if (filters?.priority) {
    conditions.push(eq(salesOrders.priority, filters.priority as any));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(salesOrders.createdAt));
}

export async function getSalesOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).limit(1);
  return result[0];
}

export async function getHighPriorityOrdersByCustomer(customerName: string) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(salesOrders)
    .where(and(
      like(salesOrders.customerName, `%${customerName}%`),
      or(eq(salesOrders.priority, 'high'), eq(salesOrders.priority, 'critical'))
    ))
    .orderBy(desc(salesOrders.orderDate));
}

export async function updateSalesOrder(id: number, data: Partial<InsertSalesOrder>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(salesOrders).set(data).where(eq(salesOrders.id, id));
}

export async function createSalesOrder(data: InsertSalesOrder) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(salesOrders).values(data);
  return result[0].insertId;
}

// ============ SHIPMENT FUNCTIONS ============
export async function getShipments(filters?: { status?: string; riskLevel?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(shipments);
  const conditions = [];
  
  if (filters?.status) {
    conditions.push(eq(shipments.status, filters.status as any));
  }
  if (filters?.riskLevel) {
    conditions.push(eq(shipments.riskLevel, filters.riskLevel as any));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(shipments.createdAt));
}

export async function getShipmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(shipments).where(eq(shipments.id, id)).limit(1);
  return result[0];
}

export async function updateShipment(id: number, data: Partial<InsertShipment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(shipments).set(data).where(eq(shipments.id, id));
}

export async function createShipment(data: InsertShipment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(shipments).values(data);
  return result[0].insertId;
}

// ============ ALERT FUNCTIONS ============
export async function getAlerts(filters?: { type?: string; severity?: string; isRead?: boolean; isResolved?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(alerts);
  const conditions = [];
  
  if (filters?.type) {
    conditions.push(eq(alerts.type, filters.type as any));
  }
  if (filters?.severity) {
    conditions.push(eq(alerts.severity, filters.severity as any));
  }
  if (filters?.isRead !== undefined) {
    conditions.push(eq(alerts.isRead, filters.isRead));
  }
  if (filters?.isResolved !== undefined) {
    conditions.push(eq(alerts.isResolved, filters.isResolved));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(alerts.createdAt));
}

export async function getUnreadAlerts() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(alerts)
    .where(eq(alerts.isRead, false))
    .orderBy(desc(alerts.severity), desc(alerts.createdAt));
}

export async function createAlert(data: InsertAlert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(alerts).values(data);
  return result[0].insertId;
}

export async function markAlertAsRead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alerts).set({ isRead: true }).where(eq(alerts.id, id));
}

export async function resolveAlert(id: number, userId: number, actionTaken: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alerts).set({
    isResolved: true,
    resolvedAt: new Date(),
    resolvedBy: userId,
    actionTaken
  }).where(eq(alerts.id, id));
}

// ============ DEMAND HISTORY FUNCTIONS ============
export async function getDemandHistory(itemId: number, days = 90) {
  const db = await getDb();
  if (!db) return [];
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return db.select()
    .from(demandHistory)
    .where(and(
      eq(demandHistory.itemId, itemId),
      gte(demandHistory.date, startDate)
    ))
    .orderBy(asc(demandHistory.date));
}

export async function createDemandHistory(data: InsertDemandHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(demandHistory).values(data);
  return result[0].insertId;
}

// ============ REMEDIATION ACTIONS FUNCTIONS ============
export async function getRemediationActions(filters?: { status?: string; actionType?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(remediationActions);
  const conditions = [];
  
  if (filters?.status) {
    conditions.push(eq(remediationActions.status, filters.status as any));
  }
  if (filters?.actionType) {
    conditions.push(eq(remediationActions.actionType, filters.actionType as any));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(remediationActions.createdAt));
}

export async function createRemediationAction(data: InsertRemediationAction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(remediationActions).values(data);
  return result[0].insertId;
}

export async function updateRemediationAction(id: number, data: Partial<InsertRemediationAction>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(remediationActions).set(data).where(eq(remediationActions.id, id));
}

// ============ DASHBOARD STATISTICS ============
export async function getDashboardStats() {
  const db = await getDb();
  
  // Local stats
  const localPoStatsPromise = db ? db.select({
    total: sql<number>`COUNT(*)`,
    atRisk: sql<number>`SUM(CASE WHEN riskLevel IN ('red', 'yellow') THEN 1 ELSE 0 END)`,
    delayed: sql<number>`SUM(CASE WHEN status = 'delayed' OR delayProbability > 50 THEN 1 ELSE 0 END)`
  }).from(purchaseOrders).where(sql`status NOT IN ('delivered', 'cancelled')`) : Promise.resolve([{total:0, atRisk:0, delayed:0} as any]);
  
  const localInventoryStatsPromise = db ? db.select({
    total: sql<number>`COUNT(*)`,
    lowStock: sql<number>`SUM(CASE WHEN stockoutRisk IN ('high', 'critical') THEN 1 ELSE 0 END)`,
    criticalItems: sql<number>`SUM(CASE WHEN daysOfSupply <= 7 THEN 1 ELSE 0 END)`
  }).from(inventoryItems) : Promise.resolve([{total:0, lowStock:0, criticalItems:0} as any]);
  
  const localAlertStatsPromise = db ? db.select({
    total: sql<number>`COUNT(*)`,
    unread: sql<number>`SUM(CASE WHEN isRead = 0 THEN 1 ELSE 0 END)`,
    critical: sql<number>`SUM(CASE WHEN severity = 'critical' AND isResolved = 0 THEN 1 ELSE 0 END)`
  }).from(alerts) : Promise.resolve([{total:0, unread:0, critical:0} as any]);
  
  const localSupplierStatsPromise = db ? db.select({
    total: sql<number>`COUNT(*)`,
    active: sql<number>`SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)`,
    avgReliability: sql<number>`AVG(reliabilityScore)`
  }).from(suppliers) : Promise.resolve([{total:0, active:0, avgReliability:0} as any]);
  
  // JDE dynamic alerts (matching routers.ts alert.list logic)
  const jdeDataPromises = [
    jdeDb.getJDEInventoryItems(),
    jdeDb.getJDEPurchaseOrders(),
    jdeDb.getJDESalesOrders(),
    jdeDb.getJDEShipments(),
    jdeDb.getJDESuppliers()
  ];
  
  const [jdeInventory, jdePOs, jdeSOs, jdeShipments, jdeSuppliers] = await Promise.all(jdeDataPromises);
  
  // Generate JDE alerts counts (same logic as alert.list)
  const inventoryCritical = jdeInventory.filter((item: any) => item.stockoutRisk === "critical").length;
  const inventoryWarning = jdeInventory.filter((item: any) => item.stockoutRisk === "high").length;
  
  const poCritical = jdePOs.filter((po: any) => po.riskLevel === "red").length;
  const poWarning = jdePOs.filter((po: any) => po.riskLevel === "yellow").length;
  
  const soCritical = jdeSOs.filter((so: any) => so.fulfillmentRisk === "red").length;
  
  const shipmentCritical = jdeShipments.filter((s: any) => s.riskLevel === "red" || s.riskLevel === "yellow").length; // Note: temp alert handled in full list
  const shipmentTempCritical = jdeShipments.filter((s: any) => s.temperature !== undefined && Math.abs(s.temperature || 0 - 20) > 5).length; // approx temp alert
  
  const supplierCritical = jdeSuppliers.filter((s: any) => 
    s.type !== 'V' || (s.reliabilityScore || 0) < 50 || (s.qualityScore || 0) < 50
  ).length;
  const supplierWarning = jdeSuppliers.filter((s: any) => 
    (s.reliabilityScore || 0) < 70 || (s.qualityScore || 0) < 70
  ).length - supplierCritical;
  
  // Total generated JDE alerts: all warnings + criticals
  const jdeTotalAlerts = inventoryCritical + inventoryWarning + poCritical + poWarning + soCritical + shipmentCritical + shipmentTempCritical + supplierCritical + supplierWarning;
  
  // Critical = all "critical" severity
  const jdeCriticalAlerts = inventoryCritical + poCritical + soCritical + shipmentCritical + shipmentTempCritical + supplierCritical;
  
  // Unread = all JDE alerts (none marked read in resolutions table for dashboard)
  const jdeUnreadAlerts = jdeTotalAlerts; // Simplified: all dynamic are "unread" for dashboard
  
  // Combine local + JDE
  const [poStats, inventoryStats, localAlertStats, supplierStats] = await Promise.all([
    localPoStatsPromise, localInventoryStatsPromise, localAlertStatsPromise, localSupplierStatsPromise
  ]);
  
  const combinedAlerts = {
    total: Number(localAlertStats[0]?.total || 0) + jdeTotalAlerts,
    unread: Number(localAlertStats[0]?.unread || 0) + jdeUnreadAlerts,
    critical: Number(localAlertStats[0]?.critical || 0) + jdeCriticalAlerts
  };
  
  // MySQL returns aggregates as strings; coerce to numbers for the client
  const toNum = (obj: Record<string, any>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Number(v)]));

  return {
    purchaseOrders: toNum(poStats[0] || {total:0, atRisk:0, delayed:0}),
    inventory: toNum(inventoryStats[0] || {total:0, lowStock:0, criticalItems:0}),
    alerts: combinedAlerts,
    suppliers: toNum(supplierStats[0] || {total:0, active:0, avgReliability:0}),
  };
}
