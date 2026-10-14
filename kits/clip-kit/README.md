# Clip Kit

Opus Clips–style pipeline: long-form video → Whisper word-level transcript → Claude picks the
viral-worthy segments (title, hook, reasoning, 0–100 score) → ASS captions with per-word
highlight → ffmpeg 9:16 crop + burn-in. Supabase (Postgres, Auth, Storage) for data, Stripe
for subscription tiers.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- Supabase: `profiles` / `videos` / `clips` with RLS, magic-link auth, private `videos` and `clips` buckets
- Stripe Checkout + Billing Portal; the signature-verified webhook is the only writer of plan state
- Clip selection: Claude via the Anthropic API **or** OpenRouter (OpenAI-compatible), structured JSON output
- Transcription: OpenAI `whisper-1` API or local `openai-whisper` CLI
- Rendering: ffmpeg + libass, four caption presets (`karaoke`, `boxed`, `pop`, `minimal`)

## Setup

```bash
npm install
cp .env.example .env        # fill in Supabase, Stripe and AI keys
supabase db push            # applies supabase/migrations to your project
npm run dev                 # web app on :3000
npm run worker              # pipeline worker (polls for UPLOADED videos)
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Stripe: create two recurring monthly prices and put their ids in `STRIPE_PRICE_CREATOR` /
`STRIPE_PRICE_STUDIO`. Plan limits live in `src/lib/plans.ts`.

## Pipeline

`src/lib/pipeline.ts` runs one video end to end and writes each status transition to the DB:

`UPLOADED → EXTRACTING_AUDIO → TRANSCRIBING → SELECTING_CLIPS → RENDERING → DONE | FAILED`

| Stage | Module | Notes |
| --- | --- | --- |
| Audio | `ffmpeg.ts` | 16 kHz mono wav |
| Transcript | `transcribe.ts` | word timestamps; API path chunks at 10 min |
| Selection | `highlights.ts` | 30–60 s target, no overlaps, snapped to word boundaries |
| Captions | `captions.ts` | one ASS event per word so the highlight tracks speech |
| Render | `render.ts` | crop to 9:16, scale 1080×1920, `subtitles=` burn-in, H.264/AAC |

## Demo without a database

`demo/` has a synthetic 95 s interview (fictional artist "Kai North") with aligned word timings.

```bash
python3 demo/generate-source.py                       # needs espeak-ng + ffmpeg → speech.wav, words.json
# build a 1280x720 source from speech.wav (see the ffmpeg command in demo/generate-source.py's docstring)
npm run demo:select -- demo/words.json demo/clips.json 3       # real Claude selection
npm run demo:render -- source.mp4 demo/words.json demo/clips.json demo-output karaoke
```

`demo/clips.json` is a real selection produced by Claude Sonnet via OpenRouter.

## Caption styles

Set `CLIPKIT_CAPTION_STYLE` (or pass a style to `demo:render`):

- `karaoke` — big white words, current word turns yellow (default)
- `boxed` — translucent black box behind each line
- `pop` — centred, current word scales up 130 %
- `minimal` — small phrase captions, no per-word highlight
