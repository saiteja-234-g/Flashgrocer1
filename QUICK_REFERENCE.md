<!-- 
  FlashGrocer - Quick Reference Card
  Keep this handy for common tasks and API calls
-->

# 🚀 FlashGrocer Backend - Quick Reference Card

## 📦 Installation & Setup

```bash
# 1. Install dependencies
npm install

# 2. Create .env file
echo "PORT=3000" > .env
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> .env
echo "NODE_ENV=development" >> .env
echo "DB_PATH=./database/flashgrocer.db" >> .env

# 3. Seed database
npm run seed:admin

# 4. Start development server
npm run dev

# 5. Test health
curl http://localhost:3000/api/health
```

---

## 🔐 Authentication Quick Reference

### Default Admin Credentials
```
Email: admin@flashgrocer.com
Password: Admin@12345
```

### Login & Get Token
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flashgrocer.com","password":"Admin@12345"}'
```

### Use Token in Requests
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## 📍 API Endpoints Quick Reference

### Auth Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Create account | ❌ |
| POST | `/api/auth/login` | Get tokens | ❌ |
| GET | `/api/auth/me` | Current user | ✅ |
| POST | `/api/auth/logout` | Logout | ✅ |

### Product Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/products` | List products | ❌ |
| GET | `/api/products/:id` | Single product | ❌ |
| POST | `/api/products` | Create | ✅ Admin |
| PUT | `/api/products/:id` | Update | ✅ Admin |
| DELETE | `/api/products/:id` | Delete | ✅ Admin |

### Cart Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/cart` | View cart | ✅ |
| POST | `/api/cart` | Add item | ✅ |
| PUT | `/api/cart/:id` | Update qty | ✅ |
| DELETE | `/api/cart/:id` | Remove item | ✅ |

### Order Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/orders` | View orders | ✅ |
| POST | `/api/orders` | Create order | ✅ |
| GET | `/api/orders/:id` | Order details | ✅ |
| PUT | `/api/orders/:id/status` | Update status | ✅ Admin |

---

## 🧪 Quick Test Requests

### Register New User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name":"John Doe",
    "email":"john@example.com",
    "password":"Password@123"
  }'
```

### Get All Products
```bash
curl "http://localhost:3000/api/products?limit=10&offset=0"
```

### Filter Products by Category
```bash
curl "http://localhost:3000/api/products?category=grocery&sort=price-asc"
```

### Search Products
```bash
curl "http://localhost:3000/api/products?q=milk"
```

### Add to Cart
```bash
curl -X POST http://localhost:3000/api/cart \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"product_id":1,"quantity":2}'
```

### Create Order
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "shipping_address":"123 Main St, City, PIN",
    "payment_method":"cod"
  }'
```

### Admin: Update Order Status
```bash
curl -X PUT http://localhost:3000/api/orders/1/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"status":"shipped"}'
```

---

## 🗂️ File Locations

```
File                         | Purpose
---------------------------- | --------------------------------
server.js                    | Main Express app
routes/auth.js              | Authentication routes
routes/products.js          | Product management
routes/cart.js              | Shopping cart
routes/orders.js            | Order management
database/db.js              | Database setup
middleware/auth.js          | JWT authentication
middleware/errorHandler.js  | Error handling
middleware/validate.js      | Input validation
```

---

## 🐛 Debugging Tips

### Check Server Status
```bash
curl http://localhost:3000/api/health
```

### View Database
```bash
# Install sqlite3 CLI if needed
sqlite3 database/flashgrocer.db

# Common queries
SELECT * FROM users;
SELECT * FROM products;
SELECT * FROM orders;
.exit
```

### Check Node Process
```bash
# Find Node process
lsof -i :3000

# Kill process if stuck
kill -9 <PID>
```

### View Error Logs
```bash
# Check console output from npm run dev
# Look for [ERROR] messages
```

---

## 📊 Database Operations

### Common SQL Queries

```sql
-- Count users
SELECT COUNT(*) FROM users;

-- List all active products
SELECT id, name, price, stock FROM products WHERE is_active = 1;

-- Get user orders
SELECT * FROM orders WHERE user_id = 1 ORDER BY created_at DESC;

-- Get order total
SELECT SUM(total_price) FROM orders WHERE status != 'cancelled';

-- Get inventory by category
SELECT category, SUM(stock) FROM products WHERE is_active = 1 GROUP BY category;

-- Get top selling products
SELECT p.name, SUM(oi.quantity) as sold 
FROM order_items oi
JOIN products p ON oi.product_id = p.id
GROUP BY p.id ORDER BY sold DESC LIMIT 10;
```

---

## 🚨 Error Codes Reference

| Code | Meaning | Solution |
|------|---------|----------|
| 400 | Bad Request | Check your request format & validation |
| 401 | Unauthorized | Add valid JWT token in Authorization header |
| 403 | Forbidden | Missing admin role for this operation |
| 404 | Not Found | Check the resource ID or endpoint |
| 409 | Conflict | Email already registered duplicate data |
| 429 | Too Many Requests | Rate limited, wait before retrying |
| 500 | Server Error | Check server logs for details |

