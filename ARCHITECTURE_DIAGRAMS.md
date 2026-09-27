# FlashGrocer Backend - Architecture & Flow Diagrams

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT APPLICATIONS                          │
│              (Web Browser, Mobile App, Desktop Client)              │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP/HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EXPRESS SERVER (Node.js)                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   SECURITY MIDDLEWARE                         │  │
│  │  ├─ Helmet (security headers)                                │  │
│  │  ├─ CORS (cross-origin)                                      │  │
│  │  ├─ Rate Limiting                                            │  │
│  │  ├─ Body Parser                                              │  │
│  │  └─ Morgan (logging)                                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                             │                                        │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │                      ROUTE HANDLERS                          │  │
│  │  ├─ Auth (JWT, refresh tokens, roles)                       │  │
│  │  ├─ Products (CRUD with filters)                            │  │
│  │  ├─ Cart (add/update/remove)                                │  │
│  │  ├─ Orders (checkout, tracking)                             │  │
│  │  ├─ Wishlist (save items)                                   │  │
│  │  └─ Admin (dashboard, management)                           │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                             │                                        │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │                  ERROR HANDLING MIDDLEWARE                   │  │
│  │  ├─ Validation errors                                        │  │
│  │  ├─ Authentication errors                                    │  │
│  │  └─ Database errors                                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │ SQL Queries
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SQLite Database                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ├─ Users        (authentication & profiles)                 │  │
│  │  ├─ Products     (catalog with inventory)                    │  │
│  │  ├─ Orders       (purchase history)                          │  │
│  │  ├─ Cart         (shopping cart items)                       │  │
│  │  ├─ Wishlist     (saved items)                               │  │
│  │  ├─ Reviews      (product ratings)                           │  │
│  │  ├─ Coupons      (discounts)                                 │  │
│  │  └─ Activity Log (user actions)                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Authentication & Authorization Flow

```
┌──────────────┐
│ User Starts  │
└──────┬───────┘
       │
       ▼
┌─────────────────────────┐
│ Visits Login Page       │
├─────────────────────────┤
│ Enter Credentials       │
│ (email + password)      │
└──────┬──────────────────┘
       │
       ▼ POST /api/auth/login
┌─────────────────────────────────────────┐
│ Server Receives Login Request           │
├─────────────────────────────────────────┤
│ 1. Find user by email                   │
│ 2. Compare password with hash (bcrypt)  │
│ 3. If valid, generate tokens            │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Generate JWT Tokens                     │
├─────────────────────────────────────────┤
│ ├─ Access Token (7 days)                │
│ │  { id, email, role, iat, exp }        │
│ │                                       │
│ └─ Refresh Token (30 days, hashed)      │
│    Stored in DB for validation          │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Client Stores Tokens                    │
├─────────────────────────────────────────┤
│ ├─ Access Token → httpOnly cookie       │
│ └─ Refresh Token → httpOnly cookie      │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ User Makes Protected Request            │
│ GET /api/auth/me                        │
├─────────────────────────────────────────┤
│ Headers:                                │
│ Authorization: Bearer <access_token>    │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Server Verifies Token                   │
├─────────────────────────────────────────┤
│ ├─ Check signature is valid             │
│ ├─ Check token not expired              │
│ └─ Extract user ID from payload         │
└──────┬──────────────────────────────────┘
       │
       ├─────────────────────┬────────────────────────┐
       │ Valid              │ Expired                │ Invalid
       ▼                    ▼                        ▼
    ✅ Continue      Call /api/auth/refresh    ❌ Return 401
    Process         Send refresh token         Unauthorized
                    Get new access token
```

---

## 🛒 Shopping Cart & Checkout Flow

