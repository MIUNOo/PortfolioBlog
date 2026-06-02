+++
title = 'Baacadia — Hearing the System'
date = 2026-05-29T12:00:00-07:00
draft = false
showSlideToc = true
+++

> A Game UX Research case study on *Baacadia*, USC AGP 2026's third-person audio-driven puzzle game.
> Over seven months I sat behind seventeen playtest sessions, read 497 observations, and watched the same eight problems surface in eight different costumes. This is the story of what they all turned out to be.

---

## The Game

{{< figure src="/BAAC/baacadia-keyart.jpg" alt="Baacadia key art" >}}

*Baacadia* is a third-person PC puzzle game built by USC's Advanced Games Project 2026. You play a small robot in an alien world, and the verb you use most is **listening**. You record sounds from the environment, you play them back, and the world responds — vines retreat, sheep gather, jellyfish lift, dead trees flower, doors that look like noise dissolve into silence.

It's a beautiful pitch. It's also a UX challenge, though not for the reason you'd guess. The story and the tutorials are delivered the way most games deliver them — dialogue boxes and HUD popups, text you can sit with and re-read. The hard part is the layer underneath: the signal that tells you *whether your action actually did something*. That signal doesn't persist. A sound plays once. A visual response flashes and fades. The channels that explain what to *attempt* stay on screen; the channel that confirms it *worked* is a moment you either catch or lose — and when you lose it, there's nothing left to re-read.

{{< youtube 9N-_HzB6mGw >}}

---

## What I was trying to find out

I joined the project in September 2025. By April 2026, I had been the moderator or analyst on seventeen documented playtest sessions across builds 9-12 through 1.0.2. The team wasn't short on opinions about what was wrong — every internal review meeting produced a fresh list — but the lists kept being *different lists*. One week the problem was the noise puzzle. The next week the problem was the sheep AI. The next week movement was too slow. The list moved every time the build moved.

So I came in with four working hypotheses that tried to cut across the moving target:

1. Players don't understand the *causal chain* between recording a sound and seeing the world react.
2. Noise spheres serve a double role — POI and obstacle — and players can't reconcile the two.
3. The Jellyfish + Waterfall + Assemble chain is three mechanics deep, and three is one too many for a first-time player.
4. When the world stops responding, players blame themselves or the game; almost no one blames the *feedback*.

The fourth hypothesis is the one that did all the work in the end. I'll come back to it.

---

## How I investigated it

Before the findings, the loop that produced them. As the usability side of the team, my job was to **run the playtest sessions** and turn what happened inside them into something the designers could act on. The method has a name — **Moderated Usability Testing with RITE-style iteration tracking** — but in practice it was a weekly rhythm: brief a player on the current build, let them loose, and moderate by think-aloud, where the player narrates what they're doing and expecting and I only step in once they're stuck past a set threshold.

Each session became a **playtest report**: the session recording, the specific moments of friction I observed, and a timestamp for every one of them, so any claim could be traced back to the exact frame that produced it. Those moments fed a living **RITE problem sheet** — the running issue table the whole method turns on — which I triaged by severity, handed to the design team with concrete change suggestions, and then re-tested against on the next build. At roughly **two sessions a week**, the corpus added up fast — and that pace is exactly what created the bottleneck the analysis pipeline was built to solve.

{{< figure src="/BAAC/ai-pipeline.png" alt="The Whisper + FunASR analysis pipeline used to triage 497 observations from 17 sessions." >}}

Every session produced a screen recording, a webcam track, and a Think-Aloud audio channel. Manually transcribing and triaging all of that on a student schedule was a non-starter, so the later half of the project ran on an AI-assisted ingest. Whisper handled the English passages and FunASR the Mandarin sessions; the transcripts were time-aligned to gameplay events, merged with the session metrics, and passed to an LLM for a first pass — clustering recurring complaints, surfacing candidate problems, drafting severity guesses. I then reviewed and corrected every one of those by hand before it reached the RITE sheet. The model proposes; the researcher disposes. That single change cut analysis time by roughly **70%**, and is the only reason a corpus of **497 granular observations and 35 RITE problem rows** stayed sortable inside a single graduate student's free hours.

I scored everything against a four-tier severity rubric (Critical / High / Medium / Low) and a six-category tag (Functional, Visual, Accessibility, UX, Performance, Content). The rubric matters because the loudest problem is not always the most severe — a Critical issue is one that blocks progress or breaks the core loop; a Medium is one with a workaround. Without that distinction, the team would patch the loudest complaints first and leave the load-bearing ones for the post-mortem.

