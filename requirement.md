```markdown
# Phone Repair Manager

> A lightweight, offline-first, cross-platform web application for managing used phone purchasing, repair, inventory, sales, costs, and profit tracking.

---

# Project Goal

Develop a fast, lightweight, responsive web application for a single user (store owner) who buys used or damaged mobile phones, repairs them, and sells them for profit.

The application should focus on:

- Fast data entry
- Minimal clicks
- Automatic profit calculation
- Offline capability
- Responsive UI (Desktop, Tablet, Mobile)
- Easy deployment
- Low hardware requirements

This is NOT an ERP system.

There is only ONE administrator account.

---

# Technology Stack

## Frontend

- React 19
- Vite
- TypeScript
- TailwindCSS
- Shadcn UI
- TanStack Router
- TanStack Query
- React Hook Form
- Zod
- Recharts

## Backend

- Supabase

Use:

- PostgreSQL Database
- Authentication (Single Admin)
- Storage (Phone Images)
- Realtime (optional)

No custom backend required.

No Node.js server.

No ASP.NET.

No Express.

No NestJS.

All CRUD operations should use Supabase SDK.

---

# Local Database Support

The application should work even when internet is unavailable.

Use:

- IndexedDB
- Dexie.js

When internet becomes available:

- synchronize data with Supabase

Offline-first architecture.

---

# Deployment

Deploy on

- Vercel

or

- Netlify

One-click deployment.

---

# Design Principles

UI should be

- Modern
- Minimal
- Fast
- Clean
- Large touch targets
- Mobile friendly

Use

- Card layout
- Data Table
- Dialog
- Drawer on mobile

Dark mode supported.

---

# Authentication

Single Admin Login

Fields

- Username
- Password

Remember login.

No role management.

---

# Main Modules

---

# 1. Dashboard

Display

- Total phones in stock
- Waiting for repair
- Ready to sell
- Sold today
- Revenue today
- Revenue this month
- Profit today
- Profit this month
- Inventory value
- Parts low in stock

Charts

- Revenue by month
- Profit by month
- Sales count
- Purchase count

---

# 2. Phone Management

Each phone has

## Basic Information

- ID
- IMEI 1
- IMEI 2
- Brand
- Model
- Color
- Storage
- RAM
- Carrier
- Accessories
- Notes

Purchase Information

- Seller Name
- Seller Phone
- Purchase Price
- Purchase Date

Status

- Purchased
- Waiting Repair
- Repairing
- Ready For Sale
- Reserved
- Sold

Images

- Front
- Back
- IMEI
- Accessories

QR Code generated automatically.

---

# 3. Fault Management

Each phone may contain multiple faults.

Examples

- Broken Screen
- Dead Battery
- Face ID
- Camera
- Speaker
- Charging
- Water Damage
- Motherboard
- Network
- WiFi
- Bluetooth

Allow

- Add
- Remove
- Edit

---

# 4. Repair History

Each phone stores repair history.

Repair Record

- Date
- Description
- Technician (optional)
- Labor Cost
- Notes

Multiple repairs allowed.

Timeline view.

---

# 5. Parts Inventory

Fields

- Name
- Category
- Compatible Models
- Purchase Cost
- Quantity
- Minimum Stock
- Supplier
- Notes

Examples

- OLED Screen
- Battery
- Camera
- Housing
- Charging Port
- Flex Cable

Show

- Current Stock
- Low Stock Warning

---

# 6. Parts Replacement

One repair can use multiple parts.

Each replacement stores

- Part
- Quantity
- Unit Cost
- Total Cost

Automatically

- Reduce inventory
- Update repair cost

---

# 7. Expense Management

Store additional expenses.

Examples

- Shipping
- Packaging
- Cleaning
- External Repair
- Fuel
- Other

Each expense may belong to

- Phone
- General Store Expense

---

# 8. Automatic Cost Calculation

Phone Cost

Purchase Price

+

Repair Parts

+

Labor Cost

+

Additional Expenses

=

Total Cost

Automatically update.

Never manually calculate.

---

# 9. Sales Management

Fields

- Customer Name
- Phone
- Sale Date
- Sale Price
- Warranty Months
- Notes

When sold

Automatically

- Change status
- Record revenue
- Calculate profit

---

# 10. Profit Calculation

Profit

=

Sale Price

-

Total Cost

Display

- Profit Amount
- Profit Margin %
- ROI

Color

Green

Positive

Red

Negative

---

# 11. Customer Management

Store

- Name
- Phone
- Notes

History

Purchased phones

Warranty

---

# 12. Warranty

Track

- Warranty Start
- Warranty End
- Notes

Show

Upcoming Warranty Expiration

---

# 13. Search

Global Search

Search by

- IMEI
- Model
- Brand
- Customer
- Status

Instant filtering.

---

# 14. Reports

Generate

Daily

Weekly

Monthly

Yearly

Custom Range

Statistics

- Purchase Count
- Sales Count
- Revenue
- Cost
- Profit
- Expenses

Export

- Excel
- CSV
- PDF

---

# 15. Backup

Buttons

Backup

Restore

Export database

Import database

JSON format.

---

# 16. Settings

Store

Business Name

Default Warranty

Currency

Dark Mode

Backup Settings

---

# Database Tables

## phones

- id
- imei1
- imei2
- brand
- model
- color
- storage
- ram
- purchase_price
- purchase_date
- seller_name
- seller_phone
- status
- notes

---

## phone_faults

- id
- phone_id
- fault_name

---

## repairs

- id
- phone_id
- repair_date
- labor_cost
- notes

---

## repair_parts

- id
- repair_id
- part_id
- quantity
- price

---

## parts

- id
- name
- stock
- purchase_cost
- minimum_stock

---

## expenses

- id
- phone_id
- amount
- category
- description

---

## customers

- id
- name
- phone

---

## sales

- id
- phone_id
- customer_id
- sale_price
- sale_date
- warranty_months

---

# UI Requirements

Responsive

Desktop

Tablet

Mobile

Use

- Data Table
- Drawer
- Sheet
- Dialog
- Command Palette
- Toast Notification
- Skeleton Loading

Keyboard shortcuts

Ctrl + N

Add Phone

Ctrl + F

Search

Ctrl + S

Save

---

# Performance

Initial load

< 2 seconds

Lighthouse

Performance > 95

Accessibility > 95

SEO > 90

Bundle size

< 400 KB (excluding images)

---

# Security

- Supabase Authentication
- Row Level Security
- Input Validation
- Zod Validation
- SQL Injection Protection
- XSS Protection

---

# AI Features (Optional)

- OCR IMEI from image
- OCR invoice scanning
- Auto detect phone model
- AI repair note suggestion
- AI estimate selling price
- AI monthly business summary

---

# Nice-to-have

- Barcode Scanner
- QR Scanner
- Drag & Drop Images
- Camera Capture
- Image Compression
- PWA Support
- Installable on Desktop
- Installable on Android
- Installable on iPhone
- Push Notifications
- Auto Sync
- Offline Mode

---

# Coding Standards

- Strict TypeScript
- Feature-based folder structure
- Reusable Components
- Custom Hooks
- No duplicated code
- Clean Architecture
- SOLID principles
- ESLint
- Prettier

---

# Deliverables

The generated application must include:

- Complete source code
- Database schema
- Supabase migrations
- Responsive UI
- Sample data
- Dark mode
- PWA support
- Offline support
- CRUD for every module
- Charts
- Export/Import
- README
- Environment variable example

The application should be production-ready, scalable, and easy to maintain while remaining lightweight and optimized for a single-user workflow.
```
