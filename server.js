require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const midtransClient = require('midtrans-client');

// Create Core/Snap API instance
const snap = new midtransClient.Snap({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Konfigurasi Database Postgres
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3310,
  database: process.env.DB_NAME || 'testdb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

console.log(`Attempting to connect to DB on host: ${process.env.DB_HOST || 'localhost'}, port: ${process.env.DB_PORT || 3310}, database: ${process.env.DB_NAME || 'testdb'}`);

pool.connect((err) => {
  if (err) console.error('Gagal koneksi ke Postgres:', err.stack);
  else console.log('Database Postgres Terhubung!');
});

const app = express();
app.use(cors({
    origin: '*', // Or specify your Expo web port, e.g., 'http://localhost:8081'
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_123';

// --- MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: 'Token tidak tersedia' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token tidak valid' });
        req.user = user;
        next();
    });
};

const authorizeRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Akses ditolak: Peran tidak diizinkan' });
        }
        next();
    };
};

// ==========================================
// INTERNAL SYSTEM (Admin & Kasir)
// ==========================================

// Internal Login
app.post('/api/internal/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Plain text for existing staff as per original dump
        const results = await pool.query("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
        if (results.rows.length > 0) {
            const user = results.rows[0];
            const token = jwt.sign({ userId: user.user_id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
            res.json({ success: true, token, role: user.role, username: user.username });
        } else {
            res.status(401).json({ success: false, message: 'Username atau password salah!' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Manage Barang (Admin & Kasir)
app.get('/api/internal/barang', authenticateToken, authorizeRole('admin', 'kasir'), async (req, res) => {
    try {
        const results = await pool.query("SELECT * FROM barang ORDER BY barang_id ASC");
        res.json(results.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/internal/barang', authenticateToken, authorizeRole('admin', 'kasir'), async (req, res) => {
    console.log("INCOMING PRODUCT DATA:", req.body);
    const { nama_barang, kategori, harga, stok } = req.body;
    try {
        await pool.query(
            "INSERT INTO barang (nama_barang, kategori, harga, stok) VALUES ($1, $2, $3, $4) RETURNING *", 
            [nama_barang, kategori, harga, stok]
        );
        res.json({ success: true, message: 'Barang berhasil ditambahkan!' });
    } catch (err) {
        console.error('Backend DB Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/internal/barang/:id', authenticateToken, authorizeRole('admin', 'kasir'), async (req, res) => {
    const { nama_barang, kategori, harga, stok } = req.body;
    try {
        await pool.query(
            "UPDATE barang SET nama_barang = $1, kategori = $2, harga = $3, stok = $4 WHERE barang_id = $5", 
            [nama_barang, kategori, harga, stok, req.params.id]
        );
        res.json({ success: true, message: 'Barang berhasil diupdate!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/internal/barang/:id', authenticateToken, authorizeRole('admin', 'kasir'), async (req, res) => {
    try {
        await pool.query("DELETE FROM barang WHERE barang_id = $1", [req.params.id]);
        res.json({ success: true, message: 'Barang berhasil dihapus!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Manage Pelanggan (Admin & Kasir)
app.get('/api/internal/pelanggan', authenticateToken, authorizeRole('admin', 'kasir'), async (req, res) => {
    try {
        const results = await pool.query("SELECT * FROM pelanggan ORDER BY pelanggan_id ASC");
        res.json(results.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/internal/pelanggan', authenticateToken, authorizeRole('admin', 'kasir'), async (req, res) => {
    const { pelanggan_id, nama_pelanggan, nomor_telepon, alamat, email } = req.body;
    try {
        await pool.query(
            "INSERT INTO pelanggan (pelanggan_id, nama_pelanggan, nomor_telepon, alamat, email) VALUES ($1, $2, $3, $4, $5)", 
            [pelanggan_id, nama_pelanggan, nomor_telepon, alamat, email]
        );
        res.json({ success: true, message: 'Pelanggan berhasil ditambahkan!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/internal/pelanggan/:id', authenticateToken, authorizeRole('admin', 'kasir'), async (req, res) => {
    const { nama_pelanggan, nomor_telepon, alamat, email } = req.body;
    try {
        await pool.query(
            "UPDATE pelanggan SET nama_pelanggan = $1, nomor_telepon = $2, alamat = $3, email = $4 WHERE pelanggan_id = $5", 
            [nama_pelanggan, nomor_telepon, alamat, email, req.params.id]
        );
        res.json({ success: true, message: 'Pelanggan berhasil diupdate!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/internal/pelanggan/:id', authenticateToken, authorizeRole('admin', 'kasir'), async (req, res) => {
    try {
        await pool.query("DELETE FROM pelanggan WHERE pelanggan_id = $1", [req.params.id]);
        res.json({ success: true, message: 'Pelanggan berhasil dihapus!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Tracking Status (Admin & Kasir)
app.put('/api/internal/transaksi/:id/status', authenticateToken, authorizeRole('admin', 'kasir'), async (req, res) => {
    const { status_transaksi } = req.body;
    try {
        await pool.query("UPDATE transaksi SET status_transaksi = $1 WHERE transaksi_id = $2", [status_transaksi, req.params.id]);
        res.json({ success: true, message: 'Status transaksi diperbarui' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN ONLY DASHBOARDS ---
app.get('/api/admin/stats', authenticateToken, authorizeRole('admin'), async (req, res) => {
    try {
        const query = `
            SELECT 
                COALESCE((SELECT SUM(total_harga) FROM transaksi), 0) as total_revenue,
                (SELECT COUNT(*) FROM transaksi) as total_sales,
                (SELECT COUNT(*) FROM barang WHERE stok < 5) as low_stock_count
        `;
        const results = await pool.query(query);
        res.json(results.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/top-selling', authenticateToken, authorizeRole('admin'), async (req, res) => {
    try {
        const query = `
            SELECT b.nama_barang, SUM(dt.jumlah_barang) as total_terjual
            FROM detail_transaksi dt
            JOIN barang b ON dt.barang_id = b.barang_id
            GROUP BY b.nama_barang
            ORDER BY total_terjual DESC
            LIMIT 3
        `;
        const results = await pool.query(query);
        res.json(results.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/revenue-trend', authenticateToken, authorizeRole('admin'), async (req, res) => {
    try {
        const query = `
            SELECT DATE(tanggal_transaksi) as transaction_date, SUM(total_harga) as daily_revenue
            FROM transaksi
            WHERE tanggal_transaksi > CURRENT_DATE - INTERVAL '7 days'
            GROUP BY DATE(tanggal_transaksi)
            ORDER BY transaction_date ASC
        `;
        const results = await pool.query(query);
        res.json(results.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// CASHIER POS API (React Native Mobile)
// ==========================================

// Fetch Pending Cash Orders
app.get('/api/admin/orders/pending-cash', authenticateToken, authorizeRole('admin', 'kasir'), async (req, res) => {
    try {
        const query = `
            SELECT 
                t.transaksi_id, t.tanggal_transaksi, t.total_harga, t.status_transaksi, t.metode_pembayaran,
                json_agg(json_build_object(
                    'barang_id', d.barang_id,
                    'nama_barang', b.nama_barang,
                    'jumlah_barang', d.jumlah_barang,
                    'harga_satuan', d.harga_satuan,
                    'subtotal', d.subtotal
                )) as items
            FROM transaksi t
            JOIN detail_transaksi d ON t.transaksi_id = d.transaksi_id
            JOIN barang b ON d.barang_id = b.barang_id
            WHERE t.status_transaksi = 'Menunggu Pembayaran Kasir'
            GROUP BY t.transaksi_id
            ORDER BY t.tanggal_transaksi DESC
        `;
        const results = await pool.query(query);
        res.json(results.rows);
    } catch (err) {
        console.error("Fetch pending cash orders error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Confirm Payment
app.post('/api/admin/orders/:id/confirm', authenticateToken, authorizeRole('admin', 'kasir'), async (req, res) => {
    try {
        const result = await pool.query(
            "UPDATE transaksi SET status_transaksi = 'Selesai' WHERE transaksi_id = $1 RETURNING *",
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
        
        res.status(200).json({ success: true, message: "Pembayaran diterima." });
    } catch (err) {
        console.error("Confirm payment error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Deny / Cancel Payment
app.post('/api/admin/orders/:id/deny', authenticateToken, authorizeRole('admin', 'kasir'), async (req, res) => {
    try {
        await pool.query('BEGIN');
        
        // 1. Fetch details to restore stock
        const detailsRes = await pool.query(
            "SELECT barang_id, jumlah_barang FROM detail_transaksi WHERE transaksi_id = $1",
            [req.params.id]
        );
        
        if (detailsRes.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Order not found' });
        }

        // 2. Restore stock
        for (const item of detailsRes.rows) {
            await pool.query(
                "UPDATE barang SET stok = stok + $1 WHERE barang_id = $2",
                [item.jumlah_barang, item.barang_id]
            );
        }

        // 3. Update order status
        await pool.query(
            "UPDATE transaksi SET status_transaksi = 'Dibatalkan' WHERE transaksi_id = $1",
            [req.params.id]
        );

        await pool.query('COMMIT');
        res.status(200).json({ success: true, message: "Pesanan dibatalkan dan stok dikembalikan." });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("Deny payment error:", err);
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// CUSTOMER WEBSITE (Online Portal)
// ==========================================

// Customer Registration
app.post('/api/customer/auth/register', async (req, res) => {
    const { nama_pelanggan, email, password, nomor_telepon, alamat } = req.body;
    try {
        // Cek email exists
        const check = await pool.query("SELECT * FROM pelanggan WHERE email = $1", [email]);
        if (check.rows.length > 0) {
            return res.status(400).json({ message: 'Email sudah terdaftar' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const pelanggan_id = `PLG-${Date.now()}`; // Simple ID generation

        await pool.query(
            "INSERT INTO pelanggan (pelanggan_id, nama_pelanggan, email, password_hash, nomor_telepon, alamat) VALUES ($1, $2, $3, $4, $5, $6)",
            [pelanggan_id, nama_pelanggan, email, hashedPassword, nomor_telepon, alamat]
        );

        res.status(201).json({ success: true, message: 'Registrasi berhasil, silakan login.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Customer Login
app.post('/api/customer/auth/login', async (req, res) => {
    console.log("LOGIN ATTEMPT PAYLOAD:", req.body);
    const { email, password } = req.body;
    try {
        const results = await pool.query("SELECT * FROM pelanggan WHERE email = $1", [email]);
        if (results.rows.length === 0) {
            return res.status(401).json({ error: 'Email not registered.' });
        }

        const customer = results.rows[0];
        const isMatch = await bcrypt.compare(password, customer.password_hash);

        if (!isMatch) {
            return res.status(401).json({ error: 'Incorrect password.' });
        }

        const token = jwt.sign({ pelangganId: customer.pelanggan_id, role: 'customer' }, JWT_SECRET, { expiresIn: '7d' });
        
        // Save session token in db (Optional, for stricter validation)
        await pool.query("UPDATE pelanggan SET session_token = $1 WHERE pelanggan_id = $2", [token, customer.pelanggan_id]);

        res.json({ success: true, token, nama: customer.nama_pelanggan });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Browse Products
app.get('/api/customer/barang', async (req, res) => {
    try {
        const { kategori } = req.query;
        let queryStr = "SELECT barang_id, nama_barang, kategori, harga, stok FROM barang WHERE stok > 0";
        const queryParams = [];

        if (kategori && kategori !== 'Semua') {
            queryStr += " AND kategori = $1";
            queryParams.push(kategori);
        }

        const results = await pool.query(queryStr, queryParams);
        res.json(results.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Place Online Order
app.post('/api/customer/order', authenticateToken, authorizeRole('customer'), async (req, res) => {
    const { items, metode_pembayaran } = req.body; // items: [{ id_barang, jumlah }]
    const pelangganId = req.user.pelangganId;

    try {
        await pool.query('BEGIN');
        
        // Find a valid user_id to satisfy foreign key constraints
        const systemUserRes = await pool.query("SELECT user_id FROM users LIMIT 1");
        if (systemUserRes.rows.length === 0) {
            throw new Error("Cannot process order: No valid user_id found in the database to satisfy foreign key constraint.");
        }
        const defaultUserId = systemUserRes.rows[0].user_id;

        const transaksiId = 'TRX' + Date.now().toString().slice(-9);
        let totalHargaAll = 0;
        const processedItems = [];

        // Pass 1: Validate stock and calculate total BEFORE inserting anything
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            // ✅ PATCH: Added FOR UPDATE for row-level locking
            const cekStok = await pool.query("SELECT harga, stok FROM barang WHERE barang_id = $1 FOR UPDATE", [item.id_barang]);
            if (cekStok.rows.length === 0 || cekStok.rows[0].stok < item.jumlah) {
                throw new Error(`Stok tidak cukup untuk barang ${item.id_barang}`);
            }
            const harga = cekStok.rows[0].harga;
            const subtotal = harga * item.jumlah;
            totalHargaAll += subtotal;
            processedItems.push({ ...item, harga, subtotal });
        }

        // Pass 2: Insert Parent Record (transaksi) FIRST to satisfy detail_transaksi foreign key
        // ✅ PATCH: Dynamic status based on payment method
        const initialStatus = metode_pembayaran === 'TUNAI' ? 'Menunggu Pembayaran Kasir' : 'Pending';
        await pool.query(
            "INSERT INTO transaksi (transaksi_id, user_id, pelanggan_id, tanggal_transaksi, total_harga, metode_pembayaran, status_transaksi) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6)",
            [transaksiId, defaultUserId, pelangganId, totalHargaAll, metode_pembayaran, initialStatus]
        );

        // Pass 3: Insert Child Records (detail_transaksi) and Update Stock
        for (let index = 0; index < processedItems.length; index++) {
            const pItem = processedItems[index];
            const detailId = 'DTL' + Date.now().toString().slice(-9) + index;
            await pool.query(
                "INSERT INTO detail_transaksi (detail_id, transaksi_id, barang_id, jumlah_barang, harga_satuan, subtotal) VALUES ($1, $2, $3, $4, $5, $6)",
                [detailId, transaksiId, pItem.id_barang, pItem.jumlah, pItem.harga, pItem.subtotal]
            );
            await pool.query("UPDATE barang SET stok = stok - $1 WHERE barang_id = $2", [pItem.jumlah, pItem.id_barang]);
        }

        // Generate Midtrans Snap Token
        let snapToken = null;
        if (metode_pembayaran === 'QRIS') {
            const parameter = {
                "transaction_details": {
                    "order_id": transaksiId,
                    "gross_amount": totalHargaAll
                }
            };
            const transaction = await snap.createTransaction(parameter);
            snapToken = transaction.token;
        }

        await pool.query('COMMIT');
        res.json({ success: true, message: 'Pesanan berhasil dibuat', transaksi_id: transaksiId, token: snapToken });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("CHECKOUT CRASH REASON:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get Customer Profile
app.get('/api/customer/profile', authenticateToken, authorizeRole('customer'), async (req, res) => {
    const pelangganId = req.user.pelangganId;
    try {
        const results = await pool.query(
            "SELECT nama_pelanggan, email, nomor_telepon, alamat FROM pelanggan WHERE pelanggan_id = $1",
            [pelangganId]
        );
        if (results.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
        res.json(results.rows[0]);
    } catch (err) {
        console.error("Fetch profile error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Update Customer Profile
app.put('/api/customer/profile', authenticateToken, authorizeRole('customer'), async (req, res) => {
    const pelangganId = req.user.pelangganId;
    const { nama_pelanggan, nomor_telepon, alamat } = req.body;
    try {
        await pool.query(
            "UPDATE pelanggan SET nama_pelanggan = $1, nomor_telepon = $2, alamat = $3 WHERE pelanggan_id = $4",
            [nama_pelanggan, nomor_telepon, alamat, pelangganId]
        );
        res.json({ success: true, message: 'Profil berhasil diperbarui' });
    } catch (err) {
        console.error("Update profile error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get Customer Orders
app.get('/api/customer/orders', authenticateToken, authorizeRole('customer'), async (req, res) => {
    const pelangganId = req.user.pelangganId;
    try {
        const query = `
            SELECT transaksi_id, tanggal_transaksi, total_harga, status_transaksi 
            FROM transaksi 
            WHERE pelanggan_id = $1 
            ORDER BY tanggal_transaksi DESC
        `;
        const results = await pool.query(query, [pelangganId]);
        res.json(results.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Customer Order Details
app.get('/api/customer/orders/:id', authenticateToken, authorizeRole('customer'), async (req, res) => {
    const pelangganId = req.user.pelangganId;
    const transaksiId = req.params.id;
    try {
        const orderRes = await pool.query(
            "SELECT * FROM transaksi WHERE transaksi_id = $1 AND pelanggan_id = $2", 
            [transaksiId, pelangganId]
        );
        if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
        
        const detailsRes = await pool.query(
            "SELECT d.*, b.nama_barang FROM detail_transaksi d JOIN barang b ON d.barang_id = b.barang_id WHERE d.transaksi_id = $1", 
            [transaksiId]
        );
        
        const order = orderRes.rows[0];
        order.items = detailsRes.rows;
        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Retry Payment
app.post('/api/customer/orders/:id/pay', authenticateToken, authorizeRole('customer'), async (req, res) => {
    const pelangganId = req.user.pelangganId;
    const transaksiId = req.params.id;
    try {
        const orderRes = await pool.query(
            "SELECT * FROM transaksi WHERE transaksi_id = $1 AND pelanggan_id = $2", 
            [transaksiId, pelangganId]
        );
        if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
        const order = orderRes.rows[0];
        
        if (order.status_transaksi !== 'Pending') {
            return res.status(400).json({ error: 'Order is not pending' });
        }
        
        if (order.metode_pembayaran !== 'QRIS') {
            return res.status(400).json({ error: 'Only QRIS payments can be retried via Midtrans' });
        }

        const parameter = {
            "transaction_details": {
                "order_id": `${transaksiId}-${Math.floor(Math.random() * 10000)}`,
                "gross_amount": parseInt(order.total_harga)
            }
        };
        const transaction = await snap.createTransaction(parameter);
        res.json({ token: transaction.token });
    } catch (err) {
        console.error("Retry payment error:", err);
        res.status(500).json({ error: err.message });
    }
});


// Transition order status
app.post('/api/customer/orders/:id/transition', authenticateToken, authorizeRole('customer'), async (req, res) => {
    const pelangganId = req.user.pelangganId;
    const transaksiId = req.params.id;
    const { new_status } = req.body;
    
    try {
        const orderRes = await pool.query(
            "SELECT * FROM transaksi WHERE transaksi_id = $1 AND pelanggan_id = $2",
            [transaksiId, pelangganId]
        );
        if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
        
        await pool.query("UPDATE transaksi SET status_transaksi = $1 WHERE transaksi_id = $2", [new_status, transaksiId]);
        res.json({ success: true, message: `Status updated to ${new_status}` });
    } catch (err) {
        console.error("Transition error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Submit Review
app.post('/api/customer/reviews', authenticateToken, authorizeRole('customer'), async (req, res) => {
    const pelangganId = req.user.pelangganId;
    const { transaksi_id, barang_id, rating, komentar, review_text } = req.body;
    const ulasanText = komentar || review_text || '';
    
    try {
        const orderRes = await pool.query(
            "SELECT * FROM transaksi WHERE transaksi_id = $1 AND pelanggan_id = $2",
            [transaksi_id, pelangganId]
        );
        if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
        
        await pool.query('BEGIN');
        
        await pool.query(
            "INSERT INTO ulasan (transaksi_id, barang_id, rating, komentar) VALUES ($1, $2, $3, $4)",
            [transaksi_id, barang_id, rating, ulasanText]
        );
        
        await pool.query("UPDATE transaksi SET status_transaksi = 'Selesai' WHERE transaksi_id = $1", [transaksi_id]);
        
        await pool.query('COMMIT');
        res.json({ success: true, message: 'Review submitted and status updated to Selesai' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("Review error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Autocomplete Search
app.get('/api/customer/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    
    try {
        const results = await pool.query(
            "SELECT barang_id, nama_barang, harga FROM barang WHERE nama_barang ILIKE $1 LIMIT 5",
            [`%${q}%`]
        );
        res.json(results.rows);
    } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Midtrans Webhook
app.post('/api/midtrans/webhook', async (req, res) => {
    try {
        const statusResponse = await snap.transaction.notification(req.body);
        const realOrderId = statusResponse.order_id.split('-')[0];
        const transactionStatus = statusResponse.transaction_status;
        const fraudStatus = statusResponse.fraud_status;

        console.log(`Transaction notification received. Order ID: ${statusResponse.order_id} (Real: ${realOrderId}). Transaction status: ${transactionStatus}. Fraud status: ${fraudStatus}`);

        if (transactionStatus == 'capture') {
            if (fraudStatus == 'challenge') {
                // TODO set transaction status on your database to 'challenge'
            } else if (fraudStatus == 'accept') {
                // ✅ PATCH: Changed 'Paid' to 'Dikemas' to match SDD
                await pool.query("UPDATE transaksi SET status_transaksi = 'Dikemas' WHERE transaksi_id = $1", [realOrderId]);
            }
        } else if (transactionStatus == 'settlement') {
            // ✅ PATCH: Changed 'Paid' to 'Dikemas' to match SDD
            await pool.query("UPDATE transaksi SET status_transaksi = 'Dikemas' WHERE transaksi_id = $1", [realOrderId]);
        } else if (transactionStatus == 'cancel' || transactionStatus == 'deny' || transactionStatus == 'expire') {
            await pool.query("UPDATE transaksi SET status_transaksi = 'Cancelled' WHERE transaksi_id = $1", [realOrderId]);
        } else if (transactionStatus == 'pending') {
            await pool.query("UPDATE transaksi SET status_transaksi = 'Pending' WHERE transaksi_id = $1", [realOrderId]);
        }
        res.status(200).send('OK');
    } catch (err) {
        console.error("Webhook error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// CASHIER DASHBOARD (KIOSK MONITORING)
// ==========================================

app.get('/api/cashier/pending', async (req, res) => {
    try {
        const query = `
            SELECT t.transaksi_id, t.tanggal_transaksi, t.total_harga, t.status_transaksi,
                json_agg(json_build_object(
                    'nama_barang', b.nama_barang,
                    'jumlah_barang', d.jumlah_barang,
                    'subtotal', d.subtotal
                )) as items
            FROM transaksi t
            LEFT JOIN detail_transaksi d ON t.transaksi_id = d.transaksi_id
            LEFT JOIN barang b ON d.barang_id = b.barang_id
            WHERE t.status_transaksi = 'Pending' AND t.metode_pembayaran = 'Tunai'
            GROUP BY t.transaksi_id
            ORDER BY t.tanggal_transaksi ASC
        `;
        const results = await pool.query(query);
        res.json(results.rows);
    } catch (err) {
        console.error("Fetch cashier pending error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/cashier/update-status', async (req, res) => {
    const { transaction_id, new_status } = req.body;
    
    try {
        await pool.query('BEGIN');

        // 1. Update the transaction status
        await pool.query(
            "UPDATE transaksi SET status_transaksi = $1 WHERE transaksi_id = $2",
            [new_status, transaction_id]
        );

        // 2. ONLY if the new status is 'Selesai', deduct the stock
        if (new_status === 'Selesai') {
            // Get the items for this specific transaction
            const detailRes = await pool.query(
                "SELECT barang_id, jumlah_barang FROM detail_transaksi WHERE transaksi_id = $1",
                [transaction_id]
            );

            // Loop and deduct
            for (let i = 0; i < detailRes.rows.length; i++) {
                const item = detailRes.rows[i];
                await pool.query(
                    "UPDATE barang SET stok = stok - $1 WHERE barang_id = $2",
                    [item.jumlah_barang, item.barang_id]
                );
            }
        }

        await pool.query('COMMIT');
        res.json({ success: true, message: `Status updated to ${new_status} and stock adjusted if necessary.` });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("Update cashier status error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// KIOSK POS (WALK-IN CHECKOUT)
// ==========================================
app.post('/api/checkout', async (req, res) => {
    const { user_id, metode_pembayaran, status_transaksi, total_harga, items } = req.body;
    
    try {
        await pool.query('BEGIN');
        
        const transaksiId = 'TRX' + Date.now().toString().slice(-9);
        
        // 1. Insert into transaksi
        await pool.query(
            "INSERT INTO transaksi (transaksi_id, user_id, pelanggan_id, tanggal_transaksi, total_harga, metode_pembayaran, status_transaksi) VALUES ($1, $2, null, CURRENT_TIMESTAMP, $3, $4, $5)",
            [transaksiId, user_id, total_harga, metode_pembayaran, status_transaksi]
        );
        
        // 2. Insert details and update stock
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const detailId = 'DTL' + Date.now().toString().slice(-9) + i;
            
            await pool.query(
                "INSERT INTO detail_transaksi (detail_id, transaksi_id, barang_id, jumlah_barang, harga_satuan, subtotal) VALUES ($1, $2, $3, $4, $5, $6)",
                [detailId, transaksiId, item.barang_id, item.jumlah_barang, item.harga_satuan, item.subtotal]
            );
            
            await pool.query(
                "UPDATE barang SET stok = stok - $1 WHERE barang_id = $2",
                [item.jumlah_barang, item.barang_id]
            );
        }
        
        await pool.query('COMMIT');
        res.json({ success: true, message: 'Kiosk checkout berhasil', transaksi_id: transaksiId });
        
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("KIOSK CHECKOUT ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});