---

## 🔑 Key Concepts

### JWT Token Structure
```
Header.Payload.Signature

Header: { alg: "HS256", typ: "JWT" }
Payload: { id, email, role, iat, exp }
Signature: HMACSHA256(header + payload, secret)
```

### User Roles
- `customer` - Regular users (default)
- `admin` - Can manage products, orders, users

### Order Status Flow
```
pending → confirmed → shipped → delivered
           ↓
        cancelled (anytime)
```

### Product Category
- grocery
- electronics
- clothes
- food
- daily

---

## ⚡ Performance Tips

### Optimize Queries
```javascript
// ✅ Good: Use pagination
/api/products?limit=20&offset=0

// ❌ Avoid: Loading all data
/api/products (without limit)
```

### Filter Efficiently
```bash
# ✅ Filtered on server (efficient)
curl "http://localhost:3000/api/products?category=grocery"

# ❌ Load all and filter on client (inefficient)
curl "http://localhost:3000/api/products" | filter locally
```

### Cache Responses
```javascript
// Frontend: Cache product list (short-term)
const cached = localStorage.getItem('products');
if (cached) return JSON.parse(cached);
```

---

## 📱 Frontend Integration

### JavaScript Fetch Example
```javascript
// Login
const response = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // For cookies
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password'
  })
});

const data = await response.json();
const token = data.data.accessToken;

// Get protected resource
const userResponse = await fetch('http://localhost:3000/api/auth/me', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const user = await userResponse.json();
```

---

## 🛡️ Security Checklist

- [x] Use HTTPS in production
- [x] Store tokens in httpOnly cookies
- [x] Never commit .env file
- [x] Validate all inputs
- [x] Use parameterized queries
- [x] Hash passwords with bcrypt
- [x] Implement rate limiting
- [x] Add CORS whitelist
- [x] Use Helmet for headers
- [x] Log security events

---

## 📞 Troubleshooting

### "Port 3000 is already in use"
```bash
# Kill process using port 3000
lsof -ti:3000 | xargs kill -9
# Or change PORT in .env
```

### "Cannot find module 'express'"
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### "Database connection failed"
```bash
# Check database file exists
ls -la database/flashgrocer.db
# Or reinitialize
npm run seed:admin
```

### "Invalid token"
```bash
# Get new token by logging in
curl -X POST http://localhost:3000/api/auth/login ...
```

### "CORS error"
```bash
# Add your frontend URL to .env
FRONTEND_URL=http://yourdomain.com
# Restart server
```

---

## 🎓 Learning Resources

- **Express.js Docs**: https://expressjs.com/
- **SQLite Guide**: https://www.sqlite.org/
- **JWT Explained**: https://jwt.io/
- **REST API Best Practices**: https://restfulapi.net/
- **Node.js Best Practices**: https://github.com/goldbergyoni/nodebestpractices

---

## 📝 Node.js Versions

- **Required**: Node.js 14+
- **Recommended**: Node.js 18+
- **Check version**: `node --version`

---

## 🎯 Development Workflow

### 1. Start Development Server
```bash
npm run dev
```

### 2. Make Changes to Code
```bash
# Server auto-reloads via nodemon
# Errors shown in console
```

### 3. Test Changes
```bash
curl http://localhost:3000/api/health
# Or use Postman/Insomnia
```

### 4. Check Database
```bash
sqlite3 database/flashgrocer.db
```

### 5. Commit Changes
```bash
git add .
git commit -m "Feature: description"
```

---

## 🚀 Deployment Checklist

- [ ] Set `NODE_ENV=production` in .env
- [ ] Generate strong JWT_SECRET
- [ ] Set up production database
- [ ] Configure CORS for production domain
- [ ] Enable HTTPS
- [ ] Set up monitoring
- [ ] Configure backups
- [ ] Test all endpoints
- [ ] Load test the API
- [ ] Monitor logs
- [ ] Set up alerts

---

## 📞 Quick Help

**Need to add a new route?**
1. Create file in `routes/` folder
2. Import in `server.js`
3. Mount with `app.use('/api/name', routeFile)`

**Need to add a new database table?**
1. Add CREATE TABLE statement in `database/db.js`
2. Run `npm run seed:admin` to apply

**Need to change authentication?**
1. Edit `middleware/auth.js`
2. Restart server

**Need to modify response format?**
1. Update in route handlers
2. Keep `{ success: boolean }` consistent

---

## 🎉 Success!

Your backend is ready to serve API requests. Now:
1. Connect your frontend to these endpoints
2. Test thoroughly
3. Deploy to production
4. Monitor performance

**Happy Coding! 🚀**

---

_Last Updated: March 31, 2026_  
_FlashGrocer Backend v1.0.0_
