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

// Atomic Sync Logic for GitHub (Production)
let isSyncing = false;
let pendingSync = false;

function triggerGitHubSync() {
    const token = process.env.GITHUB_TOKEN;
    if (!token || isSyncing) {
        if (token) pendingSync = true;
        return;
    }
    isSyncing = true;
    exec(`git add database.json && git commit -m "Sync: User progress update" && git push https://x-access-token:${token}@github.com/Check-this-out-for-me/MesoShqip.git main`, (err) => {
        isSyncing = false;
        if (pendingSync) { pendingSync = false; triggerGitHubSync(); }
    });
}

// Database Utils
function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) return { users: [], verifications: [] };
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) { return { users: [], verifications: [] }; }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        triggerGitHubSync();
    } catch (e) { console.error("DB Save Error"); }
}

// SMTP Setup
let transporter;
async function initSmtp() {
    try {
        let testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email", port: 587, secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass },
        });
        console.log(`[MAIL] Ready: ${testAccount.user}`);
    } catch (err) { console.log("[MAIL] Simulation mode active"); }
}
initSmtp();

// --- API ---

app.post('/api/register', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Emri kërkohet" });
    const db = readDB();
    const newUser = { id: Date.now().toString(), name, isPremium: false, level: 1, xp: 0, registeredAt: new Date().toISOString() };
    db.users.push(newUser);
    writeDB(db);
    res.json({ user: newUser });
});

app.post('/api/premium/request', async (req, res) => {
    const { userId, email } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "Jo gjetur" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    db.verifications = (db.verifications || []).filter(v => v.userId !== userId);
    db.verifications.push({ userId, email, code, expires: Date.now() + 600000 });
    writeDB(db);

    if (!transporter) return res.json({ isSimulation: true, code });

    try {
        const info = await transporter.sendMail({
            from: '"MësoShqip AI" <noreply@mesoshqip.ai>',
            to: email,
            subject: "Kodi juaj Premium ⭐",
            html: `<h3>Kodi: ${code}</h3>`
        });
        res.json({ previewUrl: nodemailer.getTestMessageUrl(info) });
    } catch (e) { res.status(500).json({ error: "Mail failed" }); }
});

app.post('/api/premium/verify', (req, res) => {
    const { userId, code } = req.body;
    const db = readDB();
    const v = db.verifications?.find(x => x.userId === userId && x.code === code);
    if (!v || v.expires < Date.now()) return res.status(400).json({ error: "Kodi i gabuar" });

    const idx = db.users.findIndex(u => u.id === userId);
    db.users[idx].isPremium = true;
    db.users[idx].email = v.email;
    db.verifications = db.verifications.filter(x => x.userId !== userId);
    writeDB(db);
    res.json({ user: db.users[idx] });
});

app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
        res.json({ success: true, token: 'admin_' + Date.now() });
    } else res.status(401).json({ error: "GABIM" });
});

app.get('/api/admin/users', (req, res) => {
    if (!req.headers.authorization?.startsWith('admin_')) return res.status(403).send();
    res.json(readDB().users);
});

app.post('/api/user/progress', (req, res) => {
    const { userId, level, xp } = req.body;
    const db = readDB();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
        db.users[idx].level = Math.max(db.users[idx].level, level || 1);
        db.users[idx].xp = xp || 0;
        writeDB(db);
        res.json({ success: true });
    } else res.status(404).send();
});

app.get('*any', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Server on ${PORT}`));
