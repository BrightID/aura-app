# Aura app — design principles

**Every screen follows these.** When a screen and a principle disagree, the screen is wrong.

1. **Every screen answers "what's next for me?"** It has one primary action, and it's obvious. Everything else is quieter.
2. **One thing per screen in a flow.** On flow screens the primary button sits in a fixed spot, about 45% down the viewport, so the cursor never has to move. Content above it is a heading and at most two lines; secondary links go below it. List pages (Get endorsed, Requests, Board) are the exception.
3. **Complexity only once you're inside it.** Mechanics, voter lists, confidence and levels open on a tap. There are no explanation paragraphs, and an eyebrow label appears only if it tells you something new.
4. **The object itself is the button.** Never repeat link text ("View answers" three times). A question's row, dot cell or name chip is directly tappable and looks touchable: a pill or chip with a clear pressed state. One link style is kept for navigation text only.
5. **Actions happen in place.** Tapping Ask, Yes/No or Rate in changes that control's own state immediately (Sent ✓, selected, Answered ✓). There are no confirmation screens, no batches and no "Submit" at the bottom of a long list unless the answers genuinely belong together. Controls in one state family share one shape and size; state shows through colour and label.
6. **Status at a glance.** Green dots for Yes, red for No, an empty outlined slot for a missing answer, and a red border when any No is present. Seated, Disputed and Pending read as different even without reading the words.
7. **Nothing moves under your finger.** Status lines reserve their space, and appearing content never pushes the thing you just tapped.
8. **A time on every event, and never a claim the app can't know.**
9. **Names follow the name rule.** A name appears only if it was given to you, its owner made it visible to a group you're in, or it's findable or published. Otherwise the first 8 characters of the identifier show.
10. **Back returns to where you were.** Tabs reset the history.
11. **Short copy, in the user's words.** Some lines are fixed product wording; don't reword them. For example, the newcomer lead is: "Node operators must be endorsed as trustworthy by members of the Interfold team."
12. **Everything sits inside a consistent inset.** Buttons, secondary links and text all share one side inset inside the card or column. Nothing touches an edge, and nothing is edge-to-edge unless it's a deliberate full-bleed bar.
13. **No success-only screens.** A success is either an in-place update on the screen you're on, or a short line marked at the top of the next screen you'd go to anyway. It's never a page of its own.
14. **One status colour set, used everywhere.**
    - **Seated / Verified / Answered:** green and bold.
    - **Pending / Waiting / Sent:** the accent blue. Never yellow or amber.
    - **Disputed / Held back / Declined:** red.
    - **Not started:** dim.

    The same word always gets the same colour on every screen.
15. **A request says what's being asked, and how many questions it holds.** For example, "Idris · Node operator · 3 questions" or "Tom · Wants to be a player · 1 question". The count comes from the domain, so it can be 1, 2 or 10.
16. **Counts scale.** A dot cell shows its seating slots (for example, 2). Beyond that, it adds a compact count ("●● +5") and never grows wider. The detail on tap lists everyone.
17. **Button locations are sacred.** No interaction moves any control or row: not a tap, a confidence change, Undo, a status arriving or a caption appearing. Every piece of changing text has reserved, fixed-height space. This is tested by measuring positions before and after every interaction; a 1 px move is a failure.
18. **No unwanted line breaks.** Buttons, chips, status words, row titles, captions and confidence readouts stay on one line. They use shorter words, ellipsis or a fixed layout, and never wrap.
19. **Feedback is instant.** The tapped control changes within one frame. Any grace or undo timer runs *after* the visible change, never before it. Undo always works for the whole window it shows.
20. **Never waste space.** Lists are dense: one line per item where it fits, tight vertical rhythm, and no repeated headers such as "4 nodes" twice. Card padding is for grouping, not for air.
21. **A summary and its detail always agree.** A dot cell, a count and the list behind it come from the same data. Two green dots means two people are listed when you tap.
22. **Every flow ends with a clear "you're done".** When someone has done what we asked (answered every question, sent their endorsement asks), a prominent completion state appears in the fixed primary spot. It tells them they can stop and shows the one next thing, if there is one. Never a tiny link.
23. **Every choice about a person gets an undo window.** Yes, No, Ask, Rate in, Not now and Ignore all run the same 1.5 s sweep in the same fixed slot. Anything that goes to the node reads "Sending… Undo" and then "Sent ✓". App-side choices use their own words ("Skipping… Undo", then "Skipped").

24. **Record only the conclusion.** Anything that helps someone reach an answer (how do I know them, how long, could they game it) is a thinking prompt, not a form field. We store the answer and its confidence, nothing else.
25. **Show what you've done.** The moment something commits (an answer, a vouch, an ask, an endorsement), it appears in that person's history — "Earlier answers", "Sent" — read from the same stored record as everything else. History is never a seed list.
26. **Times are "how long ago".** Every rating, ask and event shows age, not a date: "just now", "5m", "3h", "2d", "4M", "1Y", rounded simply. The exact date and time sit behind it only where someone needs them (tap or hover).

27. **The north star is a share-dialog look: simple, quiet, informative.** What it does:
    - **The main action comes first**: one input at the top, already focused.
    - **Groups are quiet grey labels, not boxes.** "People with access", "People you invited", "General access". There are no cards, borders or dividers between groups, and there's only one rule, above the footer.
    - **A person is one row**: an initials circle, their name in white, and one grey line under it that carries status and time together ("Invited · expires Oct 27"). The role sits on the right as a quiet dropdown, and a single icon handles the action.
    - **You are "(you)"**, and controls you can't change are shown dimmed rather than hidden.
    - **The footer says, in one sentence, what's true now**: "Only people invited can open this link."
    - **Colour is almost absent.** It's dark neutrals with muted avatar tints. The only accent is the focus ring.

28. **"Not now" and "Ignore" are two different things.**
    - **Not now:** skip it for now. The person comes back later. It's app-side and never reaches the node.
    - **Ignore:** don't show me again. It's app-side and never reaches the node, and it is **not** a No. Ignored people stay findable behind a quiet "Ignored (n)" link at the bottom of the list, so an ignore can be reversed after the undo window closes.
    - Both run the undo sweep (principle 23). A real No is only for Yes/No questions.
