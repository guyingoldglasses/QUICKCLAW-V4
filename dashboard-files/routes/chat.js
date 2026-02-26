/**
 * routes/chat.js — Chat interface backend
 *
 * Routes messages through:
 *   1. OpenClaw gateway WebSocket (ws://localhost:18789) if running
 *   2. Direct OpenAI API if key/OAuth token exists
 *   3. Direct Anthropic API if key exists
 *   4. Returns onboarding guidance if nothing is configured
 */
const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const h = require('../lib/helpers');
const st = require('../lib/state');

const router = Router();

// ═══ FIRST-RUN DETECTION ═══
const SETUP_MARKER = path.join(h.DATA_DIR, '.setup-complete');

router.get('/api/chat/first-run', (req, res) => {
  const isFirstRun = !fs.existsSync(SETUP_MARKER);
  res.json({ firstRun: isFirstRun });
});

router.post('/api/chat/complete-setup', (req, res) => {
  try { fs.writeFileSync(SETUP_MARKER, new Date().toISOString()); } catch {}
  res.json({ ok: true });
});

// ═══ SETUP STATUS — what's configured? ═══
router.get('/api/chat/status', async (req, res) => {
  try {
    const gw = await h.gatewayState();
    const settings = st.getSettings();
    const profiles = st.getProfiles();
    const active = profiles.find(p => p.active) || profiles[0];
    const pp = active ? st.profilePaths(active.id) : null;

    // Check for API keys in multiple locations
    let hasOpenaiKey = !!settings.openaiApiKey;
    let hasAnthropicKey = !!settings.anthropicApiKey;
    let hasOauthToken = !!settings.openaiOAuthEnabled;
    let hasTelegram = !!settings.telegramBotToken;

    // Also check profile .env files
    if (pp) {
      const env = h.readEnv(pp.envPath);
      if (!hasOpenaiKey && env.OPENAI_API_KEY) hasOpenaiKey = true;
      if (!hasAnthropicKey && env.ANTHROPIC_API_KEY) hasAnthropicKey = true;
      if (!hasTelegram && env.TELEGRAM_BOT_TOKEN) hasTelegram = true;

      // Check codex auth.json for OAuth
      const codexAuth = path.join(h.HOME, '.codex', 'auth.json');
      if (!hasOauthToken && fs.existsSync(codexAuth)) {
        try {
          const auth = JSON.parse(fs.readFileSync(codexAuth, 'utf-8'));
          if (auth.access_token || auth.token) hasOauthToken = true;
        } catch {}
      }
    }

    // Determine best available chat method
    let chatMethod = 'none';
    let chatReady = false;
    if (gw.running && (hasOpenaiKey || hasOauthToken || hasAnthropicKey)) {
      chatMethod = 'gateway';
      chatReady = true;
    } else if (hasOpenaiKey) {
      chatMethod = 'openai-direct';
      chatReady = true;
    } else if (hasAnthropicKey) {
      chatMethod = 'anthropic-direct';
      chatReady = true;
    } else if (hasOauthToken) {
      chatMethod = 'oauth';
      chatReady = true;
    }

    // Determine onboarding step
    let onboardingStep = 'complete';
    if (!chatReady) onboardingStep = 'need-api-key';
    else if (!gw.running) onboardingStep = 'start-gateway';
    else if (!hasTelegram) onboardingStep = 'add-telegram';

    const isFirstRun = !fs.existsSync(SETUP_MARKER);

    res.json({
      chatReady,
      chatMethod,
      gateway: { running: gw.running, statusText: gw.statusText },
      keys: { openai: hasOpenaiKey, anthropic: hasAnthropicKey, oauth: hasOauthToken, telegram: hasTelegram },
      onboardingStep,
      activeProfile: active ? active.id : null,
      firstRun: isFirstRun
    });
  } catch (e) {
    res.json({ chatReady: false, chatMethod: 'none', error: e.message, onboardingStep: 'need-api-key' });
  }
});

// ═══ SEND MESSAGE ═══
router.post('/api/chat/send', async (req, res) => {
  const { message, history, model } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ ok: false, error: 'No message provided' });
  }
  const userMessage = message.trim();

  try {
    const settings = st.getSettings();
    const profiles = st.getProfiles();
    const active = profiles.find(p => p.active) || profiles[0];
    const pp = active ? st.profilePaths(active.id) : null;

    // Gather keys
    let openaiKey = settings.openaiApiKey || '';
    let anthropicKey = settings.anthropicApiKey || '';
    if (pp) {
      const env = h.readEnv(pp.envPath);
      if (!openaiKey && env.OPENAI_API_KEY) openaiKey = env.OPENAI_API_KEY;
      if (!anthropicKey && env.ANTHROPIC_API_KEY) anthropicKey = env.ANTHROPIC_API_KEY;
    }

    // Load soul/system prompt if available
    let systemPrompt = 'You are a helpful AI assistant running via OpenClaw. Be friendly and concise.';
    if (pp) {
      const soulPath = st.findSoul(pp);
      if (soulPath && fs.existsSync(soulPath)) {
        const soul = fs.readFileSync(soulPath, 'utf-8').trim();
        if (soul) systemPrompt = soul;
      }
    }

    // Build conversation — filter out errors and ensure valid content
    const messages = [];
    if (Array.isArray(history)) {
      history.slice(-20).forEach(m => {
        if (!m || !m.role || !m.content) return;
        const content = String(m.content).trim();
        if (!content) return;
        // Skip error messages from history
        if (content.startsWith('\u26A0') || content.startsWith('⚠')) return;
        const role = m.role === 'user' ? 'user' : 'assistant';
        messages.push({ role, content });
      });
    }
    messages.push({ role: 'user', content: userMessage });

    // Try OpenAI-compatible API first
    if (openaiKey) {
      const reply = await callOpenAI(openaiKey, messages, systemPrompt, model || 'gpt-4o-mini');
      saveChatMessage(userMessage, reply);
      return res.json({ ok: true, reply, method: 'openai' });
    }

    // Try Anthropic
    if (anthropicKey) {
      const reply = await callAnthropic(anthropicKey, messages, systemPrompt, model || 'claude-sonnet-4-20250514');
      saveChatMessage(userMessage, reply);
      return res.json({ ok: true, reply, method: 'anthropic' });
    }

    // Try gateway CLI as last resort
    const gw = await h.gatewayState();
    if (gw.running) {
      const result = await h.run(`echo ${JSON.stringify(userMessage)} | ${h.cliBin()} chat --no-interactive 2>/dev/null`, { timeout: 30000 });
      if (result.ok && result.output) {
        saveChatMessage(userMessage, result.output);
        return res.json({ ok: true, reply: result.output, method: 'gateway-cli' });
      }
    }

    res.json({ ok: false, error: 'No API keys configured. Click the 🔑 button above to add one.' });
  } catch (e) {
    res.json({ ok: false, error: e.message || 'Chat request failed' });
  }
});

