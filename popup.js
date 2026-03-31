// ═══════════════════════════════════════════════════════════════════════════
// 🔥 Claude Conversation Exporter v2.1 — UPDATED
// ═══════════════════════════════════════════════════════════════════════════
// Based on actual Claude.ai DOM structure (March 2026)
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
    // Helper: Convert HTML inline elements to Markdown text
    // ═════════════════════════════════════════════════════════════
    const htmlToMarkdown = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      
      const tag = node.tagName.toLowerCase();
      let inner = Array.from(node.childNodes).map(htmlToMarkdown).join('');
      
      if (tag === 'strong' || tag === 'b') return `**${inner}**`;
      if (tag === 'em' || tag === 'i') return `*${inner}*`;
      if (tag === 'code') return `\`${inner}\``;
      if (tag === 'a') {
        const href = node.getAttribute('href') || '';
        return `[${inner}](${href})`;
      }
      if (tag === 'br') return '\n';
      
      return inner;
    };
    
    // ═════════════════════════════════════════════════════════════
    // Helper: Extract structured markdown from a .standard-markdown div
    // ═════════════════════════════════════════════════════════════
    const extractMarkdownContent = (markdownEl) => {
      let text = '';
      const children = markdownEl.children;
      
      for (let i = 0; i < children.length; i++) {
        const el = children[i];
        const tag = el.tagName.toLowerCase();
        
        if (tag === 'h1') text += `# ${htmlToMarkdown(el).trim()}\n\n`;
        else if (tag === 'h2') text += `## ${htmlToMarkdown(el).trim()}\n\n`;
        else if (tag === 'h3') text += `### ${htmlToMarkdown(el).trim()}\n\n`;
        else if (tag === 'h4') text += `#### ${htmlToMarkdown(el).trim()}\n\n`;
        else if (tag === 'h5') text += `##### ${htmlToMarkdown(el).trim()}\n\n`;
        else if (tag === 'h6') text += `###### ${htmlToMarkdown(el).trim()}\n\n`;
        else if (tag === 'ul' || tag === 'ol') {
          text += extractList(el, 0, tag === 'ol');
          text += '\n';
        }
        else if (tag === 'pre') {
          // Code blocks — try to get the language from a class
          const codeEl = el.querySelector('code');
          let lang = '';
          if (codeEl) {
            const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
            if (langClass) lang = langClass.replace('language-', '');
          }
          const codeText = (codeEl || el).innerText.trim();
          text += `\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`;
        }
        else if (tag === 'blockquote') {
          const lines = htmlToMarkdown(el).trim().split('\n');
          text += lines.map(l => `> ${l}`).join('\n') + '\n\n';
        }
        else if (tag === 'hr') text += '---\n\n';
        else if (tag === 'table') {
          text += extractTable(el) + '\n\n';
        }
        else if (tag === 'p') {
          const content = htmlToMarkdown(el).trim();
          if (content) text += `${content}\n\n`;
        }
        else {
          // div or other container — might wrap another standard-markdown or content
          const content = htmlToMarkdown(el).trim();
          if (content) text += `${content}\n\n`;
        }
      }
      
      return text;
    };
    
    // ═════════════════════════════════════════════════════════════
    // Helper: Extract list items with nesting
    // ═════════════════════════════════════════════════════════════
    const extractList = (listEl, depth = 0, isOrdered = false) => {
      let text = '';
      const items = listEl.querySelectorAll(':scope > li');
      items.forEach((li, idx) => {
        const indent = '  '.repeat(depth);
        const prefix = isOrdered ? `${idx + 1}. ` : '- ';
        
        // Get direct text content (not from nested lists)
        let itemText = '';
        li.childNodes.forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) {
            itemText += child.textContent;
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const childTag = child.tagName.toLowerCase();
            if (childTag !== 'ul' && childTag !== 'ol') {
              itemText += htmlToMarkdown(child);
            }
          }
        });
        text += `${indent}${prefix}${itemText.trim()}\n`;
        
        // Handle nested lists
        const nestedUl = li.querySelector(':scope > ul');
        const nestedOl = li.querySelector(':scope > ol');
        if (nestedUl) text += extractList(nestedUl, depth + 1, false);
        if (nestedOl) text += extractList(nestedOl, depth + 1, true);
      });
      return text;
    };
    
    // ═════════════════════════════════════════════════════════════
    // Helper: Extract table to markdown
    // ═════════════════════════════════════════════════════════════
    const extractTable = (tableEl) => {
      const rows = tableEl.querySelectorAll('tr');
      if (rows.length === 0) return '';
      
      let text = '';
      rows.forEach((row, rowIdx) => {
        const cells = row.querySelectorAll('th, td');
        const cellTexts = Array.from(cells).map(c => htmlToMarkdown(c).trim());
        text += `| ${cellTexts.join(' | ')} |\n`;
        
        // Add header separator after first row
        if (rowIdx === 0) {
          text += `| ${cellTexts.map(() => '---').join(' | ')} |\n`;
        }
      });
      return text;
    };
    
    // ═════════════════════════════════════════════════════════════
    // MAIN: Find chat container and extract messages
    // ═════════════════════════════════════════════════════════════
    
    // Try multiple selectors for the chat container
    const chatContainer = 
      document.querySelector('[data-autoscroll-container="true"]') ||
      document.querySelector('.overflow-y-auto.overflow-x-hidden') ||
      document.querySelector('.overflow-y-scroll');
    
    if (!chatContainer) {
      return { error: 'Could not find chat container. Make sure you have a conversation open.', messages: [], title: '' };
    }
    
    // Find all render-count divs (each message turn)
    const messageTurns = chatContainer.querySelectorAll('[data-test-render-count]');
    
    messageTurns.forEach((turn) => {
      // Check if this is a user message
      const userMsg = turn.querySelector('[data-testid="user-message"]');
      if (userMsg) {
        const paragraphs = userMsg.querySelectorAll('p');
        let text = '';
        if (paragraphs.length > 0) {
          text = Array.from(paragraphs).map(p => htmlToMarkdown(p).trim()).join('\n\n');
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
        // Collect ALL .standard-markdown sections (there can be multiple when artifacts/tool use splits the response)
        const markdownSections = claudeResponse.querySelectorAll('.standard-markdown');
        let text = '';
        
        markdownSections.forEach((section) => {
          const sectionText = extractMarkdownContent(section);
          if (sectionText.trim()) {
            text += sectionText;
          }
        });
        
        if (text.trim()) {
          messages.push({ role: 'assistant', content: text.trim() });
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
    
    if (!tab.url || (!tab.url.includes('claude.ai') && !tab.url.includes('claude.com'))) {
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
      .replace(/[\/\\:*?"<>|]+/g, '')   // remove filesystem-unsafe chars
      .replace(/\s+/g, '-')             // spaces → hyphens
      .replace(/-{2,}/g, '-')           // collapse multiple hyphens
      .replace(/^-|-$/g, '')
      .substring(0, 80);
    
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
