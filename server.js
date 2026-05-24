const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 5001; // Using 5001 to avoid conflicts
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }, null, 2));
}

function readDB() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// User Registration
app.post('/api/register', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const db = readDB();
    const newUser = {
        id: Date.now().toString(),
        name,
        isPremium: false,
        registeredAt: new Date().toISOString()
    };
    db.users.push(newUser);
    writeDB(db);

    res.json({ message: "Registered successfully", user: newUser });
});

// Upgrade to Premium (Simulation)
app.post('/api/upgrade', (req, res) => {
    const { userId } = req.body;
    const db = readDB();
    const userIndex = db.users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) return res.status(404).json({ error: "User not found" });

    db.users[userIndex].isPremium = true;
    writeDB(db);

    res.json({ message: "Upgraded to Premium!", user: db.users[userIndex] });
});

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'hyseniyll44@gmail.com' && password === 'Nora_bali1.') {
        res.json({ success: true, token: 'admin-token-12345' });
    } else {
        res.status(401).json({ error: "Invalid credentials" });
    }
});

// Get Users (Admin only)
app.get('/api/admin/users', (req, res) => {
    const token = req.headers.authorization;
    if (token !== 'admin-token-12345') {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const db = readDB();
    res.json(db.users);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Serveri i MësoShqip po punon në http://localhost:${PORT}`);
});