By April the matrix looked like this:

{{< figure src="/BAAC/severity-heatmap.svg" alt="Severity × Category heatmap. UX rows: F-01 Critical, F-02 High, F-05 + F-07 Medium. Functional: F-03 High, F-06 Medium. Content: F-04 High. Accessibility: F-08 Low." >}}

Eight findings. One Critical. Three High. Anyone can produce a list like this — the job is figuring out which problem is doing the work. The Critical is the one I want to talk about, because everything else turned out to be downstream of it.

---

## The root cause: a broken feedback chain (F-01)

Here is the loop *Baacadia* is asking a first-time player to internalize:

{{< mermaid >}}
flowchart LR
    A["Approach a<br/>sound source"] --> B["Record<br/>the sound"]
    B --> C["Hold it in<br/>your sound slot"]
    C --> D["Play it near<br/>a target"]
    D --> E["Watch the<br/>target respond"]
    E --> A
    classDef stg fill:#2d5f8a,stroke:#1b3d5a,color:#ffffff
    class A,B,C,D,E stg
{{< /mermaid >}}

Five stages. Each stage is supposed to produce a state change the player can see, hear, or feel. The loop is the game's grammar — every puzzle is a sentence written in this grammar, every tutorial is a lesson on how to read it.

What players actually experienced, observed across builds 9-12 through 1.0.2:

- **Stage A → B (Approach → Record):** Players couldn't tell when they were in range. They held the record key in places where nothing was recordable and released the key in places where everything was. *"Did it record?"* — `obs_0001`, `obs_0044`.
- **Stage B → C (Record → Hold):** No persistent indicator showed what sound was currently held. Players forgot what they had. Some thought every recording overwrote the slot; some thought sounds accumulated. *"What did I just record?"* — `obs_0063`, `obs_0240`.
- **Stage C → D (Hold → Play):** The play action produced a sound effect, but the same sound effect played whether the target was valid, invalid, or absent. Players couldn't distinguish "I played the wrong sound" from "I played the right sound at the wrong place" from "nothing here responds to anything." — `obs_0070`, `obs_0308`.
- **Stage D → E (Play → Respond):** The world's responses were subtle. A vine retreating two inches read as "nothing happened" to players still parsing whether they had recorded anything in the first place. *"I used the new sound but nothing happened."*
- **Stage E → A (Respond → Re-approach):** Because the previous four stages had failed to produce a clean read, players could not form a hypothesis about what to try next. The loop never closed; they tried *everything*.

When the loop never closes, the player's working theory of the game collapses. They stop reasoning and start guessing. This is what Critical severity means in a UX rubric: not "this crashes the game," but "this makes the game uninterpretable."

### What that looks like at the controller

This is one player's overlay, captured roughly thirty seconds into the first Noise Cancel puzzle:

{{< figure src="/BAAC/player-confusion-noise.png" alt="A first-time player generating four competing theories simultaneously: push the sheep, make any sound, stand on the button, use a collected sound." caption="One player. Four mutually exclusive theories. Zero feedback to rule any of them out." >}}

This is not a player who is *stuck*. A stuck player has one wrong theory and runs it into a wall. This is a player with four simultaneous theories and no way to test any of them, because the feedback chain that would invalidate three of them has gone silent. That's the difference F-01 produces, and it's what the rest of the findings inherit.

---

## How one broken loop cascaded into seven more

Once I had the chain diagram, I went back through the other seven findings and asked: *does this finding survive in a world where F-01 is fixed?* Most of them shrink. Three of them shrink dramatically.

{{< mermaid >}}
flowchart TD
    F01["F-01 Critical<br/>Broken feedback chain"]:::crit
    F02["F-02 High<br/>Noise puzzle illegible"]:::high
    F03["F-03 High<br/>Jellyfish transport opaque"]:::high
    F04["F-04 High<br/>Goal and inventory absent"]:::high
    F06["F-06 Medium<br/>Sheep response unreadable"]:::med
    F07["F-07 Medium<br/>Bird tutorial doesn't land"]:::med
    F08["F-08 Low<br/>Input swap missed"]:::low
    F05["F-05 Fixed<br/>Movement pacing<br/>(independent)"]:::fixed
    F01 --> F02
    F01 --> F03
    F01 --> F04
    F01 -.-> F06
    F01 -.-> F07
    F01 -.-> F08
    classDef crit  fill:#c0392b,stroke:#7d1f15,color:#ffffff
    classDef high  fill:#e67e22,stroke:#a05415,color:#ffffff
    classDef med   fill:#f1c40f,stroke:#a88c0a,color:#1a1a1a
    classDef low   fill:#16a085,stroke:#0e6e5d,color:#ffffff
    classDef fixed fill:#7f8c8d,stroke:#4f5859,color:#ffffff
{{< /mermaid >}}

