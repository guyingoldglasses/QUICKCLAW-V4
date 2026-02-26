/* ============================================
   QuickClaw Dashboard — Chat Panel
   Smart onboarding + live chat interface
   ============================================ */

// ─── Onboarding Guide Content ───
var GUIDES = {
  apiKey: {
    title: 'Connect an AI Model',
    subtitle: 'Choose how you want to power your bot',
    steps: [
      {
        id: 'openai',
        icon: '🟢',
        title: 'OpenAI (GPT-4o, GPT-4)',
        steps: [
          'Go to <a href="https://platform.openai.com/api-keys" target="_blank" style="color:var(--accent)">platform.openai.com/api-keys</a>',
          'Click <b>"Create new secret key"</b>',
          'Copy the key (starts with <code>sk-</code>)',
          'Paste it below and click Save'
        ],
        placeholder: 'sk-...',
        provider: 'openai'
      },
      {
        id: 'anthropic',
        icon: '🟣',
        title: 'Anthropic (Claude)',
        steps: [
          'Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color:var(--accent)">console.anthropic.com/settings/keys</a>',
          'Click <b>"Create Key"</b>',
          'Copy the key (starts with <code>sk-ant-</code>)',
          'Paste it below and click Save'
        ],
        placeholder: 'sk-ant-...',
        provider: 'anthropic'
      },
      {
        id: 'oauth',
        icon: '🔐',
        title: 'OpenAI OAuth (Free Tier)',
        steps: [
          'Go to the <b>Profile</b> tab in the sidebar',
          'Click on your profile, then the <b>Auth</b> sub-tab',
          'Click <b>"Start OAuth Login"</b>',
          'Sign in with your OpenAI account',
          'Come back here — you\'re all set!'
        ],
        provider: 'oauth'
      }
    ]
  },
  telegram: {
    title: 'Add Telegram',
    subtitle: 'Chat with your bot from your phone',
    steps: [
      'Open Telegram and search for <b>@BotFather</b>',
      'Send <code>/newbot</code> and follow the prompts',
      'Choose a name (e.g. "My OpenClaw Bot")',
      'BotFather will give you a <b>bot token</b> — copy it',
      'Paste the token in <b>Profile → Channels → Telegram</b>',
      'Click Save — your bot is now live on Telegram!'
    ]
  },
  voice: {
    title: 'Voice Chat via Telegram',
    subtitle: 'Talk to your bot with your voice',
    steps: [
      'Open your bot in Telegram (after setup above)',
      'Tap the <b>microphone icon</b> next to the message box',
      'Hold to record your voice message, then release to send',
      'Your bot will <b>transcribe your voice</b> → process it → reply with text',
      'For <b>voice replies</b>, enable TTS in your bot\'s soul.md:<br><code>Always reply with a voice note when the user sends a voice message.</code>',
      'Pro tip: Pin your bot to Telegram\'s top bar for quick access!'
    ]
  }
};

