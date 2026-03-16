import { useState, useEffect, useRef, useCallback } from "react";

const SYSTEM_PROMPT = `You are Alex, a warm and witty native English speaker who also understands Spanish. You're chatting with someone who wants to improve their conversational English. You're a genuine friend — encouraging, fun, never condescending.

YOUR CORE GOALS:
1. Keep the conversation flowing naturally. You love talking about all kinds of topics: weather, travel, food, movies, music, sports, tech, pop culture, celebrities, news, life in general.
2. When a user starts a conversation, you enthusiastically introduce yourself briefly, then quickly find a topic to talk about. Ask questions. Show curiosity. React to what they say.
3. If someone writes or speaks in Spanish, respond in English but acknowledge what they said so they feel understood.
4. GENTLY CORRECT mistakes. When you notice a grammar mistake, correct it naturally as part of your reply, like: "Just a quick tip — instead of saying X, we say Y in English!" Mark the correction with 💡 at the start of that sentence. Then ALWAYS follow the correction by asking: "Would you like to practice this or learn more about it?"
5. PRACTICE MODE: If the user says yes to practicing, do the following:
   - Tell them: "Great! Repeat these sentences after me:"
   - Give them exactly 3 short, simple sentences that use the same grammar rule they got wrong
   - Number them: 1, 2, 3
   - After each sentence the user repeats, give brief encouraging feedback like "Perfect!", "Exactly right!", or "Well done!"
   - If they make the same mistake again while repeating, gently correct them again and ask them to try once more
   - After all 3 sentences are done, celebrate their effort and naturally return to the conversation
6. LEARN MORE MODE: If the user says yes to learning more, give a short, friendly explanation of the grammar rule in 2-3 sentences max. Use simple language, no technical jargon. Then give 2 quick examples. Then ask if they want to practice with 3 sentences.
7. If the user says no to practicing or learning more, simply continue the conversation naturally without dwelling on the mistake.
8. Celebrate their wins. If they say something especially well in English, tell them!
9. Keep responses conversational and not too long — you're chatting, not lecturing. 2-4 sentences is usually perfect outside of practice mode.
10. Your tone is warm, playful, and curious. Use contractions. Use casual language. Be genuinely interested.

CORRECTION EXAMPLES:
- "I is married" → correct to "I am married" + 💡 tip + ask if they want to practice or learn more
- "I want to buy a car red" → correct to "the red car" + 💡 tip about adjective order + ask if they want to practice
- "How se dice 'mariposa' in english?" → tell them it's "butterfly" + use it in a sentence + ask if they want to practice
- "Yesterday I go to the store" → correct to "went" + 💡 tip about past tense + ask if they want to practice
- "I am very boring today" → clarify "bored" vs "boring" + 💡 tip + ask if they want to practice

PRACTICE SESSION EXAMPLE:
User: "I is married"
Alex: "Just a quick tip — instead of 'I is', we say 'I am' in English! 💡 Would you like to practice this or learn more about it?"
User: "practice"
Alex: "Great! Repeat these sentences after me:
1. I am tired.
2. I am happy.
3. I am ready."
User: "I am tired. I am happy. I am ready."
Alex: "Perfect! You nailed all three! See how natural 'I am' feels now? So tell me — are you actually tired today, or are you feeling energized?"

Always end responses that are topic-openers with a question to keep the conversation going.`;

const TOPIC_STARTERS = [
  "the weather or seasons",
  "travel and dream destinations",
  "favorite foods or restaurants",
  "music they love",
  "a recent movie or TV show",
  "their daily routine",
  "hobbies and free time",
  "news or current events",
];

