import React, { useState, useEffect, useRef, useCallback } from "react";

const BASE_SYSTEM_PROMPT = `You are Alex, a warm and witty native English speaker who also understands Spanish. You're chatting with someone who wants to improve their conversational English. You're a genuine friend — encouraging, fun, never condescending.

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
9. Keep responses conversational and not too long — you are chatting, not lecturing. 2-4 sentences is usually perfect outside of practice mode.
10. Your tone is warm, playful, and curious. Use contractions. Use casual language. Be genuinely interested.

CORRECTION EXAMPLES:
- "I is married" correct to "I am married" plus tip plus ask if they want to practice or learn more
- "I want to buy a car red" correct to "the red car" plus tip about adjective order plus ask if they want to practice
- "How se dice mariposa in english?" tell them it is "butterfly" plus use it in a sentence plus ask if they want to practice
- "Yesterday I go to the store" correct to "went" plus tip about past tense plus ask if they want to practice
- "I am very boring today" clarify "bored" vs "boring" plus tip plus ask if they want to practice

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

const SILENT_MP3 = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v///////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRBqpAAAAAAD/+xBkAA/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

function buildSystemPrompt(profile) {
  if (!profile) return BASE_SYSTEM_PROMPT;
  const mistakeSection = profile.mistakes && profile.mistakes.length > 0
    ? "\n\nUSER HISTORY: " + profile.name + " has used this chat before. Their recurring mistakes:\n" + profile.mistakes.map(function(m) { return "- " + m.rule + ": they said " + m.example + ", correct is " + m.correction + " (seen " + m.count + " times)"; }).join("\n") + "\n\nWhen relevant, naturally revisit these patterns to help them practice."
    : "";
  return BASE_SYSTEM_PROMPT + mistakeSection;
}

function splitIntoSentences(text) {
  return text
    .replace(/💡/g, "")
    .split(/(?<=[.!?])\s+/)
    .map(function(s) { return s.trim(); })
    .filter(function(s) { return s.length > 2; });
}

export default function VoiceChatFriend() {
  var [screen, setScreen] = useState("login");
  var [userName, setUserName] = useState("");
  var [nameInput, setNameInput] = useState("");
  var [emailInput, setEmailInput] = useState("");
  var [profile, setProfile] = useState(null);
  var [messages, setMessages] = useState([]);
  var [isListening, setIsListening] = useState(false);
  var [isSpeaking, setIsSpeaking] = useState(false);
  var [isThinking, setIsThinking] = useState(false);
  var [transcript, setTranscript] = useState("");
  var [error, setError] = useState(null);
  var [waveAmplitudes, setWaveAmplitudes] = useState([0.2, 0.4, 0.3, 0.5, 0.2]);
  var [lastSpokenText, setLastSpokenText] = useState("");
  var [ttsError, setTtsError] = useState(false);
  var [isSaving, setIsSaving] = useState(false);

  var recognitionRef = useRef(null);
  var sharedAudioRef = useRef(null);
  var audioUnlockedRef = useRef(false);
  var messagesEndRef = useRef(null);
  var waveTimerRef = useRef(null);
  var ttsQueueRef = useRef([]);
  var isSpeakingQueueRef = useRef(false);
  var profileRef = useRef(null);
  var emailRef = useRef("");

  useEffect(function() { profileRef.current = profile; }, [profile]);

  useEffect(function() {
    if (isListening || isSpeaking) {
      waveTimerRef.current = setInterval(function() {
        setWaveAmplitudes(Array.from({ length: 5 }, function() { return Math.random() * 0.7 + 0.15; }));
      }, 120);
    } else {
      clearInterval(waveTimerRef.current);
      setWaveAmplitudes([0.2, 0.15, 0.25, 0.15, 0.2]);
    }
    return function() { clearInterval(waveTimerRef.current); };
  }, [isListening, isSpeaking]);

  useEffect(function() {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  var unlockAudio = useCallback(function() {
    if (audioUnlockedRef.current) return;
    var audio = sharedAudioRef.current;
    if (!audio) { audio = new Audio(); sharedAudioRef.current = audio; }
    audio.src = SILENT_MP3;
    audio.play().then(function() { audio.pause(); audioUnlockedRef.current = true; }).catch(function() {});
  }, []);

  var fetchAudio = useCallback(async function(text) {
    var response = await fetch("https://alan-chat-two.vercel.app/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
    });
    if (!response.ok) throw new Error("TTS failed");
    var arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error("Empty audio");
    var blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
    return URL.createObjectURL(blob);
  }, []);

  var playAudio = useCallback(function(url) {
    return new Promise(function(resolve, reject) {
      var audio = sharedAudioRef.current;
      if (!audio) { audio = new Audio(); sharedAudioRef.current = audio; }
      audio.src = url;
      audio.onended = function() { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = function() { URL.revokeObjectURL(url); reject(); };
      audio.play().catch(reject);
    });
  }, []);

  var processQueue = useCallback(async function() {
    if (isSpeakingQueueRef.current) return;
    isSpeakingQueueRef.current = true;
    setIsSpeaking(true);
    var anyFailed = false;
    while (ttsQueueRef.current.length > 0) {
      var audioPromise = ttsQueueRef.current.shift();
      try {
        var url = await audioPromise;
        if (url) await playAudio(url);
      } catch(e) { anyFailed = true; }
    }
    isSpeakingQueueRef.current = false;
    setIsSpeaking(false);
    if (anyFailed) setTtsError(true);
  }, [playAudio]);

  var enqueueSentence = useCallback(function(sentence) {
    if (!sentence.trim()) return;
    var audioPromise = fetchAudio(sentence).catch(function() { return null; });
    ttsQueueRef.current.push(audioPromise);
    if (!isSpeakingQueueRef.current) processQueue();
  }, [fetchAudio, processQueue]);

  var stopSpeaking = useCallback(function() {
    ttsQueueRef.current = [];
    isSpeakingQueueRef.current = false;
    if (sharedAudioRef.current) sharedAudioRef.current.pause();
    setIsSpeaking(false);
  }, []);

  var replayLastMessage = useCallback(function() {
    if (!lastSpokenText) return;
    setTtsError(false);
    stopSpeaking();
    splitIntoSentences(lastSpokenText).forEach(function(s) {
      var p = fetchAudio(s).catch(function() { return null; });
      ttsQueueRef.current.push(p);
    });
    processQueue();
  }, [lastSpokenText, stopSpeaking, fetchAudio, processQueue]);

  var loadProfile = useCallback(async function(name) {
    try {
      var response = await fetch("https://alan-chat-two.vercel.app/api/profile?name=" + encodeURIComponent(name.toLowerCase().trim()));
      if (!response.ok) return null;
      return await response.json();
    } catch(e) { return null; }
  }, []);

  var saveProfile = useCallback(async function(name, currentMessages) {
    if (!name || currentMessages.length === 0) return;
    setIsSaving(true);
    try {
      var extractRes = await fetch("https://alan-chat-two.vercel.app/api/extract-mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: currentMessages }),
      });
      var extracted = await extractRes.json();
      var mistakes = extracted.mistakes;
      await fetch("https://alan-chat-two.vercel.app/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, email: emailRef.current || undefined, mistakes: mistakes, recentMessages: currentMessages }),
      });
    } catch(e) { console.error("Save profile error:", e); }
    finally { setIsSaving(false); }
  }, []);

  var streamResponse = useCallback(async function(systemPrompt, messagesForApi, onStart) {
    var response = await fetch("https://alan-chat-two.vercel.app/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, stream: true, system: systemPrompt, messages: messagesForApi }),
    });
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var fullText = "";
    var buffer = "";
    if (onStart) onStart();
    while (true) {
      var result = await reader.read();
      if (result.done) break;
      var chunk = decoder.decode(result.value);
      var lines = chunk.split("\n");
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.startsWith("data: ")) continue;
        var data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          var parsed = JSON.parse(data);
          if (parsed.type === "content_block_delta" && parsed.delta && parsed.delta.text) {
            var newText = parsed.delta.text;
            fullText += newText;
            buffer += newText;
            setMessages(function(prev) {
              var updated = prev.slice();
              updated[updated.length - 1] = { role: "assistant", content: fullText };
              return updated;
            });
            var sentenceMatch = buffer.match(/^(.*[.!?])\s+/s);
            if (sentenceMatch) {
              var sentence = sentenceMatch[1].trim();
              buffer = buffer.slice(sentenceMatch[0].length);
              enqueueSentence(sentence.replace(/💡/g, ""));
            }
          }
        } catch(e) {}
      }
    }
    if (buffer.trim().length > 2) enqueueSentence(buffer.trim().replace(/💡/g, ""));
    setLastSpokenText(fullText);
    return fullText;
  }, [enqueueSentence]);

  var handleLogin = useCallback(async function() {
    var name = nameInput.trim();
    if (!name) return;
    unlockAudio();
    emailRef.current = emailInput.trim();
    setUserName(name);
    setScreen("chat");
    setIsThinking(true);
    var loaded = await loadProfile(name);
    setProfile(loaded);
    var systemPrompt = buildSystemPrompt(loaded);
    var isReturning = loaded && loaded.recentMessages && loaded.recentMessages.length > 0;
    var hasMistakes = loaded && loaded.mistakes && loaded.mistakes.length > 0;
    var topMistake = hasMistakes ? loaded.mistakes[0] : null;
    var starter = TOPIC_STARTERS[Math.floor(Math.random() * TOPIC_STARTERS.length)];
    var greeting;
    if (isReturning) {
      greeting = "[System: The user name is " + name + ". They have used this chat before. Greet them warmly by name. " + (hasMistakes ? "Their most common mistake is: " + topMistake.rule + " (they said " + topMistake.example + " instead of " + topMistake.correction + "). Briefly and warmly mention you would love to keep practicing this together, then naturally start a conversation about " + starter + ". Keep it friendly and short." : "Start a natural conversation about " + starter + ". Keep it short and friendly.") + "]";
    } else {
      greeting = "[System: The user name is " + name + ". They are new. Greet them warmly by name, introduce yourself as Alex in 1 sentence, and start a conversation about " + starter + ". Keep it short and friendly.]";
    }
    setMessages([{ role: "assistant", content: "" }]);
    try {
      await streamResponse(systemPrompt, [{ role: "user", content: greeting }], function() { setIsThinking(false); });
    } catch(e) {
      setIsThinking(false);
      setError("Couldn't connect. Please try again.");
    }
  }, [nameInput, emailInput, unlockAudio, loadProfile, streamResponse]);

  var sendMessage = useCallback(async function(userText) {
    if (!userText.trim()) return;
    var newUserMsg = { role: "user", content: userText };
    var updatedMessages = messages.concat([newUserMsg]);
    setMessages(updatedMessages.concat([{ role: "assistant", content: "" }]));
    setIsThinking(true);
    setTranscript("");
    setTtsError(false);
    stopSpeaking();
    try {
      await streamResponse(buildSystemPrompt(profileRef.current), updatedMessages, function() { setIsThinking(false); });
    } catch(e) {
      setIsThinking(false);
      setError("Oops, something went wrong. Try again!");
    }
  }, [messages, stopSpeaking, streamResponse]);

  var stopListening = useCallback(function() {
    if (recognitionRef.current) {
      recognitionRef.current._shouldRestart = false;
      recognitionRef.current.stop();
    }
  }, []);

  var startListening = useCallback(function() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setError("Your browser does not support voice input. Try Chrome.");
      return;
    }
    unlockAudio();
    if (isListening) { stopListening(); return; }
    stopSpeaking();
    setTtsError(false);
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    var recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    var finalTranscript = "";
    recognition.onstart = function() { setIsListening(true); };
    recognition.onresult = function(e) {
      var interim = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) { finalTranscript += e.results[i][0].transcript + " "; }
        else { interim = e.results[i][0].transcript; }
      }
      setTranscript(finalTranscript + interim);
    };
    recognition.onend = function() {
      if (recognitionRef.current && recognitionRef.current._shouldRestart) {
        recognition.start();
      } else {
        setIsListening(false);
        var textToSend = finalTranscript.trim();
        setTranscript("");
        finalTranscript = "";
        if (textToSend) sendMessage(textToSend);
      }
    };
    recognition.onerror = function(e) {
      setIsListening(false);
      if (e.error !== "no-speech") setError("Voice error: " + e.error);
    };
    recognition._shouldRestart = true;
    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening, unlockAudio, stopListening, stopSpeaking, sendMessage]);

  var endConversation = useCallback(async function() {
    if (messages.length === 0) return;
    stopSpeaking();
    saveProfile(userName, messages);
    try {
      await fetch("https://alan-chat-two.vercel.app/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messages, userName: userName }),
      });
      alert("Great session! Your progress was saved. See you next time!");
    } catch(e) {
      alert("Session saved! See you next time.");
    }
    setMessages([]);
    setScreen("login");
    setNameInput("");
    setEmailInput("");
    setUserName("");
    setProfile(null);
  }, [messages, userName, stopSpeaking, saveProfile]);

  var formatMessage = function(text) {
    var parts = text.split(/(💡[^\n]*)/g);
    return parts.map(function(part, i) {
      if (part.startsWith("💡")) return React.createElement("span", { key: i, style: styles.tip }, part);
      return React.createElement("span", { key: i }, part);
    });
  };

  if (screen === "login") {
    return React.createElement("div", { style: styles.wrapper },
      React.createElement("div", { style: Object.assign({}, styles.card, { justifyContent: "center" }) },
        React.createElement("div", { style: styles.loginBox },
          React.createElement("div", { style: styles.loginAvatar },
            React.createElement("svg", { viewBox: "0 0 40 40", width: "48", height: "48", fill: "none" },
              React.createElement("circle", { cx: "20", cy: "16", r: "8", fill: "#fff", opacity: "0.9" }),
              React.createElement("ellipse", { cx: "20", cy: "34", rx: "13", ry: "9", fill: "#fff", opacity: "0.7" })
            )
          ),
          React.createElement("div", { style: styles.loginTitle }, "Hi! I'm Alex 👋"),
          React.createElement("div", { style: styles.loginSubtitle }, "Your English conversation friend"),
          React.createElement("div", { style: styles.loginLabel }, "What's your name?"),
          React.createElement("input", { style: styles.loginInput, type: "text", placeholder: "Type your name...", value: nameInput, onChange: function(e) { setNameInput(e.target.value); }, autoFocus: true }),
          React.createElement("div", { style: styles.loginLabel }, "Email (optional — to receive your monthly progress)"),
          React.createElement("input", { style: styles.loginInput, type: "email", placeholder: "you@example.com", value: emailInput, onChange: function(e) { setEmailInput(e.target.value); }, onKeyDown: function(e) { if (e.key === "Enter") handleLogin(); } }),
          React.createElement("button", { style: Object.assign({}, styles.loginBtn, { opacity: nameInput.trim() ? 1 : 0.5 }), onClick: handleLogin, disabled: !nameInput.trim() }, "Start chatting →")
        )
      ),
      React.createElement("style", null, "@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@400;500;600&display=swap');")
    );
  }

  return React.createElement("div", { style: styles.wrapper },
    React.createElement("div", { style: styles.card },
      React.createElement("div", { style: styles.header },
        React.createElement("div", { style: styles.avatarWrapper },
          React.createElement("div", { style: styles.avatar },
            React.createElement("svg", { viewBox: "0 0 40 40", width: "40", height: "40", fill: "none" },
              React.createElement("circle", { cx: "20", cy: "16", r: "8", fill: "#fff", opacity: "0.9" }),
              React.createElement("ellipse", { cx: "20", cy: "34", rx: "13", ry: "9", fill: "#fff", opacity: "0.7" })
            )
          ),
          React.createElement("div", { style: styles.onlineDot })
        ),
        React.createElement("div", { style: styles.headerText },
          React.createElement("div", { style: styles.name }, "Alex"),
          React.createElement("div", { style: styles.subtitle }, profile ? "Welcome back, " + userName + "!" : "Hey " + userName + "!")
        ),
        React.createElement("div", { style: styles.waveform },
          waveAmplitudes.map(function(amp, i) {
            return React.createElement("div", { key: i, style: Object.assign({}, styles.waveBar, { height: (amp * 36) + "px", opacity: isListening || isSpeaking ? 0.9 : 0.3, background: isListening ? "#f59e0b" : isSpeaking ? "#34d399" : "#94a3b8", transition: "height 0.12s ease, opacity 0.3s" }) });
          })
        )
      ),
      React.createElement("div", { style: styles.messages },
        isThinking && messages.length === 0 && React.createElement("div", { style: styles.thinking },
          React.createElement("span", { style: styles.dot }),
          React.createElement("span", { style: Object.assign({}, styles.dot, { animationDelay: "0.2s" }) }),
          React.createElement("span", { style: Object.assign({}, styles.dot, { animationDelay: "0.4s" }) })
        ),
        messages.map(function(msg, idx) {
          return React.createElement("div", { key: idx, style: Object.assign({}, styles.msgRow, { justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }) },
            msg.role === "assistant" && React.createElement("div", { style: styles.smallAvatar }, "A"),
            React.createElement("div", { style: msg.role === "user" ? styles.userBubble : styles.assistantBubble },
              msg.role === "assistant"
                ? (msg.content ? formatMessage(msg.content) : React.createElement("span", { style: styles.typingDots },
                    React.createElement("span", { style: styles.dot }),
                    React.createElement("span", { style: Object.assign({}, styles.dot, { animationDelay: "0.2s" }) }),
                    React.createElement("span", { style: Object.assign({}, styles.dot, { animationDelay: "0.4s" }) })
                  ))
                : msg.content
            )
          );
        }),
        ttsError && React.createElement("div", { style: styles.ttsErrorBox },
          React.createElement("span", { style: styles.ttsErrorText }, "🔇 Audio did not play"),
          React.createElement("button", { style: styles.replayBtn, onClick: replayLastMessage }, "🔁 Tap to hear Alex")
        ),
        error && React.createElement("div", { style: styles.errorMsg }, error),
        transcript && React.createElement("div", { style: Object.assign({}, styles.msgRow, { justifyContent: "flex-end" }) },
          React.createElement("div", { style: Object.assign({}, styles.userBubble, { opacity: 0.6, fontStyle: "italic" }) }, transcript + "…")
        ),
        React.createElement("div", { ref: messagesEndRef })
      ),
      React.createElement("div", { style: styles.controls },
        React.createElement("div", { style: styles.statusLabel },
          isListening ? "Tap to send…" : isSpeaking ? "Alex is speaking…" : isThinking ? "Thinking…" : "Tap to speak"
        ),
        React.createElement("button", {
          style: Object.assign({}, styles.micBtn, {
            background: isListening ? "linear-gradient(135deg, #f59e0b, #ef4444)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
            boxShadow: isListening ? "0 0 0 8px rgba(245,158,11,0.2), 0 8px 24px rgba(239,68,68,0.4)" : "0 8px 24px rgba(99,102,241,0.4)",
            transform: isListening ? "scale(1.08)" : "scale(1)",
          }),
          onClick: startListening,
          disabled: isThinking
        },
          isListening
            ? React.createElement("svg", { viewBox: "0 0 24 24", width: "28", height: "28", fill: "white" },
                React.createElement("rect", { x: "6", y: "4", width: "4", height: "16", rx: "2" }),
                React.createElement("rect", { x: "14", y: "4", width: "4", height: "16", rx: "2" })
              )
            : React.createElement("svg", { viewBox: "0 0 24 24", width: "28", height: "28", fill: "white" },
                React.createElement("path", { d: "M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" }),
                React.createElement("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2", strokeWidth: "2", stroke: "white", fill: "none", strokeLinecap: "round" }),
                React.createElement("line", { x1: "12", y1: "19", x2: "12", y2: "23", stroke: "white", strokeWidth: "2", strokeLinecap: "round" }),
                React.createElement("line", { x1: "8", y1: "23", x2: "16", y2: "23", stroke: "white", strokeWidth: "2", strokeLinecap: "round" })
              )
        ),
        React.createElement("div", { style: styles.hint }, "Tap to start · Tap again to send"),
        React.createElement("button", { style: styles.endBtn, onClick: endConversation, disabled: isSaving }, isSaving ? "Saving…" : "End & save session")
      )
    ),
    React.createElement("style", null, "@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@400;500;600&display=swap');\n@keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }\n@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }")
  );
}

var styles = {
  wrapper: { fontFamily: "'DM Sans', sans-serif", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)", padding: "20px" },
  card: { width: "100%", maxWidth: "480px", background: "#0f1117", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", overflow: "hidden", height: "600px" },
  loginBox: { display: "flex", flexDirection: "column", alignItems: "center", padding: "32px", gap: "12px" },
  loginAvatar: { width: "72px", height: "72px", borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "4px" },
  loginTitle: { fontFamily: "'Lora', serif", fontSize: "24px", fontWeight: "600", color: "#fff" },
  loginSubtitle: { fontSize: "14px", color: "rgba(255,255,255,0.45)", marginBottom: "4px" },
  loginLabel: { fontSize: "13px", color: "rgba(255,255,255,0.6)", alignSelf: "flex-start" },
  loginInput: { width: "100%", padding: "13px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: "16px", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" },
  loginBtn: { width: "100%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", borderRadius: "50px", padding: "14px 28px", fontSize: "15px", fontWeight: "600", cursor: "pointer", letterSpacing: "0.02em", boxShadow: "0 8px 24px rgba(99,102,241,0.4)", fontFamily: "'DM Sans', sans-serif", marginTop: "4px" },
  header: { display: "flex", alignItems: "center", gap: "14px", padding: "20px 24px", background: "linear-gradient(135deg, #1e1b4b, #1a1035)", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  avatarWrapper: { position: "relative" },
  avatar: { width: "48px", height: "48px", borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" },
  onlineDot: { position: "absolute", bottom: "2px", right: "2px", width: "10px", height: "10px", borderRadius: "50%", background: "#34d399", border: "2px solid #1e1b4b" },
  headerText: { flex: 1 },
  name: { fontFamily: "'Lora', serif", fontSize: "18px", fontWeight: "600", color: "#fff", letterSpacing: "0.01em" },
  subtitle: { fontSize: "12px", color: "rgba(255,255,255,0.45)", marginTop: "2px" },
  waveform: { display: "flex", alignItems: "center", gap: "4px", height: "36px" },
  waveBar: { width: "4px", borderRadius: "2px", minHeight: "4px" },
  messages: { flex: 1, overflowY: "auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: "14px", scrollbarWidth: "none" },
  msgRow: { display: "flex", alignItems: "flex-end", gap: "10px", animation: "fadeIn 0.3s ease" },
  smallAvatar: { width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: "11px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  assistantBubble: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px 18px 18px 4px", padding: "13px 16px", fontSize: "14px", color: "rgba(255,255,255,0.88)", lineHeight: "1.65", maxWidth: "80%" },
  userBubble: { background: "linear-gradient(135deg, #4f46e5, #7c3aed)", borderRadius: "18px 18px 4px 18px", padding: "13px 16px", fontSize: "14px", color: "#fff", lineHeight: "1.65", maxWidth: "75%" },
  tip: { display: "block", marginTop: "8px", padding: "8px 12px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "10px", fontSize: "13px", color: "#fbbf24", lineHeight: "1.5" },
  typingDots: { display: "flex", gap: "6px", alignItems: "center", padding: "2px 0" },
  thinking: { display: "flex", gap: "6px", alignItems: "center", padding: "14px 16px" },
  dot: { display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "rgba(255,255,255,0.4)", animation: "bounce 1.2s infinite ease-in-out" },
  ttsErrorBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "12px" },
  ttsErrorText: { fontSize: "12px", color: "rgba(255,255,255,0.4)" },
  replayBtn: { background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff", border: "none", borderRadius: "50px", padding: "8px 20px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  errorMsg: { textAlign: "center", color: "#f87171", fontSize: "13px", padding: "8px 16px", background: "rgba(248,113,113,0.1)", borderRadius: "10px" },
  controls: { padding: "20px 24px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" },
  statusLabel: { fontSize: "12px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em", textTransform: "uppercase" },
  micBtn: { width: "72px", height: "72px", borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease", userSelect: "none" },
  hint: { fontSize: "11px", color: "rgba(255,255,255,0.25)" },
  endBtn: { marginTop: "8px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "50px", padding: "8px 20px", fontSize: "12px", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" },
};
