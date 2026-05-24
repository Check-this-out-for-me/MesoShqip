const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 5001;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

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
}

let transporter;
let isSmtpReady = false;

// Pre-create transporter
async function initSmtp() {
    try {
        console.log("Duke krijuar llogarine testuese SMTP...");
        let testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false, 
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });
        isSmtpReady = true;
        console.log(`[EMAIL] SMTP Gati: ${testAccount.user}`);
    } catch (err) {
        console.error("[EMAIL ERROR] Deshtoi SMTP:", err.message);
    }
}
initSmtp();

app.post('/api/register', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Emri kërkohet" });
    const db = readDB();
    const newUser = { id: Date.now().toString(), name, isPremium: false, registeredAt: new Date().toISOString() };
    db.users.push(newUser);
    writeDB(db);
    res.json({ message: "OK", user: newUser });
});

app.post('/api/premium/request', async (req, res) => {
    try {
        const { userId, email } = req.body;
        console.log(`Kerkesë Premium: ${userId} (${email})`);
        
        const db = readDB();
        const user = db.users.find(u => u.id === userId);
        if (!user) return res.status(404).json({ error: "Përdoruesi nuk u gjet" });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        db.verifications = (db.verifications || []).filter(v => v.userId !== userId);
        db.verifications.push({ userId, email, code, expires: Date.now() + 10 * 60 * 1000 });
        writeDB(db);

        if (!isSmtpReady || !transporter) {
            console.log(`[SIMULATION] Kodi: ${code}`);
            return res.json({ message: "OK (Simulated)", code, isSimulation: true });
        }

        const info = await transporter.sendMail({
            from: '"MësoShqip AI" <premium@mesoshqip.ai>',
            to: email,
            subject: "Kodi Premium ⭐",
            html: `<h2 style="color:#6366f1;">MësoShqip Premium</h2><p>Përshëndetje ${user.name}, kodi juaj i aktivizimit është: <b>${code}</b></p>`
        });

        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`Email dërguar. Kodi: ${code}. Preview: ${previewUrl}`);
        res.json({ message: "OK", previewUrl });
    } catch (err) {
        console.error("API ERROR:", err);
        res.status(500).json({ error: "Gabim në server" });
    }
});

app.post('/api/premium/verify', (req, res) => {
    const { userId, code } = req.body;
    const db = readDB();
    const v = db.verifications?.find(x => x.userId === userId && x.code === code);
    if (!v || v.expires < Date.now()) return res.status(400).json({ error: "Kodi i pasaktë" });

    const uIdx = db.users.findIndex(u => u.id === userId);
    db.users[uIdx].isPremium = true;
    db.users[uIdx].email = v.email;
    db.verifications = db.verifications.filter(x => x.userId !== userId);
    writeDB(db);
    res.json({ message: "OK", user: db.users[uIdx] });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Serveri po punon ne http://localhost:${PORT}`));