Three of them are worth opening up.

### F-02 — The noise puzzle is illegible because the loop is silent

The first Noise Cancel area is supposed to teach: *SING dissolves Noise*. The screenshot above is the moment that lesson is supposed to land. Instead the player is generating four hypotheses because the feedback channel that would confirm or deny any of them — the audio response of the noise sphere being affected by the sung sound — is too quiet, too brief, and indistinguishable from ambient. Of eight players I watched first-encounter this puzzle, **seven** tried at least three wrong strategies before the right one, and the average time-to-correct-action was over a minute.

Note what's *not* the problem: the puzzle's logic. SING-affects-Noise is a clean rule. The problem is that Stage D → E of the feedback loop is broken specifically for the SING/Noise interaction, so even when the player accidentally does the right thing, they don't *see* that they've done the right thing, and they move on to the next wrong theory.

{{< figure src="/BAAC/harshnoise-before.png" alt="The pre-fix first-encounter Noise Cancel area: a player character, a dark noise box, a yellow vine-door barrier, and a sheep standing on the structure. No shader on the world, no glow on the button, no visible cue that any of these objects are part of a puzzle." caption="The pre-fix first encounter, framed roughly as the player meets it. A noise box. A button. A sheep. A barrier. No shader on the world, no glow on the button, no signal that any one of these objects is the answer. This is the field of view that produced the four-theories-at-once overlay from earlier in the article." >}}

### F-03 — Jellyfish transport: three mechanics deep, no preview

The Jellyfish + Waterfall + Sheep Transport sequence asks the player to internalize five rules in a row: *players can bounce on jellyfish, sheep can be caught by jellyfish, waterfalls lift jellyfish upward, the Assemble sound releases captured sheep, released sheep teleport to the nearest valid surface.* Two of those — "nearest valid surface" and "Assemble releases" — have no visible preview. Players release sheep into a void and watch them appear on a platform they did not predict. Some players began to suspect a softlock. Most just stopped trusting the mechanic.

Without F-01, even a correct release looks like a roll of the dice. *With* F-01 — with a visible landing marker and a "release-blocked" reaction when the destination is invalid — the same mechanic becomes a tool. Same rules. Different feedback. Different game.

The three rules players are being asked to internalize, in order:

{{< figure src="/BAAC/jellyfish-grab.png" alt="A jellyfish floating over water with a sheep stuck to its underside. Player and two other sheep on the bank watching." caption="**Rule 1 — Jellyfish capture sheep.** Visible enough. Players see this happen and accept it as a mechanic. So far the chain is one link long." >}}

{{< figure src="/BAAC/jellyfish-waterfall.png" alt="A jellyfish inside a sound-bubble dome rising upward near a waterfall mechanism. Player and sheep watch from the foreground." caption="**Rule 2 — Waterfall sounds lift the jellyfish.** This is the second sound the player needs to know about, played at the right object, with no preview of how high or how far the jellyfish will go." >}}

{{< figure src="/BAAC/jellyfish-assemble.png" alt="The player at the center of a circular Assemble sound wave with white wavy lines radiating outward, near a jellyfish, with the sheep being extracted." caption="**Rule 3 — Assemble releases captured sheep.** The third sound, with no preview of where the released sheep will land, and no visible blocker when the destination is invalid. This is the link in the chain where players begin to suspect a softlock." >}}

Three mechanics deep. Three different sounds. Zero landing previews. The chain is internally consistent, but for a first-time player it is just too many simultaneous moving parts to learn before any of them produce a confirming read.

### F-04 — Goal and inventory model: the loop you can't see undoes the goal you can

When I asked players to describe what they thought their objective was, in the first twenty minutes of play, I got: "collect sheep," "follow the path," "save the sheep," "trigger the story," "find more sounds," "I don't know." Six different mental models from a sample where every player had reached the same point in the same build.

A reasonable instinct is to blame the *objective UI* — there isn't one. But the reason there isn't one is that the designers expected the audio loop to teach the goal: each successful Record → Play → Respond cycle was supposed to confirm "this is a tool, you are making progress." When the loop doesn't close, the goal never accumulates. F-04 is F-01 wearing a different costume.

