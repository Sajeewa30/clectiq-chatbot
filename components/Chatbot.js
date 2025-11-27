"use client";
import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";

// Render plain text while keeping markdown link labels visible (URLs hidden)
function renderMessageWithLinks(text, opts = {}) {
  const isTyping = !!opts.isTyping;
  const safeText = String(text ?? "");
  const lines = safeText.split(/\n/);
  const mdLink = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const bareUrl = /(https?:\/\/[^\s]+)/g;

  return lines.map((line, li) => {
    let displayLine = line;
    if (isTyping) {
      const partialMd = /\[([^\]]+)\]\([^)]*$/;
      while (partialMd.test(displayLine)) {
        displayLine = displayLine.replace(partialMd, "$1");
      }
    }

    const pattern = new RegExp(`${mdLink.source}|${bareUrl.source}`, "g");
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(displayLine)) !== null) {
      if (match.index > lastIndex) {
        parts.push(displayLine.slice(lastIndex, match.index));
      }
      let label;
      if (match[1] && match[2]) {
        label = match[1];
      } else {
        label = match[0];
      }
      if (match[1] && match[2]) {
        parts.push(
          <React.Fragment key={`msg-link-${li}-${parts.length}`}>
            {label}
          </React.Fragment>
        );
      }
      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < displayLine.length) {
      parts.push(displayLine.slice(lastIndex));
    }

    return (
      <React.Fragment key={`msg-line-${li}`}>
        {parts}
        {li < lines.length - 1 ? <br /> : null}
      </React.Fragment>
    );
  });
}

function sanitizeTypingDisplay(text) {
  const safe = String(text ?? "");
  const mdComplete = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const bareUrl = /(https?:\/\/[^\s]+)/g;
  const mdPartial = /\[([^\]]+)\]\([^)]*$/;

  const lines = safe.split(/\n/);
  const out = lines.map((line) => {
    let s = line;
    s = s.replace(mdComplete, "$1");
    s = s.replace(bareUrl, "");
    let guard = 0;
    while (mdPartial.test(s) && guard++ < 10) {
      s = s.replace(mdPartial, "$1");
    }
    return s;
  });
  return out.join("\n");
}

const defaultConfig = {
  webhook: { url: "", route: "" },
  typingSpeedMs: 20,
  branding: {
    logo: "",
    name: "Clectiq",
    welcomeText: "",
    responseTimeText: "",
    poweredBy: {
      text: "Powered by Clectiq",
      link: "https://clectiq.com/",
    },
  },
  style: {
    primaryColor: "#2563eb",
    secondaryColor: "#0f172a",
    position: "right",
    backgroundColor: "#f6f7fb",
    fontColor: "#0f172a",
  },
};

