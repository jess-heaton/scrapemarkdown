const express = require('express');
const fetch = require('node-fetch');
const TurndownService = require('turndown');
const FormData = require('form-data');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware for parsing form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/scrape', async (req, res) => {
  const { url, voiceflowApiKey, overwrite, maxChunkSize, tags } = req.body;
  
  if (!url || !voiceflowApiKey) {
    return res.status(400).send("Missing URL or Voiceflow API Key.");
  }
  
  try {
    // --- Step 1: Call Firecrawl API ---
    // Replace this URL with the actual Firecrawl endpoint if different.
    const firecrawlUrl = `https://api.firecrawl.dev/scrape?url=${encodeURIComponent(url)}`;
    const firecrawlResponse = await fetch(firecrawlUrl);
    if (!firecrawlResponse.ok) {
      throw new Error("Firecrawl API error: " + firecrawlResponse.statusText);
    }
    // Assume Firecrawl returns HTML text (if it returns Markdown directly, you can skip conversion)
    const firecrawlData = await firecrawlResponse.text();
    
    // --- Step 2: Convert HTML to Markdown ---
    const turndownService = new TurndownService();
    const markdown = turndownService.turndown(firecrawlData);
    
    // --- Step 3: Prepare file upload to Voiceflow ---
    const voiceflowEndpoint = "https://api.voiceflow.com/v1/knowledge-base/docs/upload";
    
    // Construct query parameters if provided
    let queryParams = [];
    if (overwrite) queryParams.push(`overwrite=${overwrite}`);
    if (maxChunkSize) queryParams.push(`maxChunkSize=${maxChunkSize}`);
    if (tags) queryParams.push(`tags=${encodeURIComponent(tags)}`);
    const queryString = queryParams.length > 0 ? '?' + queryParams.join('&') : '';
    const uploadUrl = voiceflowEndpoint + queryString;
    
    // Create an in-memory file using FormData
    const form = new FormData();
    form.append('file', Buffer.from(markdown, 'utf-8'), {
      filename: 'document.txt',
      contentType: 'text/plain'
    });
    
    // Optional: attach metadata (e.g., the source URL)
    // form.append('metadata', JSON.stringify({ source: url }));
    
    // --- Step 4: Call Voiceflow API ---
    const voiceflowResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        // Assuming Voiceflow requires the API key in an Authorization header.
        'Authorization': `Bearer ${voiceflowApiKey}`
        // Do NOT manually set Content-Type; FormData sets it (with boundary) automatically.
      },
      body: form
    });
    
    if (!voiceflowResponse.ok) {
      const errorText = await voiceflowResponse.text();
      throw new Error("Voiceflow API error: " + errorText);
    }
    
    const voiceflowResult = await voiceflowResponse.json();
    
    res.json({
      message: "Document uploaded successfully",
      voiceflowResult
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).send("Error: " + err.message);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