The follow-on bug here is more concrete. There is a "collection panel" UI that shows previously-discovered sounds. Several players opened it and tried to **switch sounds from it** — they had read it as a sound inventory, not a journal. That's a labeling and affordance issue, but it's also a symptom of the same root: the player is looking for the slot indicator the HUD never gave them.

{{< figure src="/BAAC/soundbank-before.png" alt="The pre-fix Sound Bank radial UI showing text labels Sing and Assemble, with a question mark overlay indicating player confusion." caption="The pre-fix sound bank — a radial wheel with sound *names* as text. Players who hadn't memorized which sound did what looked at this and shrugged. (The question mark in the screenshot is mine, marking the player-confusion moment in the source data.)" >}}

---

## The recommendation framework

The full recommendation set is seven items long. The three that matter for this narrative — REC-01, REC-02, REC-03 — all attack the same target from different angles, which is what you'd expect if the underlying problem is a single broken chain.

**REC-01 — Unify the Record → Play → See Effect chain.** A persistent record-ready indicator. A success toast or icon the moment a sound is captured. A current-sound slot the player can see at all times. A waveform or pulse during playback. A directional highlight on the affected object during a successful play. A short failure response when the play hits nothing or the wrong target. Five stages, five state changes, five reads. Short-term effort (1-3 days); the materials largely exist and need consolidation, not invention.

**REC-02 — Scaffold the first Noise Cancel encounter.** Demonstrate SING-affects-Noise once, in a low-stakes context, before requiring the player to use it. Then on the gated puzzle: a visible directional decay on the noise surface when SING plays, an audio filter shift the player can hear, a progress response. When the player plays the *wrong* sound, give a brief invalid-input response so they know the system received the input but it had no effect. This is the same chain as REC-01 — Stage D → E specifically — applied to a single mechanic.

**REC-03 — Landing previews and softlock protection on Jellyfish release.** Show the player where the sheep will land before they release. Block release into invalid NavMesh. Teach Jellyfish's three rules sequentially, not simultaneously. Long-term effort (>3 days) because it needs new tech, not just consolidation.

The pattern across the three: **make every stage of the feedback loop legible, then teach mechanics one chain at a time.** The next four recommendations — sheep response cues, bird tutorial re-staging, persistent input widget, goal/journal information architecture — are the same idea applied to lower-severity surfaces.

---

## What got fixed — and the move I didn't see coming

By the late-May build, the team had shipped against F-01, F-02 and F-04. Three findings, four targeted design moves — and one of those moves was the elegant move of the cycle, and not one I had on my recommendation list.

I had recommended unifying the Record → Play → See Effect *chain* by giving each of its five stages its own legible state change. The team did that. But they also did something I didn't anticipate: they introduced a **visual vocabulary**. Every recordable sound now has a unique icon, and the same icon travels with the sound through every stage of the loop.

- When the player is **in range** of a sound source, the source's icon appears above it.
- When a sound is **held**, its icon appears in the sound bank UI.
- When a puzzle **requires** a specific sound, that sound's icon is placed somewhere visible near the puzzle.

It's a UI move, but it's also a knowledge-architecture move. My recommendation focused on teaching the *chain*. The team taught the **lexicon** — the same currency carries information across recording, holding, applying, and learning a new puzzle. The chain still has to work, but the icon system makes its outputs *interpretable* in a way that any amount of prose tutorial copy cannot.

I want to flag this honestly, because it's also the thing I want to remember from this project: research can name a problem precisely without imagining the shape of the best fix. The chain diagnosis was correct; the icon system was the design team's contribution, and it carries more load than my own recommendation would have.

### Fix 1 — Recording: from "ripple" to glyph

In early builds, the only signal that a sound was recordable was a small ripple effect at the source. Players missed it. The tutorial copy assumed the ripple was unmissable; the observation data said it was missed in roughly half of first encounters.

{{< figure src="/BAAC/recording-before.png" alt="The pre-fix recording feedback — a faint ripple above a green sound source, requiring a red box and arrow annotation to even be visible." caption="**Before** — the only in-range cue was a faint ripple above the sound source. It needed an annotation arrow to be visible in documentation, which is most of what you need to know about it." >}}

{{< figure src="/BAAC/recording-fix.png" alt="The post-fix recording state — a sound-specific glyph floats above each recordable source. Tutorial text on the right explains that the glyph indicates recording range." caption="**After** — a sound-specific glyph appears above the source when the player is in range, paired with a single contextual line that names both the affordance and the action key. Stage A → B is now a one-look read." >}}

