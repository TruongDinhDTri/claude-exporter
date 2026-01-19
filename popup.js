// ═══════════════════════════════════════════════════════════════════════════
// 🔥 Claude Conversation Exporter v2 — REWRITTEN
// ═══════════════════════════════════════════════════════════════════════════
// Based on actual Claude.ai DOM structure (December 2024)
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  const exportBtn = document.getElementById('exportBtn');
  const copyBtn = document.getElementById('copyBtn');
  const statusEl = document.getElementById('status');
  
  const getFormat = () => document.querySelector('input[name="format"]:checked').value;
  
  const getOptions = () => ({
    includeTimestamp: document.getElementById('includeTimestamp').checked,
    includeMetadata: document.getElementById('includeMetadata').checked,
    format: getFormat()
  });
  
  const showStatus = (message, type = 'info') => {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    if (type === 'success' || type === 'error') {
      setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status'; }, 4000);
    }
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTION FUNCTION - Runs in the page context
  // ═══════════════════════════════════════════════════════════════════════════
  const extractionScript = () => {
    const messages = [];
    
    // ═════════════════════════════════════════════════════════════
    // SELECTORS (based on actual Claude.ai structure Dec 2024)
    // ═════════════════════════════════════════════════════════════
    // User messages: [data-testid="user-message"]
    // Claude responses: [data-is-streaming] contains .standard-markdown
    // ═════════════════════════════════════════════════════════════
    
    // Find the main chat container
    const chatContainer = document.querySelector('.overflow-y-scroll');
    if (!chatContainer) {
      return { error: 'Could not find chat container', messages: [], title: '' };
    }
    
    // Find all render-count divs (each message turn)
    const messageTurns = chatContainer.querySelectorAll('[data-test-render-count]');
    
    messageTurns.forEach((turn) => {
      // Check if this is a user message
      const userMsg = turn.querySelector('[data-testid="user-message"]');
      if (userMsg) {
        // Get all paragraph text from user message
        const paragraphs = userMsg.querySelectorAll('p');
        let text = '';
        if (paragraphs.length > 0) {
          text = Array.from(paragraphs).map(p => p.innerText.trim()).join('\n\n');
        } else {
          text = userMsg.innerText.trim();
        }
        
        if (text) {
          messages.push({ role: 'human', content: text });
        }
        return;
      }
      
      // Check if this is a Claude response
      const claudeResponse = turn.querySelector('[data-is-streaming]');
      if (claudeResponse) {
        const markdown = claudeResponse.querySelector('.standard-markdown');
        if (markdown) {
          // Extract structured content
          let text = '';
          const children = markdown.children;
          
          for (let i = 0; i < children.length; i++) {
            const el = children[i];
            const tag = el.tagName.toLowerCase();
            const content = el.innerText.trim();
            
            if (!content) continue;
            
            if (tag === 'h1') text += `# ${content}\n\n`;
            else if (tag === 'h2') text += `## ${content}\n\n`;
            else if (tag === 'h3') text += `### ${content}\n\n`;
            else if (tag === 'h4') text += `#### ${content}\n\n`;
            else if (tag === 'ul' || tag === 'ol') {
              const items = el.querySelectorAll('li');
              items.forEach((li, idx) => {
                const prefix = tag === 'ol' ? `${idx + 1}. ` : '- ';
                text += `${prefix}${li.innerText.trim()}\n`;
              });
              text += '\n';
            }
            else if (tag === 'pre') text += `\`\`\`\n${content}\n\`\`\`\n\n`;
            else if (tag === 'hr') text += '---\n\n';
            else text += `${content}\n\n`;
          }
          
          if (text.trim()) {
            messages.push({ role: 'assistant', content: text.trim() });
          }
        }
      }
    });
    
    // Get title
    let title = document.title || '';
    title = title.replace(/\s*-\s*Claude\s*$/i, '').replace(/^Claude\s*-?\s*/i, '').trim();
    if (!title && messages.length > 0) {
      title = messages[0].content.substring(0, 50) + '...';
    }
    
    return {
      title: title || 'Claude Conversation',
      url: window.location.href,
      messageCount: messages.length,
      messages
    };
  };
  
  // Execute extraction
  const extractConversation = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url || !tab.url.includes('claude.ai')) {
      throw new Error('Please open a Claude.ai conversation');
    }
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractionScript
    });
    
    if (!results || !results[0] || !results[0].result) {
      throw new Error('Extraction failed - no results');
    }
    
    const data = results[0].result;
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    if (data.messages.length === 0) {
      throw new Error('No messages found. Make sure you have a conversation open.');
    }
    
    return data;
  };
  
  // Format output
  const formatConversation = (data, options) => {
    const { messages, title, url } = data;
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0];
    
    if (options.format === 'json') {
      return JSON.stringify({ title, url, exportedAt: timestamp, messageCount: messages.length, messages }, null, 2);
    }
    
    let output = '';
    
    if (options.format === 'md') {
      if (options.includeMetadata) {
        output += `# ${title}\n\n`;
        output += `> **Date:** ${dateStr}  \n`;
        output += `> **URL:** ${url}  \n`;
        output += `> **Messages:** ${messages.length}\n\n`;
        output += `---\n\n`;
      }
      
      messages.forEach((msg) => {
        const role = msg.role === 'human' ? '## 👤 Human' : '## 🤖 Claude';
        output += `${role}\n\n${msg.content}\n\n---\n\n`;
      });
    } else {
      // Plain text
      if (options.includeMetadata) {
        output += `${title.toUpperCase()}\n`;
        output += `${'='.repeat(60)}\n`;
        output += `Date: ${dateStr}\n`;
        output += `URL: ${url}\n`;
        output += `Messages: ${messages.length}\n`;
        output += `${'='.repeat(60)}\n\n`;
      }
      
      messages.forEach((msg) => {
        const role = msg.role === 'human' ? '[HUMAN]' : '[CLAUDE]';
        output += `${role}\n${'-'.repeat(40)}\n${msg.content}\n\n`;
      });
    }
    
    return output;
  };
  
  // Generate filename
  const generateFilename = (title, options) => {
    const sanitized = (title || 'claude-conversation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 40);
    
    const ext = options.format;
    const date = new Date().toISOString().split('T')[0];
    
    return options.includeTimestamp ? `${date}-${sanitized}.${ext}` : `${sanitized}.${ext}`;
  };
  
  // Download
  const downloadFile = (content, filename) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  // Button handlers
  exportBtn.addEventListener('click', async () => {
    try {
      showStatus('⏳ Extracting...');
      const data = await extractConversation();
      const options = getOptions();
      const content = formatConversation(data, options);
      const filename = generateFilename(data.title, options);
      downloadFile(content, filename);
      showStatus(`✅ Exported ${data.messages.length} messages!`, 'success');
    } catch (error) {
      showStatus(`❌ ${error.message}`, 'error');
      console.error('Export error:', error);
    }
  });
  
  copyBtn.addEventListener('click', async () => {
    try {
      showStatus('⏳ Extracting...');
      const data = await extractConversation();
      const options = getOptions();
      const content = formatConversation(data, options);
      await navigator.clipboard.writeText(content);
      showStatus(`✅ Copied ${data.messages.length} messages!`, 'success');
    } catch (error) {
      showStatus(`❌ ${error.message}`, 'error');
      console.error('Copy error:', error);
    }
  });
});