```
START
  │
  ▼
┌─────────────────────┐
│ Browse Products     │
│ GET /api/products   │
└────────┬────────────┘
         │
         ▼
┌──────────────────────────┐
│ View Product Details     │
│ GET /api/products/:id    │
└────────┬─────────────────┘
         │
         ▼ SELECT + Add to Cart
┌──────────────────────────────┐
│ Add to Cart                  │
│ POST /api/cart               │
├──────────────────────────────┤
│ Check product exists ✓       │
│ Verify stock available ✓     │
│ Insert/update cart item ✓    │
└────────┬─────────────────────┘
         │
         ▼
    Continue     ┌─────────────────┐
    Shopping? ───┤ Yes             │ (Loop back to Browse)
         │       └─────────────────┘
         │ No
         ▼
┌──────────────────────┐
│ View Cart            │
│ GET /api/cart        │
├──────────────────────┤
│ Show all items       │
│ Show total price     │
└──────┬───────────────┘
       │
       ▼ Update/Remove items?
  ┌─────────────────────────────────┐
  │ Yes                             │
  ├─────────┬───────────────────────┤
  │          │                       │
  ▼          ▼ PUT (update qty)      ▼ DELETE (remove)
┌──────────────────────┐      ┌──────────────────┐
│ Update quantity      │      │ Remove item      │
└────────────┬─────────┘      └──────┬───────────┘
             │                       │
             └──────────┬────────────┘
                        │
                        ▼ (Loop)
                    │ No
                    ▼
            ┌──────────────────┐
            │ Proceed Checkout │
            └────────┬─────────┘
                     │
                     ▼ POST /api/orders
            ┌────────────────────────────────┐
            │ Create Order                   │
            ├────────────────────────────────┤
            │ START TRANSACTION              │
            │ ├─ Verify stock for all items │
            │ ├─ Create order record         │
            │ ├─ Add order items            │
            │ ├─ Reduce product stock       │
            │ ├─ Clear user cart            │
            │ └─ COMMIT TRANSACTION         │
            └────────┬───────────────────────┘
                     │
                     ▼
            ┌────────────────────┐
            │ Order Successful   │
            ├────────────────────┤
            │ Return order       │
            │ details & status   │
            └────────┬───────────┘
                     │
                     ▼
            ┌────────────────────┐
            │ Redirect to        │
            │ Order Confirmation │
            │ Page               │
            └────────────────────┘
```

---