The cost is one new visual element. The gain is that the first two stages of the feedback loop — *am I in range, did I record* — collapse into a single, scannable cue.

### Fix 2 — Sound Bank: from question mark to lexicon

The collection panel had been the highest-stakes UI in the game and the one with the weakest read. The pre-fix version is the screenshot above with the question mark on it. The post-fix version replaces the text labels with the same glyphs used over sound sources.

{{< figure src="/BAAC/soundbank-fix.png" alt="The post-fix Sound Bank UI showing two icon glyphs in a dark radial menu — a sprout-like shape on top and a music-note in a circle on the right." caption="**After** — icons replace text. The same glyphs that appear above sound sources appear in the bank, and (critically) near puzzles that require those sounds. The radial wheel went from a vocabulary test to a tool." >}}

This is the move that quietly resolves F-04. The mental model players were trying to apply — *"this looks like a sound switcher, can I switch sounds with it?"* — is now exactly the model the UI supports.

### Fix 3 — Harsh Noise: three layers of feedback for one mechanic

The first-encounter Noise Cancel puzzle was the picture I led with — four theories at once, no feedback channel that could rule any of them out. The shipped fix is three separate layers of feedback applied to the same mechanic, each one addressing one of the candidate theories from the original screenshot.

{{< figure src="/BAAC/harshnoise-fix-shader.png" alt="The Harsh Noise area with a heavy pixelated distortion shader covering the world and the sheep, making everything look unstable and dissolved." caption="**Layer 1 — The problem is visible.** A pixelated distortion shader is applied to the world while the noise is present. The sheep is distorted. The trees are distorted. The player can now *see* what they're being asked to clear." >}}

{{< figure src="/BAAC/harshnoise-fix-button.png" alt="The same Harsh Noise scene, now with the player standing on a button on the ground that glows a warm yellow under their feet." caption="**Layer 2 — Standing on the button is acknowledged.** The button glows when occupied. This had been the second of the four player theories; previously it produced no visible response and was indistinguishable from doing nothing." >}}

{{< figure src="/BAAC/harshnoise-fix-sing.png" alt="A bright green bubble of clarity expanding around the player, light streams radiating outward, the surrounding world clean and crisp where moments ago it was distorted." caption="**Layer 3 — Singing is the answer, and the answer reads loudly.** When the player plays SING, a bright bubble of clarity expands around them and the noise distortion retreats. The world stops dissolving *only while the player sings*. This is the first time the puzzle's solution produces a feedback signal large enough to dominate the screen." >}}

A first-time player encountering this puzzle today still generates the same four candidate theories the original screenshot recorded. The difference is that only one of them survives the first ten seconds of probing — because three of the four channels now talk back.

### Fix 4 — Objective: a cutscene that names the goal

The icon-as-vocabulary system fixed the F-04 question *what does this UI do?* It left untouched the older F-04 question: *what am I trying to do?* The six pre-fix mental models I had heard from playtesters — *collect sheep, follow the path, save the sheep, trigger the story, find more sounds, I don't know* — were generated by the absence of a stated long-term objective. The icon system gives players a parseable inventory, but an inventory presupposes a goal, and the goal had never been spoken aloud.

The shipped fix is two letterboxed cutscene beats that name the objective explicitly, and stage the naming as a moment in the world.

{{< figure src="/BAAC/objective-cutscene-guide.png" alt="A letterboxed cutscene frame: the player character and a small white guide sheep stand in a noise-distorted area. Text reads '...SEARCHING FOR OBJECTIVE...'" caption="**Beat 1 — ...searching for objective...** The cutscene opens by *naming the problem the player is having*. Players who had been asking *what am I doing?* now see the game asking it back, in the same noise-distorted space they were stuck in." >}}

{{< figure src="/BAAC/objective-cutscene-sheep.png" alt="A letterboxed cutscene frame in a clear, vibrant area. Text reads 'OBJECTIVE FOUND — RECORD SOUNDS TO FILL OUT YOUR COMPENDIUM'." caption="**Beat 2 — Objective found.** The answer arrives in eight words and a verb: *record sounds to fill out your compendium*. The compendium is the icon-organized sound bank from Fix 2. The two fixes land on the same target from different sides." >}}

