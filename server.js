const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5001;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], verifications: [] }, null, 2));
}

function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { users: [], verifications: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Mailer Setup with Fallback
let transporter;
async function getTransporter() {
    if (transporter) return transporter;
    try {
        let testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false, 
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
            connectionTimeout: 10000, // 10s
        });
        console.log(`[EMAIL] SMTP test account: ${testAccount.user}`);
        return transporter;
    } catch (err) {
        console.error("[EMAIL ERROR] Failed to create test account:", err.message);
        return null;
    }
}

app.post('/api/register', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const db = readDB();
    const newUser = { id: Date.now().toString(), name, email: null, isPremium: false, registeredAt: new Date().toISOString() };
    db.users.push(newUser);
    writeDB(db);
    res.json({ message: "Registered", user: newUser });
});

app.post('/api/premium/request', async (req, res) => {
    const { userId, email } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    if (!db.verifications) db.verifications = [];
    db.verifications = db.verifications.filter(v => v.userId !== userId);
    db.verifications.push({ userId, email, code, expires: Date.now() + 10 * 60 * 1000 });
    writeDB(db);

    const mailer = await getTransporter();
    if (!mailer) {
        // Fallback: Simulation if Ethereal fails
        console.log(`[SIMULATION] Code for ${email}: ${code}`);
        return res.json({ message: "Simulation Mode: Code generated", previewUrl: "#", isSimulation: true, code });
    }

    try {
        const info = await mailer.sendMail({
            from: '"MësoShqip" <premium@mesoshqip.ai>',
            to: email,
            subject: "Verifikimi Premium ⭐",
            html: `<div style="font-family:sans-serif;padding:20px;border:1px solid #ddd;border-radius:12px;max-width:400px;margin:auto;">
                <h2 style="color:#6366f1;text-align:center;">MësoShqip Premium</h2>
                <p>Kodi juaj i verifikimit është:</p>
                <div style="background:#f3f4f6;padding:15px;text-align:center;font-size:28px;font-weight:bold;letter-spacing:4px;border-radius:8px;">${code}</div>
                <p style="font-size:12px;color:#888;margin-top:20px;text-align:center;">Ky kod skadon pas 10 minutave.</p>
            </div>`
        });
        const previewUrl = nodemailer.getTestMessageUrl(info);
        res.json({ message: "Code sent", previewUrl });
    } catch (err) {
        console.error("[EMAIL SEND ERROR]", err.message);
        res.status(500).json({ error: "Dështoi dërgimi i email-it. Provoni përsëri." });
    }
});

app.post('/api/premium/verify', (req, res) => {
    const { userId, code } = req.body;
    const db = readDB();
    const verification = db.verifications?.find(v => v.userId === userId && v.code === code);
    if (!verification || verification.expires < Date.now()) return res.status(400).json({ error: "Kodi i pasaktë ose i skaduar" });
    const userIndex = db.users.findIndex(u => u.id === userId);
    db.users[userIndex].isPremium = true;
    db.users[userIndex].email = verification.email;
    db.verifications = db.verifications.filter(v => v.userId !== userId);
    writeDB(db);
    res.json({ message: "Success", user: db.users[userIndex] });
});

app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'hyseniyll44@gmail.com' && password === 'Nora_bali1.') res.json({ success: true, token: 'admin-token-12345' });
    else res.status(401).json({ error: "Gabim" });
});

app.get('/api/admin/users', (req, res) => {
    if (req.headers.authorization !== 'admin-token-12345') return res.status(401).json({ error: "Jo" });
    res.json(readDB().users);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