## 📦 CRUD Operations Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    CRUD OPERATIONS                            │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  CREATE             READ              UPDATE         DELETE  │
│  ───────            ────              ──────         ──────  │
│                                                               │
│  POST /resource     GET /resource     PUT /resource  DELETE  │
│                     GET /resource/:id/:id            /resource
│                                                       /:id
│  ❶ Validate        ❶ Check auth     ❶ Verify auth  ❶ Verify
│    input            ❷ Query DB         owner/admin   owner/admin
│  ❷ Check           ❸ Return           ❷ Validate    ❷ Soft
│    duplicate         data              updates       delete
│  ❸ Insert          ❹ Paginate         ❸ Update      (set flag)
│    into DB          results            in DB       ❸ Return 200
│  ❹ Return                             ❹ Return
│    201 Created      Sample:           updated
│                     {                 resource
│  Sample:              success: true,
│  {                    data: [{...}],  Sample:
│    success: true,     pagination: {   { success:
│    data: {...}        limit: 20,      true, data:
│  }                    offset: 0,      {...} }
│                       total: 150
│                     }
│                                       Sample:
│                                       {
│                                         success:
│                                         true,
│                                         message:
│                                         'Deleted'
│                                       }
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔄 Middleware Request-Response Cycle

```
REQUEST comes in
     │
     ▼
┌─────────────────────┐
│ Helmet              │ Add security headers
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ CORS                │ Check origin whitelist
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Body Parser         │ Parse JSON/form data
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Cookie Parser       │ Parse cookies
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Morgan Logger       │ Log request
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Rate Limiter        │ Check request count
└────────┬────────────┘
         │
         ▼
┌──────────────────────────┐
│ Route Handler            │
├──────────────────────────┤
│ ├─ Validate input        │
│ ├─ Check authentication  │
│ ├─ Authorize access      │
│ └─ Process request       │
└────────┬─────────────────┘
         │
    ┌────┴────────────────────┐
    │ Success                 │ Error
    ▼                         ▼
┌─────────────────┐     ┌──────────────────┐
│ Send Response   │     │ Error Handler    │
│ Status 200-201  │     │ Middleware       │
└────────┬────────┘     └────────┬─────────┘
         │                      │
         └──────────┬───────────┘
                    │
                    ▼
Response leaves server
```

---

## 📊 Database Relationship Diagram

```
┌─────────────────────┐
│      USERS          │
├─────────────────────┤
│ id (PK)             │◄─────┐
│ email (UNIQUE)      │      │
│ password_hash       │      │
│ name                │      │
│ phone               │      │
│ address             │      │
│ role                │      │
│ created_at          │      │
└─────────────────────┘      │
          │                  │
          │ 1:N              │
          ├─────────────────┐│
          │                 ││
          ▼                 ▼▼
┌─────────────────────┐ ┌──────────────────┐
│      ORDERS         │ │  REFRESH_TOKENS  │
├─────────────────────┤ ├──────────────────┤
│ id (PK)             │ │ id (PK)          │
│ user_id (FK)        │ │ user_id (FK)     │
│ order_number        │ │ token_hash       │
│ total_price         │ │ expires_at       │
│ status              │ │ created_at       │
│ shipping_address    │ └──────────────────┘
│ created_at          │
└────────┬────────────┘
         │ 1:N
         │
         ▼
┌──────────────────────┐
│   ORDER_ITEMS        │
├──────────────────────┤
│ id (PK)              │
│ order_id (FK)        │──┐
│ product_id (FK)      │  │
│ quantity             │  │
│ price                │  │
└──────────────────────┘  │
                          │
    ┌─────────────────────┴──┐
    │ N:M                    │
    ▼                        │
┌──────────────────────┐     │
│    PRODUCTS          │     │
├──────────────────────┤     │
│ id (PK)◄─────────────┼─────┘
│ name                 │ (also referenced
│ category             │  from CART &
│ price                │  WISHLIST)
│ stock                │
│ rating               │
│ is_active            │
│ created_at           │
└──────────────────────┘

┌──────────────────────┐
│      CART            │
├──────────────────────┤
│ id (PK)              │
│ user_id (FK) ────────┤──> USERS
│ product_id (FK) ─────┤──> PRODUCTS
│ quantity             │
└──────────────────────┘

┌──────────────────────┐
│     WISHLIST         │
├──────────────────────┤
│ id (PK)              │
│ user_id (FK) ────────┤──> USERS
│ product_id (FK) ─────┤──> PRODUCTS
│ added_at             │
└──────────────────────┘

┌──────────────────────┐
│     REVIEWS          │
├──────────────────────┤
│ id (PK)              │
│ product_id (FK) ─────┤──> PRODUCTS
│ user_id (FK) ────────┤──> USERS
│ rating               │
│ comment              │
└──────────────────────┘
```

---

## 🔴 Error Handling Flow

```
REQUEST EXECUTION
        │
        ▼
    ┌─────────────────────────┐
    │ Processing              │
    └────────┬────────────────┘
             │
    ┌────────┴────────┐
    │ Error?          │
    └────────┬────────┘
             │
    ┌────────┴────────────────────┐
    │ No                          │ Yes
    ▼                             ▼
┌─────────────────────────┐  ┌──────────────────────┐
│ Send Success Response   │  │ Error Caught         │
│ Status: 200/201         │  ├──────────────────────┤
│ { success: true, ... }  │  │ Type?                │
└──────────┬──────────────┘  └──────┬───┬──────┬───┘
           │                        │   │      │
           │                        │   │      └─────────┐
           │                    ┌───┘   │                │
           │                    ▼       ▼                ▼
           │              Validation  Auth            Database
           │              Error       Error            Error
           │              ▼           ▼                ▼
           │         ┌─────────┐ ┌──────┐        ┌──────────┐
           │         │ 400     │ │ 401  │        │ 500      │
           │         │ Bad Req │ │ Unauth         │ Server   │
           │         └────┬────┘ └───┬──┘        └────┬─────┘
           │              │          │               │
           └──────────┬───┼──────────┼───────────────┼────┐
                      │   │          │               │    │
                      ▼   ▼          ▼               ▼    ▼
                 ┌─────────────────────────────────────────────────┐
                 │ Error Handler Middleware                        │
                 ├─────────────────────────────────────────────────┤
                 │ 1. Log error (if development mode)              │
                 │ 2. Format error response                        │
                 │ 3. Send response with status code & message     │
                 └─────────────────────────────────────────────────┘
                                │
                                ▼
                    SEND ERROR RESPONSE TO CLIENT
                    Status: 4xx or 5xx
                    { success: false, message: "..." }
```

---

## 🚀 Request Processing Timeline

```
TIME        CLIENT              SERVER              DATABASE
────────────────────────────────────────────────────────────
  0ms    Send Request
         POST /api/cart
         { product_id: 1,
           quantity: 2 }
             │
             ▼ (TLS handshake if HTTPS)
  10ms   Network delay
             │
             ▼────────────►────► Receive Request
                          ├─ Parse JSON
                          ├─ Validate input
                          ├─ Authenticate (verify JWT)
                          ├─ Authorize (check role)
  20ms                    ├─ Prepare query
             │            │
             │            ▼────────────────► Query DB
             │            │                 SELECT stock
  30ms                    │                 FROM products
             │            │                 WHERE id = 1
             │            │◄───────────────► Check stock
             │            │
             │            ├─ Check existing
             │            │  cart item
  40ms                    │
             │            ├─ Insert/Update
             │            │  cart record
             │            │
             │            ├─ Format response
  50ms       ◄────────────┤
         Receive          ├─ Send Response
         Response         │  Status: 201
         { success: true, │  { success: true
           data: {...} }  │    message: "Added"
                          │    data: {...} }
  60ms   Parse JSON
         Update UI
         Show message

Total latency: ~50-60ms (network + processing + DB)
```

---

## 🎯 State Machine: Order Status

```
                    CREATE ORDER
                         │
                         ▼
                    (pending)
                    /    |    \
                   /     |     \
                  /      |      \
                 /       |       \
                ▼        ▼       ▼
             confirm  payment  cancel
              error    fail   request
              │        │        │
              ▼        ▼        ▼
            (pending)──────→ (cancelled)
              │
              ▼ (admin confirms)
          (confirmed)
              │
              ▼ (admin ships)
           (shipped)
              │
              ▼ (customer receives)
          (delivered) ─── FINAL STATE

Allowed transitions:
pending ───→ confirmed
pending ───→ cancelled
confirmed ──→ shipped
confirmed ──→ cancelled
shipped ────→ delivered
shipped ────→ cancelled (rare)
```

---

## 💾 Data Flow: Add to Cart

```
┌──────────────┐
│ User clicks  │
│ "Add to Cart"│
└──────┬───────┘
       │
       ▼ POST /api/cart
┌──────────────────────────────────────────┐
│ Browser sends JSON                       │
│ { product_id: 1, quantity: 2 }          │
└──────┬───────────────────────────────────┘
       │
       ▼ HTTP Request
┌──────────────────────────────────────────┐
│ Server Receives Request                  │
├──────────────────────────────────────────┤
│ Step 1: Extract & Validate              │
│ ├─ product_id = 1 ✓                    │
│ ├─ quantity = 2 ✓                      │
│ └─ user_id = 123 (from JWT) ✓          │
└──────┬───────────────────────────────────┘
       │
       ▼ SQL Query
┌──────────────────────────────────────────┐
│ Check Product Exists & Stock             │
│ SELECT id, stock FROM products           │
│ WHERE id = 1 AND is_active = 1           │
└──────┬───────────────────────────────────┘
       │
       ├─ Stock available? YES
       │
       ▼ SQL Query
┌──────────────────────────────────────────┐
│ Check if Already in Cart                 │
│ SELECT id, quantity FROM cart            │
│ WHERE user_id = 123 AND product_id = 1   │
└──────┬───────────────────────────────────┘
       │
       ├─ Already exists? NO → INSERT
       │  INSERT INTO cart (...) VALUES (...)
       │
       ▼ ← OR → (YES) UPDATE quantity
       │  UPDATE cart SET quantity = 4
       │
       ▼ SQL Commit
┌──────────────────────────────────────────┐
│ Database Updated Successfully            │
└──────┬───────────────────────────────────┘
       │
       ▼ Send JSON Response
┌──────────────────────────────────────────┐
│ {                                        │
│   "success": true,                       │
│   "message": "Added to cart",            │
│   "data": {                              │
│     "id": 5,                             │
│     "product_id": 1,                     │
│     "quantity": 2                        │
│   }                                      │
│ }                                        │
└──────┬───────────────────────────────────┘
       │
       ▼ HTTP Response (Status: 201)
┌──────────────────────────────────────────┐
│ Browser Receives Response                │
│ ├─ Parse JSON                           │
│ ├─ Update cart count                    │
│ ├─ Show success message                 │
│ └─ Refresh cart page                    │
└──────────────────────────────────────────┘
```

---

## 📈 Performance Optimization Layers

```
                    CLIENT OPTIMIZATION
                    ├─ Gzip compression
                    ├─ Caching static assets
                    ├─ Lazy loading images
                    └─ Minified CSS/JS
                           │
                           ▼
                    NETWORK OPTIMIZATION
                    ├─ CDN for assets
                    ├─ HTTP/2
                    ├─ Keep-alive connections
                    └─ Reduced payload size
                           │
                           ▼
                    SERVER OPTIMIZATION
                    ├─ Connection pooling
                    ├─ Request rate limiting
                    ├─ Response compression
                    └─ Load balancing
                           │
                           ▼
                    APPLICATION OPTIMIZATION
                    ├─ Query optimization
                    ├─ Pagination
                    ├─ Caching (Redis)
                    └─ Async operations
                           │
                           ▼
                    DATABASE OPTIMIZATION
                    ├─ Indexes on hot columns
                    ├─ Query analysis
                    ├─ Connection pooling
                    └─ Replication
```

---

**Generated:** March 31, 2026 | **Version:** 1.0.0