What I find clever about this move, beyond its directness, is that it **resolves a UX problem with a narrative gesture rather than a UI one**. F-04 was diagnosed as a missing-goal-model issue; the easiest patch would have been to add a quest-log line on the HUD. Instead the team turned the missing model into a cutscene about the player searching for it. That works on multiple registers at once: it gives the player an explicit goal, it makes the goal-confusion *part of the story*, and it sets up the compendium — and by extension the icon-driven sound bank — as the artifact the player is filling out.

The pair of fixes — icon vocabulary plus objective-naming cutscene — together cover F-04 in both its UI and narrative dimensions. The six pre-fix mental models collapse to one: *I am recording sounds to fill out a compendium of what this world can do.*

### What "fixed" means now

The honest report card is substantially better than the April mid-cycle read:

- **F-05 (movement)** — Fully resolved; holds in latest builds.
- **F-04 (Goal + Sound Bank model)** — Fully fixed via a two-front change. The icon vocabulary turns the sound bank into a usable switcher (covering the UI half), and the two-beat objective cutscene names the long-term goal in player-facing words (covering the narrative half). The six pre-fix mental models collapse to one.
- **F-01 (recording feedback)** — Substantially fixed via the glyph + tutorial system at Stage A → B. Stage D → E still wants verification on novel puzzles, but the foundational vocabulary is in.
- **F-02 (Harsh Noise)** — Substantially fixed via the three-layer feedback above. Wants a fresh-player session to confirm time-to-correct-action has actually moved.
- **F-03 (Jellyfish transport)** — Still open. Needs the landing-marker mechanic and the staged teaching of its three sub-rules. Also still lacks a RITE row, which means it still lacks an owner.
- **F-06 / F-07 / F-08** — Sheep response cues are partially helped by the new icon vocabulary; pressure-plate occupancy, bird tutorial re-staging, and the persistent input widget remain open.

The thing I want to flag, more for my own next project than for this article, is that **the icon system was not on my recommendation list.** My diagnosis of the chain was right; my imagination for what could fix it was narrower than the design team's. UX research can supply the problem statement clean. The design team supplies the shape of the answer. When those two snap together — as they did on this cycle — you get the kind of fix that resolves three findings with one shipped feature, and the project skips a small mountain of patches that would never have aggregated to the same result.

---

## Wrapping up

A few things I want to be honest about.

I'm not certain my root-cause framing is the only valid one. A different researcher could plausibly thread F-04 (goal and inventory) as the root and treat F-01 as downstream — *players don't read the feedback because they don't know what to look for*. I think the chain interpretation has more explanatory power across the observation corpus, but I'd want a controlled comparison before I'd defend it harder than that. UX research is full of stories that explain the data, and the test of a story is whether the next build's data fits it.

I'm also aware that several of the most interesting questions — does the player who can name the held sound also describe the goal correctly? does fixing Stage D → E reduce *softlock perception* in Jellyfish? — would need to be answered against a real telemetry channel, not a Think-Aloud transcript. The next iteration of my pipeline is about wiring those event streams in.

There's a deeper problem underneath all of this that I don't think we've solved yet, and I want to name it plainly because it's the thing I'll carry furthest. Across seven months we kept finding and patching the places where a player's mental model failed to form. But the model itself — the player's working knowledge of what this world can do and how to ask it of the system — is still a fragile thing to build. It gets assembled from fragments: a cutscene here, a feedback flash there, one well-timed glyph over a sound source. Miss any single fragment — zone out for two seconds, skip past a cutscene, fail to notice the button glow — and the *next* model often doesn't form either, because it was supposed to be built on the one that got missed. The knowledge base, as it stands, is mostly a single thread; a distracted player can drop it and not get it back.

A genuinely robust experience wouldn't depend on any one fragment landing. It would teach the same thing from several angles at once, and it would let that knowledge be *re-picked-up* at any time — so a player who looked away for two seconds, or who put the game down for two days and came back, could reconstruct where they are without being punished for the gap. The icon-as-vocabulary system is the first real step in that direction: the same glyph saying the same thing at the source, in the bank, and at the puzzle is exactly this kind of redundancy. But that's one mechanic on one axis of the game. Turning the whole knowledge base from a single thread into a mesh — resilient to missed fragments, resumable after a break — is the part we're still working on, and the part I think separates a game that *can* be understood from one that reliably *is*.

The thing I would take to the next project, more than any specific finding, is the discipline of the chain. When an audio-driven puzzle game stops being legible, the instinct is to add language: a tooltip, a tutorial card, a quest log. The work I'm proudest of on *Baacadia* is the case for doing the opposite — for treating system feedback as the primary text of the game, and only reaching for words after the loop already speaks.

---
