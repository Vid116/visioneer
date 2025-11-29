# Visioneer

An AI agent that learns things for you. Give it a goal like "learn chess" or "understand machine learning basics" and it will research, study, and build up knowledge over time.

## Usage

```bash
# Set a learning goal
npm run goal "Learn the basics of chess"

# Run learning cycles
npm run agent:cycle        # Run one cycle
npm run agent:continuous   # Keep running until done/blocked

# Watch progress live
npm run dashboard
```

That's it. The agent will research, learn, and store knowledge automatically.

## Watching Progress

```bash
# Live dashboard (updates every 2 seconds)
npm run dashboard

# Static status report
npm run status
```

The dashboard shows:
- Current goal and progress
- Tasks completed / in progress / remaining
- Recent activity (what the agent is doing)
- Any questions that need your input

**Dashboard controls:** `q` quit | `r` refresh | `a` answer questions

## Answering Questions

Sometimes the agent needs your input to continue. Check for questions:

```bash
npm run answer                     # List open questions
npm run answer <id> "Your answer"  # Answer a question
```

## Changing Goals

```bash
npm run goal "New goal here"   # Set a new goal
npm run goal                   # Show current goal
npm run goal --history         # See past goals
```

## Commands Reference

| Command | What it does |
|---------|--------------|
| `npm run dashboard` | Live progress dashboard |
| `npm run status` | Show current state |
| `npm run agent:cycle` | Run one learning cycle |
| `npm run agent:continuous` | Keep running until done/blocked |
| `npm run goal "..."` | Set a new goal |
| `npm run answer` | Handle questions |
| `npm run warnings` | Check for issues |
| `npm run db:reset` | Start fresh |

## How It Works

1. You set a goal
2. The agent breaks it into tasks
3. Each `agent:cycle` executes one task (researches, learns, stores knowledge)
4. Run cycles until your goal is complete
5. Watch progress via the dashboard

The agent searches the web, reads articles, and builds up a knowledge base. All learnings are stored and can inform future tasks.

## Tips

- Use `npm run agent:continuous` to let it run automatically
- Or run `npm run agent:cycle` multiple times manually
- Check `npm run dashboard` to watch what's happening
- Answer questions promptly to unblock tasks
- Each cycle costs ~$0.10-0.20 in API calls
- Use `npm run db:reset` to start completely fresh

## Setup (first time only)

If setting up on a new machine:

```bash
npm install
cp .env.example .env   # Then add your API keys
npm run db:init
```

## For Developers

See [HANDOFF.md](./HANDOFF.md) for technical architecture and roadmap.
