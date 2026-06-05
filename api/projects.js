const fs = require('fs');
const path = require('path');
const os = require('os');

const baseId = 'appRCHodktJeOp8vm';
const tableIdOrName = encodeURIComponent('Clean Studio Setups');

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

module.exports = async function handler(req, res) {
    // Standard Vercel Serverless Function using CommonJS and global fetch (Node 18+)
    if (req.method === 'GET') {
        try {
            const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableIdOrName}`, {
                headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_ACCESS_TOKEN}` }
            });
            const data = await response.json();
            
            const projects = {};
            if (data.records) {
                data.records.forEach(record => {
                    const name = record.fields['Project Name'];
                    const rawJson = record.fields['Raw JSON'];
                    if (name) {
                        try {
                            const parsed = rawJson ? JSON.parse(rawJson) : [];
                            projects[name] = { data: parsed, recordId: record.id };
                        } catch(e) {
                            console.error(`Error parsing JSON for project ${name}:`, e);
                            projects[name] = { data: [], recordId: record.id };
                        }
                    } else {
                        console.warn(`Skipping record ${record.id} because it has no 'Project Name'.`);
                    }
                });
            }
            res.status(200).json(projects);
        } catch(err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch projects' });
        }
    } else if (req.method === 'POST') {
        const { currentProject, data, summaries = {}, recordId } = req.body;
        
        const artistAndDates = data[0] || '';
        const collab = data[1] || '';
        const asst = data[2] || '';
        const notes = data[3] || '';

        const rawArray = [...data];
        
        const attachments = [];
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        if (Array.isArray(data)) {
            for (const item of data) {
                if (typeof item === 'string' && item.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(item);
                        if (Array.isArray(parsed)) {
                            for (const file of parsed) {
                                if (file && file.url && typeof file.url === 'string' && file.url.startsWith('/uploads/')) {
                                    const filename = path.basename(file.url);
                                    
                                    // Try local folder first
                                    let filePath = path.join(__dirname, '..', 'uploads', filename);
                                    if (!fs.existsSync(filePath)) {
                                        // Try tmp folder (Vercel)
                                        filePath = path.join(os.tmpdir(), filename);
                                    }
                                    
                                    let publicUrl = file.publicUrl || null;
                                    if (!publicUrl && fs.existsSync(filePath)) {
                                        console.log(`Uploading file ${filename} from local path to tmpfiles.org...`);
                                        publicUrl = await uploadToTmpFiles(filePath, filename);
                                    }
                                    
                                    if (!publicUrl) {
                                        // Fallback to absolute Vercel URL
                                        publicUrl = file.url.startsWith('http') ? file.url : `${baseUrl}${file.url}`;
                                    }
                                    
                                    attachments.push({
                                        url: publicUrl,
                                        filename: file.filename || 'file'
                                    });
                                }
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            }
        }
        
        const fields = {
            "Project Name": currentProject,
            "Artist & Dates": typeof artistAndDates === 'string' ? artistAndDates : '',
            "Collaborators": typeof collab === 'string' ? collab : '',
            "Assistants": typeof asst === 'string' ? asst : '',
            "Notes": typeof notes === 'string' ? notes : '',
            "Pulp Prep Summary": summaries["Pulp Prep Summary"] || '',
            "Additives Summary": summaries["Additives Summary"] || '',
            "Techniques Summary": summaries["Techniques Summary"] || '',
            "Setup Summary": summaries["Setup Summary"] || '',
            "Moulds & Deckles Summary": summaries["Moulds & Deckles Summary"] || '',
            "Raw JSON": JSON.stringify(rawArray),
            "Attachment": attachments
        };

        try {
            let method = 'POST';
            let url = `https://api.airtable.com/v0/${baseId}/${tableIdOrName}`;
            
            const payload = {
                records: [{ fields }],
                typecast: true
            };

            if (recordId) {
                method = 'PATCH';
                payload.records[0].id = recordId;
            }

            let response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${process.env.AIRTABLE_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            let result = await response.json();

            // Self-healing fallback if Attachment column is not configured in Airtable
            if (!response.ok && result.error && result.error.type === 'UNKNOWN_FIELD_NAME' && result.error.message.includes('Attachment')) {
                console.warn("Airtable Attachment field does not exist. Retrying save without attachment...");
                delete fields["Attachment"];
                payload.records[0].fields = fields;
                
                response = await fetch(url, {
                    method,
                    headers: {
                        'Authorization': `Bearer ${process.env.AIRTABLE_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                result = await response.json();
                
                if (response.ok) {
                    result.warning = "To save uploaded files directly as attachments in Airtable, please add a column named 'Attachment' of type 'Attachment' in your Airtable table.";
                }
            }

            if (!response.ok) {
                console.error("Airtable API error:", result);
                return res.status(response.status).json(result);
            }
            res.status(200).json(result);
        } catch(err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to save project' });
        }
    } else if (req.method === 'DELETE') {
        const { recordId } = req.body;
        if (!recordId) return res.status(400).json({ error: 'No recordId provided' });
        
        try {
            const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableIdOrName}/${recordId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_ACCESS_TOKEN}` }
            });
            const result = await response.json();
            if (!response.ok) {
                console.error("Airtable DELETE error:", result);
                return res.status(response.status).json(result);
            }
            res.status(200).json(result);
        } catch(err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete project' });
        }
    } else {
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
};