// ═══ CHAT HISTORY ═══
router.get('/api/chat/history', (req, res) => {
  const history = h.readJson(h.CHAT_HISTORY_PATH, []);
  res.json({ messages: history.slice(-100) });
});

router.delete('/api/chat/history', (req, res) => {
  h.writeJson(h.CHAT_HISTORY_PATH, []);
  res.json({ ok: true });
});

// ═══ QUICK KEY SAVE — from onboarding ═══
router.post('/api/chat/save-key', (req, res) => {
  const { provider, key } = req.body;
  if (!provider || !key) return res.status(400).json({ ok: false, error: 'Provider and key required' });

  const settings = st.getSettings();
  if (provider === 'openai') {
    settings.openaiApiKey = key;
  } else if (provider === 'anthropic') {
    settings.anthropicApiKey = key;
  } else {
    return res.status(400).json({ ok: false, error: 'Unknown provider: ' + provider });
  }
  st.saveSettings(settings);

  // Also write to active profile .env
  try {
    const profiles = st.getProfiles();
    const active = profiles.find(p => p.active) || profiles[0];
    if (active) {
      const pp = st.profilePaths(active.id);
      if (fs.existsSync(pp.configDir)) {
        const env = h.readEnv(pp.envPath);
        if (provider === 'openai') env.OPENAI_API_KEY = key;
        else env.ANTHROPIC_API_KEY = key;
        h.writeEnv(pp.envPath, env);
      }
    }
  } catch {}

  res.json({ ok: true, provider });
});

// ═══ API CALL HELPERS ═══
function callOpenAI(apiKey, messages, systemPrompt, model) {
  return new Promise((resolve, reject) => {
    // Ensure all messages have valid string content
    const cleanMessages = [{ role: 'system', content: String(systemPrompt || 'You are a helpful assistant.') }];
    messages.forEach(m => {
      const content = String(m.content || '').trim();
      if (content) cleanMessages.push({ role: m.role === 'user' ? 'user' : 'assistant', content });
    });

    const body = JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: cleanMessages,
      max_tokens: 2048,
      temperature: 0.7
    });

    const opts = {
      hostname: 'api.openai.com', port: 443, path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'Content-Length': Buffer.byteLength(body) }
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.error) return reject(new Error(j.error.message || 'OpenAI error'));
          resolve(j.choices?.[0]?.message?.content || 'No response');
        } catch (e) { reject(new Error('Failed to parse OpenAI response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('OpenAI request timed out')); });
    req.write(body);
    req.end();
  });
}

function callAnthropic(apiKey, messages, systemPrompt, model) {
  return new Promise((resolve, reject) => {
    // Ensure all messages have valid string content and proper alternation
    const cleanMessages = [];
    messages.forEach(m => {
      const content = String(m.content || '').trim();
      if (!content) return;
      const role = m.role === 'user' ? 'user' : 'assistant';
      // Anthropic requires alternating user/assistant — merge consecutive same-role
      if (cleanMessages.length > 0 && cleanMessages[cleanMessages.length - 1].role === role) {
        cleanMessages[cleanMessages.length - 1].content += '\n' + content;
      } else {
        cleanMessages.push({ role, content });
      }
    });
    // Anthropic requires first message to be 'user'
    if (cleanMessages.length > 0 && cleanMessages[0].role !== 'user') {
      cleanMessages.shift();
    }

    const body = JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      system: String(systemPrompt || 'You are a helpful assistant.'),
      messages: cleanMessages,
      max_tokens: 2048
    });

    const opts = {
      hostname: 'api.anthropic.com', port: 443, path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-api-key': apiKey,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.error) return reject(new Error(j.error.message || 'Anthropic error'));
          const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
          resolve(text || 'No response');
        } catch (e) { reject(new Error('Failed to parse Anthropic response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Anthropic request timed out')); });
    req.write(body);
    req.end();
  });
}

function saveChatMessage(userMsg, botReply) {
  try {
    const history = h.readJson(h.CHAT_HISTORY_PATH, []);
    const ts = new Date().toISOString();
    history.push({ role: 'user', content: userMsg, ts });
    history.push({ role: 'assistant', content: botReply, ts });
    // Keep last 200 messages
    if (history.length > 200) history.splice(0, history.length - 200);
    h.writeJson(h.CHAT_HISTORY_PATH, history);
  } catch {}
}

module.exports = router;
