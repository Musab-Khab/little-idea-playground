// MFAHH – Modern Financial Accounting & Handling Hub (Turnkey Publishers)
// Dummy seed data. Demo "today" = 2025-09-12. Currency = PKR.

export const DEMO_TODAY = '2025-09-12';

/* ------------------------------ TYPES ------------------------------ */
export type DocStatus = 'Draft' | 'Pending' | 'Approved' | 'Cancelled';
export type PayStatus = 'Paid' | 'Partially Paid' | 'Unpaid' | 'Overdue' | 'Cancelled';
export type DeliveryStatus = 'Pending' | 'Partial' | 'Delivered' | 'Cancelled';
export type ActiveStatus = 'Active' | 'Inactive';
export type PayMethod = 'Cash' | 'Cheque' | 'Bank';

export interface AuditInfo {
  createdBy: string; createdAt: string;
  editedBy?: string; editedAt?: string;
  approvedBy?: string; approvedAt?: string;
  cancelledBy?: string; cancelledAt?: string; cancelReason?: string;
}
export interface LineItem { bookId: string; qty: number; rate: number; discountPct: number }

/* ------------------------- FINANCIAL YEARS ------------------------- */
export const financialYears = [
  { id: 'FY2025-26', label: '2025-26', start: '2025-07-01', end: '2026-06-30', status: 'Open' },
  { id: 'FY2024-25', label: '2024-25', start: '2024-07-01', end: '2025-06-30', status: 'Closed' },
];

/* --------------------------- USERS & ROLES ------------------------- */
export const permissionKeys = [
  'dashboard.view', 'customers.manage', 'suppliers.manage', 'books.manage', 'books.price_edit',
  'inventory.manage', 'stock.negative_allow', 'samples.manage', 'sales.create', 'sales.approve',
  'purchases.create', 'purchases.approve', 'expenses.create', 'expenses.approve', 'accounts.manage',
  'reports.view', 'staff.view', 'payroll.manage', 'settings.manage', 'audit.view',
] as const;

export const roles = [
  { id: 'admin', name: 'Admin', permissions: [...permissionKeys] },
  { id: 'accountant', name: 'Accountant', permissions: ['dashboard.view', 'customers.manage', 'suppliers.manage', 'sales.approve', 'purchases.approve', 'expenses.create', 'expenses.approve', 'accounts.manage', 'reports.view', 'audit.view'] },
  { id: 'sales', name: 'Sales', permissions: ['dashboard.view', 'customers.manage', 'sales.create', 'samples.manage', 'reports.view'] },
  { id: 'store', name: 'Store Keeper', permissions: ['dashboard.view', 'books.manage', 'inventory.manage', 'samples.manage', 'purchases.create'] },
  { id: 'hr', name: 'HR', permissions: ['dashboard.view', 'staff.view', 'payroll.manage'] },
];

export const users = [
  { id: 'U1', name: 'Admin', email: 'admin@turnkey.pk', roleId: 'admin', status: 'Active' as ActiveStatus },
  { id: 'U2', name: 'Faisal Qureshi', email: 'faisal@turnkey.pk', roleId: 'accountant', status: 'Active' as ActiveStatus },
  { id: 'U3', name: 'Hamza Ali', email: 'hamza@turnkey.pk', roleId: 'sales', status: 'Active' as ActiveStatus },
  { id: 'U4', name: 'Rizwan Ahmed', email: 'rizwan@turnkey.pk', roleId: 'store', status: 'Active' as ActiveStatus },
  { id: 'U5', name: 'Sana Malik', email: 'sana@turnkey.pk', roleId: 'hr', status: 'Active' as ActiveStatus },
];

/* ----------------------------- CUSTOMERS --------------------------- */
export type CustomerCategory = 'School' | 'Bookshop' | 'Dealer' | 'Distributor' | 'Institution' | 'Other';
export const customers = [
  { id: 'C001', code: 'CUS-001', name: 'Al-Falah Bookstore', category: 'Bookshop' as CustomerCategory, contactPerson: 'Imran Sheikh', phone: '0300-2145678', email: 'alfalah@mail.com', address: 'Urdu Bazar, Karachi', city: 'Karachi', ntn: '1234567-8', openingBalance: 120000, creditLimit: 400000, status: 'Active' as ActiveStatus },
  { id: 'C002', code: 'CUS-002', name: 'Education Point', category: 'Bookshop' as CustomerCategory, contactPerson: 'Naveed Khan', phone: '0321-8765432', email: 'edupoint@mail.com', address: 'Saddar, Karachi', city: 'Karachi', ntn: '2345678-9', openingBalance: 80000, creditLimit: 300000, status: 'Active' as ActiveStatus },
  { id: 'C003', code: 'CUS-003', name: 'Knowledge Hub', category: 'Dealer' as CustomerCategory, contactPerson: 'Adeel Raza', phone: '0333-1122334', email: 'khub@mail.com', address: 'Anarkali, Lahore', city: 'Lahore', ntn: '3456789-0', openingBalance: 0, creditLimit: 500000, status: 'Active' as ActiveStatus },
  { id: 'C004', code: 'CUS-004', name: 'City Books', category: 'Bookshop' as CustomerCategory, contactPerson: 'Tariq Mehmood', phone: '0345-6677889', email: 'citybooks@mail.com', address: 'Liaquat Road, Rawalpindi', city: 'Rawalpindi', ntn: '', openingBalance: 45000, creditLimit: 200000, status: 'Active' as ActiveStatus },
  { id: 'C005', code: 'CUS-005', name: 'Learning Corner', category: 'Bookshop' as CustomerCategory, contactPerson: 'Sadia Noor', phone: '0302-9988776', email: 'lcorner@mail.com', address: 'Hyderabad Cantt', city: 'Hyderabad', ntn: '', openingBalance: 0, creditLimit: 150000, status: 'Active' as ActiveStatus },
  { id: 'C006', code: 'CUS-006', name: 'ABC School System', category: 'School' as CustomerCategory, contactPerson: 'Principal Ayesha', phone: '021-34567890', email: 'accounts@abcschool.edu.pk', address: 'Gulshan-e-Iqbal, Karachi', city: 'Karachi', ntn: '4567890-1', openingBalance: 60000, creditLimit: 250000, status: 'Active' as ActiveStatus },
  { id: 'C007', code: 'CUS-007', name: 'Beaconhouse Branch Clifton', category: 'School' as CustomerCategory, contactPerson: 'Admin Office', phone: '021-35871234', email: 'clifton@school.edu.pk', address: 'Clifton Block 5, Karachi', city: 'Karachi', ntn: '5678901-2', openingBalance: 0, creditLimit: 350000, status: 'Active' as ActiveStatus },
  { id: 'C008', code: 'CUS-008', name: 'National Book Distributors', category: 'Distributor' as CustomerCategory, contactPerson: 'Zahid Butt', phone: '042-37654321', email: 'nbd@mail.com', address: 'McLeod Road, Lahore', city: 'Lahore', ntn: '6789012-3', openingBalance: 250000, creditLimit: 1000000, status: 'Active' as ActiveStatus },
  { id: 'C009', code: 'CUS-009', name: 'Sindh Education Foundation', category: 'Institution' as CustomerCategory, contactPerson: 'Procurement Cell', phone: '021-99201234', email: 'proc@sef.org.pk', address: 'Karachi', city: 'Karachi', ntn: '7890123-4', openingBalance: 0, creditLimit: 800000, status: 'Active' as ActiveStatus },
  { id: 'C010', code: 'CUS-010', name: 'Iqra Book Centre', category: 'Dealer' as CustomerCategory, contactPerson: 'Waseem Akram', phone: '0312-5544332', email: 'iqra@mail.com', address: 'Quetta', city: 'Quetta', ntn: '', openingBalance: 30000, creditLimit: 150000, status: 'Active' as ActiveStatus },
  { id: 'C011', code: 'CUS-011', name: 'Bright Future Academy', category: 'School' as CustomerCategory, contactPerson: 'Mr. Salman', phone: '0334-7788990', email: 'bfa@mail.com', address: 'North Nazimabad, Karachi', city: 'Karachi', ntn: '', openingBalance: 0, creditLimit: 100000, status: 'Inactive' as ActiveStatus },
  { id: 'C012', code: 'CUS-012', name: 'Peshawar Book Mart', category: 'Dealer' as CustomerCategory, contactPerson: 'Gul Rehman', phone: '0315-1239876', email: 'pbm@mail.com', address: 'Qissa Khwani, Peshawar', city: 'Peshawar', ntn: '', openingBalance: 90000, creditLimit: 250000, status: 'Active' as ActiveStatus },
];