export default function Chatbot({ config: userConfig }) {
  const normalizeInput = useCallback((text) => {
    const raw = String(text ?? "");
    const collapsed = raw.replace(/\s+/g, " ").trim();
    return collapsed.replace(/[.!?]+$/g, "");
  }, []);

  const config = useMemo(() => {
    const merged = {
      webhook: { ...defaultConfig.webhook, ...(userConfig?.webhook || {}) },
      branding: { ...defaultConfig.branding, ...(userConfig?.branding || {}) },
      style: { ...defaultConfig.style, ...(userConfig?.style || {}) },
      typingSpeedMs: Number(
        userConfig?.typingSpeedMs ?? defaultConfig.typingSpeedMs
      ),
    };
    return merged;
  }, [userConfig]);

  const [sessionId, setSessionId] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [mounted, setMounted] = useState(false);

  const typingSpeedMs = Math.max(1, Number(config?.typingSpeedMs ?? 20));

  const messagesRef = useRef(null);
  const lastBotRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingMessageIdRef = useRef(null);
  const typingFullTextRef = useRef("");

  useEffect(() => {
    setMounted(true);
    setSessionId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!messages.length) return;
    const container = messagesRef.current;
    if (!container) return;
    const last = messages[messages.length - 1];
    if (last.role === "user") {
      container.scrollTop = container.scrollHeight;
    } else {
      if (lastBotRef.current) {
        lastBotRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [messages]);

  useEffect(() => {
    if (!sending) return;
    const container = messagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [sending]);

  const addMessage = useCallback((role, text) => {
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, role, text }]);
  }, []);

  const extractLinks = useCallback((fullText) => {
    const s = String(fullText || "");
    const mdLinksRaw = [];
    const bareLinksRaw = [];

    const md = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let m;
    while ((m = md.exec(s)) !== null) {
      mdLinksRaw.push({ url: m[2], label: (m[1] || "").trim() });
    }

    const bare = /(https?:\/\/[^\s]+)/g;
    while ((m = bare.exec(s)) !== null) {
      bareLinksRaw.push({ url: m[0], label: m[0] });
    }

    const raw = mdLinksRaw.length ? mdLinksRaw : bareLinksRaw;

    const results = [];
    const seen = new Set();
    for (const it of raw) {
      const cleanedUrl = String(it.url || "").trim();
      if (!cleanedUrl) continue;
      if (seen.has(cleanedUrl)) continue;
      seen.add(cleanedUrl);
      results.push({ url: cleanedUrl, label: it.label });
    }

    return results;
  }, []);

  const typeOutBotMessage = useCallback(
    (fullText) => {
      const text = String(fullText ?? "").trim();

      if (typingTimerRef.current) {
        const prevId = typingMessageIdRef.current;
        const prevFull = typingFullTextRef.current || "";
        if (prevId) {
          setMessages((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex((m) => m.id === prevId);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], text: prevFull };
            }
            return updated;
          });
        }
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      typingMessageIdRef.current = null;
      typingFullTextRef.current = "";

      const len = text.length;
      if (len === 0) return;

      const id = crypto.randomUUID();
      typingMessageIdRef.current = id;
      typingFullTextRef.current = text;
      const links = extractLinks(text);
      setMessages((prev) => [...prev, { id, role: "bot", text: "", links }]);

      let i = 0;

      typingTimerRef.current = setInterval(() => {
        i += 1;
        const targetId = id;
        setMessages((prev) => {
          if (!prev.length) return prev;
          const updated = [...prev];
          const idx = updated.findIndex((m) => m.id === targetId);
          if (idx === -1) return prev;
          updated[idx] = { ...updated[idx], text: text.slice(0, i) };
          return updated;
        });

        const container = messagesRef.current;
        if (container) container.scrollTop = container.scrollHeight;

        if (i >= len) {
          clearInterval(typingTimerRef.current);
          typingTimerRef.current = null;
          typingMessageIdRef.current = null;
        }
      }, typingSpeedMs);
    },
    [typingSpeedMs, extractLinks]
  );

  const sendMessage = useCallback(async () => {
    const display = String(input ?? "").trim();
    const message = normalizeInput(input);
    if (!message || !sessionId || sending) return;
    addMessage("user", display);
    setInput("");
    setSending(true);

    const payload = {
      action: "sendMessage",
      sessionId,
      route: config.webhook.route,
      chatInput: message,
      metadata: { userId: "" },
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let data = null;
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
      const botReply = Array.isArray(data) ? data?.[0]?.output : data?.output;
      setSending(false);
      typeOutBotMessage(botReply || "");
    } catch (e) {
      setSending(false);
      addMessage("bot", "Sorry, there was a problem sending your message.");
    }
  }, [addMessage, config.webhook.route, input, sending, sessionId, typeOutBotMessage, normalizeInput]);

  if (!mounted) return null;

  const hasMessages = messages.length > 0;

  return (
    <div className="chat-shell" style={{ background: "#ffffff", color: config.style.fontColor }}>
      <div className={`chat-body${hasMessages ? " has-messages" : " empty"}`}>
        <div className="chat-messages" ref={messagesRef}>
          {messages.map((m, i) => {
            const isTypingMsg = Boolean(typingTimerRef.current) && m.id === typingMessageIdRef.current;
            const isLastBot = i === messages.length - 1 && m.role === "bot";
            return (
              <div
                key={m.id || i}
              className={`chat-message ${m.role}`}
              ref={isLastBot ? lastBotRef : null}
              style={{ whiteSpace: "pre-wrap" }}
            >
              {isTypingMsg ? sanitizeTypingDisplay(m.text) : renderMessageWithLinks(m.text, { isTyping: false })}
              {m.role === "bot" && m.links?.length ? (
                <div className="chat-links">
                  {m.links.map((link, idx) => (
                    <a
                      key={link.url || idx}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label || "Open link"}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

          {hasFocus && !sending && input && (
            <div className="chat-message user typing-indicator">
              <span className="typing-dots">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </span>
            </div>
          )}

          {sending && (
            <div className="chat-message bot typing-indicator" ref={lastBotRef}>
              <span className="typing-dots">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </span>
            </div>
          )}
        </div>

        <div className={`input-area${hasMessages ? "" : " center"}`}>
          <div className="input-row">
            <textarea
              placeholder="Message Clectiq..."
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setHasFocus(true)}
              onBlur={() => setHasFocus(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button type="button" onClick={sendMessage} disabled={sending || !input.trim()}>
              {sending ? "..." : "Send"}
            </button>
          </div>
          <div className="chat-footer">
            <a href={config.branding.poweredBy.link} target="_blank" rel="noreferrer">
              {config.branding.poweredBy.text}
            </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        .chat-shell {
          width: 100vw;
          height: 100vh;
          background: #ffffff;
          display: flex;
          flex-direction: column;
        }

        .chat-body {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #ffffff;
        }
        .chat-body.has-messages {
          padding-top: 24px;
        }
        .chat-body.empty {
          justify-content: center;
        }
        .chat-body.empty .chat-messages {
          display: none;
        }
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          max-width: 820px;
          margin: 0 auto;
        }
        .chat-message {
          padding: 12px 14px;
          border-radius: 12px;
          max-width: 68%;
          word-wrap: break-word;
          font-size: 15px;
          line-height: 1.5;
          border: 1px solid #e5e7eb;
          background: #ffffff;
          color: #0f172a;
        }
        .chat-message.user {
          align-self: flex-end;
          background: #dbeafe;
          color: #0f172a;
          border-color: #bfdbfe;
          box-shadow: 0 8px 20px rgba(37, 99, 235, 0.15);
        }
        .chat-message.bot {
          align-self: flex-start;
        }
        .chat-message.typing-indicator { display: inline-flex; align-items: center; gap: 8px; }
        .typing-dots { display: inline-flex; gap: 6px; align-items: center; color: #6b7280; }
        .typing-dots .dot {
          width: 6px;
          height: 6px;
          background: currentColor;
          border-radius: 50%;
          opacity: 0.3;
          animation: chat-typing-blink 1.4s infinite both;
        }
        .typing-dots .dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dots .dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes chat-typing-blink {
          0%, 80%, 100% { opacity: 0.2; }
          40% { opacity: 1; }
        }

        .input-area {
          padding: 16px 20px 20px;
          border-top: 1px solid #e5e7eb;
          background: #ffffff;
        }
        .input-area.center {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 20px;
          border-top: none;
        }
        .input-row {
          display: flex;
          gap: 12px;
          align-items: flex-end;
          max-width: 760px;
          margin: 0 auto;
        }
        .chat-body.empty .input-row {
          max-width: 640px;
          width: 100%;
        }
        .input-row textarea {
          flex: 1;
          min-height: 52px;
          max-height: 180px;
          padding: 14px 16px;
          border-radius: 14px;
          border: 1px solid #e5e7eb;
          background: #f9fafb;
          color: #0f172a;
          resize: none;
          font-size: 15px;
        }
        .input-row textarea::placeholder { color: #9ca3af; }
        .input-row button {
          background: linear-gradient(135deg, ${defaultConfig.style.primaryColor} 0%, ${defaultConfig.style.secondaryColor} 100%);
          color: #fff;
          border: 1px solid #dfe3ea;
          border-radius: 12px;
          padding: 0 18px;
          height: 52px;
          cursor: pointer;
          transition: transform 0.2s, filter 0.2s;
          font-weight: 600;
        }
        .input-row button:hover { transform: translateY(-1px); filter: brightness(1.05); }
        .input-row button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          filter: none;
        }

        .chat-footer {
          max-width: 760px;
          margin: 6px auto 0;
          font-size: 12px;
          color: #6b7280;
          text-align: right;
        }
        .chat-footer a { color: #6b7280; text-decoration: none; }
        .chat-footer a:hover { color: #0f172a; }

        .chat-links {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }
        .chat-links a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 10px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          background: linear-gradient(135deg, ${defaultConfig.style.primaryColor} 0%, ${defaultConfig.style.secondaryColor} 100%);
          color: #ffffff;
          border: 1px solid #dfe3ea;
          box-shadow: 0 6px 14px rgba(37, 99, 235, 0.12);
          transition: transform 0.15s ease, filter 0.15s ease;
        }
        .chat-links a:hover {
          transform: translateY(-1px);
          filter: brightness(1.03);
        }
        .chat-links a:active {
          transform: translateY(0);
          filter: brightness(0.98);
        }

        @media (max-width: 768px) {
          .chat-shell { height: 100vh; }
          .input-row { width: 100%; }
          .input-area { padding: 12px 12px 16px; }
        }
      `}</style>
    </div>
  );
}
