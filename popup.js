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
    autoScroll: document.getElementById('autoScroll').checked,
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
  const extractionScript = async (autoScroll) => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
    // Helper: Turn one message turn into {role, content} — or null
    // ═════════════════════════════════════════════════════════════
    const parseTurn = (turn) => {
      // User message
      const userMsg = turn.querySelector('[data-testid="user-message"]');
      if (userMsg) {
        const paragraphs = userMsg.querySelectorAll('p');
        let text = '';
        if (paragraphs.length > 0) {
          text = Array.from(paragraphs).map(p => htmlToMarkdown(p).trim()).join('\n\n');
        } else {
          text = userMsg.innerText.trim();
        }
        return text ? { role: 'human', content: text } : null;
      }

      // Claude response
      const claudeResponse = turn.querySelector('[data-is-streaming]');
      if (claudeResponse) {
        // Collect ALL .standard-markdown sections (there can be multiple when artifacts/tool use splits the response)
        const markdownSections = claudeResponse.querySelectorAll('.standard-markdown');
        let text = '';
        markdownSections.forEach((section) => {
          const sectionText = extractMarkdownContent(section);
          if (sectionText.trim()) text += sectionText;
        });
        return text.trim() ? { role: 'assistant', content: text.trim() } : null;
      }

      return null;
    };

    // ═════════════════════════════════════════════════════════════
    // Find the element that actually scrolls the thread.
    // The class names on claude.ai change between builds, so prefer the
    // autoscroll container but fall back to walking up from a real
    // message until an overflow container that can actually scroll.
    // ═════════════════════════════════════════════════════════════
    const findScroller = () => {
      const marked = document.querySelector('[data-autoscroll-container="true"]');
      if (marked && marked.scrollHeight > marked.clientHeight + 40) return marked;

      const anchor = document.querySelector('[data-test-render-count]') ||
                     document.querySelector('[data-testid="user-message"]');
      let el = anchor ? anchor.parentElement : null;
      while (el && el !== document.body) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 40) return el;
        el = el.parentElement;
      }
      return marked || document.scrollingElement || document.documentElement;
    };

    const isPageScroller = (el) =>
      el === document.scrollingElement || el === document.documentElement || el === document.body;

    const setScrollTop = (el, value) => {
      if (isPageScroller(el)) window.scrollTo(0, value);
      else el.scrollTop = value;
    };

    const countTurns = () => document.querySelectorAll('[data-test-render-count]').length;

    // ═════════════════════════════════════════════════════════════
    // Climb to the very first message.
    //
    // Claude fetches older turns over the network as you approach the
    // top, so the stop condition has to be patient: only give up once
    // height, turn count AND scroll position all sit still for several
    // rounds. Bailing after ~1s just races the fetch and loses history.
    // ═════════════════════════════════════════════════════════════
    const scrollToTop = async (scroller) => {
      let stable = 0, lastHeight = -1, lastCount = -1;

      for (let i = 0; i < 150 && stable < 4; i++) {
        setScrollTop(scroller, 0);
        await sleep(500);

        const height = scroller.scrollHeight;
        const count = countTurns();
        const atTop = (isPageScroller(scroller) ? window.scrollY : scroller.scrollTop) <= 2;

        if (height === lastHeight && count === lastCount && atTop) {
          stable++;
        } else {
          stable = 0;
          lastHeight = height;
          lastCount = count;
        }
      }
    };

    // ═════════════════════════════════════════════════════════════
    // Collect whatever is mounted right now into an ordered, de-duped
    // store. Called repeatedly while scrolling, because Claude unmounts
    // turns once they leave the viewport — reading the DOM a single
    // time can only ever see one screenful of a long conversation.
    // ═════════════════════════════════════════════════════════════
    const seen = new Map();

    const harvest = () => {
      // Count repeats *within* a pass so two genuinely identical
      // messages ("ok", "tiếp đi") don't collapse into one.
      const pass = new Map();
      document.querySelectorAll('[data-test-render-count]').forEach((turn) => {
        const msg = parseTurn(turn);
        if (!msg) return;
        const base = `${msg.role}:${msg.content}`;
        const n = (pass.get(base) || 0) + 1;
        pass.set(base, n);
        const key = `${base}#${n}`;
        if (!seen.has(key)) seen.set(key, msg);
      });
    };

    // ═════════════════════════════════════════════════════════════
    // MAIN — go to the top, then sweep downward harvesting each screen.
    // Sweeping downward keeps insertion order equal to conversation
    // order, so no re-sorting is needed afterwards.
    // ═════════════════════════════════════════════════════════════
    const scroller = findScroller();
    if (!scroller) {
      return { error: 'Could not find chat container. Make sure you have a conversation open.', messages: [], title: '' };
    }

    let passes = 0;

    const getPos = () => (isPageScroller(scroller) ? window.scrollY : scroller.scrollTop);

    if (autoScroll) {
      const original = getPos();

      await scrollToTop(scroller);

      // Descend one screen at a time, and never jump ahead.
      //
      // Two things must NOT drive the stop decision:
      //
      //   * `scrollTop + clientHeight >= scrollHeight` — claude.ai only
      //     measures the turns it has mounted so far, so scrollHeight
      //     describes discovered content, not the conversation. The test
      //     fires while the ending is still being fetched.
      //
      //   * jumping to scrollHeight when the position stalls — that skips
      //     whatever had not mounted yet, punching a hole in the middle of
      //     the export. Two answers then sit side by side with the question
      //     between them missing, which reads as duplicated text.
      //
      // A stalled position simply means the fetch has not landed. Keep
      // asking for the same next screen and stop only once the page has
      // gone completely quiet: neither the position nor the harvest has
      // changed for several rounds running.
      const step = Math.max(200, Math.floor(scroller.clientHeight * 0.7));
      let quiet = 0, lastPos = -1, lastSize = 0;

      for (let i = 0; i < 4000 && quiet < 10; i++) {
        harvest();
        passes++;

        const grew = seen.size > lastSize;
        lastSize = seen.size;

        const pos = getPos();
        const moved = pos > lastPos + 2;
        lastPos = pos;

        if (!grew && !moved) quiet++; else quiet = 0;

        setScrollTop(scroller, pos + step);
        await sleep(300);
      }

      harvest();
      setScrollTop(scroller, original);
    } else {
      harvest();
      passes = 1;
    }

    const messages = Array.from(seen.values());

    if (!messages.length) {
      return {
        error: 'No messages found. Open a Claude conversation and let it finish loading, then try again.',
        messages: [],
        title: ''
      };
    }

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
      messages,
      // Printed to the page console so a short export can be diagnosed:
      // 1 pass means the sweep never ran.
      stats: {
        passes,
        scroller: isPageScroller(scroller)
          ? 'page'
          : `${scroller.tagName.toLowerCase()}.${(scroller.className || '').toString().split(/\s+/).slice(0, 2).join('.')}`,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        mountedAtEnd: countTurns(),
        harvested: messages.length
      }
    };
  };
  
  // Execute extraction
  const extractConversation = async (options) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || (!tab.url.includes('claude.ai') && !tab.url.includes('claude.com'))) {
      throw new Error('Please open a Claude.ai conversation');
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractionScript,
      args: [options.autoScroll]
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

    if (data.stats) console.log('Claude Exporter — scroll stats:', data.stats);

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
      const options = getOptions();
      showStatus(options.autoScroll ? '⏳ Scrolling & extracting…' : '⏳ Extracting…');
      const data = await extractConversation(options);
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
      const options = getOptions();
      showStatus(options.autoScroll ? '⏳ Scrolling & extracting…' : '⏳ Extracting…');
      const data = await extractConversation(options);
      const content = formatConversation(data, options);
      await navigator.clipboard.writeText(content);
      showStatus(`✅ Copied ${data.messages.length} messages!`, 'success');
    } catch (error) {
      showStatus(`❌ ${error.message}`, 'error');
      console.error('Copy error:', error);
    }
  });
});
