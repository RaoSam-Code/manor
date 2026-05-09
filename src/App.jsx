import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Mic,
  MicOff,
  Search,
  SendHorizontal,
  Timer,
  Volume2,
  VolumeX,
} from 'lucide-react'

const DIFFICULTIES = {
  easy: { label: 'Easy', durationSeconds: 20 * 60 },
  normal: { label: 'Normal', durationSeconds: 15 * 60 },
  hard: { label: 'Hard', durationSeconds: 10 * 60 },
}

const SUSPECTS = [
  {
    id: 'victoria',
    name: 'Victoria Blackwood',
    role: 'Wife',
    emoji: '👩‍💼',
    motive: 'Affair and inheritance pressure',
    secret: 'She is having an affair with James',
  },
  {
    id: 'james',
    name: 'James Sterling',
    role: 'Ex-Partner',
    emoji: '🤵',
    motive: 'Business betrayal',
    secret: 'He is having an affair with Victoria',
  },
  {
    id: 'eleanor',
    name: 'Dr. Eleanor Hayes',
    role: 'Physician',
    emoji: '🩺',
    motive: 'Blackmailed by Richard',
    secret: 'She poisoned Richard with cyanide in brandy',
  },
  {
    id: 'margaret',
    name: 'Margaret Chen',
    role: 'Housekeeper',
    emoji: '🧹',
    motive: 'No direct motive',
    secret: 'She saw Eleanor enter the study around 9:45 PM',
  },
]

const KILLER_ID = 'eleanor'

const INTERROGATION_MODES = {
  friendly: { label: 'Friendly', trustDelta: 5 },
  neutral: { label: 'Neutral', trustDelta: 0 },
  aggressive: { label: 'Aggressive', trustDelta: -10 },
}

const INITIAL_MOOD = 'neutral'
const MOODS = {
  neutral: '😐',
  nervous: '😰',
  angry: '😠',
  happy: '😊',
  thinking: '🤔',
  lying: '😅',
}

const KEYWORDS = [
  'affair',
  'alibi',
  'poison',
  'cyanide',
  '9:45',
  'study',
  'blackmail',
  'saw',
  'garden',
  'library',
  'witness',
  'brandy',
]

const VOICE_PROFILES = {
  victoria: { pitch: 1.1, rate: 0.95 },
  james: { pitch: 0.9, rate: 1.05 },
  eleanor: { pitch: 1, rate: 0.9 },
  margaret: { pitch: 1.05, rate: 0.85 },
}

const PREFERRED_ENGLISH_VOICES = [
  'Google US English',
  'Microsoft David',
  'Microsoft Zira',
  'Samantha',
]

const clampTrust = (value) => Math.max(0, Math.min(100, value))

const formatClock = (seconds) => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

const detectMood = (text) => {
  const lower = text.toLowerCase()
  if (lower.includes('...') || lower.includes('well, i') || lower.includes('perhaps')) return 'lying'
  if (lower.includes('how dare') || lower.includes('enough') || lower.includes('!')) return 'angry'
  if (lower.includes('nervous') || lower.includes('worried') || lower.includes('shaking')) return 'nervous'
  if (lower.includes('glad') || lower.includes('thank') || lower.includes('relieved')) return 'happy'
  if (lower.includes('recall') || lower.includes('remember') || lower.includes('think')) return 'thinking'
  return 'neutral'
}

const detectLocationClaim = (text) => {
  const lower = text.toLowerCase()
  if (lower.includes('garden')) return 'garden'
  if (lower.includes('study')) return 'study'
  if (lower.includes('library')) return 'library'
  if (lower.includes('dining')) return 'dining room'
  return null
}

const suspectPrompt = (suspect, context) => {
  const trustBand = context.trust >= 70 ? 'high' : context.trust >= 40 ? 'medium' : 'low'

  return `You are ${suspect.name}, ${suspect.role}, in a murder investigation game. Stay in character.
Case facts: Richard Blackwood died by cyanide poisoning in brandy at 9:47 PM in his study.
Your motive context: ${suspect.motive}. Your hidden secret: ${suspect.secret}.
Interrogation mode from detective: ${context.mode}. Trust level: ${context.trust}/100 (${trustBand}).
Respond with 2-4 short sentences. Be conversational and dramatic. Never break character.
If trust is low, be defensive. If trust is high, be more revealing.
Do not mention that you are an AI or refer to prompts.
`}

