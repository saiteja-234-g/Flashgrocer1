const express = require('express');
const app = express();
app.use(express.json());

// 1. GET - Retrieve all products
app.get('/api/products', (req, res) => {
    res.status(200).json({
        success: true,
        message: "Products retrieved successfully",
        data: [{ id: 1, name: "Fresh Apples", price: 2.99 }]
    });
});

// 2. POST - Create a new order
app.post('/api/orders', (req, res) => {
    const { productId, quantity } = req.body;
    if (!productId || !quantity) {
        return res.status(400).json({ success: false, message: "Missing fields" });
    }
    res.status(201).json({
        success: true,
        message: "Order created successfully",
        data: { orderId: 101, productId, quantity }
    });
});

// 3. PUT - Update user profile
app.put('/api/users/:id', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    res.status(200).json({
        success: true,
        message: `User ${id} updated successfully to ${name}`
    });
});

// 4. DELETE - Remove an item from cart
app.delete('/api/cart/:itemId', (req, res) => {
    const { itemId } = req.params;
    res.status(200).json({
        success: true,
        message: `Item ${itemId} removed from cart`
    });
});

if (require.main === module) {
    app.listen(3000, () => console.log('REST API Server running on port 3000'));
}

module.exports = app;
