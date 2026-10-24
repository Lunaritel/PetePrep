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

## 5. Master exam

A question counts as **mastered** after you answer it correctly twice in a row. A wrong answer sends it back
to learning.

1. Click **Master exam** in the Library (or **Start next master round** after a round).
2. PetePrep builds a round from every question you have not mastered yet.
3. Repeat rounds until the Library shows 100% mastered. At that point the app stops offering rounds.

Once some questions are mastered, you can drag a slider to mix a few of them back in for review.

## 6. Check your progress

- **Library**: a card per exam with mastered, learning and unseen counts.
- **Stats**: weakest questions first, accuracy and average time per question, and a chart of your rounds.
- **Results**: after every round, a list of each question you got right or wrong.

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
