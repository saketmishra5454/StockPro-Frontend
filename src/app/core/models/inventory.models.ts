export interface Product {
  productId: number;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  unitOfMeasure?: string;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  maxStockLevel: number;
  leadTimeDays: number;
  imageUrl?: string;
  barcode?: string;
  active?: boolean;
  isActive?: boolean;
}

export interface Warehouse {
  warehouseId: number;
  name: string;
  location?: string;
  address?: string;
  managerId: number;
  capacity: number;
  usedCapacity: number;
  phone?: string;
  active?: boolean;
  isActive?: boolean;
  createdAt?: string;
}

export interface StockLevel {
  stockId: number;
  warehouseId: number;
  productId: number;
  quantity: number;
  reservedQuantity: number;
  availableQuantity?: number;
  location?: string;
  lastUpdated?: string;
}

export interface Supplier {
  supplierId: number;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxId?: string;
  paymentTerms?: string;
  leadTimeDays?: number;
  rating?: number;
  ratingCount?: number;
  active?: boolean;
  isActive?: boolean;
}

export interface PurchaseOrder {
  poId?: number;
  purchaseOrderId?: number;
  supplierId: number;
  warehouseId: number;
  createdById?: number;
  status: string;
  orderDate?: string;
  expectedDate?: string;
  totalAmount?: number;
  notes?: string;
  referenceNumber?: string;
  rejectionReason?: string;
}

export interface PurchaseOrderLineItem {
  lineItemId?: number;
  id?: number;
  poId?: number;
  purchaseOrderId?: number;
  productId: number;
  orderedQuantity?: number;
  receivedQuantity?: number;
  quantity?: number;
  unitPrice?: number;
  unitCost?: number;
  lineTotal?: number;
  totalCost?: number;
  receivedQty?: number;
}

export interface StockMovement {
  movementId: number;
  productId: number;
  warehouseId: number;
  movementType?: string;
  type?: string;
  quantity: number;
  referenceId?: number;
  referenceType?: string;
  unitCost?: number;
  performedBy?: number;
  notes?: string;
  balanceAfter?: number;
  createdAt?: string;
  movementDate?: string;
}

export interface Alert {
  alertId: number;
  recipientId: number;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | string;
  title: string;
  message?: string;
  relatedProductId?: number;
  relatedWarehouseId?: number;
  channel?: string;
  read?: boolean;
  acknowledged?: boolean;
  isRead?: boolean;
  isAcknowledged?: boolean;
  createdAt?: string;
}

export interface StockValueSummary {
  totalStockValue: number;
  currency: string;
  asOf: string;
}

export interface WarehouseStockValue {
  warehouseId: number;
  stockValue: number;
  asOf: string;
}

export interface InventoryTurnoverSummary {
  warehouseId: number;
  turnoverRate: number;
  from: string;
  to: string;
  interpretation: string;
}

export interface ProductMovementSummary {
  productId: number;
  productName?: string;
  sku?: string;
  totalUnitsIn?: number;
  totalUnitsOut?: number;
  totalUnitsMoved?: number;
  totalValue?: number;
  totalMoved?: number;
  totalQuantity?: number;
  movementCount?: number;
}

export interface UserProfile {
  userId?: number;
  id?: number;
  fullName?: string;
  name?: string;
  email: string;
  phone?: string;
  role: string;
  department?: string;
  active?: boolean;
  isActive?: boolean;
}
