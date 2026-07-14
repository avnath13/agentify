# Voice and multimodal agents

This document grounds designs whose input or output is not plain text: speech (voice agents), images or video (multimodal agents), or a mix. Modality changes the latency budget, the architecture, the evaluation, and the failure modes, so it is a first-class design axis, not a delivery detail. Consult this document whenever a use case involves a phone line, a voice assistant, spoken interaction, image or document understanding, screen or camera input, or any non-text channel.

## Principles

### Decide the modality explicitly

Establish input and output modality during discovery (text, voice, image, video, or mixed), the same way you establish scale and data. A voice channel is not "chat with a microphone": it imposes a sub-second turn budget, a turn-taking stack, and audio-native evaluation that a text design never needs [Softcery, Real-time vs Turn-based]. State the modality in the requirements before choosing an architecture.

### Voice architecture: cascaded vs speech-to-speech

Two production patterns, chosen by what the task needs [rtcleague, Pipeline vs Realtime; Ratishfolio, Cascading vs Realtime]:

- **Cascaded (ASR then LLM then TTS).** Three sequential stages: speech to text, text to a language model, generated text to a speech synthesizer. Latency stacks: ASR ~100 to 200 ms, LLM time-to-first-token ~200 to 400 ms, TTS ~150 to 300 ms, so ~450 to 900 ms before the user hears anything, and the LLM is typically the largest single contributor [rtcleague, Pipeline vs Realtime]. Strengths: lower cost, swappable components, deterministic tool calling, clean prompt caching, and a transcript you can audit. This remains the production standard for phone and PSTN deployments, where 8 kHz telephony audio undercuts the advantages of speech-to-speech [Softcery, Real-time vs Turn-based].
- **Speech-to-speech (S2S).** A single multimodal model ingests raw audio, reasons over it, and streams audio back, preserving prosody and emotion at lower latency. Examples in 2026 include OpenAI gpt-realtime, Google Gemini Live, Amazon Nova Sonic, Kyutai Moshi, and Ultravox [rtcleague, Pipeline vs Realtime]. Cost: tighter coupling to one provider's streaming API, weaker control over tool calls and structured extraction, and less auditability.

Decision rule: choose cascaded when you need tool calls, structured data extraction, auditability, or telephony; choose S2S when naturalness, latency, and emotional tone dominate and the interaction is conversational rather than transactional.

### The conversational latency budget is voice's hard constraint

Humans take turns at 200 to 300 ms gaps; naive voice agents lag at 800 to 1500 ms because they wait on silence [Gradium, Semantic VAD; FutureAGI, Barge-in and Turn-taking]. Target end-to-end response under ~800 ms, and closer to ~500 ms feels natural. The budget is: endpoint-detection latency, plus LLM time-to-first-token, plus TTS time-to-first-audio, plus network egress [Cresta, Real-time Voice Latency]. Measure both component latency (STT, LLM TTFT, TTS first byte) and end-to-end response time at p50, p95, and p99, never just the average [Hamming, Voice Agent Metrics]. Levers: stream every stage (partial ASR, streaming LLM output, streaming TTS), route most turns to a fast model with a stronger model only when needed, and cache common answers. Tail latency compounds the same way it does in any multi-stage chain [knowledge/latency-cost-reliability.md].

### Turn-taking: VAD, endpointing, and barge-in

Three mechanisms must be engineered, not assumed [OpenAI, Realtime VAD; LiveKit, Turn Detection]:

- **Voice activity detection (VAD).** The base layer: is the user speaking right now.
- **Endpointing (turn detection).** Has the user finished their turn. Two approaches. Acoustic or server VAD fires after a fixed silence threshold (commonly 800 to 1200 ms); it is cheap but cannot distinguish a mid-thought pause ("book a flight to, uh, Lisbon") from an end-of-turn pause, so it either interrupts a thinking user or waits through dead air [Gradium, Semantic VAD]. Semantic turn detection uses the model's own reading of the words to predict completion; it is more robust and adds ~100 to 200 ms, closing the human-like gap to ~300 ms. OpenAI (semantic_vad with an eagerness control), LiveKit (model-based turn detection), and AssemblyAI all offer it [OpenAI, Realtime VAD; LiveKit, Turn Detection].
- **Barge-in.** The user interrupts mid-response. The system must detect user speech, cancel the in-flight response (for example the Realtime API `response.cancel` event), flush the buffered TTS audio on the client, and start listening. Do not surface interruptions as errors: that produces broken UX and noisy logs [OpenAI, Realtime VAD].

For push-to-talk interfaces, disable automatic turn detection and take explicit control of the audio window [OpenAI, Realtime VAD].

### Multimodal input: vision and beyond

When the input includes images, documents, screenshots, or video, the model is a large multimodal model (LMM), but the cognitive architecture (model, tools, orchestration) is unchanged [knowledge/building-effective-agents.md]. Two design shapes recur [Xie et al., Agentic MLLM Survey]: multimodal agents that perceive and act in an environment (computer and web use, benchmarked by OSWorld), and multimodal RAG, where retrieval spans images and text and the answer is grounded in retrieved visual evidence [Mei et al., mRAG Design Space]. The crux is visual grounding: the output must be consistent with the actual input image, not with a plausible prior.

### Cost and reliability shift with modality

Voice adds per-minute ASR and TTS charges on top of token cost, and the binding capacity constraint becomes concurrent-call throughput (thousands of simultaneous sessions), not tokens [knowledge/latency-cost-reliability.md]. Multimodal input is token-expensive: high-resolution images consume large input-token counts, so downsample to the needed resolution and cache the encoded image across turns rather than resending it.