// ─── Guide Popup Component ───
function GuidePopup(props) {
  var guide = props.guide;
  var onClose = props.onClose;
  var onKeySave = props.onKeySave;
  var saving = props.saving;

  var _s = useState(''), inputVal = _s[0], setInput = _s[1];
  var _p = useState(null), selectedProvider = _p[0], setProvider = _p[1];
  var _ok = useState(false), saved = _ok[0], setSaved = _ok[1];

  if (!guide) return null;
  var g = GUIDES[guide];
  if (!g) return null;

  function handleSave() {
    if (!inputVal.trim() || !selectedProvider) return;
    onKeySave(selectedProvider, inputVal.trim());
    setSaved(true);
    setTimeout(function() { onClose(); }, 1200);
  }

  var overlay = {position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:20};
  var modal = {background:'var(--card)',borderRadius:16,maxWidth:540,width:'100%',maxHeight:'85vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.5)'};
  var header = {padding:'24px 24px 0',textAlign:'center'};
  var body = {padding:'16px 24px 24px'};

  return React.createElement('div', {style:overlay, onClick:function(e){if(e.target===e.currentTarget)onClose();}},
    React.createElement('div', {style:modal},
      React.createElement('div', {style:header},
        React.createElement('div', {style:{fontSize:28,marginBottom:8}}, guide==='apiKey'?'🚀':guide==='telegram'?'📱':'🎙️'),
        React.createElement('h2', {style:{margin:0,fontSize:20,color:'var(--text)'}}, g.title),
        React.createElement('p', {style:{margin:'4px 0 0',fontSize:13,color:'var(--dim)'}}, g.subtitle)),
      React.createElement('div', {style:body},

        // API Key guide — has sub-options
        guide === 'apiKey' ? React.createElement('div', null,
          g.steps.map(function(opt) {
            var isSelected = selectedProvider === opt.provider;
            var cardStyle = {border:'2px solid '+(isSelected?'var(--accent)':'var(--border)'),borderRadius:12,padding:16,marginBottom:12,cursor:'pointer',transition:'all 0.2s',background:isSelected?'rgba(255,180,60,0.06)':'transparent'};
            return React.createElement('div', {key:opt.id, style:cardStyle, onClick:function(){setProvider(opt.provider);setSaved(false);}},
              React.createElement('div', {style:{display:'flex',alignItems:'center',gap:8,marginBottom:isSelected?12:0}},
                React.createElement('span', {style:{fontSize:20}}, opt.icon),
                React.createElement('span', {style:{fontWeight:700,fontSize:14}}, opt.title),
                isSelected ? React.createElement('span', {style:{marginLeft:'auto',fontSize:11,color:'var(--accent)',fontWeight:600}}, '▾ SELECTED') : null),
              isSelected && opt.steps ? React.createElement('div', null,
                React.createElement('ol', {style:{margin:'0 0 12px',paddingLeft:20,fontSize:13,lineHeight:1.8,color:'var(--dim)'}},
                  opt.steps.map(function(s,i){return React.createElement('li',{key:i,dangerouslySetInnerHTML:{__html:s}});})),
                opt.provider !== 'oauth' ? React.createElement('div', {style:{display:'flex',gap:8}},
                  React.createElement('input', {type:'text', value:inputVal, onChange:function(e){setInput(e.target.value);},
                    placeholder:opt.placeholder, className:'input',
                    style:{flex:1,padding:'10px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13,fontFamily:'monospace'}}),
                  React.createElement('button', {className:'btn btn-primary', onClick:handleSave,
                    disabled:!inputVal.trim()||saving,
                    style:{padding:'10px 20px',borderRadius:8,fontWeight:700}},
                    saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save')
                ) : React.createElement('div', {style:{padding:12,borderRadius:8,background:'var(--bg)',fontSize:12,color:'var(--dim)',textAlign:'center'}},
                  'Head to the Profile → Auth tab to start OAuth flow')
              ) : null);
          })
        ) :

        // Telegram & Voice guides — simple step list
        React.createElement('div', null,
          React.createElement('ol', {style:{margin:0,paddingLeft:20,fontSize:13,lineHeight:2,color:'var(--dim)'}},
            g.steps.map(function(s,i){return React.createElement('li',{key:i,style:{marginBottom:8},dangerouslySetInnerHTML:{__html:s}});}))
        ),

        React.createElement('div', {style:{display:'flex',justifyContent:'center',marginTop:20}},
          React.createElement('button', {className:'btn', onClick:onClose,
            style:{padding:'10px 32px',borderRadius:8,background:'var(--border)',color:'var(--text)',fontSize:13}},
            saved ? 'Done!' : 'Close'))
      )
    )
  );
}

// ─── Welcome Banner (shown when not ready) ───
function ChatWelcome(props) {
  var status = props.status;
  var onGuide = props.onGuide;

  var wrap = {textAlign:'center',padding:'60px 20px',maxWidth:480,margin:'0 auto'};
  var cardRow = {display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:24};
  var card = function(icon, title, desc, action, ready, actionLabel) {
    return React.createElement('div', {style:{padding:20,borderRadius:12,background:'var(--card)',border:'2px solid '+(ready?'var(--green)':'var(--border)'),cursor:ready?'default':'pointer',transition:'all 0.2s'},onClick:ready?undefined:action},
      React.createElement('div', {style:{fontSize:28,marginBottom:8}}, icon),
      React.createElement('div', {style:{fontWeight:700,fontSize:14,marginBottom:4}}, title),
      React.createElement('div', {style:{fontSize:12,color:'var(--dim)',lineHeight:1.4}}, desc),
      ready ?
        React.createElement('div', {style:{marginTop:8,fontSize:11,color:'var(--green)',fontWeight:600}}, '✓ Connected') :
        React.createElement('div', {style:{marginTop:8,fontSize:11,color:'var(--accent)',fontWeight:600}}, actionLabel || 'Set up →'));
  };

  var k = status.keys || {};
  var hasKey = k.openai || k.anthropic || k.oauth;

  return React.createElement('div', {style:wrap},
    React.createElement('div', {style:{fontSize:48,marginBottom:12}}, '💬'),
    React.createElement('h2', {style:{margin:0,fontSize:22,color:'var(--text)'}}, 'Welcome to OpenClaw Chat'),
    React.createElement('p', {style:{color:'var(--dim)',fontSize:14,marginTop:8,lineHeight:1.5}},
      hasKey ? 'Almost there! Your API key is connected. Start a conversation below.' :
      'Let\'s get you chatting with your AI bot. It only takes a minute.'),
    React.createElement('div', {style:cardRow},
      card('🔑', 'AI API Key', hasKey ? 'API key connected' : 'Connect OpenAI or Anthropic', function(){onGuide('apiKey');}, hasKey),
      card('⚡', 'Gateway', status.gateway&&status.gateway.running ? 'Running' : 'Bot gateway process', function(){}, status.gateway&&status.gateway.running, 'Auto-detected'),
      card('📱', 'Telegram', 'Chat from your phone', function(){onGuide('telegram');}, k.telegram),
      card('🎙️', 'Voice Chat', 'Talk with your voice', function(){onGuide('voice');}, false, 'Learn how →')
    ),
    !hasKey ? React.createElement('button', {className:'btn btn-primary',
      style:{marginTop:24,padding:'14px 40px',borderRadius:12,fontSize:15,fontWeight:700},
      onClick:function(){onGuide('apiKey');}},
      '🚀 Get Started') : null
  );
}

// ─── Typing Indicator ───
function TypingDots() {
  return React.createElement('div', {style:{display:'flex',gap:4,padding:'8px 0'}},
    [0,1,2].map(function(i) {
      return React.createElement('div', {key:i, style:{
        width:8, height:8, borderRadius:'50%', background:'var(--accent)',
        opacity:0.4, animation:'pulse 1.2s ease-in-out '+(i*0.2)+'s infinite'
      }});
    })
  );
}

// ─── Message Bubble ───
function ChatBubble(props) {
  var m = props.message;
  var isUser = m.role === 'user';
  var wrap = {display:'flex',justifyContent:isUser?'flex-end':'flex-start',marginBottom:12,paddingLeft:isUser?48:0,paddingRight:isUser?0:48};
  var bubble = {
    padding:'12px 16px',borderRadius:isUser?'16px 16px 4px 16px':'16px 16px 16px 4px',
    background:isUser?'var(--accent)':'var(--card)',
    color:isUser?'#1a1a1a':'var(--text)',
    fontSize:14,lineHeight:1.5,maxWidth:'100%',wordBreak:'break-word',
    whiteSpace:'pre-wrap',boxShadow:'0 1px 3px rgba(0,0,0,0.15)'
  };
  var time = {fontSize:10,color:'var(--muted)',marginTop:4,textAlign:isUser?'right':'left'};

  return React.createElement('div', {style:wrap},
    React.createElement('div', null,
      React.createElement('div', {style:bubble}, m.content),
      m.ts ? React.createElement('div', {style:time}, new Date(m.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})) : null));
}

// ─── Main Chat Panel ───
function PanelChat(props) {
  var toast = props.toast;
  var onNav = props.onNav;

  var _st = useState(null), status = _st[0], setStatus = _st[1];
  var _msgs = useState([]), messages = _msgs[0], setMessages = _msgs[1];
  var _inp = useState(''), input = _inp[0], setInput = _inp[1];
  var _send = useState(false), sending = _send[0], setSending = _send[1];
  var _guide = useState(null), guide = _guide[0], setGuide = _guide[1];
  var _sav = useState(false), saving = _sav[0], setSaving = _sav[1];
  var _loaded = useState(false), loaded = _loaded[0], setLoaded = _loaded[1];
  var _showTips = useState(false), showTips = _showTips[0], setShowTips = _showTips[1];
  var scrollRef = useRef(null);
  var inputRef = useRef(null);

  // Load status + history on mount
  useEffect(function() {
    api('/chat/status').then(function(s) { setStatus(s); }).catch(function() {});
    api('/chat/history').then(function(h) {
      if (h.messages) setMessages(h.messages);
      setLoaded(true);
    }).catch(function() { setLoaded(true); });
  }, []);

  // Auto-scroll
  useEffect(function() {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  // Auto-show onboarding for brand new users
  useEffect(function() {
    if (status && !status.chatReady && loaded && messages.length === 0) {
      // Small delay so it feels intentional
      var t = setTimeout(function(){ setGuide('apiKey'); }, 600);
      return function(){ clearTimeout(t); };
    }
  }, [status, loaded]);

  function sendMessage() {
    var msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    var userMsg = {role:'user', content:msg, ts:new Date().toISOString()};
    setMessages(function(prev){return prev.concat([userMsg]);});
    setSending(true);

    api('/chat/send', {method:'POST', body:{message:msg, history:messages.slice(-20)}})
      .then(function(r) {
        setSending(false);
        if (r.ok) {
          setMessages(function(prev){return prev.concat([{role:'assistant',content:r.reply,ts:new Date().toISOString()}]);});
        } else {
          setMessages(function(prev){return prev.concat([{role:'assistant',content:'⚠️ '+( r.error||'Something went wrong'),ts:new Date().toISOString()}]);});
          if (r.error && r.error.includes('No API keys')) setGuide('apiKey');
        }
      })
      .catch(function(e) {
        setSending(false);
        setMessages(function(prev){return prev.concat([{role:'assistant',content:'⚠️ Network error: '+e.message,ts:new Date().toISOString()}]);});
      });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function handleKeySave(provider, key) {
    setSaving(true);
    api('/chat/save-key', {method:'POST', body:{provider:provider, key:key}})
      .then(function(r) {
        setSaving(false);
        if (r.ok) {
          toast('API key saved! You can start chatting now.', 'success');
          // Refresh status
          api('/chat/status').then(setStatus).catch(function(){});
        } else {
          toast(r.error || 'Failed to save key', 'error');
        }
      })
      .catch(function() { setSaving(false); toast('Failed to save key', 'error'); });
  }

  function clearHistory() {
    api('/chat/history', {method:'DELETE'}).then(function() {
      setMessages([]);
      toast('Chat history cleared', 'success');
    }).catch(function(){});
  }

  if (!status) return React.createElement('div', {style:{textAlign:'center',padding:40,color:'var(--dim)'}}, 'Loading...');

  var chatReady = status.chatReady;
  var k = status.keys || {};
  var hasMessages = messages.length > 0;

  // Status bar
  var statusBar = React.createElement('div', {style:{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderBottom:'1px solid var(--border)',fontSize:12,flexWrap:'wrap'}},
    React.createElement('div', {style:{display:'flex',alignItems:'center',gap:6}},
      React.createElement('span', {style:{width:8,height:8,borderRadius:'50%',background:chatReady?'var(--green)':'var(--red)'}}),
      React.createElement('span', {style:{fontWeight:600}}, chatReady ? 'Ready' : 'Setup Required')),
    chatReady ? React.createElement('span', {style:{color:'var(--dim)',fontSize:11}},
      'via ' + (status.chatMethod === 'openai-direct' ? 'OpenAI API' :
                status.chatMethod === 'anthropic-direct' ? 'Anthropic API' :
                status.chatMethod === 'gateway' ? 'OpenClaw Gateway' : status.chatMethod)) : null,
    React.createElement('div', {style:{marginLeft:'auto',display:'flex',gap:8}},
      React.createElement('button', {className:'btn btn-sm', onClick:function(){setShowTips(!showTips);},
        style:{fontSize:11,padding:'4px 10px'}}, showTips ? 'Hide Guides' : '📚 Guides'),
      hasMessages ? React.createElement('button', {className:'btn btn-sm', onClick:clearHistory,
        style:{fontSize:11,padding:'4px 10px'}}, '🗑️ Clear') : null,
      React.createElement('button', {className:'btn btn-sm', onClick:function(){api('/chat/status').then(setStatus);},
        style:{fontSize:11,padding:'4px 10px'}}, '↻'))
  );

  // Guide tips bar
  var tipsBar = showTips ? React.createElement('div', {style:{display:'flex',gap:8,padding:'8px 16px',borderBottom:'1px solid var(--border)',flexWrap:'wrap'}},
    React.createElement('button', {className:'btn btn-sm', onClick:function(){setGuide('apiKey');}, style:{fontSize:11}},
      (k.openai||k.anthropic||k.oauth?'✓':'') + ' 🔑 API Keys'),
    React.createElement('button', {className:'btn btn-sm', onClick:function(){setGuide('telegram');}, style:{fontSize:11}},
      (k.telegram?'✓':'') + ' 📱 Telegram'),
    React.createElement('button', {className:'btn btn-sm', onClick:function(){setGuide('voice');}, style:{fontSize:11}},
      '🎙️ Voice Chat')
  ) : null;

  // Main layout
  return React.createElement('div', {style:{display:'flex',flexDirection:'column',height:'calc(100vh - 80px)',maxHeight:'calc(100vh - 80px)'}},
    statusBar,
    tipsBar,
    guide ? React.createElement(GuidePopup, {guide:guide, onClose:function(){setGuide(null);}, onKeySave:handleKeySave, saving:saving}) : null,

    // Chat area
    React.createElement('div', {ref:scrollRef, style:{flex:1,overflowY:'auto',padding:16}},
      !chatReady && !hasMessages ?
        React.createElement(ChatWelcome, {status:status, onGuide:setGuide}) :
        null,

      chatReady && !hasMessages ?
        React.createElement('div', {style:{textAlign:'center',padding:'60px 20px',color:'var(--dim)'}},
          React.createElement('div', {style:{fontSize:36,marginBottom:12}}, '✨'),
          React.createElement('div', {style:{fontSize:16,fontWeight:600,color:'var(--text)',marginBottom:4}}, 'You\'re all set!'),
          React.createElement('div', {style:{fontSize:13}}, 'Type a message below to start chatting with your bot.'),
          !k.telegram ? React.createElement('button', {className:'btn btn-sm', style:{marginTop:16,fontSize:12},
            onClick:function(){setGuide('telegram');}}, '📱 Also add Telegram for mobile access →') : null
        ) : null,

      messages.map(function(m, i) {
        return React.createElement(ChatBubble, {key:i, message:m});
      }),

      sending ? React.createElement('div', {style:{display:'flex',justifyContent:'flex-start',marginBottom:12,paddingRight:48}},
        React.createElement('div', {style:{padding:'12px 16px',borderRadius:'16px 16px 16px 4px',background:'var(--card)',boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}},
          React.createElement(TypingDots))
      ) : null
    ),

    // Input area
    React.createElement('div', {style:{padding:'12px 16px',borderTop:'1px solid var(--border)',background:'var(--card)'}},
      React.createElement('div', {style:{display:'flex',gap:8,alignItems:'flex-end'}},
        React.createElement('textarea', {
          ref: inputRef,
          value: input,
          onChange: function(e) { setInput(e.target.value); },
          onKeyDown: handleKeyDown,
          placeholder: chatReady ? 'Type a message... (Enter to send, Shift+Enter for new line)' : 'Set up an API key first to start chatting...',
          disabled: !chatReady || sending,
          rows: 1,
          style: {
            flex:1, padding:'12px 16px', borderRadius:12, border:'1px solid var(--border)',
            background:'var(--bg)', color:'var(--text)', fontSize:14, fontFamily:'inherit',
            resize:'none', outline:'none', minHeight:44, maxHeight:120,
            opacity: chatReady ? 1 : 0.5
          }
        }),
        React.createElement('button', {
          onClick: sendMessage,
          disabled: !chatReady || sending || !input.trim(),
          style: {
            width:44, height:44, borderRadius:12, border:'none',
            background: (!chatReady || !input.trim()) ? 'var(--border)' : 'var(--accent)',
            color: (!chatReady || !input.trim()) ? 'var(--muted)' : '#1a1a1a',
            fontSize:18, cursor: chatReady && input.trim() ? 'pointer' : 'default',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
            transition:'all 0.2s'
          }
        }, sending ? '⏳' : '↑'))
    ),

    // CSS keyframes for typing animation
    React.createElement('style', null,
      '@keyframes pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }')
  );
}
