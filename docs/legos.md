# Aura app Lego inventory

Notes on the Lego primitives the app is built from, drawn from an earlier component system and the design principles. Geometry below is a proposed contract, not a description of what any one screen already does.

## What the earlier Legos were

**Tier 1, useful here:** `Stack` made gap and alignment explicit; its rule was to assemble layout through one primitive. `Container` gave every screen one width and inset. `Text` owned type size, weight and emphasis. `Button` owned size and primary/secondary/ghost/outline states. `Card` owned surface, radius, inset and optional atmosphere. `Screen` separated fixed header/footer from a scrolling body and restored scroll on return. `Input` and `Field` paired an inset control with its label, hint and error; a filled input selected its text on focus. `Confidence` displayed four levels with stronger light at higher levels. `Chip` and `ChipGroup` made a selected option a touchable object and supported single or multiple choice. The rebuild's token palette and `colorOf()` kept colour decisions in one place.

**Tier 2, useful here:** `NavBar` reserved a 44 px navigation strip; `ListItem` made a whole row tappable; `SettingItem` aligned label/value and action; `SegmentBar` kept progress within a set footprint; `AnswerButton` owned the answer face; `AnswerSlot` in the question flow fixed each button's height and rendered its Undo face in that same slot. `BinaryButtons` and `MCButtons` composed answer slots and owned their pending state. `QuestionCard` supplied one readable question zone. The earlier question components also had `ConfidenceSegments`; its four-part cue is worth keeping, while the rebuild's fixed slot is the stronger interaction rule.

## Lessons to carry forward

- “Answer buttons must NEVER shift position” and transient content must take no space in the answer zone. This addresses controls that moved under the finger.
- “The undo bar and the answer button are the SAME component with two faces”; mirrored overlay dimensions drift. Apply this to Yes/No **and** every send action.
- “Every new line of code must pass through the primitive system”; tokens, Stack and Text are the gate. This is the direct guard against the vouch fieldset being styled as a special case.
- “Confidence = brightness” and “Confidence through gesture, not chrome”; four segments can confirm the gesture without a separate selector. “Button positions are sacred”.
- Keep atmosphere consistent without clipping glow. If a blur needs overflow exceptions, use a radial gradient within the layout instead.

## Proposed Lego set

All widths use the same **16 px screen/card inset**; all changing labels reserve height and stay on one line. Heights are CSS minimums unless stated as fixed. State colour is always **green = Seated/Verified/Answered; blue = Pending/Waiting/Sent; red = Disputed/Held back/Declined; dim = not started. Never yellow.** This status vocabulary is distinct from the green/red Yes/No answer marks.

| Lego | Renders; fixed geometry | States; principles |
| --- | --- | --- |
| **Tokens** | Type, spacing, radius, atmosphere, four status colours; no raw per-screen values. | Theme variants, same semantic meaning; 12, 14, 17. |
| **ScreenShell** | 440 px max column, 16 px sides; 44 px header with back/history and account anchor, tabs in fixed strip; scrolling content below. | Tab/detail/sheet; back restores origin, tabs reset history; 10, 12, 17. |
| **Stack** | Row/column alignment with 4/8/12 px gaps; no ad hoc flex spacing. | Dense/list/flow presets; 12, 20. |
| **Text** | Heading, body, caption and event time with fixed line heights; one-line interactive labels ellipsize. | Primary/quiet/status emphasis; 8, 11, 18. |
| **Surface** | Rounded 16 px grouping surface with 12 px padding; atmosphere sits behind, outside its border. | Plain/selected/error; 12, 20. |
| **FlowAction** | One 52 px button in a 52 px slot centred at **45dvh**, same 16 px inset; secondary link in a reserved slot below. | Ready/loading/disabled/complete; 1, 2, 7, 17. |
| **NavLink** | One navigation-only text style, 44 px touch height; fixed back/header position. | Default/pressed/current; 4, 10, 18. |
| **InputField** | Label, 46 px input, 20 px hint/error line; 8 px internal gaps, 16 px side inset. | Empty/focused/filled/error; select filled text on focus; 7, 12, 17. |
| **ChoiceChip** | A rounded option pill, 44 px tall, 10 px horizontal inset; whole chip taps, no radio circle. | Idle/pressed/selected/disabled; 4, 5, 18. |
| **ChipGroup** | A prompt above a wrap/grid of ChoiceChips; 8 px gaps, 12 px between prompt and choices; group owns selection. | Single/multiple/incomplete/complete; 3, 5, 12. |
| **DenseRow** | One 48 px minimum tappable row, 8 px vertical rhythm, title and trailing 92 px action/status slot; detail is revealed on tap. | Idle/pressed/selected/answered; ellipsis, no row growth; 4, 15, 18, 20. |
| **StatusChip** | One 24 px pill in a reserved trailing slot; word, weight and colour come from semantic status. | Green seated/verified/answered; blue pending/sent/waiting; red disputed/declined; dim unstarted; 6, 14, 18. |
| **VoteCell** | Fixed 46 × 30 px tappable pill: two 10 px dots/empty outlines and compact `+N`; red border if any No. Detail reads the **same vote array**. | Empty/Yes/No/mixed/overflow/pressed; 6, 16, 21. |
| **AnswerControl** | Paired Yes/No or Rate in/Decline slots, each 56 px high (48 px narrow screens), 8 px gap; four segments in a reserved 7 px bottom strip and a fixed 20 px status line. Tap selects immediately; another tap raises confidence 1→4; hold may also set it. Undo face lives **inside the selected slot** for the full 1.5 s; timer starts after visible change. | Idle/pending 1–4/undo/committed; brightness follows confidence, position never changes; 5, 7, 17–19. |
| **SendSlot** | Same 92 × 44 px row action slot, or 52 px FlowAction slot; button becomes `Sending… Undo` with 1.5 s sweep **inside that slot**, then `Sent ✓`. Timestamp has reserved line/space. | Ready/sending/undone/sent/error; for Ask, Rate in, Decline and other sends; 5, 7, 8, 17, 19, 23. |
| **DoneState** | Prominent 52 px completion face in the existing primary slot, plus one short next-step line in reserved space below. | In progress/done/next available; never its own page; 1, 13, 22. |
| **Disclosure** | Whole 44 px row or chip opens detail in place; expanded content begins below the row without shifting its tap target. | Closed/open; voter names, confidence, levels, key and network detail; 3, 4, 7, 21. |

