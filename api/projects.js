const baseId = 'appRCHodktJeOp8vm';
const tableIdOrName = encodeURIComponent('Studio Setups');

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
                    if (name && rawJson) {
                        try {
                            const parsed = JSON.parse(rawJson);
                            parsed._recordId = record.id;
                            projects[name] = parsed;
                        } catch(e) {}
                    }
                });
            }
            res.status(200).json(projects);
        } catch(err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch projects' });
        }
    } else if (req.method === 'POST') {
        const { currentProject, data } = req.body;
        
        const artistAndDates = data[0] || '';
        const collab = data[1] || '';
        const asst = data[2] || '';
        const notes = data[3] || '';

        const recordId = data._recordId;
        const rawArray = [...data];
        
        const fields = {
            "Project Name": currentProject,
            "Artist": typeof artistAndDates === 'string' ? artistAndDates : '',
            "Studio Dates": '',
            "Collaborators": typeof collab === 'string' ? collab : '',
            "Assistants": typeof asst === 'string' ? asst : '',
            "Notes": typeof notes === 'string' ? notes : '',
            "Raw JSON": JSON.stringify(rawArray)
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

            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${process.env.AIRTABLE_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            res.status(200).json(result);
        } catch(err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to save project' });
        }
    } else {
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
};