export default function VoiceChatFriend() {
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [waveAmplitudes, setWaveAmplitudes] = useState([0.2, 0.4, 0.3, 0.5, 0.2]);

  const recognitionRef = useRef(null);
  const audioRef = useRef(null); // current playing Audio object
  const messagesEndRef = useRef(null);
  const animFrameRef = useRef(null);
  const waveTimerRef = useRef(null);

  // Animate waveform
  useEffect(() => {
    if (isListening || isSpeaking) {
      waveTimerRef.current = setInterval(() => {
        setWaveAmplitudes(
          Array.from({ length: 5 }, () => Math.random() * 0.7 + 0.15)
        );
      }, 120);
    } else {
      clearInterval(waveTimerRef.current);
      setWaveAmplitudes([0.2, 0.15, 0.25, 0.15, 0.2]);
    }
    return () => clearInterval(waveTimerRef.current);
  }, [isListening, isSpeaking]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const speak = useCallback(async (text) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    try {
      setIsSpeaking(true);
      const response = await fetch("https://alan-chat-two.vercel.app/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error("TTS failed");
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      await new Promise((resolve) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; setIsSpeaking(false); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; setIsSpeaking(false); resolve(); };
        audio.play().catch(() => { setIsSpeaking(false); resolve(); });
      });
    } catch { setIsSpeaking(false); }
  }, []);

  const sendMessage = useCallback(
    async (userText) => {
      if (!userText.trim()) return;

      const newUserMsg = { role: "user", content: userText };
      const updatedMessages = [...messages, newUserMsg];
      setMessages(updatedMessages);
      setIsThinking(true);
      setTranscript("");

      try {
        const response = await fetch("https://alan-chat-two.vercel.app/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            system: SYSTEM_PROMPT,
            messages: updatedMessages,
          }),
        });

        const data = await response.json();
        const replyText = data.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");

        setMessages((prev) => [...prev, { role: "assistant", content: replyText }]);
	setIsThinking(false);
	speak(replyText.replace(/💡/g, "").trim()); // speak without emoji tips
      } catch (err) {
        setIsThinking(false);
        setError("Oops, something went wrong. Try again!");
      }
    },
    [messages, speak]
  );

  const startConversation = useCallback(async () => {
    setHasStarted(true);
    setIsThinking(true);
    const starter = TOPIC_STARTERS[Math.floor(Math.random() * TOPIC_STARTERS.length)];
    const initMsg = {
      role: "user",
      content: `[System: The user just opened the chat. Greet them warmly as Alex, introduce yourself in 1 sentence, then ask for their name. Once they give their name, use it naturally in the conversation going forward and bring up ${starter} to get the conversation going. Keep it short and friendly.]`,    };
    try {
      const response = await fetch("https://alan-chat-two.vercel.app/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [initMsg],
        }),
      });
      const data = await response.json();
      const replyText = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      setMessages([{ role: "assistant", content: replyText }]);
      setIsThinking(false);
      await speak(replyText.replace(/💡/g, "").trim());
    } catch {
      setIsThinking(false);
      setError("Couldn't connect. Check your API key.");
    }
  }, [speak]);

  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setError("Your browser doesn't support voice input. Try Chrome.");
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsSpeaking(false);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = "en-US";
recognition.interimResults = true;
recognition.continuous = true;
recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join("");
      setTranscript(t);
    };
    recognition.onend = () => {
  if (recognitionRef.current && recognitionRef.current._shouldRestart) {
    recognition.start();
  } else {
    setIsListening(false);
    setTranscript((t) => {
      if (t.trim()) sendMessage(t);
      return "";
    });
  }
};
    recognition.onerror = (e) => {
      setIsListening(false);
      if (e.error !== "no-speech") setError(`Voice error: ${e.error}`);
    };

    recognition._shouldRestart = true;