## Screen map

Every named renderer in the app's `views` registry is covered. Shared ScreenShell, Tokens, Stack and Text apply throughout; this map names the distinguishing pieces. **Δ marks one concept built two ways.**

| Screen(s) | Assemble from Legos; duplication to remove |
| --- | --- |
| `home` (both domains, all personas) | Surface, StatusChip, FlowAction or DoneState, NavLink; Δ primary action is sometimes a `primary-link` inside a card, elsewhere a flow button. |
| `requests` | DenseRow, VoteCell, StatusChip, AnswerControl, Disclosure, SendSlot; Δ incoming/outgoing/player rows use different button and status markup; player answer controls sit in a taller row. |
| `board` | DenseRow, VoteCell, StatusChip, Disclosure; Δ Interfold uses dot columns, Uniqueness only a status pill. |
| `detail`, `status`, `network` | DenseRow, VoteCell, StatusChip, Disclosure; Δ `dotCell()` and `voteDots()` separately draw the same vote summary, inviting a count/detail mismatch. |
| `account`, `name-visibility` | DenseRow, StatusChip, InputField/ChipGroup, Disclosure; visibility is a sheet variant of ScreenShell. |
| `ask`, `endorse`, `player-ask`, `player-trainer` | InputField, DenseRow, SendSlot, DoneState, StatusChip; Δ `send-request`, `send-endorsement` and `send-player-request` each render their own Ask/Sent face; `endorse` uses a tiny Done link. |
| `invite`, `invite-detail` | FlowAction, InputField, DenseRow, StatusChip, Disclosure; Copy/Share use standard buttons; created/claimed/expiry times use Text. |
| `answer` (operator and trainer) | DenseRow, VoteCell, AnswerControl, Disclosure, DoneState; Δ operator and trainer share `answerPair()` but have different surrounding card/row geometry. |
| `answer` (Uniqueness vouch) | Surface, ChipGroup, ChoiceChip for its three-option verdict and four-level confidence, SendSlot, DoneState; Δ seven `fieldset`/radio groups and separate submit/Undo line bypass the shared choice/send slots. |
| `identity-start`, `player-start`, `sign-in-flow`, `player-name-question` | ScreenShell, InputField or ChipGroup, FlowAction, NavLink, DoneState. |
| `node-choice`, `node-address`, `node-checking`, `node-guide`, `node-guide-link`, `setup-node`, `declare-node` | ScreenShell, InputField or ChipGroup, FlowAction, StatusChip, DoneState; checking reserves the primary slot. |

## First target: Uniqueness vouch

Replace `vouchField()`'s seven `fieldset.vouch-step` borders, legends and radio labels with **three Surface sections** (“Your connection”, “Identity check”, “Your verdict”). Inside each, use a short **Text** prompt and one **ChipGroup** of **ChoiceChips** for each question. A soft separator between prompts stays inside the 12 px inset; no border runs alongside a heading or touches its letters. Chips have rounded ends, 44 px touch height and an immediate green selected face. Keep the vouch's three verdict choices and four confidence levels as ChipGroups; the binary **AnswerControl** serves Yes/No questions elsewhere. The final **SendSlot** occupies the same 52 px primary slot through `Vouch` → `Sending… Undo` → `Sent ✓`, then **DoneState** says “Done — you can stop” and offers the one next step. This removes the square, word-colliding outlines while keeping the decision and Undo at fixed positions.
