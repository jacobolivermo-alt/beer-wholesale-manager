export interface Product {
    id: string;
    name: string;
    price: number;
    stock: number;
    lowStockThreshold: number;
    bottlesPerCase: number;
    createdAt: string;
    deletedAt?: string;
}
export interface Customer {
    id: string;
    name: string;
    contactName: string;
    phone: string;
    address: string;
    remark: string;
    receivable: number;
    emptyBottleCount: number;
    emptyBottlesByProduct?: Record<string, number>;
    createdAt: string;
    lastOperatedAt?: string;
    productPrices: Record<string, number>;
    deletedAt?: string;
}
export interface CustomerStock {
    looseBottleQuantity?: number;
    bottlesPerCase?: number;
    id: string;
    customerId: string;
    productId: string;
    quantity: number;
}
export interface DeliveryItem {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    bottlesPerCase: number;
}
export type PaymentType = 'CREDIT' | 'PAID';
export type PaymentMethod = 'WECHAT' | 'ALIPAY' | 'CASH' | 'BANK';
export interface Delivery {
    id: string;
    customerId: string;
    items: DeliveryItem[];
    totalQuantity: number;
    totalAmount: number;
    calculatedAmount?: number;
    adjustmentReason?: string;
    totalEmptyBottleQuantity: number;
    paymentType: PaymentType;
    createdAt: string;
}
export interface Payment {
    id: string;
    customerId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    forgivenAmount?: number;
    adjustmentReason?: string;
    createdAt: string;
}
export interface BottleReturnItem {
    productId: string;
    productName: string;
    quantity: number;
}
export interface BottleReturn {
    deductInventory?: boolean;
    items?: BottleReturnItem[];
    id: string;
    customerId: string;
    quantity: number;
    createdAt: string;
}
export interface StockMovement {
    id: string;
    productId: string;
    type: 'DELIVERY' | 'PURCHASE' | 'STOCKTAKE' | 'BOTTLE_RETURN';
    quantityUnit?: 'BOX' | 'BOTTLE';
    quantity: number;
    beforeQuantity: number;
    afterQuantity: number;
    customerId?: string;
    createdAt: string;
}
export type RecordType = 'DELIVERY' | 'PURCHASE' | 'BOTTLE_RETURN' | 'PAYMENT' | 'STOCKTAKE';
export interface Receipt {
    id: string;
    path: string;
    createdAt: string;
}
export interface BusinessRecord {
    receipts?: Receipt[];
    id: string;
    type: RecordType;
    customerId?: string;
    title: string;
    quantityUnit: 'BOX' | 'BOTTLE';
    description: string;
    amount: number;
    quantity: number;
    createdAt: string;
}
export interface Database {
    version: 2;
    products: Product[];
    customers: Customer[];
    customerStocks: CustomerStock[];
    deliveries: Delivery[];
    payments: Payment[];
    bottleReturns: BottleReturn[];
    stockMovements: StockMovement[];
    records: BusinessRecord[];
}
