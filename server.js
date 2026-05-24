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

// Atomic Sync Lock to prevent Git conflicts during high traffic
let isSyncing = false;
let pendingSync = false;

app.use((req, res, next) => {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${req.method} ${req.url}`);
    next();
});

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
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        triggerGitHubSync();
    } catch (e) {
        console.error("DB Save Error:", e.message);
    }
}

function triggerGitHubSync() {
    const token = process.env.GITHUB_TOKEN;
    if (!token || isSyncing) {
        if (token) pendingSync = true;
        return;
    }

    isSyncing = true;
    const cmd = `git add database.json && git commit -m "Auto-sync: DB update" && git push https://x-access-token:${token}@github.com/Check-this-out-for-me/MesoShqip.git main`;
    
    exec(cmd, (err) => {
        isSyncing = false;
        if (err) console.error("Sync Error:", err.message);
        else console.log("GitHub Sync Success");
        
        if (pendingSync) {
            pendingSync = false;
            triggerGitHubSync();
        }
    });
}

let transporter;
let smtpStatus = "Initializing";

async function initSmtp() {
    try {
        let testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email", port: 587, secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass },
        });
        smtpStatus = "Ready";
        console.log(`[MAIL] Service Ready: ${testAccount.user}`);
    } catch (err) {
        smtpStatus = "Simulation Mode";
        console.error("[MAIL] Error, using Simulation.");
    }
}
initSmtp();

// --- API ---

app.post('/api/register', (req, res) => {
    const { name } = req.body;
    if (!name || name.length < 2) return res.status(400).json({ error: "Emri i pavlefshëm" });

    const db = readDB();
    const newUser = { 
        id: Date.now().toString(), 
        name: name.substring(0, 50), 
        isPremium: false, level: 1, xp: 0, 
        registeredAt: new Date().toISOString() 
    };
    db.users.push(newUser);
    writeDB(db);
    res.json({ message: "OK", user: newUser });
});

app.post('/api/premium/request', async (req, res) => {
    const { userId, email } = req.body;
    if (!userId || !email) return res.status(400).json({ error: "Të dhënat mungojnë" });

    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "Përdoruesi nuk u gjet" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    db.verifications = (db.verifications || []).filter(v => v.userId !== userId);
    db.verifications.push({ userId, email, code, expires: Date.now() + 600000 });
    writeDB(db);

    if (!transporter) {
        console.log(`[DEMO CODE] ${email} -> ${code}`);
        return res.json({ message: "Simulated", code, isSimulation: true });
    }

    try {
        const info = await transporter.sendMail({
            from: '"MësoShqip AI" <noreply@mesoshqip.ai>',
            to: email,
            subject: "Kodi juaj Premium ⭐",
            html: `<div style="padding:20px;border:1px solid #eee;border-radius:10px;font-family:sans-serif;">
                <h2>MësoShqip Premium</h2>
                <p>Kodi juaj: <b style="font-size:24px;">${code}</b></p>
            </div>`
        });
        res.json({ message: "OK", previewUrl: nodemailer.getTestMessageUrl(info) });
    } catch (err) {
        res.status(500).json({ error: "Dështoi dërgimi" });
    }
});

app.post('/api/premium/verify', (req, res) => {
    const { userId, code } = req.body;
    const db = readDB();
    const v = db.verifications?.find(x => x.userId === userId && x.code === code);
    
    if (!v || v.expires < Date.now()) return res.status(400).json({ error: "Kodi i pavlefshëm" });

    const idx = db.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
        db.users[idx].isPremium = true;
        db.users[idx].email = v.email;
        db.verifications = db.verifications.filter(x => x.userId !== userId);
        writeDB(db);
        return res.json({ message: "OK", user: db.users[idx] });
    }
    res.status(404).json({ error: "User error" });
});

app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
        const token = 'admin_' + Buffer.from(Date.now().toString()).toString('hex');
        res.json({ success: true, token });
    } else res.status(401).json({ error: "GABIM" });
});

app.get('/api/admin/users', (req, res) => {
    if (!req.headers.authorization?.startsWith('admin_')) return res.status(403).send("No");
    res.json(readDB().users);
});

app.post('/api/user/progress', (req, res) => {
    const { userId, level, xp } = req.body;
    const db = readDB();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
        db.users[idx].level = Math.max(db.users[idx].level, level || 0);
        db.users[idx].xp = Math.max(db.users[idx].xp, xp || 0);
        writeDB(db);
        res.json({ success: true });
    } else res.status(404).send("No");
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`[SERVER] Active on port ${PORT}`));
