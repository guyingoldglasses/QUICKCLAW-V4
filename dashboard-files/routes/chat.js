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
      if (!hasTelegram && env.TELEGRAM_TOKEN) hasTelegram = true;
      // Also check clawdbot.json channels config
      if (!hasTelegram) {
        try {
          const cfg = h.readJson(pp.configJson, {});
          if (cfg?.channels?.telegram?.botToken) hasTelegram = true;
        } catch {}
      }

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
router.post('/api/chat/save-key', async (req, res) => {
  try {
    const { provider, key } = req.body;
    if (!provider || !key) return res.status(400).json({ ok: false, error: 'Provider and key required' });

    if (provider === 'openai' || provider === 'anthropic') {
      // Direct file write — avoids read-merge cycle that can fail with corrupt files
      try {
        let current = {};
        try { current = JSON.parse(fs.readFileSync(h.SETTINGS_PATH, 'utf-8')); } catch {}
        if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
        // Only keep known safe keys
        const safe = {
          openaiApiKey: String(current.openaiApiKey || ''),
          openaiOAuthEnabled: !!current.openaiOAuthEnabled,
          anthropicApiKey: String(current.anthropicApiKey || ''),
          telegramBotToken: String(current.telegramBotToken || ''),
          ftpHost: String(current.ftpHost || ''),
          ftpUser: String(current.ftpUser || ''),
          emailUser: String(current.emailUser || '')
        };
        // Apply the new key
        if (provider === 'openai') safe.openaiApiKey = String(key);
        else safe.anthropicApiKey = String(key);
        // Write directly
        const dir = path.dirname(h.SETTINGS_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(h.SETTINGS_PATH, JSON.stringify(safe, null, 2));
        console.log('✓ API key saved for', provider);
      } catch (writeErr) {
        console.error('settings.json write error:', writeErr.message);
        return res.status(500).json({ ok: false, error: 'Could not write settings: ' + writeErr.message });
      }

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
      } catch (envErr) { console.error('Warning: could not write to profile .env:', envErr.message); }

      // Regenerate YAML config
      try { st.applySettingsToConfigFile(); } catch {}

      return res.json({ ok: true, provider });

    } else if (provider === 'telegram') {
      const token = String(key).trim();
      if (!token.includes(':')) return res.status(400).json({ ok: false, error: 'Invalid Telegram bot token. It should look like 123456789:ABCdef...' });
      // Write token to ALL config locations OpenClaw might read from
      const writeResults = st.writeTelegramTokenEverywhere(token);
      // Return immediately — frontend will call /telegram-activate for the slow restart
      return res.json({
        ok: true, provider: 'telegram',
        writeResults,
        note: 'Token saved. Call /telegram-activate to restart gateway.'
      });

    } else {
      return res.status(400).json({ ok: false, error: 'Unknown provider: ' + provider });
    }
  } catch (err) {
    console.error('save-key error:', err);
    res.status(500).json({ ok: false, error: 'Save failed: ' + (err.message || String(err)) });
  }
});