## When to apply

- If input or output is speech, design the voice stack: pick cascaded or S2S by the tool-calling, auditability, and telephony needs; specify the VAD plus endpointing plus barge-in behavior; and set an end-to-end latency budget under ~800 ms.
- If the channel is phone or PSTN, prefer cascaded, plan for 8 kHz audio, and include a DTMF (keypad) fallback.
- If the agent can take a consequential or irreversible action over voice, require explicit spoken-back confirmation and step-up authentication, and never execute on a low-confidence transcript [knowledge/security-governance.md].
- If the input includes images, documents, or video, use an LMM, add multimodal RAG when grounding in a visual corpus, and add visual-grounding evaluation.
- If accessibility is in scope, provide voice and text parity, captions, and a keypad or push-to-talk path.

## Common failure modes

- **Designing voice like chat.** A 2-second turn that is fine in chat feels broken on a call. The turn latency is the product; budget it explicitly [Gradium, Semantic VAD].
- **Acoustic-only endpointing.** Fixed silence timers interrupt users mid-thought or wait through dead air; use semantic turn detection for customer-facing voice [OpenAI, Realtime VAD].
- **Barge-in treated as an error.** Interruptions that raise exceptions instead of cancelling the response cleanly create broken conversations and noisy logs [OpenAI, Realtime VAD].
- **Acting on unconfirmed speech.** Executing a billing or irreversible action on a mis-heard utterance. Confirm critical actions by reading them back, and gate them on ASR confidence [knowledge/security-governance.md].
- **Transcript-only evaluation.** Scoring a voice agent on text alone misses prosody, latency, and interruption handling. Use audio-native evaluation and simulated calls at scale, with background-noise and barge-in cases, and gate regressions in CI [Hamming, Voice Agent Testing; Cekura, Voice AI Evaluation]. Typical targets: word error rate under 5 to 10 percent, intent accuracy above 95 percent, naturalness MOS above 4.0, end-to-end latency under 800 ms [Cekura, Voice AI Evaluation; Hamming, Voice Agent Metrics].
- **Visual hallucination.** An LMM describes objects, attributes, or relations not present in the image. Distinguish faithfulness hallucination (inconsistent with the input) from factuality hallucination (inconsistent with the world), and measure both with object and free-form benchmarks such as POPE and AMBER plus a domain golden set [Survey, Multimodal Hallucination; Jing et al., Multimodal FaithScore].
- **Speech-to-speech lock-in.** Choosing S2S, then needing tool calls, structured extraction, or provider portability; migration means rewriting the streaming integration [Softcery, Real-time vs Turn-based].
- **Image-token blowout.** Sending full-resolution images every turn; downsample to the task's needed resolution and cache the encoding.

## Citations

- rtcleague, Pipeline vs Realtime Voice Agent Architecture: https://rtcleague.com/blogs/pipeline-vs-realtime-voice-agent-architecture
- Softcery, Real-time vs Turn-based Voice Agents (2026): https://softcery.com/lab/ai-voice-agents-real-time-vs-turn-based-tts-stt-architecture
- Ratishfolio, Voice Agent Architectures, Cascading vs Realtime: https://blog.ratishfolio.com/voice-agent-architectures-explained-cascading-vs-native-multimodal-pipelines
- Building Enterprise Realtime Voice Agents from Scratch (arXiv 2603.05413): https://arxiv.org/html/2603.05413v1
- Evaluating STT x LLM x TTS Combinations (arXiv 2507.16835): https://arxiv.org/pdf/2507.16835
- OpenAI, Realtime API Voice Activity Detection guide: https://developers.openai.com/api/docs/guides/realtime-vad
- OpenAI, Voice agents guide: https://developers.openai.com/api/docs/guides/voice-agents
- LiveKit, Turn Detection for Voice Agents (VAD, endpointing, model-based): https://livekit.com/blog/turn-detection-voice-agents-vad-endpointing-model-based-detection
- Gradium, Semantic VAD for Voice Agents, Turn Detection 2026: https://gradium.ai/content/semantic-vad-voice-agents-turn-detection-2026
- FutureAGI, Voice AI Barge-In and Turn-Taking (2026): https://futureagi.com/blog/voice-ai-barge-in-turn-taking-2026/
- Cresta, Engineering for Real-Time Voice Agent Latency: https://cresta.com/blog/engineering-for-real-time-voice-agent-latency
- Hamming, Voice Agent Testing Guide and Evaluation Metrics: https://hamming.ai/resources/voice-agent-testing-guide ; https://hamming.ai/resources/voice-agent-evaluation-metrics-guide
- Cekura, Voice AI Evaluation Metrics (2026): https://www.cekura.ai/blogs/voice-ai-evaluation-metrics
- ElevenLabs, Voice Agent Evaluation Framework (6 pillars): https://elevenlabs.io/blog/voice-agent-evaluation-framework-6-pillars-explained
- Xie et al., A Survey on Agentic Multimodal Large Language Models (arXiv 2510.10991): https://arxiv.org/pdf/2510.10991
- Mei et al., mRAG: Design Space of Multimodal Retrieval-Augmented Generation (arXiv 2505.24073): https://arxiv.org/pdf/2505.24073
- A Survey of Multimodal Hallucination Evaluation and Detection (arXiv 2507.19024): https://arxiv.org/html/2507.19024v2
- Jing et al., Multimodal FaithScore: https://openreview.net/forum?id=mLBDZJ1TXfE
- Cross-references: knowledge/latency-cost-reliability.md, knowledge/security-governance.md, knowledge/evaluation.md, knowledge/building-effective-agents.md, knowledge/interoperability-observability.md