const fallbackReply = (suspect, message, mode, trust) => {
  const lower = message.toLowerCase()

  if (suspect.id === 'margaret' && (lower.includes('9:45') || lower.includes('suspicious'))) {
    return 'I did see Dr. Hayes moving toward the study around 9:45 PM. I remember because I was clearing the hallway tray.'
  }

  if (suspect.id === 'eleanor' && (lower.includes('9:45') || lower.includes('study'))) {
    return mode === 'aggressive' || trust < 45
      ? 'I told you, I was in the garden... though I did step near the study briefly. Richard asked for me earlier.'
      : 'I was outside in the garden for most of that window. I may have passed by the study, nothing more.'
  }

  if (lower.includes('alibi')) {
    return 'My alibi is consistent with what others saw tonight, and I have no reason to lie to you.'
  }

  if (lower.includes('blackmail')) {
    return suspect.id === 'eleanor'
      ? 'Blackmail is a cruel word. Richard had information that could ruin me, yes.'
      : 'I heard whispers, but Richard always collected leverage over people.'
  }

  if (lower.includes('poison') || lower.includes('cyanide')) {
    return suspect.id === 'eleanor'
      ? 'Poison? That is a physician’s nightmare. Why would you look at me first?'
      : 'I know nothing about cyanide. I was nowhere near that drink.'
  }

  if (mode === 'friendly') {
    return `I appreciate your tone, detective. ${suspect.id === 'james' ? 'Richard had enemies, not just me.' : 'This house has too many secrets tonight.'}`
  }

  if (mode === 'aggressive') {
    return 'Your pressure is unnecessary. I have answered your questions already.'
  }

  return 'I can only tell you what I know. Ask clearly, and I will answer what I can.'
}