/* ----------------------------- SUPPLIERS --------------------------- */
export type SupplierCategory = 'Paper Supplier' | 'Card Supplier' | 'Printer' | 'Binder' | 'Plate Maker' | 'Laminator' | 'Transporter' | 'Designer' | 'Packaging Supplier' | 'Other';
export const suppliers = [
  { id: 'S001', code: 'SUP-001', name: 'To Paper House', category: 'Paper Supplier' as SupplierCategory, contactPerson: 'Rashid Mehmood', phone: '021-32412345', email: 'sales@paperhouse.pk', address: 'Jodia Bazar, Karachi', ntn: '1111111-1', openingBalance: 150000, creditDays: 30, status: 'Active' as ActiveStatus },
  { id: 'S002', code: 'SUP-002', name: 'Premier Card Board Mills', category: 'Card Supplier' as SupplierCategory, contactPerson: 'Anwar Ali', phone: '021-35031234', email: 'info@premiercard.pk', address: 'SITE Area, Karachi', ntn: '2222222-2', openingBalance: 0, creditDays: 45, status: 'Active' as ActiveStatus },
  { id: 'S003', code: 'SUP-003', name: 'Star Offset Printers', category: 'Printer' as SupplierCategory, contactPerson: 'Kamran Siddiqui', phone: '021-32765432', email: 'star@offset.pk', address: 'Lyari, Karachi', ntn: '3333333-3', openingBalance: 200000, creditDays: 30, status: 'Active' as ActiveStatus },
  { id: 'S004', code: 'SUP-004', name: 'Perfect Binding Works', category: 'Binder' as SupplierCategory, contactPerson: 'Younus Khan', phone: '0300-8765123', email: 'perfectbind@mail.com', address: 'Korangi, Karachi', ntn: '', openingBalance: 40000, creditDays: 15, status: 'Active' as ActiveStatus },
  { id: 'S005', code: 'SUP-005', name: 'Digital Plate Makers', category: 'Plate Maker' as SupplierCategory, contactPerson: 'Asif Jameel', phone: '0321-4455667', email: 'dpm@mail.com', address: 'Saddar, Karachi', ntn: '4444444-4', openingBalance: 0, creditDays: 7, status: 'Active' as ActiveStatus },
  { id: 'S006', code: 'SUP-006', name: 'Glossy Lamination', category: 'Laminator' as SupplierCategory, contactPerson: 'Tahir Hussain', phone: '0333-9988001', email: 'glossy@mail.com', address: 'Orangi Town, Karachi', ntn: '', openingBalance: 25000, creditDays: 15, status: 'Active' as ActiveStatus },
  { id: 'S007', code: 'SUP-007', name: 'Swift Cargo & Transport', category: 'Transporter' as SupplierCategory, contactPerson: 'Dispatch Desk', phone: '021-34998877', email: 'ops@swiftcargo.pk', address: 'Karachi', ntn: '5555555-5', openingBalance: 0, creditDays: 7, status: 'Active' as ActiveStatus },
  { id: 'S008', code: 'SUP-008', name: 'Creative Cover Designs', category: 'Designer' as SupplierCategory, contactPerson: 'Mahnoor', phone: '0345-1234500', email: 'mahnoor@design.pk', address: 'Karachi', ntn: '', openingBalance: 0, creditDays: 0, status: 'Active' as ActiveStatus },
];

