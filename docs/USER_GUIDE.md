# PetePrep user guide

PetePrep is a free Windows app for practicing DECA-style multiple-choice exams. You give it an exam PDF that
has an answer key at the back, and it turns it into practice questions. It keeps re-testing the ones you
miss until you have answered every question correctly twice in a row.

It is an independent project. It is not affiliated with, endorsed by or sponsored by DECA Inc. or the MBA
Research and Curriculum Center. PetePrep includes no exam content: you bring your own PDF.

## 1. Install

You need a Windows 10 or 11 PC. Nothing else.

1. Open the [latest release](https://github.com/Lunaritel/PetePrep/releases/latest).
2. Under **Assets**, download one of these:
   - `PetePrep-Setup-<version>.exe` (recommended): a normal installer. It adds a Start menu entry and
     can update itself if you turn that on.
   - `PetePrep-<version>-x64.zip`: portable. Unzip anywhere and run `PetePrep.exe`. It cannot update itself.
3. Run the installer and accept the agreement page.

### "Windows protected your PC"

The app is not code signed (a certificate costs money), so Windows SmartScreen may warn you the first time.
This is normal for small free apps.

1. Click **More info**.
2. Click **Run anyway**.

If you want to be sure the file is genuine: the source code is public in this repository, and the release is built
automatically by GitHub from that code.

## 2. Get an exam PDF

PetePrep reads exams in the layout DECA publishes for its sample exams: numbered questions with four options
(A to D), followed by an answer key section with an explanation for each answer. The PDF must contain real text
(you can select words in it). Scanned photos of paper exams do not work.

Only import exams you are allowed to use.

## 3. Import your exam

1. Open PetePrep and click **Import exam**.
2. Choose your PDF, or drag the file onto the box.
3. PetePrep reads it and shows a report: how many questions and answer-key entries it found.
   If something looks wrong, you will see it in red or amber here.
4. Click **Review questions**. Any question PetePrep is unsure about is listed first under **To check**.
   Compare it with the original page shown next to it. You can fix the question text, the options, the correct
   answer and the explanation, or exclude a question entirely.
5. Continue, tick the box to confirm you checked the flagged questions, and save.

Nothing is saved until you confirm. Importing the same PDF twice is blocked.

Questions with a picture or a table are shown with a screenshot of how they look in the PDF.

## 4. Practice

From the **Library**, click **Practice** on your exam.

- On the start card, **Shuffle question order** is on by default. The answer options are never shuffled.
- Questions appear one at a time. Click an answer, or press **A** to **D** (or **1** to **4**).
- You see right or wrong straight away, the correct answer, and the official explanation word for word.
- Press **Enter** (or click **Next question**) to continue.
- Option order never changes, so the explanations that mention letters stay correct.
- You can leave any time with **Exit**. Every answer is saved as you go, and you can resume later.

## 5. What each button does

Each exam card in the Library has these buttons. The Library also has a collapsible **What does each button do?**
panel, and every start screen explains itself.

| Button | What it does | When to use it |
|---|---|---|
| **Practice** | Asks the whole exam once, in order (or shuffled). | Your first run through a new exam. |
| **Master exam** | Builds a round from everything you have not mastered yet: questions you have not seen, and ones you have not answered correctly twice in a row. Repeat until the exam reaches 100%. | Working an exam all the way to mastered. |
| **Weak points** | Only the questions from this exam that you got wrong (its part of the mistake bank). | Fixing mistakes fast, one exam at a time. |
| **Mistake bank** (top menu, and the strip above your exams) | Every question you have missed, from all your exams, mixed into one drill. | Reviewing mistakes across exams. |
| **Stats** | Your weakest questions, accuracy and time, and a chart of your rounds. | Seeing where to focus. |
| **Reset progress** | Forgets your answers for this exam. The questions stay. | Starting an exam fresh. |
| **Delete** | Removes the exam and all its progress. | Getting rid of an exam. |

### How the mistake bank works

- A question goes in when you get it wrong.
- It leaves after you answer it correctly in **two separate rounds**. A question never appears twice inside one round,
  so the two correct answers always come from different rounds.
- If you miss it again, it goes straight back in.
- The same rule applies whether the rounds were Weak points, the mixed Mistake bank drill, Master exam or Practice.

For example: you miss 30 questions in Practice. **Weak points** asks exactly those 30. Say you get 25 right and 5 wrong.
The 25 now need one more correct round, and the 5 still need two. The next Weak points round asks all 30 again
(none has left yet). If you get the 25 right again they leave the bank, and the 5 then need one more correct round.

If two of your exams contain the same question, it can appear once for each exam, but never back to back.

### Master exam versus Weak points

Master exam asks for everything not yet mastered, which includes questions you answered right only once. If you want
**only what you got wrong**, use **Weak points** (one exam) or the **Mistake bank** drill (all exams).

## 6. Check your progress

- **Library**: a card per exam with mastered, learning, unseen and mistake-bank counts.
- **Stats**: weakest questions first, accuracy and average time per question, and a chart of your rounds, including Weak points and mixed Mistake bank rounds.
- **Results**: after every round, a list of each question you got right or wrong, and how many questions are left in your mistake bank.

## 7. Keep your data safe

Everything is stored on your computer. Nothing is uploaded.

- **Settings > Export backup** saves everything (exams, pictures, progress) to one file you choose.
- **Settings > Restore from backup** brings it back. This replaces everything currently in the app.
- PetePrep also saves a backup after each round to `Documents\PetePrep Backups`. You can turn this off in Settings.

To move to a new computer: export a backup on the old one, install PetePrep on the new one, then restore.

## 8. Updates

By default PetePrep never connects to the internet. In **Settings > Updates** you can press
**Check for updates**, or turn on **Check for updates automatically** (it looks once when the app opens).
Updating never happens without your click. The only thing the check sends is a request to GitHub asking whether
a newer release exists.

## Troubleshooting

| Problem | What to do |
|---|---|
| "No questions were found" or "looks scanned" | The PDF has no text layer. Use the original digital PDF, not a scan or photo. |
| Fewer questions than expected | Open the review step. If the count is wrong, the PDF layout is not supported yet. See "Report a problem" below. |
| An answer or explanation looks wrong | Use the review step to compare with the PDF and fix it before saving. Saved questions cannot be edited later: delete the exam in the Library, then import it again and fix it in the review step. |
| Windows blocks the installer | See "Windows protected your PC" above. |
| The portable zip says it cannot update | Expected. Download the newest zip from the releases page, or use the installer version. |
| I want to start over | **Settings > Reset all data** (you must type DELETE). Export a backup first if unsure. |

## Report a problem

Open an issue at <https://github.com/Lunaritel/PetePrep/issues>. Please describe what you clicked and what you
expected. Do not attach exam PDFs: they belong to their publishers.

## Uninstall

Windows **Settings > Apps > PetePrep > Uninstall**. Your saved exams and progress stay in
`%APPDATA%\PetePrep` until you delete that folder. For the portable zip, delete the folder you unzipped.