// ═══ TELEGRAM ACTIVATE — full restart + verify (called after save-key) ═══
router.post('/api/chat/telegram-activate', async (req, res) => {
  try {
    const steps = [];
    const { execSync } = require('child_process');
    const freshInstall = req.body && req.body.freshInstall;

    // Step 1: Stop gateway
    steps.push({ step: 'stop', status: 'running' });
    try { await h.gatewayExec(`${h.gatewayStopCommand()} 2>&1`); } catch {}
    await new Promise(r => setTimeout(r, 1500));

    // Hard kill anything on gateway ports
    for (const port of [18789, 5000]) {
      try {
        const pids = execSync(`lsof -ti tcp:${port}`, { stdio: 'pipe' }).toString().trim();
        for (const pid of pids.split('\n').filter(Boolean)) {
          try { process.kill(parseInt(pid), 'SIGKILL'); } catch {}
        }
      } catch {}
    }
    try {
      const pids = execSync(`pgrep -f "openclaw.*gateway" || true`, { stdio: 'pipe' }).toString().trim();
      for (const pid of pids.split('\n').filter(Boolean)) {
        const n = parseInt(pid);
        if (n && n !== process.pid) { try { process.kill(n, 'SIGKILL'); } catch {} }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
    steps[0].status = 'done';

    // Step 2: Clear old telegram session data for fresh pairing
    if (freshInstall) {
      const ocDir = path.join(h.HOME, '.openclaw');  // symlink → external drive
      const cleanDirs = ['telegram', 'devices', 'completions', 'cron', 'media'];
      for (const sub of cleanDirs) {
        const dir = path.join(ocDir, sub);
        try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      }
      // Also clear the Telegram bot's pending updates so old messages don't replay
      const settings = st.getSettings();
      const token = settings.telegramBotToken || '';
      if (token) {
        try {
          // getUpdates with offset -1 clears the queue
          await new Promise((resolve) => {
            const req = https.get(`https://api.telegram.org/bot${token}/getUpdates?offset=-1&timeout=0`, { timeout: 5000 }, (resp) => {
              let d = ''; resp.on('data', c => d += c); resp.on('end', () => resolve(d));
            });
            req.on('error', () => resolve(null));
            req.on('timeout', () => { req.destroy(); resolve(null); });
          });
        } catch {}
      }
      steps.push({ step: 'clean', status: 'done' });
    }

    // Step 3: Ensure telegram is ENABLED with pairing mode in openclaw.json
    // This is critical — openclaw channels add may set enabled:false or dmPolicy:open
    try {
      const ocPath = st.openclawConfigPath();
      const ocDir = path.dirname(ocPath);
      fs.mkdirSync(ocDir, { recursive: true });
      const oc = fs.existsSync(ocPath) ? h.readJson(ocPath, {}) : {};
      // Ensure channel structure exists and is fully enabled
      if (!oc.channels) oc.channels = {};
      if (!oc.channels.telegram) oc.channels.telegram = {};
      oc.channels.telegram.enabled = true;           // MUST be true for gateway to load it
      oc.channels.telegram.dmPolicy = 'pairing';     // Require approval per user
      oc.channels.telegram.groupPolicy = 'allowlist'; // Don't respond in random groups
      oc.channels.telegram.streaming = 'partial';
      // Preserve bot token if set
      const settings = st.getSettings();
      if (settings.telegramBotToken && !oc.channels.telegram.botToken) {
        oc.channels.telegram.botToken = settings.telegramBotToken;
      }
      // Ensure plugin is enabled too (gateway needs both)
      if (!oc.plugins) oc.plugins = {};
      if (!oc.plugins.entries) oc.plugins.entries = {};
      if (!oc.plugins.entries.telegram) oc.plugins.entries.telegram = {};
      oc.plugins.entries.telegram.enabled = true;     // MUST be true
      h.writeJson(ocPath, oc);
      steps.push({ step: 'config', status: 'done', note: 'channels.telegram.enabled=true, dmPolicy=pairing' });
    } catch (e) {
      console.error('Failed to enforce telegram config:', e.message);
    }

    // Step 4: Full start (install LaunchAgent + patch plist + start)
    steps.push({ step: 'start', status: 'running' });
    const startResult = await h.gatewayFullStart(path.join(h.LOG_DIR, 'gateway.log'));
    steps[steps.length - 1].status = startResult.ok ? 'done' : 'failed';

    // Step 4: Wait for telegram to initialize (gateway needs time to connect)
    if (startResult.ok) {
      // Re-enforce config after gateway install (it might have reset enabled/dmPolicy)
      try {
        const ocPath2 = st.openclawConfigPath();
        if (fs.existsSync(ocPath2)) {
          const oc2 = h.readJson(ocPath2, {});
          let needsWrite = false;
          if (oc2.channels?.telegram?.enabled !== true) {
            oc2.channels = oc2.channels || {};
            oc2.channels.telegram = oc2.channels.telegram || {};
            oc2.channels.telegram.enabled = true;
            needsWrite = true;
          }
          if (oc2.channels?.telegram?.dmPolicy !== 'pairing') {
            oc2.channels.telegram.dmPolicy = 'pairing';
            needsWrite = true;
          }
          if (oc2.plugins?.entries?.telegram?.enabled !== true) {
            oc2.plugins = oc2.plugins || {};
            oc2.plugins.entries = oc2.plugins.entries || {};
            oc2.plugins.entries.telegram = oc2.plugins.entries.telegram || {};
            oc2.plugins.entries.telegram.enabled = true;
            needsWrite = true;
          }
          if (needsWrite) {
            h.writeJson(ocPath2, oc2);
            // Restart gateway to pick up the fixed config
            try { await h.gatewayExec(`${h.gatewayStopCommand()} 2>&1`); } catch {}
            await new Promise(r => setTimeout(r, 2000));
            await h.gatewayExec(`${h.cliBin()} gateway start 2>&1`);
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      } catch {}

      steps.push({ step: 'connecting', status: 'running' });
      await new Promise(r => setTimeout(r, 5000));

      // Check if telegram is actually polling
      const settings = st.getSettings();
      const token = settings.telegramBotToken || '';
      let telegramConnected = false;
      let botInfo = null;
      let pairingInfo = null;

      if (token) {
        // Validate token
        try {
          const info = await new Promise((resolve, reject) => {
            const treq = https.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 8000 }, (resp) => {
              let data = '';
              resp.on('data', c => data += c);
              resp.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Bad JSON')); } });
            });
            treq.on('error', reject);
            treq.on('timeout', () => { treq.destroy(); reject(new Error('timeout')); });
          });
          if (info.ok) botInfo = { username: info.result.username, firstName: info.result.first_name };
        } catch {}

        // Check updates to see if gateway is now polling
        // Gateway running + valid token = connected (we can't directly verify polling)
        try {
          const updates = await new Promise((resolve, reject) => {
            const ureq = https.get(`https://api.telegram.org/bot${token}/getUpdates?limit=1&timeout=0`, { timeout: 8000 }, (resp) => {
              let data = '';
              resp.on('data', c => data += c);
              resp.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Bad JSON')); } });
            });
            ureq.on('error', reject);
            ureq.on('timeout', () => { ureq.destroy(); reject(new Error('timeout')); });
          });
          // If getUpdates succeeds, the token works and Telegram can reach the bot
          // Gateway is running (we verified above), so consider it connected
          telegramConnected = updates.ok === true;
        } catch {}
      }

      // Check openclaw.json for pairing mode
      try {
        const ocPath = st.openclawConfigPath();
        const oc = h.readJson(ocPath, {});
        const dmPolicy = oc.channels?.telegram?.dmPolicy || 'open';
        if (dmPolicy === 'pairing') {
          pairingInfo = {
            mode: 'pairing',
            note: 'Your bot uses pairing mode. When you first message it, it will give you a pairing code. Run "openclaw channels login --channel telegram" in Terminal to complete pairing, OR change dmPolicy to "open" for instant access.'
          };
        } else {
          pairingInfo = {
            mode: dmPolicy,
            note: 'Your bot is set to "' + dmPolicy + '" mode — anyone can message it directly.'
          };
        }
      } catch {}

      steps[steps.length - 1].status = 'done';

      return res.json({
        ok: true,
        gatewayRunning: startResult.ok,
        telegramConnected,
        botInfo,
        pairingInfo,
        steps,
        startLog: startResult.log
      });
    }

    return res.json({
      ok: false,
      gatewayRunning: false,
      steps,
      startLog: startResult.log,
      error: 'Gateway failed to start'
    });
  } catch (err) {
    console.error('telegram-activate error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
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

// ═══ TELEGRAM DIAGNOSTICS ═══
router.post('/api/chat/telegram-diagnose', async (req, res) => {
  try {
    const results = {
      gateway: { running: false, statusText: '' },
      tokenLocations: {},
      botInfo: null,
      botError: null,
      recentLogs: '',
      suggestions: []
    };

    // 1. Gateway status
    try {
      const gw = await h.gatewayState();
      results.gateway = { running: gw.running, statusText: gw.statusText, ws18789: gw.ws18789, port5000: gw.port5000 };
    } catch (e) { results.gateway.statusText = 'Error checking: ' + e.message; }

    // 2. Check token in all locations
    const settings = st.getSettings();
    const profiles = st.getProfiles();
    const active = profiles.find(p => p.active) || profiles[0];
    let foundToken = '';

    // settings.json
    const stToken = settings.telegramBotToken || '';
    results.tokenLocations.settings = !!stToken;
    if (stToken) foundToken = stToken;

    if (active) {
      const pp = st.profilePaths(active.id);
      // .env file
      try {
        const env = h.readEnv(pp.envPath);
        const envToken = env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_TOKEN || '';
        results.tokenLocations.env = !!envToken;
        if (envToken && !foundToken) foundToken = envToken;
      } catch { results.tokenLocations.env = false; }

      // clawdbot.json
      try {
        const cfg = h.readJson(pp.configJson, {});
        const cfgToken = cfg.channels?.telegram?.botToken || '';
        const cfgEnabled = !!cfg.channels?.telegram?.enabled;
        const pluginEnabled = !!cfg.plugins?.entries?.telegram?.enabled;
        results.tokenLocations.configJson = !!cfgToken;
        results.tokenLocations.telegramEnabled = cfgEnabled;
        results.tokenLocations.pluginEnabled = pluginEnabled;
        if (cfgToken && !foundToken) foundToken = cfgToken;
      } catch { results.tokenLocations.configJson = false; }

      // credentials/telegram.json
      try {
        const credFile = path.join(pp.configDir, 'credentials', 'telegram.json');
        const cred = h.readJson(credFile, {});
        results.tokenLocations.credentials = !!cred.botToken;
      } catch { results.tokenLocations.credentials = false; }
    }

    // 2b. THE REAL CONFIG: ~/.openclaw/openclaw.json (what the gateway actually reads)
    try {
      const ocPath = st.openclawConfigPath();
      const oc = h.readJson(ocPath, {});
      const ocToken = oc.channels?.telegram?.botToken || '';
      const ocEnabled = !!oc.channels?.telegram?.enabled;
      const ocPluginEnabled = !!oc.plugins?.entries?.telegram?.enabled;
      results.tokenLocations.openclawJson = !!ocToken;
      results.tokenLocations.ocTelegramEnabled = ocEnabled;
      results.tokenLocations.ocPluginEnabled = ocPluginEnabled;
      if (ocToken && !foundToken) foundToken = ocToken;
      // This is the critical check — if openclaw.json has enabled:false, nothing will work
      if (!ocEnabled) {
        results.criticalIssue = 'Telegram is DISABLED in openclaw.json (the file the gateway reads). Token is present but channels.telegram.enabled = false.';
      }
      if (!ocPluginEnabled) {
        results.criticalIssue = (results.criticalIssue || '') + ' Telegram PLUGIN is also disabled in openclaw.json.';
      }
    } catch { results.tokenLocations.openclawJson = false; }

    // 3. Validate token with Telegram API (getMe)
    if (foundToken) {
      try {
        const botInfo = await new Promise((resolve, reject) => {
          const https = require('https');
          const req = https.get(`https://api.telegram.org/bot${foundToken}/getMe`, { timeout: 8000 }, (resp) => {
            let data = '';
            resp.on('data', c => data += c);
            resp.on('end', () => {
              try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON from Telegram')); }
            });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('Telegram API timed out')); });
        });
        if (botInfo.ok) {
          results.botInfo = { username: botInfo.result.username, firstName: botInfo.result.first_name, id: botInfo.result.id, canReadMessages: botInfo.result.can_read_all_group_messages };
        } else {
          results.botError = botInfo.description || 'Telegram rejected the token';
        }
      } catch (e) {
        results.botError = 'Could not reach Telegram API: ' + e.message;
      }

      // 3b. Check for pending updates (are messages reaching the bot?)
      try {
        const updates = await new Promise((resolve, reject) => {
          const https = require('https');
          const req = https.get(`https://api.telegram.org/bot${foundToken}/getUpdates?limit=3&timeout=0`, { timeout: 8000 }, (resp) => {
            let data = '';
            resp.on('data', c => data += c);
            resp.on('end', () => {
              try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
            });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timed out')); });
        });
        if (updates.ok) {
          results.pendingUpdates = updates.result.length;
          if (updates.result.length > 0) {
            results.lastUpdate = {
              from: updates.result[updates.result.length - 1].message?.from?.first_name || 'unknown',
              text: (updates.result[updates.result.length - 1].message?.text || '').slice(0, 50),
              date: updates.result[updates.result.length - 1].message?.date
            };
          }
        }
      } catch {}
    } else {
      results.botError = 'No token found in any config location';
    }

    // 4. Recent gateway logs — check BOTH QuickClaw log dir AND OpenClaw's own log dir
    const logSources = [
      path.join(h.LOG_DIR, 'gateway.log'),
      path.join(h.OPENCLAW_STATE_DIR, 'logs', 'gateway.log'),
      path.join(h.HOME, '.openclaw', 'logs', 'gateway.log'),
      path.join(h.HOME, '.clawdbot', 'logs', 'gateway.log')
    ];
    // Also check active profile's config dir for logs
    if (active) {
      const pp = st.profilePaths(active.id);
      logSources.push(path.join(pp.configDir, 'logs', 'gateway.log'));
    }
    const allLogs = [];
    const seenPaths = new Set();
    for (const logPath of logSources) {
      const resolved = path.resolve(logPath);
      if (seenPaths.has(resolved)) continue;
      seenPaths.add(resolved);
      try {
        if (fs.existsSync(logPath)) {
          const log = fs.readFileSync(logPath, 'utf-8');
          const lines = log.split('\n').filter(l => l.trim());
          if (lines.length > 0) {
            allLogs.push('── ' + logPath + ' ──');
            allLogs.push(...lines.slice(-12));
          }
        }
      } catch {}
    }
    results.recentLogs = allLogs.length > 0 ? allLogs.join('\n') : 'No gateway logs found';

    // 4b. Dump actual clawdbot.json config summary for debugging
    if (active) {
      try {
        const pp = st.profilePaths(active.id);
        const cfg = h.readJson(pp.configJson, {});
        results.configSummary = {
          configPath: pp.configJson,
          hasTelegramChannel: !!(cfg.channels && cfg.channels.telegram),
          telegramEnabled: !!(cfg.channels && cfg.channels.telegram && cfg.channels.telegram.enabled),
          hasToken: !!(cfg.channels && cfg.channels.telegram && cfg.channels.telegram.botToken),
          tokenPreview: cfg.channels?.telegram?.botToken ? h.maskKey(cfg.channels.telegram.botToken) : 'none',
          pluginEnabled: !!(cfg.plugins?.entries?.telegram?.enabled),
          allChannels: Object.keys(cfg.channels || {}),
          allPlugins: Object.keys(cfg.plugins?.entries || {})
        };
      } catch {}
    }

    // 5. Build suggestions
    if (results.criticalIssue) {
      results.suggestions.push('⚠️ CRITICAL: ' + results.criticalIssue);
    }
    if (!results.gateway.running) {
      results.suggestions.push('Gateway is NOT running. Try restarting it from the Dashboard tab, or click "Restart Gateway" below.');
    }
    if (results.botError && results.botError.includes('Unauthorized')) {
      results.suggestions.push('Telegram says the bot token is INVALID. Double-check you copied the full token from BotFather.');
    }
    if (results.botError && results.botError.includes('timed out')) {
      results.suggestions.push('Could not reach Telegram API. Check your internet connection.');
    }
    if (!results.tokenLocations.configJson) {
      results.suggestions.push('Token missing from clawdbot.json — the main config file OpenClaw reads.');
    }
    if (!results.tokenLocations.telegramEnabled) {
      results.suggestions.push('Telegram channel is not enabled in clawdbot.json.');
    }
    if (!results.tokenLocations.pluginEnabled) {
      results.suggestions.push('Telegram plugin is not enabled in clawdbot.json.');
    }
    if (results.pendingUpdates > 0) {
      results.suggestions.push('There are ' + results.pendingUpdates + ' unprocessed messages from Telegram — the gateway is not polling them. It may need a restart.');
    }
    if (results.gateway.running && results.botInfo && results.pendingUpdates === 0 && results.tokenLocations.configJson) {
      results.suggestions.push('Everything looks configured correctly. Try sending another message in Telegram and wait 10-15 seconds.');
    }

    res.json({ ok: true, ...results });
  } catch (err) {
    console.error('telegram-diagnose error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══ GATEWAY RESTART (dedicated endpoint — hard restart) ═══
router.post('/api/chat/gateway-restart', async (req, res) => {
  try {
    const log = [];
    
    // 1. Try graceful stop first
    try {
      const stopResult = await h.gatewayExec(`${h.gatewayStopCommand()} 2>&1`);
      log.push('stop: ' + (stopResult.stdout || '').trim().slice(0, 100));
    } catch (e) { log.push('stop failed: ' + e.message.slice(0, 80)); }
    
    await new Promise(r => setTimeout(r, 1500));
    
    // 2. Hard kill anything on ports 18789 and 5000 (gateway websocket ports)
    for (const port of [18789, 5000]) {
      try {
        const pids = require('child_process').execSync(`lsof -ti tcp:${port}`, { stdio: 'pipe' }).toString().trim();
        if (pids) {
          for (const pid of pids.split('\n').filter(Boolean)) {
            try { process.kill(parseInt(pid), 'SIGKILL'); log.push('killed pid ' + pid + ' on port ' + port); } catch {}
          }
        }
      } catch {} // No process on port — fine
    }
    
    // 3. Also kill any lingering openclaw gateway processes
    try {
      const pids = require('child_process').execSync(`pgrep -f "openclaw.*gateway" || true`, { stdio: 'pipe' }).toString().trim();
      if (pids) {
        for (const pid of pids.split('\n').filter(Boolean)) {
          const pidNum = parseInt(pid);
          if (pidNum && pidNum !== process.pid) { // Don't kill ourselves
            try { process.kill(pidNum, 'SIGKILL'); log.push('killed openclaw gateway pid ' + pid); } catch {}
          }
        }
      }
    } catch {}
    
    await new Promise(r => setTimeout(r, 2000)); // Let everything die
    
    // 4. Verify ports are free
    const stillBusy18789 = h.portListeningSync(18789);
    const stillBusy5000 = h.portListeningSync(5000);
    log.push('ports free: 18789=' + !stillBusy18789 + ', 5000=' + !stillBusy5000);
    
    // 5. Full start: install LaunchAgent + patch plist + start
    try {
      const startResult = await h.gatewayFullStart(path.join(h.LOG_DIR, 'gateway.log'));
      log.push('fullStart: ' + startResult.log.join(', '));
    } catch (e) { log.push('start failed: ' + e.message.slice(0, 80)); }
    
    // 6. Check state
    const gw = await h.gatewayState();
    log.push('final state: running=' + gw.running);
    
    // 8. Read last few lines of gateway log for context
    let recentLog = '';
    try {
      const logPath = path.join(h.LOG_DIR, 'gateway.log');
      if (fs.existsSync(logPath)) {
        const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(l => l.trim());
        recentLog = lines.slice(-10).join('\n');
      }
    } catch {}
    
    res.json({ ok: true, running: gw.running, statusText: gw.statusText, log: log.join(' | '), recentLog });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