/* ------------------------------- BOOKS ----------------------------- */
export type ProductCategory = 'Textbook' | 'Workbook' | 'Guide' | 'Stationery' | 'Other';
export const books = [
  { id: 'B001', code: 'ENG-G5-01', name: 'English Grammar', subject: 'English', class: 'Class 5', series: 'Smart Series', edition: '2025 (3rd)', category: 'Textbook' as ProductCategory, costPrice: 180, salePrice: 300, minStock: 300, openingStock: 2000, availableStock: 1480, damagedStock: 12, status: 'Active' as ActiveStatus },
  { id: 'B002', code: 'MTH-G6-01', name: 'Mathematics Today', subject: 'Mathematics', class: 'Class 6', series: 'Smart Series', edition: '2025 (2nd)', category: 'Textbook' as ProductCategory, costPrice: 170, salePrice: 300, minStock: 300, openingStock: 1800, availableStock: 1150, damagedStock: 8, status: 'Active' as ActiveStatus },
  { id: 'B003', code: 'SCI-G7-01', name: 'Science Explorer', subject: 'Science', class: 'Class 7', series: 'Explorer', edition: '2025 (1st)', category: 'Textbook' as ProductCategory, costPrice: 160, salePrice: 300, minStock: 250, openingStock: 1500, availableStock: 760, damagedStock: 5, status: 'Active' as ActiveStatus },
  { id: 'B004', code: 'SST-G8-01', name: 'Social Studies', subject: 'Social Studies', class: 'Class 8', series: 'Explorer', edition: '2024 (2nd)', category: 'Textbook' as ProductCategory, costPrice: 150, salePrice: 300, minStock: 250, openingStock: 1200, availableStock: 640, damagedStock: 3, status: 'Active' as ActiveStatus },
  { id: 'B005', code: 'URD-G4-01', name: 'Urdu Reader', subject: 'Urdu', class: 'Class 4', series: 'Nisab', edition: '2025 (4th)', category: 'Textbook' as ProductCategory, costPrice: 120, salePrice: 300, minStock: 200, openingStock: 1600, availableStock: 890, damagedStock: 0, status: 'Active' as ActiveStatus },
  { id: 'B006', code: 'ENG-G5-WB', name: 'English Grammar Workbook', subject: 'English', class: 'Class 5', series: 'Smart Series', edition: '2025 (1st)', category: 'Workbook' as ProductCategory, costPrice: 90, salePrice: 180, minStock: 200, openingStock: 1000, availableStock: 120, damagedStock: 2, status: 'Active' as ActiveStatus },
  { id: 'B007', code: 'MTH-G6-WB', name: 'Mathematics Today Workbook', subject: 'Mathematics', class: 'Class 6', series: 'Smart Series', edition: '2025 (1st)', category: 'Workbook' as ProductCategory, costPrice: 85, salePrice: 170, minStock: 200, openingStock: 1000, availableStock: 0, damagedStock: 0, status: 'Active' as ActiveStatus },
  { id: 'B008', code: 'ISL-G3-01', name: 'Islamiyat for Kids', subject: 'Islamiyat', class: 'Class 3', series: 'Nisab', edition: '2025 (2nd)', category: 'Textbook' as ProductCategory, costPrice: 100, salePrice: 220, minStock: 200, openingStock: 1200, availableStock: 560, damagedStock: 4, status: 'Active' as ActiveStatus },
  { id: 'B009', code: 'CMP-G6-01', name: 'Computer Science Basics', subject: 'Computer', class: 'Class 6', series: 'Explorer', edition: '2025 (1st)', category: 'Textbook' as ProductCategory, costPrice: 140, salePrice: 280, minStock: 150, openingStock: 800, availableStock: 95, damagedStock: 1, status: 'Active' as ActiveStatus },
  { id: 'B010', code: 'ENG-G8-GD', name: 'English Guide Class 8', subject: 'English', class: 'Class 8', series: 'Guide', edition: '2024 (5th)', category: 'Guide' as ProductCategory, costPrice: 110, salePrice: 250, minStock: 150, openingStock: 700, availableStock: 410, damagedStock: 6, status: 'Active' as ActiveStatus },
  { id: 'B011', code: 'BIO-G9-01', name: 'Biology Class 9', subject: 'Biology', class: 'Class 9', series: 'Matric', edition: '2025 (3rd)', category: 'Textbook' as ProductCategory, costPrice: 210, salePrice: 380, minStock: 200, openingStock: 900, availableStock: 0, damagedStock: 0, status: 'Active' as ActiveStatus },
  { id: 'B012', code: 'PHY-G9-01', name: 'Physics Class 9', subject: 'Physics', class: 'Class 9', series: 'Matric', edition: '2025 (3rd)', category: 'Textbook' as ProductCategory, costPrice: 220, salePrice: 400, minStock: 200, openingStock: 900, availableStock: 180, damagedStock: 2, status: 'Active' as ActiveStatus },
  { id: 'B013', code: 'ENG-G5-OLD', name: 'English Grammar (Old Edition)', subject: 'English', class: 'Class 5', series: 'Smart Series', edition: '2022 (1st)', category: 'Textbook' as ProductCategory, costPrice: 150, salePrice: 250, minStock: 0, openingStock: 300, availableStock: 140, damagedStock: 40, status: 'Inactive' as ActiveStatus },
  { id: 'B014', code: 'STN-NB-01', name: 'Turnkey Notebook 200pg', subject: 'General', class: 'All', series: 'Stationery', edition: '-', category: 'Stationery' as ProductCategory, costPrice: 60, salePrice: 110, minStock: 500, openingStock: 3000, availableStock: 2210, damagedStock: 0, status: 'Active' as ActiveStatus },
  { id: 'B015', code: 'GEO-G7-01', name: 'Geography Atlas', subject: 'Geography', class: 'Class 7', series: 'Explorer', edition: '2025 (2nd)', category: 'Other' as ProductCategory, costPrice: 190, salePrice: 350, minStock: 100, openingStock: 600, availableStock: 330, damagedStock: 1, status: 'Active' as ActiveStatus },
];

/* ---------------------------- SALES INVOICES ----------------------- */
export interface SalesInvoice extends AuditInfo {
  id: string; no: string; date: string; dueDate: string; customerId: string;
  items: LineItem[]; invoiceDiscount: number; taxPct: number;
  paidAmount: number; docStatus: DocStatus; payStatus: PayStatus; remarks?: string;
}
const A = (by: string, at: string, appr?: string): AuditInfo => ({ createdBy: by, createdAt: at, approvedBy: appr, approvedAt: appr ? at : undefined });

