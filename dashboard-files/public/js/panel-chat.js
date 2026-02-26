/* ============================================
   QuickClaw Dashboard — Chat Panel v2
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
          'Copy the key (starts with <code style="background:var(--bg);padding:2px 6px;border-radius:4px">sk-</code>)',
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
          'Copy the key (starts with <code style="background:var(--bg);padding:2px 6px;border-radius:4px">sk-ant-</code>)',
          'Paste it below and click Save'
        ],
        placeholder: 'sk-ant-...',
        provider: 'anthropic'
      },
      {
        id: 'oauth',
        icon: '🔐',
        title: 'OpenAI OAuth (Free — No API Key Needed)',
        steps: [
          'Go to the <b>Profile</b> tab in the sidebar',
          'Click on your profile, then open the <b>Auth</b> sub-tab',
          'Click <b>"Start OAuth Login"</b>',
          'Sign in with your OpenAI account — free tier works!',
          'Come back here — you\'re all set!'
        ],
        provider: 'oauth'
      }
    ]
  },
  telegram: {
    title: 'Chat on Your Phone via Telegram',
    subtitle: 'Takes about 2 minutes to set up',
    hasInput: true,
    inputProvider: 'telegram',
    inputPlaceholder: '123456789:ABCdef...',
    inputLabel: '\uD83D\uDC47 Paste your bot token from BotFather here:',
    steps: [
      'Open <b>Telegram</b> on your phone (free from App Store / Play Store)',
      'Search for <b>@BotFather</b> and open a chat with it',
      'Send the command <code style="background:var(--bg);padding:2px 6px;border-radius:4px">/newbot</code>',
      'Choose a <b>name</b> and a <b>username</b> ending in "bot"',
      'BotFather gives you a <b>bot token</b> \u2014 copy it!'
    ],
    afterSaveNote: 'Token saved and gateway restarting! Open your bot in Telegram and send /start — your AI will reply!'
  },
  voice: {
    title: 'Voice-to-Voice Chat',
    subtitle: 'Talk to your bot with your actual voice via Telegram',
    steps: [
      'First, complete Telegram setup above so your bot is connected',
      'Open your bot\'s chat in the <b>Telegram app</b>',
      'Tap the <b>microphone icon</b> next to the message box',
      'Hold to record, release to send — your bot will <b>transcribe</b> your voice and reply',
      'For <b>voice replies back</b>, add this to your bot\'s <b>soul.md</b> file:<br><code style="background:var(--bg);padding:4px 8px;border-radius:4px;display:inline-block;margin-top:4px">When the user sends a voice message, always reply with a voice note.</code>',
      'You can edit soul.md in <b>Profile &#8594; Soul</b> tab in this dashboard',
      'Pro tip: Pin your bot to Telegram\'s top bar for instant voice access anytime!'
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

  function handleSave(overrideProvider) {
    var provider = overrideProvider || selectedProvider;
    if (!inputVal.trim() || !provider) return;
    onKeySave(provider, inputVal.trim());
    setSaved(true);
    setTimeout(function() { onClose(); }, 1800);
  }

  var overlay = {position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(4px)'};
  var modal = {background:'var(--card)',borderRadius:16,maxWidth:560,width:'100%',maxHeight:'85vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.5)',border:'1px solid var(--border)'};

  return React.createElement('div', {style:overlay, onClick:function(e){if(e.target===e.currentTarget)onClose();}},
    React.createElement('div', {style:modal},
      React.createElement('div', {style:{padding:'28px 28px 0',textAlign:'center'}},
        React.createElement('div', {style:{fontSize:36,marginBottom:8}}, guide==='apiKey'?'🚀':guide==='telegram'?'📱':'🎙️'),
        React.createElement('h2', {style:{margin:0,fontSize:22,color:'var(--text)',fontWeight:800}}, g.title),
        React.createElement('p', {style:{margin:'6px 0 0',fontSize:13,color:'var(--dim)'}}, g.subtitle)),
      React.createElement('div', {style:{padding:'20px 28px 28px'}},

        guide === 'apiKey' ? React.createElement('div', null,
          g.steps.map(function(opt) {
            var isSelected = selectedProvider === opt.provider;
            var cardStyle = {border:'2px solid '+(isSelected?'var(--accent)':'var(--border)'),borderRadius:12,padding:16,marginBottom:12,cursor:'pointer',transition:'all 0.2s',background:isSelected?'rgba(255,180,60,0.06)':'transparent'};
            return React.createElement('div', {key:opt.id, style:cardStyle, onClick:function(){setProvider(opt.provider);setSaved(false);}},
              React.createElement('div', {style:{display:'flex',alignItems:'center',gap:8,marginBottom:isSelected?12:0}},
                React.createElement('span', {style:{fontSize:20}}, opt.icon),
                React.createElement('span', {style:{fontWeight:700,fontSize:14,flex:1}}, opt.title),
                isSelected ? React.createElement('span', {style:{fontSize:11,color:'var(--accent)',fontWeight:700,background:'rgba(255,180,60,0.15)',padding:'2px 8px',borderRadius:6}}, 'SELECTED') :
                  React.createElement('span', {style:{fontSize:16,color:'var(--dim)'}}, '\u203A')),
              isSelected && opt.steps ? React.createElement('div', {style:{borderTop:'1px solid var(--border)',paddingTop:12,marginTop:4}},
                React.createElement('ol', {style:{margin:'0 0 16px',paddingLeft:22,fontSize:13,lineHeight:2,color:'var(--dim)'}},
                  opt.steps.map(function(s,i){return React.createElement('li',{key:i,style:{paddingLeft:4},dangerouslySetInnerHTML:{__html:s}});})),
                opt.provider !== 'oauth' ? React.createElement('div', {style:{display:'flex',gap:8}},
                  React.createElement('input', {type:'password', value:inputVal, onChange:function(e){setInput(e.target.value);},
                    placeholder:opt.placeholder,
                    onFocus:function(e){e.target.type='text';},
                    onBlur:function(e){if(!inputVal)e.target.type='password';},
                    style:{flex:1,padding:'12px 14px',borderRadius:10,border:'2px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:14,fontFamily:'monospace',outline:'none'}}),
                  React.createElement('button', {onClick:handleSave,
                    disabled:!inputVal.trim()||saving,
                    style:{padding:'12px 24px',borderRadius:10,fontWeight:800,fontSize:14,border:'none',cursor:inputVal.trim()&&!saving?'pointer':'default',
                      background:saved?'var(--green)':inputVal.trim()?'var(--accent)':'var(--border)',
                      color:saved?'#fff':inputVal.trim()?'#1a1a1a':'var(--muted)',transition:'all 0.2s'}},
                    saved ? '\u2713 Saved!' : saving ? '...' : 'Save')
                ) : React.createElement('div', {style:{padding:14,borderRadius:10,background:'var(--bg)',fontSize:13,color:'var(--dim)',textAlign:'center',lineHeight:1.5}},
                  '\uD83D\uDC49 Head to the Profile \u2192 Auth tab in the sidebar to start the OAuth flow. No credit card needed!')
              ) : null);
          })
        ) :

        React.createElement('div', null,
          React.createElement('ol', {style:{margin:0,paddingLeft:22,fontSize:13,lineHeight:2.2,color:'var(--dim)'}},
            g.steps.map(function(s,i){return React.createElement('li',{key:i,style:{paddingLeft:4,marginBottom:4},dangerouslySetInnerHTML:{__html:s}});})),

          // Prominent inline input for Telegram token
          g.hasInput ? React.createElement('div', {style:{marginTop:20,padding:20,borderRadius:14,
            background:'linear-gradient(135deg, rgba(255,180,60,0.1), rgba(255,120,0,0.05))',
            border:'2px solid rgba(255,180,60,0.35)'}},
            React.createElement('div', {style:{fontSize:14,fontWeight:800,marginBottom:12,color:'var(--text)',display:'flex',alignItems:'center',gap:8}},
              React.createElement('span',{style:{fontSize:20}},'\uD83D\uDD11'),
              g.inputLabel || 'Paste here:'),
            React.createElement('div', {style:{display:'flex',gap:8}},
              React.createElement('input', {type:'text', value:inputVal, onChange:function(e){setInput(e.target.value);},
                placeholder:g.inputPlaceholder || '',
                autoFocus:true,
                style:{flex:1,padding:'14px 16px',borderRadius:10,border:'2px solid var(--border)',
                  background:'var(--card)',color:'var(--text)',fontSize:15,fontFamily:'monospace',outline:'none'}}),
              React.createElement('button', {onClick:function(){handleSave(g.inputProvider);},
                disabled:!inputVal.trim()||saving,
                style:{padding:'14px 28px',borderRadius:10,fontWeight:800,fontSize:15,border:'none',
                  cursor:inputVal.trim()&&!saving?'pointer':'default',
                  background:saved?'var(--green)':inputVal.trim()?'var(--accent)':'var(--border)',
                  color:saved?'#fff':inputVal.trim()?'#1a1a1a':'var(--muted)',transition:'all 0.2s'}},
                saved ? '\u2713 Saved!' : saving ? '...' : 'Save')),
            saved && g.afterSaveNote ? React.createElement('div', {style:{marginTop:14,padding:14,borderRadius:10,
              background:'rgba(80,200,120,0.1)',border:'1px solid rgba(80,200,120,0.2)',fontSize:13,color:'var(--green)',lineHeight:1.6}},
              '\u2713 ', g.afterSaveNote,
              guide === 'telegram' ? React.createElement('div',{style:{marginTop:8,fontSize:12,color:'var(--dim)'}},
                'Open your bot in Telegram and send a message \u2014 your AI will reply!') : null) : null
          ) : null,

          guide === 'telegram' ? React.createElement('div', {style:{marginTop:14,padding:12,borderRadius:10,
            background:'rgba(255,180,60,0.08)',border:'1px solid rgba(255,180,60,0.15)',fontSize:12,color:'var(--dim)',lineHeight:1.5,textAlign:'center'}},
            '\uD83D\uDCA1 Don\'t have Telegram yet? It\'s free for iPhone, Android, Mac, Windows, and web at ',
            React.createElement('a',{href:'https://telegram.org',target:'_blank',style:{color:'var(--accent)'}},'telegram.org')) : null
        ),

        React.createElement('div', {style:{display:'flex',justifyContent:'center',gap:10,marginTop:24}},
          !saved ? React.createElement('button', {onClick:onClose,
            style:{padding:'12px 28px',borderRadius:10,background:'transparent',color:'var(--muted)',fontSize:13,fontWeight:600,border:'1px solid var(--border)',cursor:'pointer'}},
            'Skip for now') : null,
          React.createElement('button', {onClick:onClose,
            style:{padding:'12px 36px',borderRadius:10,background:saved?'var(--accent)':'var(--border)',color:saved?'#1a1a1a':'var(--text)',fontSize:14,fontWeight:700,border:'none',cursor:'pointer',transition:'all 0.2s'}},
            saved ? '\uD83C\uDF89 Done! Start Chatting' : 'Close'))
      )
    )
  );
}

// ─── Setup Status Cards (always visible at top) ───
function SetupCards(props) {
  var status = props.status;
  var onGuide = props.onGuide;
  var k = status.keys || {};
  var hasKey = k.openai || k.anthropic || k.oauth;

  function chip(icon, label, ready, action) {
    return React.createElement('button', {
      onClick: action,
      style:{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,
        background:ready?'rgba(80,200,120,0.1)':'rgba(255,180,60,0.08)',
        border:'1px solid '+(ready?'rgba(80,200,120,0.3)':'rgba(255,180,60,0.25)'),
        color:ready?'var(--green)':'var(--accent)',fontSize:12,fontWeight:600,
        cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.2s',outline:'none'}
    }, React.createElement('span', null, icon), label, ready ? ' \u2713' : ' \u2192');
  }

  return React.createElement('div', {style:{display:'flex',gap:8,padding:'10px 16px',borderBottom:'1px solid var(--border)',overflowX:'auto',flexWrap:'wrap',alignItems:'center'}},
    React.createElement('span', {style:{fontSize:11,color:'var(--muted)',fontWeight:600,marginRight:4}}, 'SETUP:'),
    chip('\uD83D\uDD11', hasKey ? 'API Key' : 'Add API Key', hasKey, function(){onGuide('apiKey');}),
    chip('\u26A1', 'Gateway', status.gateway && status.gateway.running, function(){}),
    chip('\uD83D\uDCF1', k.telegram ? 'Telegram' : 'Add Telegram', k.telegram, function(){onGuide('telegram');}),
    chip('\uD83C\uDF99\uFE0F', 'Voice Chat', false, function(){onGuide('voice');}),
    status.chatReady ? React.createElement('span', {style:{marginLeft:'auto',fontSize:11,color:'var(--green)',fontWeight:600}},
      '\u25CF Connected via ' + (status.chatMethod === 'openai-direct' ? 'OpenAI' :
        status.chatMethod === 'anthropic-direct' ? 'Anthropic' :
        status.chatMethod === 'gateway' ? 'Gateway' : status.chatMethod)) : null);
}

// ─── Welcome Screen ───
function ChatWelcome(props) {
  var status = props.status;
  var onGuide = props.onGuide;
  var k = status.keys || {};
  var hasKey = k.openai || k.anthropic || k.oauth;

  var cardGrid = {display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:28,textAlign:'left'};
  function bigCard(icon, title, desc, action, ready, actionLabel) {
    return React.createElement('div', {
      onClick:action,
      style:{padding:20,borderRadius:14,background:'var(--card)',border:'2px solid '+(ready?'var(--green)':'var(--border)'),
        cursor:action?'pointer':'default',transition:'all 0.2s'}},
      React.createElement('div', {style:{display:'flex',alignItems:'center',gap:10,marginBottom:8}},
        React.createElement('span', {style:{fontSize:28}}, icon),
        React.createElement('div', {style:{flex:1}},
          React.createElement('div', {style:{fontWeight:700,fontSize:14}}, title),
          React.createElement('div', {style:{fontSize:11,color:'var(--dim)',marginTop:2}}, desc))),
      React.createElement('div', {style:{fontSize:12,fontWeight:700,color:ready?'var(--green)':'var(--accent)'}},
        ready ? '\u2713 Connected' : (actionLabel || 'Set up \u2192')));
  }

  return React.createElement('div', {style:{textAlign:'center',padding:'32px 20px',maxWidth:520,margin:'0 auto'}},
    React.createElement('div', {style:{fontSize:52,marginBottom:12}}, '\uD83E\uDD16'),
    React.createElement('h2', {style:{margin:0,fontSize:24,color:'var(--text)',fontWeight:800}}, 'Welcome to OpenClaw Chat'),
    React.createElement('p', {style:{color:'var(--dim)',fontSize:14,marginTop:10,lineHeight:1.6,maxWidth:420,margin:'10px auto 0'}},
      hasKey ? 'Your AI is connected and ready! Type a message below to start a conversation.' :
      'Get your AI bot up and running in just a few steps. It\'s easier than you think!'),

    React.createElement('div', {style:cardGrid},
      bigCard('\uD83D\uDD11', 'AI API Key', hasKey ? 'Key connected' : 'Connect OpenAI or Anthropic', function(){onGuide('apiKey');}, hasKey),
      bigCard('\u26A1', 'Gateway', status.gateway&&status.gateway.running ? 'Process running' : 'Bot engine', null, status.gateway&&status.gateway.running, 'Auto'),
      bigCard('\uD83D\uDCF1', 'Telegram', k.telegram ? 'Bot connected' : 'Chat from your phone', function(){onGuide('telegram');}, k.telegram),
      bigCard('\uD83C\uDF99\uFE0F', 'Voice Chat', 'Talk with your voice', function(){onGuide('voice');}, false, 'Learn how \u2192')),

    !hasKey ? React.createElement('button', {
      onClick:function(){onGuide('apiKey');},
      style:{marginTop:28,padding:'16px 48px',borderRadius:14,fontSize:16,fontWeight:800,border:'none',cursor:'pointer',
        background:'var(--accent)',color:'#1a1a1a',boxShadow:'0 4px 20px rgba(255,180,60,0.3)',transition:'all 0.2s'}},
      '\uD83D\uDE80 Get Started') : null,

    hasKey && !k.telegram ? React.createElement('button', {
      onClick:function(){onGuide('telegram');},
      style:{marginTop:20,padding:'10px 24px',borderRadius:10,fontSize:13,fontWeight:600,border:'1px solid var(--border)',cursor:'pointer',background:'transparent',color:'var(--accent)'}},
      '\uD83D\uDCF1 Next: Add Telegram for mobile access') : null,

    hasKey ? React.createElement('div', {style:{fontSize:13,color:'var(--muted)',marginTop:20}}, '\u2B07 Start typing below to chat with your bot') : null);
}

// ─── Typing Indicator ───
function TypingDots() {
  return React.createElement('div', {style:{display:'flex',gap:4,padding:'8px 0',alignItems:'center'}},
    React.createElement('span', {style:{fontSize:11,color:'var(--dim)',marginRight:4}}, 'Thinking'),
    [0,1,2].map(function(i) {
      return React.createElement('div', {key:i, style:{
        width:7, height:7, borderRadius:'50%', background:'var(--accent)',
        opacity:0.4, animation:'pulse 1.2s ease-in-out '+(i*0.2)+'s infinite'
      }});
    }));
}

// ─── Message Bubble ───
function ChatBubble(props) {
  var m = props.message;
  var isUser = m.role === 'user';
  var isError = !isUser && m.content && m.content.indexOf('\u26A0') === 0;
  var bubble = {
    padding:'14px 18px',borderRadius:isUser?'18px 18px 4px 18px':'18px 18px 18px 4px',
    background:isError?'rgba(255,80,80,0.1)':isUser?'var(--accent)':'var(--card)',
    color:isError?'var(--red)':isUser?'#1a1a1a':'var(--text)',
    border:isError?'1px solid rgba(255,80,80,0.2)':'none',
    fontSize:14,lineHeight:1.7,wordBreak:'break-word',
    whiteSpace:'pre-wrap',boxShadow:'0 2px 6px rgba(0,0,0,0.12)'
  };

  return React.createElement('div', {style:{display:'flex',justifyContent:isUser?'flex-end':'flex-start',marginBottom:16,paddingLeft:isUser?60:0,paddingRight:isUser?0:60}},
    React.createElement('div', {style:{maxWidth:'100%'}},
      !isUser ? React.createElement('div', {style:{fontSize:10,color:'var(--dim)',marginBottom:3,fontWeight:600}}, '\uD83E\uDD16 Bot') : null,
      React.createElement('div', {style:bubble}, m.content),
      m.ts ? React.createElement('div', {style:{fontSize:10,color:'var(--muted)',marginTop:3,textAlign:isUser?'right':'left'}},
        new Date(m.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})) : null));
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
  var scrollRef = useRef(null);

  useEffect(function() {
    loadStatus();
    api('/chat/history').then(function(r) {
      if (r.messages) setMessages(r.messages);
      setLoaded(true);
    }).catch(function() { setLoaded(true); });
  }, []);

  function loadStatus() {
    return api('/chat/status').then(function(s) { setStatus(s); return s; }).catch(function() {});
  }

  useEffect(function() {
    if (scrollRef.current) setTimeout(function(){ scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 50);
  }, [messages, sending]);

  // Auto-open guide for first-run users or users without API keys
  useEffect(function() {
    if (status && (status.firstRun || !status.chatReady) && loaded && messages.length === 0) {
      var t = setTimeout(function(){ setGuide('apiKey'); }, 600);
      return function(){ clearTimeout(t); };
    }
  }, [status, loaded]);

  function sendMessage() {
    var msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    setMessages(function(prev){return prev.concat([{role:'user',content:msg,ts:new Date().toISOString()}]);});
    setSending(true);
    api('/chat/send', {method:'POST', body:{message:msg, history:messages.slice(-20)}})
      .then(function(r) {
        setSending(false);
        if (r.ok) {
          setMessages(function(prev){return prev.concat([{role:'assistant',content:r.reply,ts:new Date().toISOString()}]);});
        } else {
          setMessages(function(prev){return prev.concat([{role:'assistant',content:'\u26A0\uFE0F '+(r.error||'Something went wrong'),ts:new Date().toISOString()}]);});
          if (r.error && r.error.indexOf('No API keys') >= 0) setTimeout(function(){ setGuide('apiKey'); }, 500);
        }
      })
      .catch(function(e) {
        setSending(false);
        setMessages(function(prev){return prev.concat([{role:'assistant',content:'\u26A0\uFE0F Network error: '+e.message,ts:new Date().toISOString()}]);});
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
          if (provider === 'telegram') {
            if (r.gatewayRestarted) {
              toast('Token saved & gateway restarted! Open your bot in Telegram and send /start', 'success');
            } else {
              toast('Token saved! Start the gateway from the Dashboard, then message your bot.', 'success');
            }
          } else {
            toast('API key saved! You can start chatting now.', 'success');
          }
          api('/chat/complete-setup', {method:'POST'}).catch(function(){});
          loadStatus();
        } else {
          toast(r.error || 'Failed to save', 'error');
        }
      })
      .catch(function() { setSaving(false); toast('Failed to save', 'error'); });
  }

  function clearHistory() {
    if (!confirm('Clear all chat history?')) return;
    api('/chat/history', {method:'DELETE'}).then(function() { setMessages([]); toast('Chat cleared', 'success'); }).catch(function(){});
  }

  if (!status) return React.createElement('div', {style:{display:'flex',alignItems:'center',justifyContent:'center',height:'50vh',color:'var(--dim)'}},
    React.createElement('div', {style:{textAlign:'center'}}, React.createElement('div', {style:{fontSize:32,marginBottom:8}}, '\uD83D\uDCAC'), 'Loading chat...'));

  var chatReady = status.chatReady;

  return React.createElement('div', {style:{display:'flex',flexDirection:'column',height:'calc(100vh - 80px)',maxHeight:'calc(100vh - 80px)'}},

    React.createElement(SetupCards, {status:status, onGuide:setGuide}),

    guide ? React.createElement(GuidePopup, {guide:guide, onClose:function(){setGuide(null); loadStatus();}, onKeySave:handleKeySave, saving:saving}) : null,

    React.createElement('div', {ref:scrollRef, style:{flex:1,overflowY:'auto',padding:'20px 20px 12px'}},
      messages.length === 0 ? React.createElement(ChatWelcome, {status:status, onGuide:setGuide}) : null,
      messages.map(function(m, i) { return React.createElement(ChatBubble, {key:i, message:m}); }),
      sending ? React.createElement('div', {style:{display:'flex',justifyContent:'flex-start',marginBottom:16,paddingRight:60}},
        React.createElement('div', {style:{padding:'12px 16px',borderRadius:'16px 16px 16px 4px',background:'var(--card)',boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}},
          React.createElement(TypingDots))) : null),

    React.createElement('div', {style:{padding:'12px 16px',borderTop:'1px solid var(--border)',background:'var(--card)'}},
      !chatReady ? React.createElement('div', {style:{textAlign:'center',padding:'6px 0 10px',fontSize:13,color:'var(--dim)'}},
        '\uD83D\uDD11 Connect an API key to start chatting ',
        React.createElement('button', {onClick:function(){setGuide('apiKey');},
          style:{background:'var(--accent)',color:'#1a1a1a',border:'none',padding:'4px 14px',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer'}},
          'Set Up Now')) : null,
      React.createElement('div', {style:{display:'flex',gap:8,alignItems:'flex-end'}},
        React.createElement('textarea', {
          value: input,
          onChange: function(e) { setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'; },
          onKeyDown: handleKeyDown,
          placeholder: chatReady ? 'Type a message... (Enter to send)' : 'Connect an API key first...',
          disabled: !chatReady || sending,
          rows: 1,
          style: {flex:1,padding:'12px 16px',borderRadius:12,border:'2px solid '+(chatReady?'var(--border)':'rgba(255,80,80,0.2)'),
            background:'var(--bg)',color:'var(--text)',fontSize:14,fontFamily:'inherit',
            resize:'none',outline:'none',minHeight:44,maxHeight:120,opacity:chatReady?1:0.4,transition:'all 0.2s'}
        }),
        React.createElement('button', {
          onClick: sendMessage, disabled: !chatReady || sending || !input.trim(),
          style:{width:44,height:44,borderRadius:12,border:'none',
            background:(!chatReady||!input.trim())?'var(--border)':'var(--accent)',
            color:(!chatReady||!input.trim())?'var(--muted)':'#1a1a1a',
            fontSize:18,cursor:chatReady&&input.trim()?'pointer':'default',
            display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.2s'}
        }, sending ? '\u23F3' : '\u2191'),
        messages.length > 0 ? React.createElement('button', {
          onClick: clearHistory, title: 'Clear chat',
          style:{width:44,height:44,borderRadius:12,border:'1px solid var(--border)',background:'transparent',
            color:'var(--muted)',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}
        }, '\uD83D\uDDD1') : null)),

    React.createElement('style', null,
      '@keyframes pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }'));
}