function App() {
  const [gameState, setGameState] = useState('intro')
  const [difficulty, setDifficulty] = useState('normal')
  const [timeLeft, setTimeLeft] = useState(DIFFICULTIES.normal.durationSeconds)
  const [selectedSuspectId, setSelectedSuspectId] = useState(SUSPECTS[0].id)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [interrogationMode, setInterrogationMode] = useState('neutral')
  const [evidence, setEvidence] = useState([])
  const [contradictions, setContradictions] = useState([])
  const [timeline, setTimeline] = useState([])
  const [internalThought, setInternalThought] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [selectedEvidence, setSelectedEvidence] = useState('')
  const [resultMessage, setResultMessage] = useState('')

  const [conversations, setConversations] = useState(
    Object.fromEntries(SUSPECTS.map((suspect) => [suspect.id, []])),
  )

  const [suspectMood, setSuspectMood] = useState(
    Object.fromEntries(SUSPECTS.map((suspect) => [suspect.id, INITIAL_MOOD])),
  )

  const [suspectTrust, setSuspectTrust] = useState(
    Object.fromEntries(
      SUSPECTS.map((suspect) => [suspect.id, suspect.id === 'margaret' ? 100 : 50]),
    ),
  )

  const audioContextRef = useRef(null)
  const locationClaimsRef = useRef({})
  const recognitionRef = useRef(null)

  const selectedSuspect = useMemo(
    () => SUSPECTS.find((suspect) => suspect.id === selectedSuspectId),
    [selectedSuspectId],
  )

  const activeConversation = conversations[selectedSuspectId] || []

  const searchedMessages = useMemo(() => {
    if (!searchTerm.trim()) return []
    const needle = searchTerm.toLowerCase()

    return Object.entries(conversations)
      .flatMap(([suspectId, messages]) =>
        messages
          .filter((entry) => entry.text.toLowerCase().includes(needle))
          .map((entry) => ({ suspectId, ...entry })),
      )
      .slice(-10)
  }, [conversations, searchTerm])

  useEffect(() => {
    if (gameState !== 'playing') return undefined

    const timer = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          clearInterval(timer)
          setGameState('failed')
          setResultMessage('Time is up. The killer walks free in the shadows of Blackwood Manor.')
          return 0
        }
        return previous - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [gameState])

  useEffect(() => () => window.speechSynthesis.cancel(), [])

  const playTone = (frequency, duration, gain = 0.15) => {
    if (!soundEnabled) return

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }

    const oscillator = audioContextRef.current.createOscillator()
    const gainNode = audioContextRef.current.createGain()

    oscillator.frequency.value = frequency
    gainNode.gain.value = gain

    oscillator.connect(gainNode)
    gainNode.connect(audioContextRef.current.destination)

    oscillator.start()
    oscillator.stop(audioContextRef.current.currentTime + duration)
  }

  const adjustTrust = (suspectId, delta) => {
    setSuspectTrust((previous) => ({
      ...previous,
      [suspectId]: clampTrust(previous[suspectId] + delta),
    }))
  }

  const addEvidenceFromText = (speakerName, text) => {
    const lower = text.toLowerCase()
    const found = KEYWORDS.filter((keyword) => lower.includes(keyword))

    if (!found.length) return

    setEvidence((previous) => {
      const additions = found
        .map((keyword) => `${speakerName} mentioned “${keyword}”`)
        .filter((item) => !previous.includes(item))

      if (!additions.length) return previous

      playTone(523.25, 0.3, 0.15)
      return [...previous, ...additions]
    })
  }

  const registerContradiction = (suspectId, text) => {
    const location = detectLocationClaim(text)
    if (!location) return

    const previousLocation = locationClaimsRef.current[suspectId]
    if (previousLocation && previousLocation !== location) {
      const suspectName = SUSPECTS.find((suspect) => suspect.id === suspectId)?.name ?? suspectId
      const contradiction = `${suspectName} changed location from ${previousLocation} to ${location}.`

      setContradictions((previous) => {
        if (previous.includes(contradiction)) return previous
        playTone(800, 0.2, 0.2)
        return [...previous, contradiction]
      })
    }

    locationClaimsRef.current[suspectId] = location
  }

  const setMoodWithReset = (suspectId, text) => {
    const mood = detectMood(text)
    setSuspectMood((previous) => ({ ...previous, [suspectId]: mood }))

    setTimeout(() => {
      setSuspectMood((previous) => ({ ...previous, [suspectId]: INITIAL_MOOD }))
    }, 5000)
  }

  const setThoughtWithReset = (suspect, responseText) => {
    const mood = detectMood(responseText)
    const thought =
      mood === 'nervous'
        ? `🔮 Intuition: ${suspect.name} sounds rattled. Keep pressure on their timeline.`
        : mood === 'lying'
          ? `🧠 Logic: Their wording feels evasive. Compare this against earlier statements.`
          : mood === 'angry'
            ? `❤️ Empathy: They are defensive. A softer angle might open them up.`
            : `👁️ Perception: Their response is controlled. Probe with specific times and places.`

    setInternalThought(thought)
    setTimeout(() => setInternalThought(''), 5000)
  }

  const speak = (suspectId, text) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    const profile = VOICE_PROFILES[suspectId] ?? { pitch: 1, rate: 1 }
    const voices = window.speechSynthesis.getVoices()
    const preferredVoice = voices.find((voice) =>
      PREFERRED_ENGLISH_VOICES.some((preferredName) => voice.name.includes(preferredName)),
    )

    utterance.pitch = profile.pitch
    utterance.rate = profile.rate
    utterance.voice = preferredVoice || voices.find((voice) => /en/i.test(voice.lang)) || null

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
  }

  const askGroq = async (suspect, nextUserText) => {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY
    const isGroqKey = /^gsk_[A-Za-z0-9._-]+$/.test(apiKey || '')
    // No valid API key means local fallback mode so the game remains playable offline.
    if (!isGroqKey) {
      return fallbackReply(suspect, nextUserText, interrogationMode, suspectTrust[suspect.id])
    }

    const prior = (conversations[suspect.id] || []).slice(-10)
    const messages = [
      {
        role: 'system',
        content: suspectPrompt(suspect, {
          mode: interrogationMode,
          trust: suspectTrust[suspect.id],
        }),
      },
      ...prior.map((entry) => ({
        role: entry.role === 'user' ? 'user' : 'assistant',
        content: entry.text,
      })),
      { role: 'user', content: nextUserText },
    ]

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.8,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      return fallbackReply(suspect, nextUserText, interrogationMode, suspectTrust[suspect.id])
    }

    const payload = await response.json()
    return (
      payload?.choices?.[0]?.message?.content?.trim() ||
      fallbackReply(suspect, nextUserText, interrogationMode, suspectTrust[suspect.id])
    )
  }

  const sendQuestion = async () => {
    const question = input.trim()
    if (!question || loading || gameState !== 'playing') return

    const suspect = selectedSuspect
    const userMessage = { role: 'user', text: question, at: Date.now() }

    setConversations((previous) => ({
      ...previous,
      [suspect.id]: [...previous[suspect.id], userMessage],
    }))

    addEvidenceFromText('Detective', question)

    adjustTrust(suspect.id, INTERROGATION_MODES[interrogationMode].trustDelta)

    setTimeline((previous) => [
      ...previous,
      {
        at: Date.now(),
        suspectName: suspect.name,
        mode: interrogationMode,
        question,
      },
    ])

    setInput('')
    setLoading(true)

    try {
      const answer = await askGroq(suspect, question)
      const aiMessage = { role: 'assistant', text: answer, at: Date.now() }

      setConversations((previous) => ({
        ...previous,
        [suspect.id]: [...previous[suspect.id], aiMessage],
      }))

      addEvidenceFromText(suspect.name, answer)
      registerContradiction(suspect.id, answer)
      setMoodWithReset(suspect.id, answer)
      setThoughtWithReset(suspect, answer)
      speak(suspect.id, answer)
    } catch {
      const fallback = fallbackReply(suspect, question, interrogationMode, suspectTrust[suspect.id])
      const aiMessage = { role: 'assistant', text: fallback, at: Date.now() }

      setConversations((previous) => ({
        ...previous,
        [suspect.id]: [...previous[suspect.id], aiMessage],
      }))
      addEvidenceFromText(suspect.name, fallback)
      registerContradiction(suspect.id, fallback)
      setMoodWithReset(suspect.id, fallback)
      setThoughtWithReset(suspect, fallback)
      speak(suspect.id, fallback)
    } finally {
      setLoading(false)
    }
  }

  const handleAccusation = (type) => {
    if (gameState !== 'playing') return

    const suspect = selectedSuspect

    if (type === 'truth') {
      const text = `${suspect.name} seems relieved that you accepted the statement.`
      setConversations((previous) => ({
        ...previous,
        [suspect.id]: [...previous[suspect.id], { role: 'system', text, at: Date.now() }],
      }))
      setThoughtWithReset(suspect, text)
      return
    }

    if (type === 'doubt') {
      const text = `${suspect.name} tightens up under your doubt and becomes more cautious.`
      adjustTrust(suspect.id, -10)
      setConversations((previous) => ({
        ...previous,
        [suspect.id]: [...previous[suspect.id], { role: 'system', text, at: Date.now() }],
      }))
      setThoughtWithReset(suspect, text)
      return
    }

    if (!selectedEvidence) return

    playTone(440, 0.5, 0.3)
    adjustTrust(suspect.id, -20)

    const exposure =
      suspect.id === KILLER_ID &&
      /9:45|study|poison|cyanide|blackmail|brandy/i.test(selectedEvidence)

    const text = exposure
      ? `${suspect.name} breaks under pressure: “Fine. Richard was destroying my life. I did it.”`
      : `${suspect.name} resists your claim: “That evidence proves nothing on its own.”`

    setConversations((previous) => ({
      ...previous,
      [suspect.id]: [...previous[suspect.id], { role: 'system', text, at: Date.now() }],
    }))

    if (exposure) {
      setGameState('solved')
      setResultMessage('Case Closed: Dr. Eleanor Hayes confessed under evidence-backed pressure.')
    }

    setThoughtWithReset(suspect, text)
  }

  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (isListening) return

    if (!SpeechRecognition) {
      setVoiceError('Voice input is not supported in this browser.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setVoiceError('')
      setIsListening(true)
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = (event) => {
      setIsListening(false)
      const messageByError = {
        'no-speech': 'No speech detected. Try speaking a little louder.',
        'audio-capture': 'No microphone detected. Check your audio input device.',
        'not-allowed': 'Microphone access denied. Enable microphone permission and try again.',
        'network': 'Network error during voice input. Check your connection and retry.',
      }
      setVoiceError(messageByError[event.error] || 'Voice input failed. Please try again.')
    }
    recognition.onresult = (event) => {
      const transcript = event?.results?.[0]?.[0]?.transcript || ''
      setInput((previous) => [previous, transcript].filter(Boolean).join(' ').trim())
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const finalAccusation = () => {
    if (gameState !== 'playing') return

    if (selectedSuspectId === KILLER_ID) {
      setGameState('solved')
      setResultMessage('Correct. Dr. Eleanor Hayes poisoned Richard Blackwood at 9:47 PM.')
      return
    }

    setGameState('failed')
    setResultMessage(`${selectedSuspect.name} is innocent. The real killer was Dr. Eleanor Hayes.`)
  }

  const resetGame = () => {
    setGameState('intro')
    setTimeLeft(DIFFICULTIES[difficulty].durationSeconds)
    setInput('')
    setLoading(false)
    setInterrogationMode('neutral')
    setEvidence([])
    setContradictions([])
    setTimeline([])
    setInternalThought('')
    setSearchTerm('')
    setResultMessage('')
    setSelectedEvidence('')
    locationClaimsRef.current = {}
    setConversations(Object.fromEntries(SUSPECTS.map((suspect) => [suspect.id, []])))
    setSuspectMood(Object.fromEntries(SUSPECTS.map((suspect) => [suspect.id, INITIAL_MOOD])))
    setSuspectTrust(
      Object.fromEntries(SUSPECTS.map((suspect) => [suspect.id, suspect.id === 'margaret' ? 100 : 50])),
    )
  }

  if (gameState === 'intro') {
    return (
      <main className="app intro">
        <h1>Ultimate AI Detective</h1>
        <p>Midnight at Blackwood Manor</p>
        <p>Interrogate suspects, find contradictions, and accuse the killer before time runs out.</p>
        <div className="difficulty-row">
          {Object.entries(DIFFICULTIES).map(([key, config]) => (
            <button
              key={key}
              type="button"
              className={difficulty === key ? 'active' : ''}
              onClick={() => {
                setDifficulty(key)
                setTimeLeft(config.durationSeconds)
              }}
            >
              {config.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setTimeLeft(DIFFICULTIES[difficulty].durationSeconds)
            setGameState('playing')
            setResultMessage('')
          }}
        >
          Begin Investigation
        </button>
      </main>
    )
  }

  if (gameState === 'solved' || gameState === 'failed') {
    return (
      <main className="app outcome">
        <h1>{gameState === 'solved' ? '✅ Case Solved' : '❌ Investigation Failed'}</h1>
        <p>{resultMessage}</p>
        <p>
          Questions asked: <strong>{timeline.length}</strong> · Evidence found: <strong>{evidence.length}</strong>
        </p>
        <button type="button" onClick={resetGame}>
          Play Again
        </button>
      </main>
    )
  }

  return (
    <main className="app board">
      <header className="topbar">
        <div className="timer">
          <Timer size={16} />
          <strong>{formatClock(timeLeft)}</strong>
        </div>

        <div className="modes">
          {Object.entries(INTERROGATION_MODES).map(([mode, config]) => (
            <button
              key={mode}
              type="button"
              className={mode === interrogationMode ? 'active' : ''}
              onClick={() => setInterrogationMode(mode)}
            >
              {config.label}
            </button>
          ))}
        </div>

        <div className="toggles">
          <button type="button" onClick={() => setVoiceEnabled((previous) => !previous)}>
            {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button type="button" onClick={() => setSoundEnabled((previous) => !previous)}>
            {soundEnabled ? 'SFX: On' : 'SFX: Off'}
          </button>
        </div>
      </header>

      <section className="layout">
        <aside className="left">
          <h2>Suspects</h2>
          {SUSPECTS.map((suspect) => {
            const trust = suspectTrust[suspect.id]
            const trustClass = trust >= 70 ? 'high' : trust >= 40 ? 'medium' : 'low'
            return (
              <button
                key={suspect.id}
                type="button"
                className={`suspect ${selectedSuspectId === suspect.id ? 'selected' : ''}`}
                onClick={() => setSelectedSuspectId(suspect.id)}
              >
                <div>
                  <strong>{suspect.name}</strong>
                  <small>{suspect.role}</small>
                </div>
                <div className="status">
                  <span>{MOODS[suspectMood[suspect.id]] ?? '😐'}</span>
                  <small>{trust}%</small>
                </div>
                <div className={`trust ${trustClass}`}>
                  <span style={{ width: `${trust}%` }} />
                </div>
              </button>
            )
          })}

          <button type="button" className="final-accuse" onClick={finalAccusation}>
            Final Accusation: {selectedSuspect?.name}
          </button>
        </aside>

        <section className="center">
          <div className="interview-card">
            <h2>
              {selectedSuspect.emoji} {selectedSuspect.name}
            </h2>
            <p>{selectedSuspect.role}</p>
            {isSpeaking && <small>🎙️ Speaking...</small>}
            {voiceError && <small>{voiceError}</small>}
          </div>

          {internalThought && <div className="thought">{internalThought}</div>}

          <div className="chat">
            {activeConversation.length === 0 ? (
              <p className="placeholder">Ask a question to start the interrogation.</p>
            ) : (
              activeConversation.map((entry) => (
                <article key={`${entry.at}-${entry.role}`} className={`msg ${entry.role}`}>
                  <strong>
                    {entry.role === 'user'
                      ? 'You'
                      : entry.role === 'assistant'
                        ? selectedSuspect.name
                        : 'Investigation'}
                  </strong>
                  <p>{entry.text}</p>
                </article>
              ))
            )}
          </div>

          <div className="accusation-bar">
            <button type="button" onClick={() => handleAccusation('truth')}>
              Truth
            </button>
            <button type="button" onClick={() => handleAccusation('doubt')}>
              Doubt
            </button>
            <select value={selectedEvidence} onChange={(event) => setSelectedEvidence(event.target.value)}>
              <option value="">Select evidence for Lie...</option>
              {evidence.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => handleAccusation('lie')} disabled={!selectedEvidence}>
              Lie
            </button>
          </div>

          <form
            className="input-row"
            onSubmit={(event) => {
              event.preventDefault()
              sendQuestion()
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about alibi, timeline, poison, or motive..."
              disabled={loading}
            />
            <button type="button" onClick={startVoiceInput} disabled={isListening || loading}>
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button type="submit" disabled={loading || !input.trim()}>
              <SendHorizontal size={16} />
            </button>
          </form>
        </section>

        <aside className="right">
          <h2>Case File</h2>

          <section>
            <h3>Evidence ({evidence.length})</h3>
            <ul>{evidence.slice(-8).map((item) => <li key={item}>{item}</li>)}</ul>
          </section>

          <section>
            <h3>Contradictions ({contradictions.length})</h3>
            <ul>{contradictions.slice(-6).map((item) => <li key={item}>{item}</li>)}</ul>
          </section>

          <section>
            <h3>Search Conversations</h3>
            <label>
              <Search size={14} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search keyword"
              />
            </label>
            <ul>
              {searchedMessages.map((item) => {
                const suspectName = SUSPECTS.find((suspect) => suspect.id === item.suspectId)?.name
                return (
                  <li key={`${item.at}-${item.suspectId}`}>
                    <strong>{suspectName}:</strong> {item.text}
                  </li>
                )
              })}
            </ul>
          </section>

          <section>
            <h3>Timeline</h3>
            <ul>
              {timeline.slice(-5).map((entry) => (
                <li key={`${entry.at}-${entry.question}`}>
                  <strong>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>{' '}
                  {entry.suspectName} ({entry.mode}) — {entry.question}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </section>
    </main>
  )
}

export default App