export const salesInvoices: SalesInvoice[] = [
  { id: 'SI01', no: 'INV-1024', date: '2025-09-12', dueDate: '2025-10-12', customerId: 'C001', items: [{ bookId: 'B001', qty: 50, rate: 300, discountPct: 10 }, { bookId: 'B005', qty: 40, rate: 300, discountPct: 10 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 24500, docStatus: 'Approved', payStatus: 'Partially Paid', ...A('Hamza Ali', '2025-09-12T10:15', 'Faisal Qureshi') },
  { id: 'SI02', no: 'INV-1023', date: '2025-09-12', dueDate: '2025-10-12', customerId: 'C006', items: [{ bookId: 'B002', qty: 120, rate: 300, discountPct: 15 }, { bookId: 'B007', qty: 60, rate: 170, discountPct: 15 }], invoiceDiscount: 500, taxPct: 0, paidAmount: 0, docStatus: 'Approved', payStatus: 'Unpaid', ...A('Hamza Ali', '2025-09-12T09:40', 'Faisal Qureshi') },
  { id: 'SI03', no: 'INV-1022', date: '2025-09-10', dueDate: '2025-10-10', customerId: 'C008', items: [{ bookId: 'B003', qty: 300, rate: 300, discountPct: 20 }, { bookId: 'B004', qty: 200, rate: 300, discountPct: 20 }, { bookId: 'B009', qty: 100, rate: 280, discountPct: 20 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 100000, docStatus: 'Approved', payStatus: 'Partially Paid', ...A('Hamza Ali', '2025-09-10T14:00', 'Admin') },
  { id: 'SI04', no: 'INV-1021', date: '2025-09-05', dueDate: '2025-10-05', customerId: 'C002', items: [{ bookId: 'B001', qty: 80, rate: 300, discountPct: 10 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 21600, docStatus: 'Approved', payStatus: 'Paid', ...A('Hamza Ali', '2025-09-05T11:00', 'Faisal Qureshi') },
  { id: 'SI05', no: 'INV-1020', date: '2025-08-28', dueDate: '2025-09-10', customerId: 'C003', items: [{ bookId: 'B011', qty: 150, rate: 380, discountPct: 12 }, { bookId: 'B012', qty: 150, rate: 400, discountPct: 12 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 0, docStatus: 'Approved', payStatus: 'Overdue', ...A('Hamza Ali', '2025-08-28T12:30', 'Admin') },
  { id: 'SI06', no: 'INV-1019', date: '2025-08-20', dueDate: '2025-09-19', customerId: 'C007', items: [{ bookId: 'B002', qty: 200, rate: 300, discountPct: 15 }, { bookId: 'B010', qty: 100, rate: 250, discountPct: 15 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 70000, docStatus: 'Approved', payStatus: 'Partially Paid', ...A('Hamza Ali', '2025-08-20T16:20', 'Faisal Qureshi') },
  { id: 'SI07', no: 'INV-1018', date: '2025-08-14', dueDate: '2025-09-13', customerId: 'C004', items: [{ bookId: 'B005', qty: 60, rate: 300, discountPct: 10 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 16200, docStatus: 'Approved', payStatus: 'Paid', ...A('Hamza Ali', '2025-08-14T10:10', 'Faisal Qureshi') },
  { id: 'SI08', no: 'INV-1017', date: '2025-08-02', dueDate: '2025-09-01', customerId: 'C009', items: [{ bookId: 'B001', qty: 400, rate: 300, discountPct: 18 }, { bookId: 'B003', qty: 400, rate: 300, discountPct: 18 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 150000, docStatus: 'Approved', payStatus: 'Overdue', ...A('Hamza Ali', '2025-08-02T09:00', 'Admin') },
  { id: 'SI09', no: 'INV-1016', date: '2025-07-22', dueDate: '2025-08-21', customerId: 'C012', items: [{ bookId: 'B008', qty: 100, rate: 220, discountPct: 10 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 0, docStatus: 'Cancelled', payStatus: 'Cancelled', ...A('Hamza Ali', '2025-07-22T13:00', 'Faisal Qureshi'), cancelledBy: 'Admin', cancelledAt: '2025-07-23T09:30', cancelReason: 'Customer cancelled the order' },
  { id: 'SI10', no: 'INV-1025', date: '2025-09-12', dueDate: '2025-10-12', customerId: 'C005', items: [{ bookId: 'B014', qty: 200, rate: 110, discountPct: 5 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 0, docStatus: 'Pending', payStatus: 'Unpaid', createdBy: 'Hamza Ali', createdAt: '2025-09-12T11:30' },
  { id: 'SI11', no: 'INV-1026', date: '2025-09-12', dueDate: '2025-10-12', customerId: 'C010', items: [{ bookId: 'B015', qty: 30, rate: 350, discountPct: 0 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 0, docStatus: 'Draft', payStatus: 'Unpaid', createdBy: 'Hamza Ali', createdAt: '2025-09-12T11:45' },
];

/** Helper: total of an invoice (works for sales and purchase documents) */
export const docTotal = (d: { items: LineItem[]; invoiceDiscount?: number; taxPct?: number }) => {
  const sub = d.items.reduce((s, i) => s + i.qty * i.rate * (1 - i.discountPct / 100), 0);
  return Math.round((sub - (d.invoiceDiscount ?? 0)) * (1 + (d.taxPct ?? 0) / 100));
};

/* ----------------------------- SALES ORDERS ------------------------ */
export const salesOrders = [
  { id: 'SO01', no: 'SO-501', date: '2025-09-11', customerId: 'C001', items: [{ bookId: 'B001', qty: 250, rate: 300, discountPct: 10, delivered: 0 }], status: 'Pending' as DeliveryStatus, createdBy: 'Hamza Ali' },
  { id: 'SO02', no: 'SO-500', date: '2025-09-09', customerId: 'C002', items: [{ bookId: 'B002', qty: 180, rate: 300, discountPct: 10, delivered: 100 }], status: 'Partial' as DeliveryStatus, createdBy: 'Hamza Ali' },
  { id: 'SO03', no: 'SO-499', date: '2025-09-08', customerId: 'C003', items: [{ bookId: 'B011', qty: 300, rate: 380, discountPct: 12, delivered: 0 }, { bookId: 'B012', qty: 300, rate: 400, discountPct: 12, delivered: 0 }], status: 'Pending' as DeliveryStatus, createdBy: 'Hamza Ali' },
  { id: 'SO04', no: 'SO-498', date: '2025-09-06', customerId: 'C004', items: [{ bookId: 'B005', qty: 120, rate: 300, discountPct: 10, delivered: 60 }], status: 'Partial' as DeliveryStatus, createdBy: 'Hamza Ali' },
  { id: 'SO05', no: 'SO-497', date: '2025-09-03', customerId: 'C005', items: [{ bookId: 'B009', qty: 200, rate: 280, discountPct: 10, delivered: 0 }], status: 'Pending' as DeliveryStatus, createdBy: 'Hamza Ali' },
  { id: 'SO06', no: 'SO-490', date: '2025-08-25', customerId: 'C006', items: [{ bookId: 'B002', qty: 100, rate: 300, discountPct: 15, delivered: 100 }], status: 'Delivered' as DeliveryStatus, createdBy: 'Hamza Ali' },
];

/* ---------------------------- SALES RETURNS ------------------------ */
export const salesReturns = [
  { id: 'SR01', no: 'SR-031', date: '2025-09-08', customerId: 'C001', invoiceNo: 'INV-1015', items: [{ bookId: 'B001', qty: 10, rate: 270 }], reason: 'Misprint pages', docStatus: 'Approved' as DocStatus, createdBy: 'Hamza Ali', approvedBy: 'Faisal Qureshi' },
  { id: 'SR02', no: 'SR-032', date: '2025-09-11', customerId: 'C006', invoiceNo: 'INV-1023', items: [{ bookId: 'B007', qty: 5, rate: 144.5 }], reason: 'Wrong class ordered', docStatus: 'Pending' as DocStatus, createdBy: 'Hamza Ali' },
];

/* ---------------------------- CUSTOMER RECEIPTS -------------------- */
export const customerReceipts = [
  { id: 'RV01', no: 'RV-2087', date: '2025-09-12', customerId: 'C001', amount: 24500, method: 'Cash' as PayMethod, bankId: null, ref: 'INV-1024', docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi' },
  { id: 'RV02', no: 'RV-2086', date: '2025-09-12', customerId: 'C006', amount: 35000, method: 'Bank' as PayMethod, bankId: 'BK01', ref: 'On account', docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi' },
  { id: 'RV03', no: 'RV-2085', date: '2025-09-10', customerId: 'C008', amount: 100000, method: 'Cheque' as PayMethod, bankId: 'BK02', ref: 'INV-1022 / Chq 889102', docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi' },
  { id: 'RV04', no: 'RV-2084', date: '2025-09-05', customerId: 'C002', amount: 21600, method: 'Bank' as PayMethod, bankId: 'BK01', ref: 'INV-1021', docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi' },
  { id: 'RV05', no: 'RV-2088', date: '2025-09-12', customerId: 'C003', amount: 50000, method: 'Cheque' as PayMethod, bankId: 'BK01', ref: 'Chq 450011', docStatus: 'Pending' as DocStatus, createdBy: 'Faisal Qureshi' },
];

/* ------------------------------ PURCHASES -------------------------- */
export interface PurchaseInvoice extends AuditInfo {
  id: string; no: string; supplierRef: string; date: string; dueDate: string; supplierId: string;
  items: LineItem[]; invoiceDiscount: number; taxPct: number; paidAmount: number;
  docStatus: DocStatus; payStatus: PayStatus; kind: 'Books' | 'Material' | 'Service';
}
export const purchaseInvoices: PurchaseInvoice[] = [
  { id: 'PI01', no: 'PINV-2087', supplierRef: 'GRN #P-2087', date: '2025-09-12', dueDate: '2025-10-12', supplierId: 'S001', items: [{ bookId: 'MAT-PAPER-80', qty: 100, rate: 182, discountPct: 0 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 18200, docStatus: 'Approved', payStatus: 'Partially Paid', kind: 'Material', ...A('Rizwan Ahmed', '2025-09-12T09:10', 'Faisal Qureshi') },
  { id: 'PI02', no: 'PINV-2086', supplierRef: 'STAR-8841', date: '2025-09-10', dueDate: '2025-10-10', supplierId: 'S003', items: [{ bookId: 'B001', qty: 1000, rate: 180, discountPct: 0 }, { bookId: 'B006', qty: 1000, rate: 90, discountPct: 0 }], invoiceDiscount: 5000, taxPct: 0, paidAmount: 100000, docStatus: 'Approved', payStatus: 'Partially Paid', kind: 'Books', ...A('Rizwan Ahmed', '2025-09-10T15:00', 'Admin') },
  { id: 'PI03', no: 'PINV-2085', supplierRef: 'PCB-1120', date: '2025-09-02', dueDate: '2025-10-17', supplierId: 'S002', items: [{ bookId: 'MAT-CARD-300', qty: 500, rate: 95, discountPct: 0 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 0, docStatus: 'Approved', payStatus: 'Unpaid', kind: 'Material', ...A('Rizwan Ahmed', '2025-09-02T10:00', 'Faisal Qureshi') },
  { id: 'PI04', no: 'PINV-2084', supplierRef: 'PBW-77', date: '2025-08-18', dueDate: '2025-09-02', supplierId: 'S004', items: [{ bookId: 'SRV-BIND', qty: 2000, rate: 14, discountPct: 0 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 0, docStatus: 'Approved', payStatus: 'Overdue', kind: 'Service', ...A('Rizwan Ahmed', '2025-08-18T12:00', 'Faisal Qureshi') },
  { id: 'PI05', no: 'PINV-2083', supplierRef: 'SCT-310', date: '2025-08-10', dueDate: '2025-08-17', supplierId: 'S007', items: [{ bookId: 'SRV-FREIGHT', qty: 1, rate: 45000, discountPct: 0 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 45000, docStatus: 'Approved', payStatus: 'Paid', kind: 'Service', ...A('Rizwan Ahmed', '2025-08-10T17:00', 'Admin') },
  { id: 'PI06', no: 'PINV-2088', supplierRef: 'STAR-8860', date: '2025-09-12', dueDate: '2025-10-12', supplierId: 'S003', items: [{ bookId: 'B011', qty: 800, rate: 210, discountPct: 0 }], invoiceDiscount: 0, taxPct: 0, paidAmount: 0, docStatus: 'Pending', payStatus: 'Unpaid', kind: 'Books', createdBy: 'Rizwan Ahmed', createdAt: '2025-09-12T12:00' },
];
export const purchaseReturns = [
  { id: 'PR01', no: 'PR-011', date: '2025-09-04', supplierId: 'S003', refInvoice: 'PINV-2080', items: [{ bookId: 'B003', qty: 25, rate: 160 }], reason: 'Binding defect', docStatus: 'Approved' as DocStatus, createdBy: 'Rizwan Ahmed' },
];
export const supplierPayments = [
  { id: 'PV01', no: 'PV-1312', date: '2025-09-12', supplierId: 'S001', amount: 18200, method: 'Cash' as PayMethod, bankId: null, ref: 'PINV-2087', docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi' },
  { id: 'PV02', no: 'PV-1311', date: '2025-09-12', supplierId: 'S001', amount: 12000, method: 'Bank' as PayMethod, bankId: 'BK01', ref: 'To Paper House', docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi' },
  { id: 'PV03', no: 'PV-1310', date: '2025-09-10', supplierId: 'S003', amount: 100000, method: 'Cheque' as PayMethod, bankId: 'BK02', ref: 'PINV-2086 / Chq 330021', docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi' },
];

/* ------------------------------- SAMPLES --------------------------- */
export type SampleStatus = 'Issued' | 'Partially Returned' | 'Returned' | 'Outstanding';
export const samples = [
  { id: 'SM01', slipNo: 'SMP-0201', date: '2025-09-11', issuedTo: 'Mr. Salman (Principal)', customerId: 'C011', issuedBy: 'Hamza Ali', purpose: 'Evaluation for 2026 syllabus', items: [{ bookId: 'B002', qty: 2, returned: 0 }, { bookId: 'B003', qty: 2, returned: 0 }], status: 'Outstanding' as SampleStatus, expectedReturn: '2025-09-30' },
  { id: 'SM02', slipNo: 'SMP-0200', date: '2025-09-08', issuedTo: 'Ms. Ayesha', customerId: 'C006', issuedBy: 'Hamza Ali', purpose: 'Teacher review copy', items: [{ bookId: 'B001', qty: 3, returned: 3 }], status: 'Returned' as SampleStatus, expectedReturn: '2025-09-20' },
  { id: 'SM03', slipNo: 'SMP-0199', date: '2025-09-02', issuedTo: 'Mr. Adeel Raza', customerId: 'C003', issuedBy: 'Hamza Ali', purpose: 'Dealer promotion', items: [{ bookId: 'B011', qty: 5, returned: 2 }, { bookId: 'B012', qty: 5, returned: 2 }], status: 'Partially Returned' as SampleStatus, expectedReturn: '2025-09-15' },
  { id: 'SM04', slipNo: 'SMP-0198', date: '2025-08-26', issuedTo: 'Sir Kamran', customerId: 'C007', issuedBy: 'Hamza Ali', purpose: 'Selection committee', items: [{ bookId: 'B009', qty: 4, returned: 0 }], status: 'Outstanding' as SampleStatus, expectedReturn: '2025-09-05' },
  { id: 'SM05', slipNo: 'SMP-0197', date: '2025-08-20', issuedTo: 'Ms. Sadia', customerId: 'C005', issuedBy: 'Hamza Ali', purpose: 'Shop display', items: [{ bookId: 'B014', qty: 2, returned: 0 }], status: 'Issued' as SampleStatus, expectedReturn: '2025-10-20' },
];

/* ---------------------------- STOCK MOVEMENTS ---------------------- */
export const stockMovements = [
  { id: 'M01', date: '2025-07-01', bookId: 'B001', type: 'Opening', ref: 'OPENING', qtyIn: 2000, qtyOut: 0 },
  { id: 'M02', date: '2025-08-02', bookId: 'B001', type: 'Sale', ref: 'INV-1017', qtyIn: 0, qtyOut: 400 },
  { id: 'M03', date: '2025-09-05', bookId: 'B001', type: 'Sale', ref: 'INV-1021', qtyIn: 0, qtyOut: 80 },
  { id: 'M04', date: '2025-09-08', bookId: 'B001', type: 'Sales Return', ref: 'SR-031', qtyIn: 10, qtyOut: 0 },
  { id: 'M05', date: '2025-09-08', bookId: 'B001', type: 'Sample Issue', ref: 'SMP-0200', qtyIn: 0, qtyOut: 3 },
  { id: 'M06', date: '2025-09-12', bookId: 'B001', type: 'Sample Return', ref: 'SMP-0200', qtyIn: 3, qtyOut: 0 },
  { id: 'M07', date: '2025-09-12', bookId: 'B001', type: 'Sale', ref: 'INV-1024', qtyIn: 0, qtyOut: 50 },
  { id: 'M08', date: '2025-09-10', bookId: 'B001', type: 'Purchase', ref: 'PINV-2086', qtyIn: 1000, qtyOut: 0 },
  { id: 'M09', date: '2025-09-09', bookId: 'B013', type: 'Damaged Write-off', ref: 'ADJ-007', qtyIn: 0, qtyOut: 40 },
];
export const stockAdjustments = [
  { id: 'ADJ01', no: 'ADJ-007', date: '2025-09-09', bookId: 'B013', qty: -40, reason: 'Water damage in godown', reference: 'Inspection note 09/09', docStatus: 'Approved' as DocStatus, createdBy: 'Rizwan Ahmed', approvedBy: 'Admin' },
  { id: 'ADJ02', no: 'ADJ-008', date: '2025-09-11', bookId: 'B006', qty: 15, reason: 'Count difference found in physical audit', reference: 'Audit sheet #4', docStatus: 'Pending' as DocStatus, createdBy: 'Rizwan Ahmed' },
];

/* ------------------------------ EXPENSES --------------------------- */
export const expenseHeads = ['Salaries', 'Rent', 'Utilities', 'Transportation', 'Printing', 'Stationery', 'Marketing', 'Bank Charges', 'Maintenance', 'Office Supplies', 'Misc'];
export const expenses = [
  { id: 'E01', no: 'EV-4410', date: '2025-09-12', head: 'Office Supplies', description: 'Office supplies purchase', amount: 3450, method: 'Cash' as PayMethod, bankId: null, docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi' },
  { id: 'E02', no: 'EV-4409', date: '2025-09-12', head: 'Transportation', description: 'Delivery van fuel', amount: 15000, method: 'Cash' as PayMethod, bankId: null, docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi' },
  { id: 'E03', no: 'EV-4408', date: '2025-09-10', head: 'Utilities', description: 'K-Electric bill - August', amount: 48200, method: 'Bank' as PayMethod, bankId: 'BK01', docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi' },
  { id: 'E04', no: 'EV-4407', date: '2025-09-05', head: 'Rent', description: 'Warehouse rent - September', amount: 120000, method: 'Bank' as PayMethod, bankId: 'BK01', docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi' },
  { id: 'E05', no: 'EV-4406', date: '2025-09-03', head: 'Marketing', description: 'Teacher meet banners', amount: 28000, method: 'Cash' as PayMethod, bankId: null, docStatus: 'Approved' as DocStatus, createdBy: 'Hamza Ali' },
  { id: 'E06', no: 'EV-4405', date: '2025-09-01', head: 'Bank Charges', description: 'Monthly bank charges', amount: 2150, method: 'Bank' as PayMethod, bankId: 'BK02', docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi' },
  { id: 'E07', no: 'EV-4411', date: '2025-09-12', head: 'Maintenance', description: 'AC repair - office', amount: 9500, method: 'Cash' as PayMethod, bankId: null, docStatus: 'Pending' as DocStatus, createdBy: 'Faisal Qureshi' },
];

/* --------------------------- BANKS & ACCOUNTS ---------------------- */
export const bankAccounts = [
  { id: 'BK01', name: 'Meezan Bank - Current', accountNo: '0101-0123456', branch: 'Clifton Branch', opening: 800000, current: 745000, status: 'Active' as ActiveStatus },
  { id: 'BK02', name: 'HBL - Current', accountNo: '1234-7890123', branch: 'Saddar Branch', opening: 500000, current: 505000, status: 'Active' as ActiveStatus },
  { id: 'BK03', name: 'Bank Alfalah - Old Account', accountNo: '5566-0011223', branch: 'Defence Branch', opening: 0, current: 0, status: 'Inactive' as ActiveStatus },
];
// Dashboard: Cash Rs 340,500 | Bank (active) Rs 1,250,000

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
export const chartOfAccounts = [
  { code: '1000', name: 'Cash in Hand', type: 'Asset' as AccountType, parent: null, opening: 250000 },
  { code: '1010', name: 'Meezan Bank - Current', type: 'Asset' as AccountType, parent: null, opening: 800000 },
  { code: '1011', name: 'HBL - Current', type: 'Asset' as AccountType, parent: null, opening: 500000 },
  { code: '1100', name: 'Accounts Receivable (Customers)', type: 'Asset' as AccountType, parent: null, opening: 675000 },
  { code: '1200', name: 'Inventory - Finished Books', type: 'Asset' as AccountType, parent: null, opening: 4200000 },
  { code: '1210', name: 'Inventory - Raw Material', type: 'Asset' as AccountType, parent: null, opening: 350000 },
  { code: '1300', name: 'Staff Advances & Loans', type: 'Asset' as AccountType, parent: null, opening: 90000 },
  { code: '2000', name: 'Accounts Payable (Suppliers)', type: 'Liability' as AccountType, parent: null, opening: 415000 },
  { code: '2100', name: 'Salaries Payable', type: 'Liability' as AccountType, parent: null, opening: 0 },
  { code: '2200', name: 'Bank Borrowings', type: 'Liability' as AccountType, parent: null, opening: 1500000 },
  { code: '3000', name: "Owner's Capital", type: 'Equity' as AccountType, parent: null, opening: 4000000 },
  { code: '3100', name: 'Retained Earnings', type: 'Equity' as AccountType, parent: null, opening: 350000 },
  { code: '4000', name: 'Sales Revenue', type: 'Income' as AccountType, parent: null, opening: 0 },
  { code: '4100', name: 'Sales Returns & Discounts', type: 'Income' as AccountType, parent: null, opening: 0 },
  { code: '5000', name: 'Purchases / Cost of Sales', type: 'Expense' as AccountType, parent: null, opening: 0 },
  { code: '6000', name: 'Salaries Expense', type: 'Expense' as AccountType, parent: null, opening: 0 },
  { code: '6100', name: 'Rent Expense', type: 'Expense' as AccountType, parent: null, opening: 0 },
  { code: '6200', name: 'Utilities Expense', type: 'Expense' as AccountType, parent: null, opening: 0 },
  { code: '6300', name: 'Transportation Expense', type: 'Expense' as AccountType, parent: null, opening: 0 },
  { code: '6400', name: 'Marketing Expense', type: 'Expense' as AccountType, parent: null, opening: 0 },
  { code: '6500', name: 'Bank Charges', type: 'Expense' as AccountType, parent: null, opening: 0 },
];

export const journalVouchers = [
  { id: 'JV01', no: 'JV-087', date: '2025-09-01', narration: 'Depreciation of office equipment - Aug', lines: [{ account: '6600 Depreciation', dr: 8500, cr: 0 }, { account: '1400 Accumulated Depreciation', dr: 0, cr: 8500 }], docStatus: 'Approved' as DocStatus, createdBy: 'Faisal Qureshi', approvedBy: 'Admin' },
  { id: 'JV02', no: 'JV-088', date: '2025-09-11', narration: 'Correction: expense booked to wrong head', lines: [{ account: '6200 Utilities Expense', dr: 5000, cr: 0 }, { account: '6100 Rent Expense', dr: 0, cr: 5000 }], docStatus: 'Pending' as DocStatus, createdBy: 'Faisal Qureshi' },
];

/* --------------------------- DASHBOARD SERIES ---------------------- */
export const dashboardKpis = {
  todaySales: 125600, todaySalesTrend: 12,
  monthlySales: 3450000, monthlySalesTrend: 8,
  yearlySales: 28750000, yearlySalesTrend: 15,
  todayPurchases: 78200, todayPurchasesTrend: -5,
  monthlyPurchases: 2180000, monthlyPurchasesTrend: 6,
  todayExpenses: 18450, todayExpensesTrend: 3,
  monthlyExpenses: 520000, monthlyExpensesTrend: -7,
  grossProfit: 72350, netProfit: 60200, netProfitTrend: 10,
  cashBalance: 340500, bankBalance: 1250000,
  receivables: 1480000, receivablesOverdue: 320000,
  payables: 960000, payablesOverdue: 210000,
  stockUnits: 12560, stockValue: 4850000,
  lowStockItems: 18, outOfStockItems: 7, outstandingSamples: 12,
};
// NOTE: when you build real computations, derive these from the arrays above. These are for the first screenshot-matching render.

export const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
export const salesTrend = [110000, 150000, 205000, 182000, 235000, 258000, 295000, 275000, 340000, 375000].slice(0, 9).map((v, i) => ({ month: months[i], value: v }));
export const purchasesVsExpenses = [
  { month: 'Jan', purchases: 155000, expenses: 85000 }, { month: 'Feb', purchases: 250000, expenses: 135000 },
  { month: 'Mar', purchases: 305000, expenses: 170000 }, { month: 'Apr', purchases: 265000, expenses: 170000 },
  { month: 'May', purchases: 265000, expenses: 145000 }, { month: 'Jun', purchases: 345000, expenses: 155000 },
  { month: 'Jul', purchases: 285000, expenses: 140000 }, { month: 'Aug', purchases: 305000, expenses: 150000 },
  { month: 'Sep', purchases: 265000, expenses: 150000 },
];
export const profitTrend = [130000, 155000, 205000, 168000, 250000, 265000, 295000, 275000, 330000].map((v, i) => ({ month: months[i], value: v }));
export const stockValueByCategory = [
  { name: 'Textbooks', value: 3200000 }, { name: 'Workbooks', value: 520000 }, { name: 'Guides', value: 310000 },
  { name: 'Stationery', value: 450000 }, { name: 'Other', value: 370000 },
];

/* ------------------------------- STAFF ----------------------------- */
export const staff = [
  { id: 'ST01', empId: 'EMP-001', name: 'Zubair Ahmed', designation: 'Managing Director', department: 'Management', type: 'Management', phone: '0300-1112223', joiningDate: '2015-01-01', status: 'Active', basic: 250000, allowances: 50000, deductions: 0, cnic: '42101-1234567-1' },
  { id: 'ST02', empId: 'EMP-002', name: 'Faisal Qureshi', designation: 'Senior Accountant', department: 'Accounts', type: 'Employee', phone: '0321-2223334', joiningDate: '2019-03-15', status: 'Active', basic: 90000, allowances: 15000, deductions: 3000, cnic: '42201-2345678-3' },
  { id: 'ST03', empId: 'EMP-003', name: 'Hamza Ali', designation: 'Sales Manager', department: 'Sales', type: 'Employee', phone: '0333-3334445', joiningDate: '2020-06-01', status: 'Active', basic: 80000, allowances: 20000, deductions: 2500, cnic: '42301-3456789-5' },
  { id: 'ST04', empId: 'EMP-004', name: 'Rizwan Ahmed', designation: 'Store Keeper', department: 'Warehouse', type: 'Employee', phone: '0345-4445556', joiningDate: '2021-02-10', status: 'Active', basic: 55000, allowances: 8000, deductions: 1500, cnic: '42401-4567890-7' },
  { id: 'ST05', empId: 'EMP-005', name: 'Sana Malik', designation: 'HR Officer', department: 'HR', type: 'Employee', phone: '0302-5556667', joiningDate: '2022-08-22', status: 'Active', basic: 65000, allowances: 10000, deductions: 2000, cnic: '42501-5678901-9' },
  { id: 'ST06', empId: 'EMP-006', name: 'Bilal Hussain', designation: 'Delivery Driver', department: 'Logistics', type: 'Employee', phone: '0312-6667778', joiningDate: '2023-01-05', status: 'Active', basic: 38000, allowances: 4000, deductions: 0, cnic: '42601-6789012-1' },
  { id: 'ST07', empId: 'EMP-007', name: 'Nida Farooq', designation: 'Marketing Executive', department: 'Marketing', type: 'Employee', phone: '0334-7778889', joiningDate: '2023-09-18', status: 'Resigned', basic: 60000, allowances: 8000, deductions: 0, cnic: '42701-7890123-3' },
  { id: 'ST08', empId: 'EMP-008', name: 'Imtiaz Baig', designation: 'Packer', department: 'Warehouse', type: 'Employee', phone: '0315-8889990', joiningDate: '2024-04-01', status: 'Terminated', basic: 32000, allowances: 2000, deductions: 0, cnic: '42801-8901234-5' },
];

export const attendance = [ // Sep 2025 (sample days) – P/A/L(ate)/LV
  { staffId: 'ST02', date: '2025-09-10', status: 'Present' }, { staffId: 'ST02', date: '2025-09-11', status: 'Present' }, { staffId: 'ST02', date: '2025-09-12', status: 'Present' },
  { staffId: 'ST03', date: '2025-09-10', status: 'Late' }, { staffId: 'ST03', date: '2025-09-11', status: 'Present' }, { staffId: 'ST03', date: '2025-09-12', status: 'Present' },
  { staffId: 'ST04', date: '2025-09-10', status: 'Present' }, { staffId: 'ST04', date: '2025-09-11', status: 'Absent' }, { staffId: 'ST04', date: '2025-09-12', status: 'Present' },
  { staffId: 'ST05', date: '2025-09-10', status: 'Leave' }, { staffId: 'ST05', date: '2025-09-11', status: 'Leave' }, { staffId: 'ST05', date: '2025-09-12', status: 'Present' },
  { staffId: 'ST06', date: '2025-09-10', status: 'Present' }, { staffId: 'ST06', date: '2025-09-11', status: 'Present' }, { staffId: 'ST06', date: '2025-09-12', status: 'Late' },
];
export const leaveApplications = [
  { id: 'LV01', staffId: 'ST05', type: 'Sick Leave', from: '2025-09-10', to: '2025-09-11', days: 2, reason: 'Fever', status: 'Approved', approvedBy: 'Admin' },
  { id: 'LV02', staffId: 'ST03', type: 'Casual Leave', from: '2025-09-20', to: '2025-09-20', days: 1, reason: 'Family function', status: 'Pending', approvedBy: null },
  { id: 'LV03', staffId: 'ST06', type: 'Annual Leave', from: '2025-10-05', to: '2025-10-12', days: 8, reason: 'Hometown visit', status: 'Pending', approvedBy: null },
];
export const payroll = [ // August 2025 run
  { id: 'PAY01', month: '2025-08', staffId: 'ST01', basic: 250000, allowances: 50000, deductions: 0, advanceRecovery: 0, net: 300000, voucherNo: 'SV-0808', status: 'Paid' },
  { id: 'PAY02', month: '2025-08', staffId: 'ST02', basic: 90000, allowances: 15000, deductions: 3000, advanceRecovery: 5000, net: 97000, voucherNo: 'SV-0809', status: 'Paid' },
  { id: 'PAY03', month: '2025-08', staffId: 'ST03', basic: 80000, allowances: 20000, deductions: 2500, advanceRecovery: 0, net: 97500, voucherNo: 'SV-0810', status: 'Paid' },
  { id: 'PAY04', month: '2025-08', staffId: 'ST04', basic: 55000, allowances: 8000, deductions: 1500, advanceRecovery: 3000, net: 58500, voucherNo: 'SV-0811', status: 'Paid' },
  { id: 'PAY05', month: '2025-08', staffId: 'ST05', basic: 65000, allowances: 10000, deductions: 2000, advanceRecovery: 0, net: 73000, voucherNo: 'SV-0812', status: 'Paid' },
  { id: 'PAY06', month: '2025-08', staffId: 'ST06', basic: 38000, allowances: 4000, deductions: 0, advanceRecovery: 0, net: 42000, voucherNo: 'SV-0813', status: 'Paid' },
];
export const staffLoans = [
  { id: 'LN01', staffId: 'ST02', type: 'Advance', amount: 25000, date: '2025-07-05', installments: 5, installmentAmount: 5000, recovered: 10000, outstanding: 15000 },
  { id: 'LN02', staffId: 'ST04', type: 'Loan', amount: 60000, date: '2025-05-01', installments: 20, installmentAmount: 3000, recovered: 12000, outstanding: 48000 },
];
export const staffDocuments = [
  { id: 'D01', staffId: 'ST02', type: 'Appointment Letter', fileName: 'faisal_appointment.pdf', uploadedAt: '2019-03-15' },
  { id: 'D02', staffId: 'ST02', type: 'CNIC Copy', fileName: 'faisal_cnic.jpg', uploadedAt: '2019-03-15' },
  { id: 'D03', staffId: 'ST03', type: 'Contract', fileName: 'hamza_contract.pdf', uploadedAt: '2020-06-01' },
];

/* ---------------------------- AUDIT LOG ---------------------------- */
export const auditLog = [
  { id: 'AL01', at: '2025-09-12T11:45', user: 'Hamza Ali', action: 'Created', entity: 'Sales Invoice', ref: 'INV-1026', details: 'Draft created' },
  { id: 'AL02', at: '2025-09-12T10:20', user: 'Faisal Qureshi', action: 'Approved', entity: 'Sales Invoice', ref: 'INV-1024', details: 'Posted to ledger, stock reduced' },
  { id: 'AL03', at: '2025-09-12T09:10', user: 'Faisal Qureshi', action: 'Approved', entity: 'Purchase Invoice', ref: 'PINV-2087', details: 'Posted, stock updated' },
  { id: 'AL04', at: '2025-09-11T16:05', user: 'Rizwan Ahmed', action: 'Created', entity: 'Stock Adjustment', ref: 'ADJ-008', details: 'Awaiting approval' },
  { id: 'AL05', at: '2025-09-09T12:00', user: 'Admin', action: 'Approved', entity: 'Stock Adjustment', ref: 'ADJ-007', details: '-40 units B013' },
  { id: 'AL06', at: '2025-07-23T09:30', user: 'Admin', action: 'Cancelled', entity: 'Sales Invoice', ref: 'INV-1016', details: 'Reason: Customer cancelled the order. Reversal posted.' },
];

/* ------------------------ NUMBER SERIES (settings) ----------------- */
export const numberSeries = { INV: 1027, SR: 33, SO: 502, RV: 2089, PV: 1313, JV: 89, EV: 4412, PINV: 2089, PR: 12, SMP: 202, ADJ: 9, SV: 814 };

/* ------------------------- COMPANY PROFILE ------------------------- */
export const company = {
  name: 'Turnkey Publishers', product: 'MFAHH – Modern Financial Accounting & Handling Hub',
  address: 'Plot 12, Industrial Area, Karachi, Pakistan', phone: '021-35000000', email: 'info@turnkey.pk', ntn: '9999999-9',
  tagline: 'Knowledge Today, A Brighter Tomorrow',
};