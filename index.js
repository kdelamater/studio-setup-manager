const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Standard Vercel Serverless Function behavior uses global fetch in Node 18+
// If using an older version of Node, we polyfill with node-fetch
if (!global.fetch) {
    global.fetch = require('node-fetch');
}

const multer = require('multer');
const fs = require('fs');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist (use tmp in Vercel serverless)
const uploadDir = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (index.html, etc.) from the root directory
app.use(express.static(__dirname));

// Custom uploads route with Airtable S3 fallback redirect
app.get('/uploads/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(uploadDir, filename);
    
    if (fs.existsSync(filepath)) {
        return res.sendFile(filepath);
    }
    
    // Fallback: search Airtable for this attachment and redirect
    try {
        const baseId = 'appRCHodktJeOp8vm';
        const tableIdOrName = encodeURIComponent('Clean Studio Setups');
        const token = process.env.AIRTABLE_ACCESS_TOKEN;
        
        if (token) {
            const airtableRes = await fetch(`https://api.airtable.com/v0/${baseId}/${tableIdOrName}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await airtableRes.json();
            
            if (data.records) {
                for (const record of data.records) {
                    const attachments = record.fields['Attachment'];
                    if (Array.isArray(attachments)) {
                        const found = attachments.find(att => att.filename === filename || (att.url && att.url.includes(filename)));
                        if (found && found.url) {
                            console.log(`Redirecting to Airtable URL: ${found.url}`);
                            return res.redirect(found.url);
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error in uploads fallback redirect:", e);
    }
    
    res.status(404).send('File not found');
});

// Helper to upload to tmpfiles.org
async function uploadToTmpFiles(filePath, fileName) {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const formData = new FormData();
        const blob = new Blob([fileBuffer]);
        formData.append('file', blob, fileName);
        
        const res = await fetch('https://tmpfiles.org/api/v1/upload', {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            const json = await res.json();
            if (json.status === 'success' && json.data && json.data.url) {
                return json.data.url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
            }
        }
        console.error(`tmpfiles.org upload status ${res.status}`);
    } catch (e) {
        console.error("Failed to upload to tmpfiles.org:", e);
    }
    return null;
}

// Route file uploads
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    const filePath = req.file.path;
    
    console.log(`Uploading newly uploaded file ${req.file.filename} to tmpfiles.org...`);
    const publicUrl = await uploadToTmpFiles(filePath, req.file.filename);
    
    res.status(200).json({
        url: fileUrl,
        publicUrl: publicUrl,
        filename: req.file.originalname
    });
});


// Import the API handler
const projectsHandler = require('./api/projects');

// Route API requests to the handler
// The frontend calls /api/projects
app.all('/api/projects', async (req, res) => {
    try {
        await projectsHandler(req, res);
    } catch (error) {
        console.error('Error in projects handler:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



app.listen(port, () => {
    console.log(`\n🚀 Dev server running at http://localhost:${port}`);
    console.log(`   Serving static files from: ${__dirname}\n`);
});
