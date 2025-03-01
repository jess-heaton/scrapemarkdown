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

function cleanMarkdown(markdown) {
  // Remove inline images
  let cleaned = markdown.replace(/!\[.*?\]\(.*?\)/g, '');
  // Remove image links (linked images)
  cleaned = cleaned.replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '');
  // Remove iframes or other custom patterns
  cleaned = cleaned.replace(/\[iframe\]\(.*?\)/g, '');
  // Optional: Remove all markdown links if not needed
  // cleaned = cleaned.replace(/\[.*?\]\(.*?\)/g, '');
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{2,}/g, '\n\n').trim();
  return cleaned;
}


app.post('/scrape', async (req, res) => {
  const { url, voiceflowApiKey, overwrite, maxChunkSize, tags } = req.body;
  
  if (!url || !voiceflowApiKey) {
    return res.status(400).send("Missing URL or Voiceflow API Key.");
  }
  
  try {
    // --- Step 1: Call Firecrawl API ---
    const firecrawlUrl = 'https://api.firecrawl.dev/v1/scrape';
    const firecrawlResponse = await fetch(firecrawlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer fc-734c78692af444e79380460414146ceb`
      },
      body: JSON.stringify({
        url: url,
        formats: ["markdown", "html"]
      })
    });
    
    if (!firecrawlResponse.ok) {
      throw new Error("Firecrawl API error: " + firecrawlResponse.statusText);
    }
    
    const firecrawlResult = await firecrawlResponse.json();
    
    // Prefer the markdown output, but if it's not available, convert HTML to Markdown.
    let finalMarkdown = firecrawlResult.data.markdown;
    if (!finalMarkdown && firecrawlResult.data.html) {
      const turndownService = new TurndownService();
      finalMarkdown = turndownService.turndown(firecrawlResult.data.html);
    }
    
    if (!finalMarkdown) {
      throw new Error("No markdown or html content received from Firecrawl.");
    }
    
    // --- Post-Process the Markdown ---
    finalMarkdown = cleanMarkdown(finalMarkdown);
    
    // --- Step 2: Prepare file upload to Voiceflow ---
    const voiceflowEndpoint = "https://api.voiceflow.com/v1/knowledge-base/docs/upload";
    
    // Build query parameters if provided
    let queryParams = [];
    if (overwrite) queryParams.push(`overwrite=${overwrite}`);
    if (maxChunkSize) queryParams.push(`maxChunkSize=${maxChunkSize}`);
    if (tags) queryParams.push(`tags=${encodeURIComponent(tags)}`);
    const queryString = queryParams.length > 0 ? '?' + queryParams.join('&') : '';
    const uploadUrl = voiceflowEndpoint + queryString;
    
    // Generate a file name based on the URL hostname (e.g., example.com.txt)
    let fileName = 'document.txt'; // fallback
    try {
      const parsedUrl = new URL(url);
      fileName = parsedUrl.hostname + '.txt';
    } catch (e) {
      console.error("URL parsing error, using fallback filename:", e);
    }
    
    // Create an in-memory file using FormData
    const form = new FormData();
    form.append('file', Buffer.from(finalMarkdown, 'utf-8'), {
      filename: fileName,
      contentType: 'text/plain'
    });
    
    // --- Step 3: Call Voiceflow API ---
    const voiceflowResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        // Send Voiceflow API key directly, without the "Bearer " prefix.
        'Authorization': voiceflowApiKey
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