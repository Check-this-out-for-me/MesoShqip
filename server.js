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

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], verifications: [] }, null, 2));
}

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { users: [], verifications: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    
    // Auto-sync to GitHub if token exists (Render mode)
    const token = process.env.GITHUB_TOKEN;
    if (token) {
        exec(`git add database.json && git commit -m "Update DB: User activity" && git push https://x-access-token:${token}@github.com/Check-this-out-for-me/MesoShqip.git main`, (err) => {
            if (err) console.error("GitHub Sync Error:", err);
            else console.log("DB Synced to GitHub");
        });
    }
}

let transporter;
async function initSmtp() {
    try {
        let testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email", port: 587, secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass },
        });
        console.log(`[EMAIL] Ready: ${testAccount.user}`);
    } catch (err) { console.error("SMTP Init failed"); }
}
initSmtp();

app.post('/api/register', (req, res) => {
    const { name } = req.body;
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
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    db.verifications = (db.verifications || []).filter(v => v.userId !== userId);
    db.verifications.push({ userId, email, code, expires: Date.now() + 10 * 60 * 1000 });
    writeDB(db);

    if (!transporter) return res.json({ message: "Simulated", code, isSimulation: true });

    try {
        const info = await transporter.sendMail({
            from: '"MësoShqip AI" <premium@mesoshqip.ai>',
            to: email,
            subject: "Kodi Premium ⭐",
            html: `<h2 style="color:#6366f1;">MësoShqip Premium</h2><p>Kodi juaj: <b>${code}</b></p>`
        });
        res.json({ message: "OK", previewUrl: nodemailer.getTestMessageUrl(info) });
    } catch (err) { res.status(500).json({ error: "Email failed" }); }
});

app.post('/api/premium/verify', (req, res) => {
    const { userId, code } = req.body;
    const db = readDB();
    const v = db.verifications?.find(x => x.userId === userId && x.code === code);
    if (!v) return res.status(400).json({ error: "Kodi i gabuar" });

    const idx = db.users.findIndex(u => u.id === userId);
    db.users[idx].isPremium = true;
    db.users[idx].email = v.email;
    db.verifications = db.verifications.filter(x => x.userId !== userId);
    writeDB(db);
    res.json({ message: "OK", user: db.users[idx] });
});

// Corrected Admin Login
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
        res.json({ success: true, token: 'secure-admin-session-' + Date.now() });
    } else {
        res.status(401).json({ success: false, error: "Kredencialet e gabuara" });
    }
});

app.get('/api/admin/users', (req, res) => {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('secure-admin-session-')) return res.status(403).json({ error: "Unauthorized" });
    res.json(readDB().users);
});

// Update User Progress (Levels/XP)
app.post('/api/user/progress', (req, res) => {
    const { userId, level, xp } = req.body;
    const db = readDB();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
        db.users[idx].level = level;
        db.users[idx].xp = xp;
        writeDB(db);
    }
    res.json({ success: true });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`MesoShqip Server running on port ${PORT}`));
