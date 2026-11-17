---
name: walkthrough
description: Prepares a short spoken walkthrough of the latest phase or diff for the interviewer, covering what now works, the key decision, how it's tested, and which lines deserve a careful read before the change is accepted. Use after a phase lands, when asked to explain or walk through the changes, or with "what did that change", "walk me through it" or "what should I look at".
---

# Walkthrough

The user reads this aloud or paraphrases it to the interviewer, and uses it to review agent output before accepting it. Write plain prose they can say without editing.

1. Get the diff. Use the range since the previous `phase-N` tag or the previous commit; if there are uncommitted changes, include those. Read the changed files in full where the diff alone hides context.
2. Write the walkthrough in under 150 words:
   - One sentence on what works now that didn't before, as the user would demo it.
   - The main design choice (data shape, where validation happens, how errors surface) and the alternative it beat, one sentence each.
   - Which tests cover which requirement, by test name.
   - What's known to be missing or deferred.
3. Separately, list what the user should look at before accepting, each as `file:line` with one line of why. Include the trickiest logic, anything outside the phase's scope, any test that changed or was removed, new dependencies, and type or lint suppressions. If nothing qualifies, say so in one line.

Don't praise the change or restate the diff line by line.
