# Multiple chapters — sales handoff (high level)

**What this is:** A short overview of how members can belong to more than one chapter and move between them in the app. Written for **sales and customer conversations** — not a technical spec.

---

## Where things stand today

**Yes — the main experience is in place.** Someone who is already in Trailblaize can accept an invite to **another** chapter and, once they belong to **more than one** chapter, they get a **chapter picker** at the top of the dashboard. 

-> What they see (home feed, people, events, and similar) follows the chapter they picked.

**New people** still join the way you expect: they use an invite link, create an account, and land in **one** chapter first. 

They get a **second** chapter the same way anyone else does (invite) — when a **second** chapter invites them and they accept.

**Important in conversations:** The picker only appears when someone actually belongs to **two or more** chapters. If they only have one, the app stays simple.

---

## How to talk about it with chapters

- **Nothing changes for “first join.”** Invite links and onboarding for a brand‑new member work as before.
- **Second chapter = another invite.** The chapter they’re joining sends an invite (same idea as today). The person accepts while logged in (or signs in first, then accepts).
- **One account, several chapters.** They don’t need a second email or a second login for each chapter.
- **They choose the chapter they’re “in” right now** with the picker, so alumni networking, home, and chapter‑specific content line up with that choice.

---

## Visual: paths to belonging to multiple chapters

```mermaid
flowchart TB
  subgraph First["First chapter — new or returning”]
    I1[Chapter sends an invite link]
    I2{Already has a Trailblaize account?}
    I1 --> I2
    I2 -->|No| I3[Creates account and finishes join for that chapter]
    I2 -->|Yes| I4[Signs in, then accepts the invite]
    I3 --> M1[Member of that chapter]
    I4 --> M1
  end

  subgraph Second["Adding another chapter”]
    S1[Another chapter sends its own invite link]
    S2{Signed in?}
    S1 --> S2
    S2 -->|No| S3[Signs in — then returns to the invite]
    S2 -->|Yes| S4[Accepts the invite]
    S3 --> S4
    S4 --> M2[Now a member of two chapters]
  end

  subgraph App["In the app after two chapters”]
    A1[Chapter picker appears on the dashboard]
    A2[They pick which chapter they’re viewing]
    A3[What they see matches that chapter]
    A1 --> A2 --> A3
  end

  M1 --> S1
  M2 --> A1
```



**Reading the diagram:** Everyone starts with **one** chapter (top). **Adding** a second chapter is always “another invite + accept” (middle). After that, the **picker and scoped experience** apply (bottom).

---

## One‑liner options for decks

- *“Alumni and members can belong to more than one chapter and switch context in one account.”*
- *“A second chapter is always an invite from that chapter — then the app shows a chapter switcher when it applies.”*

---

## Invite links (important caveat)

This flow is started with **private join links** that a chapter creates and shares with chosen people — **not** open public “anyone can join” links. Chapters **invite** someone with that link to start or continue this path (first chapter or an additional chapter).

---



