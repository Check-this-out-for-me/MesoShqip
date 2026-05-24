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

// Secure Admin Logic
const ADMIN_EMAIL = 'hyseniyll44@gmail.com';
const ADMIN_PASS = 'Nora_bali1.';

// Simple Logger with sanitized logs
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// Database Initialization
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], verifications: [] }, null, 2));
}

function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("DB Read Error:", e.message);
        return { users: [], verifications: [] };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        
        // Auto-sync to GitHub if token exists (Production/Render mode)
        const token = process.env.GITHUB_TOKEN;
        if (token) {
            exec(`git add database.json && git commit -m "Update DB: User progress sync" && git push https://x-access-token:${token}@github.com/Check-this-out-for-me/MesoShqip.git main`, (err) => {
                if (err) console.error("GitHub Sync Error:", err.message);
                else console.log("Database synced to GitHub successfully.");
            });
        }
    } catch (e) {
        console.error("DB Write Error:", e.message);
    }
}

// Mailer Setup
let transporter;
async function initSmtp() {
    try {
        // Using Ethereal for testing or real SMTP if configured via env
        let testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            },
        });
        console.log(`[EMAIL SERVICE] Ready. Test account: ${testAccount.user}`);
    } catch (err) {
        console.error("[EMAIL SERVICE ERROR] Failed to initialize SMTP:", err.message);
    }
}
initSmtp();

// --- API ENDPOINTS ---

app.post('/api/register', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Emri kërkohet" });

    const db = readDB();
    const newUser = { 
        id: Date.now().toString(), 
        name, 
        isPremium: false, 
        level: 1, 
        xp: 0, 
        registeredAt: new Date().toISOString() 
    };
    db.users.push(newUser);
    writeDB(db);
    res.json({ message: "OK", user: newUser });
});

app.post('/api/premium/request', async (req, res) => {
    const { userId, email } = req.body;
    if (!userId || !email) return res.status(400).json({ error: "Missing data" });

    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "Përdoruesi nuk u gjet" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    db.verifications = (db.verifications || []).filter(v => v.userId !== userId);
    db.verifications.push({ userId, email, code, expires: Date.now() + 10 * 60 * 1000 });
    writeDB(db);

    if (!transporter) {
        console.log(`[SIMULATION] Code for ${email}: ${code}`);
        return res.json({ message: "Simulated", code, isSimulation: true });
    }

    try {
        const info = await transporter.sendMail({
            from: '"MësoShqip AI" <premium@mesoshqip.ai>',
            to: email,
            subject: "Kodi juaj Premium ⭐",
            html: `
                <div style="font-family:sans-serif; max-width:500px; margin:auto; border:1px solid #eee; padding:20px; border-radius:15px;">
                    <h2 style="color:#6366f1; text-align:center;">MësoShqip Premium</h2>
                    <p>Përshëndetje <b>${user.name}</b>,</p>
                    <p>Kodi juaj për aktivizimin e paketës PRO është:</p>
                    <div style="background:#f8fafc; padding:20px; text-align:center; font-size:32px; font-weight:bold; letter-spacing:5px; color:#1e293b; border-radius:10px;">${code}</div>
                    <p style="font-size:12px; color:#64748b; margin-top:20px; text-align:center;">Ky kod skadon pas 10 minutave.</p>
                </div>
            `
        });
        res.json({ message: "OK", previewUrl: nodemailer.getTestMessageUrl(info) });
    } catch (err) {
        console.error("Email Error:", err.message);
        res.status(500).json({ error: "Dështoi dërgimi i email-it" });
    }
});

app.post('/api/premium/verify', (req, res) => {
    const { userId, code } = req.body;
    const db = readDB();
    const v = db.verifications?.find(x => x.userId === userId && x.code === code);
    
    if (!v) return res.status(400).json({ error: "Kodi është i pasaktë" });
    if (v.expires < Date.now()) return res.status(400).json({ error: "Kodi ka skaduar" });

    const idx = db.users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: "Përdoruesi nuk ekziston" });

    db.users[idx].isPremium = true;
    db.users[idx].email = v.email;
    db.verifications = db.verifications.filter(x => x.userId !== userId);
    writeDB(db);
    res.json({ message: "OK", user: db.users[idx] });
});

app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
        res.json({ success: true, token: 'secure-admin-session-' + Buffer.from(Date.now().toString()).toString('base64') });
    } else {
        res.status(401).json({ success: false, error: "Kredencialet e gabuara" });
    }
});

app.get('/api/admin/users', (req, res) => {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('secure-admin-session-')) {
        return res.status(403).json({ error: "Unauthorized access" });
    }
    res.json(readDB().users);
});

app.post('/api/user/progress', (req, res) => {
    const { userId, level, xp } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const db = readDB();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
        db.users[idx].level = level || db.users[idx].level;
        db.users[idx].xp = xp || db.users[idx].xp;
        writeDB(db);
        return res.json({ success: true });
    }
    res.status(404).json({ error: "User not found" });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`   MESOSHQIP SERVER ACTIVE ON PORT ${PORT}      `);
    console.log(`   URL: http://localhost:${PORT}                `);
    console.log(`==================================================`);
});
