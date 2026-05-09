# Ultimate AI Detective - Midnight at Blackwood Manor

Interactive AI detective game where you interrogate suspects and solve a timed murder mystery.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Optional AI configuration

Create a `.env` file in the repository root:

```bash
VITE_GROQ_API_KEY=your_groq_api_key_here
```

If the API key is not provided, the game uses built-in fallback suspect responses so you can still play locally.