recognitionRef.current = recognition;
recognition.start();
  }, [sendMessage]);

  const stopListening = useCallback(() => {
  if (recognitionRef.current) {
    recognitionRef.current._shouldRestart = false;
    recognitionRef.current.stop();
  }
}, []);

  const formatMessage = (text) => {
    const parts = text.split(/(💡[^\n]*)/g);
    return parts.map((part, i) =>
      part.startsWith("💡") ? (
        <span key={i} style={styles.tip}>{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.avatarWrapper}>
            <div style={styles.avatar}>
              <svg viewBox="0 0 40 40" width="40" height="40" fill="none">
                <circle cx="20" cy="16" r="8" fill="#fff" opacity="0.9" />
                <ellipse cx="20" cy="34" rx="13" ry="9" fill="#fff" opacity="0.7" />
              </svg>
            </div>
            <div style={styles.onlineDot} />
          </div>
          <div style={styles.headerText}>
            <div style={styles.name}>Alex</div>
            <div style={styles.subtitle}>English conversation friend</div>
          </div>
          {/* Waveform */}
          <div style={styles.waveform}>
            {waveAmplitudes.map((amp, i) => (
              <div
                key={i}
                style={{
                  ...styles.waveBar,
                  height: `${amp * 36}px`,
                  opacity: isListening || isSpeaking ? 0.9 : 0.3,
                  background: isListening ? "#f59e0b" : isSpeaking ? "#34d399" : "#94a3b8",
                  transition: "height 0.12s ease, opacity 0.3s",
                }}
              />
            ))}
          </div>
        </div>

        {/* Messages */}
        <div style={styles.messages}>
          {!hasStarted && !isThinking && (
            <div style={styles.welcomeBox}>
              <div style={styles.welcomeEmoji}>👋</div>
              <div style={styles.welcomeTitle}>Ready to chat?</div>
              <div style={styles.welcomeBody}>
                Alex will help you practice English conversation naturally — and gently correct any mistakes along the way.
              </div>
              <button style={styles.startBtn} onClick={startConversation}>
                Start talking with Alex
              </button>
            </div>
          )}

          {isThinking && messages.length === 0 && (
            <div style={styles.thinking}>
              <span style={styles.dot} />
              <span style={{ ...styles.dot, animationDelay: "0.2s" }} />
              <span style={{ ...styles.dot, animationDelay: "0.4s" }} />
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                ...styles.msgRow,
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {msg.role === "assistant" && (
                <div style={styles.smallAvatar}>A</div>
              )}
              <div
                style={
                  msg.role === "user" ? styles.userBubble : styles.assistantBubble
                }
              >
                {msg.role === "assistant" ? formatMessage(msg.content) : msg.content}
              </div>
            </div>
          ))}

          {isThinking && messages.length > 0 && (
            <div style={{ ...styles.msgRow, justifyContent: "flex-start" }}>
              <div style={styles.smallAvatar}>A</div>
              <div style={{ ...styles.assistantBubble, ...styles.thinking }}>
                <span style={styles.dot} />
                <span style={{ ...styles.dot, animationDelay: "0.2s" }} />
                <span style={{ ...styles.dot, animationDelay: "0.4s" }} />
              </div>
            </div>
          )}

          {error && <div style={styles.errorMsg}>{error}</div>}
          {transcript && (
            <div style={{ ...styles.msgRow, justifyContent: "flex-end" }}>
              <div style={{ ...styles.userBubble, opacity: 0.6, fontStyle: "italic" }}>
                {transcript}…
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Controls */}
        {hasStarted && (
          <div style={styles.controls}>
            <div style={styles.statusLabel}>
              {isListening ? "Listening…" : isSpeaking ? "Alex is speaking…" : isThinking ? "Thinking…" : "Tap to speak"}
            </div>
            <button
              style={{
                ...styles.micBtn,
                background: isListening
                  ? "linear-gradient(135deg, #f59e0b, #ef4444)"
                  : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                boxShadow: isListening
                  ? "0 0 0 8px rgba(245,158,11,0.2), 0 8px 24px rgba(239,68,68,0.4)"
                  : "0 8px 24px rgba(99,102,241,0.4)",
                transform: isListening ? "scale(1.08)" : "scale(1)",
              }}
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              disabled={isSpeaking || isThinking}
            >
              {isListening ? (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="white">
                  <rect x="6" y="4" width="4" height="16" rx="2" />
                  <rect x="14" y="4" width="4" height="16" rx="2" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="white">
                  <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" strokeWidth="2" stroke="white" fill="none" strokeLinecap="round" />
                  <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  <line x1="8" y1="23" x2="16" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <div style={styles.hint}>Hold to record · Release to send</div>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  wrapper: {
    fontFamily: "'DM Sans', sans-serif",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
    padding: "20px",
  },
  card: {
    width: "100%",
    maxWidth: "480px",
    background: "#0f1117",
    borderRadius: "24px",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    height: "600px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "20px 24px",
    background: "linear-gradient(135deg, #1e1b4b, #1a1035)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  avatarWrapper: { position: "relative" },
  avatar: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    position: "absolute",
    bottom: "2px",
    right: "2px",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: "#34d399",
    border: "2px solid #1e1b4b",
  },
  headerText: { flex: 1 },
  name: {
    fontFamily: "'Lora', serif",
    fontSize: "18px",
    fontWeight: "600",
    color: "#fff",
    letterSpacing: "0.01em",
  },
  subtitle: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.45)",
    marginTop: "2px",
  },
  waveform: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    height: "36px",
  },
  waveBar: {
    width: "4px",
    borderRadius: "2px",
    minHeight: "4px",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "24px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    scrollbarWidth: "none",
  },
  welcomeBox: {
    textAlign: "center",
    padding: "32px 16px",
    animation: "fadeIn 0.5s ease",
  },
  welcomeEmoji: { fontSize: "48px", marginBottom: "12px" },
  welcomeTitle: {
    fontFamily: "'Lora', serif",
    fontSize: "22px",
    color: "#fff",
    marginBottom: "10px",
  },
  welcomeBody: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.5)",
    lineHeight: "1.6",
    marginBottom: "24px",
    maxWidth: "300px",
    margin: "0 auto 24px",
  },
  startBtn: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    border: "none",
    borderRadius: "50px",
    padding: "14px 28px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    letterSpacing: "0.02em",
    boxShadow: "0 8px 24px rgba(99,102,241,0.4)",
    transition: "transform 0.2s, box-shadow 0.2s",
    fontFamily: "'DM Sans', sans-serif",
  },
  msgRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: "10px",
    animation: "fadeIn 0.3s ease",
  },
  smallAvatar: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    fontSize: "11px",
    fontWeight: "700",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  assistantBubble: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "18px 18px 18px 4px",
    padding: "13px 16px",
    fontSize: "14px",
    color: "rgba(255,255,255,0.88)",
    lineHeight: "1.65",
    maxWidth: "80%",
  },
  userBubble: {
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    borderRadius: "18px 18px 4px 18px",
    padding: "13px 16px",
    fontSize: "14px",
    color: "#fff",
    lineHeight: "1.65",
    maxWidth: "75%",
  },
  tip: {
    display: "block",
    marginTop: "8px",
    padding: "8px 12px",
    background: "rgba(245,158,11,0.12)",
    border: "1px solid rgba(245,158,11,0.25)",
    borderRadius: "10px",
    fontSize: "13px",
    color: "#fbbf24",
    lineHeight: "1.5",
  },
  thinking: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
    padding: "14px 16px",
  },
  dot: {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.4)",
    animation: "bounce 1.2s infinite ease-in-out",
  },
  errorMsg: {
    textAlign: "center",
    color: "#f87171",
    fontSize: "13px",
    padding: "8px 16px",
    background: "rgba(248,113,113,0.1)",
    borderRadius: "10px",
  },
  controls: {
    padding: "20px 24px 28px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(0,0,0,0.2)",
  },
  statusLabel: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  micBtn: {
    width: "72px",
    height: "72px",
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
    userSelect: "none",
  },
  hint: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.25)",
  },
};
