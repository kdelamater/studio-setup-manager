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

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (index.html, etc.) from the root directory
app.use(express.static(__dirname));

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
